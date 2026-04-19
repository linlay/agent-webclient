import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, message } from 'antd';
import type {
  AIAwaitSubmitPayloadData,
  FormActiveAwaiting,
} from '@/app/state/types';
import { getViewport } from '@/features/transport/lib/apiClientProxy';
import {
  type AwaitingCollectDecision,
  buildAwaitingCollectMessage,
  buildAwaitingInitMessage,
  buildAwaitingUpdateMessage,
  buildAwaitingViewportSignature,
  isAwaitingFrameCloseMessage,
  readAwaitingSubmitPayload,
} from '@/features/tools/components/protocol';

interface AwaitingHtmlContainerProps {
  data: FormActiveAwaiting;
  onPatch?: (patch: Partial<FormActiveAwaiting>) => void;
  onSubmit?: (payload: AIAwaitSubmitPayloadData) => Promise<unknown>;
  onClose?: () => void;
  onResolvedByOther?: () => void;
}

function getSubmitErrorText(result: unknown): string {
  if (typeof result === 'string' && result.trim()) {
    return result.trim();
  }
  if (result instanceof Error && result.message.trim()) {
    return result.message.trim();
  }
  return '';
}

export const AWAITING_COLLECT_TIMEOUT_MS = 5_000;
export const AWAITING_COLLECT_TIMEOUT_ERROR = '业务表单未响应采集请求';

interface AwaitingCollectLifecycleHandlers {
  onCollectingChange: (decision: AwaitingCollectDecision | null) => void;
  onStatusChange: (status: string) => void;
  onErrorChange: (error: string) => void;
}

export function beginAwaitingCollectRequest(
  input: {
    awaiting: FormActiveAwaiting;
    decision: AwaitingCollectDecision;
    postMessage: (message: unknown, targetOrigin: string) => void;
    scheduleTimeout: (
      callback: () => void,
      delay: number,
    ) => ReturnType<typeof setTimeout>;
  } & AwaitingCollectLifecycleHandlers,
): ReturnType<typeof setTimeout> {
  const {
    awaiting,
    decision,
    postMessage,
    scheduleTimeout,
    onCollectingChange,
    onStatusChange,
    onErrorChange,
  } = input;

  postMessage(buildAwaitingCollectMessage(awaiting, decision), '*');
  onCollectingChange(decision);
  onStatusChange('采集中...');
  onErrorChange('');

  return scheduleTimeout(() => {
    onCollectingChange(null);
    onStatusChange('');
    onErrorChange(AWAITING_COLLECT_TIMEOUT_ERROR);
  }, AWAITING_COLLECT_TIMEOUT_MS);
}

export function clearAwaitingCollectRequest(
  clearTimeoutFn: (timeout: ReturnType<typeof setTimeout>) => void,
  timeout: ReturnType<typeof setTimeout> | null,
  handlers?: Partial<AwaitingCollectLifecycleHandlers>,
): void {
  if (timeout) {
    clearTimeoutFn(timeout);
  }
  handlers?.onCollectingChange?.(null);
  handlers?.onStatusChange?.('');
}

export const AwaitingHtmlContainer: React.FC<AwaitingHtmlContainerProps> = ({
  data,
  onPatch,
  onSubmit,
  onClose,
  onResolvedByOther,
}) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const activeKeyRef = useRef(data.key);
  const requestedKeyRef = useRef('');
  const currentFrameKeyRef = useRef('');
  const lastPostedSignatureRef = useRef('');
  const resolvedByOtherHandledRef = useRef(false);
  const collectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [submitStatus, setSubmitStatus] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [collectingDecision, setCollectingDecision] =
    useState<AwaitingCollectDecision | null>(null);

  const viewportSignature = useMemo(
    () => buildAwaitingViewportSignature(data),
    [data],
  );

  const clearCollectTimeout = useCallback(() => {
    if (!collectTimeoutRef.current) {
      return;
    }
    clearTimeout(collectTimeoutRef.current);
    collectTimeoutRef.current = null;
  }, []);

  const postToFrame = useCallback((kind: 'init' | 'update') => {
    const frame = iframeRef.current;
    if (!frame?.contentWindow) {
      return;
    }

    frame.contentWindow.postMessage(
      kind === 'init'
        ? buildAwaitingInitMessage(data)
        : buildAwaitingUpdateMessage(data),
      '*',
    );
    lastPostedSignatureRef.current = viewportSignature;
  }, [data, viewportSignature]);

  const requestCollectFromFrame = useCallback((decision: AwaitingCollectDecision) => {
    const frame = iframeRef.current;
    if (!frame?.contentWindow) {
      return;
    }

    clearCollectTimeout();
    collectTimeoutRef.current = beginAwaitingCollectRequest({
      awaiting: data,
      decision,
      postMessage: (messageValue, targetOrigin) => {
        frame.contentWindow?.postMessage(messageValue, targetOrigin);
      },
      scheduleTimeout: (callback, delay) => setTimeout(callback, delay),
      onCollectingChange: setCollectingDecision,
      onStatusChange: setSubmitStatus,
      onErrorChange: setSubmitError,
    });
  }, [clearCollectTimeout, data]);

  useEffect(() => {
    activeKeyRef.current = data.key;
  }, [data.key]);

  useEffect(() => {
    clearCollectTimeout();
    requestedKeyRef.current = '';
    currentFrameKeyRef.current = '';
    lastPostedSignatureRef.current = '';
    setCollectingDecision(null);
    setSubmitStatus('');
    setSubmitError('');
  }, [clearCollectTimeout, data.key]);

  useEffect(() => {
    if (!data.resolvedByOther) {
      resolvedByOtherHandledRef.current = false;
      return;
    }
    if (resolvedByOtherHandledRef.current) {
      return;
    }
    clearCollectTimeout();
    resolvedByOtherHandledRef.current = true;
    setCollectingDecision(null);
    setSubmitStatus('');
    setSubmitError('');
    void message.info('已被其他终端提交');
    onResolvedByOther?.();
  }, [clearCollectTimeout, data.resolvedByOther, onResolvedByOther]);

  useEffect(() => () => {
    clearCollectTimeout();
  }, [clearCollectTimeout]);

  useEffect(() => {
    if (!data.viewportKey || data.viewportHtml || data.loading) {
      return;
    }
    if (requestedKeyRef.current === data.key) {
      return;
    }

    const expectedKey = data.key;
    requestedKeyRef.current = expectedKey;
    onPatch?.({
      loading: true,
      loadError: '',
      viewportHtml: '',
    });

    getViewport(data.viewportKey)
      .then((response) => {
        if (activeKeyRef.current !== expectedKey) {
          return;
        }
        const payload = response.data as Record<string, unknown> | null;
        const html = typeof payload?.html === 'string' ? payload.html.trim() : '';
        if (!html) {
          throw new Error('Viewport response does not contain html');
        }
        onPatch?.({
          loading: false,
          loadError: '',
          viewportHtml: html,
        });
      })
      .catch((error) => {
        if (activeKeyRef.current !== expectedKey) {
          return;
        }
        onPatch?.({
          loading: false,
          loadError: `业务确认表单加载失败: ${(error as Error).message}`,
          viewportHtml: '',
        });
      });
  }, [
    data.key,
    data.loading,
    data.viewportHtml,
    data.viewportKey,
    onPatch,
  ]);

  useEffect(() => {
    if (!data.viewportHtml || !iframeRef.current) {
      return;
    }

    const frame = iframeRef.current;
    const expectedKey = data.key;
    const sendInit = () => {
      if (activeKeyRef.current !== expectedKey) {
        return;
      }
      currentFrameKeyRef.current = expectedKey;
      postToFrame('init');
    };

    frame.addEventListener('load', sendInit);
    if (frame.contentDocument?.readyState === 'complete') {
      sendInit();
    }

    return () => {
      frame.removeEventListener('load', sendInit);
    };
  }, [data.key, data.viewportHtml, postToFrame]);

  useEffect(() => {
    if (!data.viewportHtml) {
      return;
    }
    if (currentFrameKeyRef.current !== data.key) {
      return;
    }
    if (!lastPostedSignatureRef.current) {
      return;
    }
    if (lastPostedSignatureRef.current === viewportSignature) {
      return;
    }

    postToFrame('update');
  }, [data.key, data.viewportHtml, postToFrame, viewportSignature]);

  useEffect(() => {
    const onWindowMessage = async (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }

      if (isAwaitingFrameCloseMessage(event.data)) {
        onClose?.();
        return;
      }

      const payload = readAwaitingSubmitPayload(event.data, data);
      if (!payload) {
        return;
      }
      clearCollectTimeout();
      clearAwaitingCollectRequest(clearTimeout, null, {
        onCollectingChange: setCollectingDecision,
      });
      if (!onSubmit) {
        setSubmitStatus('');
        setSubmitError('提交失败：缺少提交流程处理器');
        return;
      }

      setSubmitStatus('提交中...');
      setSubmitError('');
      const result = await onSubmit(payload);
      const errorText = getSubmitErrorText(result);
      if (errorText) {
        setSubmitStatus('');
        setSubmitError(`提交失败：${errorText}`);
        return;
      }
      setSubmitStatus('');
      setSubmitError('');
    };

    window.addEventListener('message', onWindowMessage);
    return () => window.removeEventListener('message', onWindowMessage);
  }, [clearCollectTimeout, data, onClose, onSubmit]);

  const actionDisabled = useMemo(
    () => (
      data.loading
      || !data.viewportHtml
      || !onSubmit
      || Boolean(collectingDecision)
      || submitStatus === '提交中...'
    ),
    [collectingDecision, data.loading, data.viewportHtml, onSubmit, submitStatus],
  );

  return (
    <div className="awaiting-panel" id="awaiting-html-panel">
      <div className="awaiting-panel-header">
        <strong className="awaiting-panel-title">业务确认</strong>
        <span className="awaiting-panel-caption">{data.viewportKey}</span>
      </div>

      {data.loading && <div className="status-line">加载表单中...</div>}
      {data.loadError && (
        <div className="awaiting-panel-error">{data.loadError}</div>
      )}
      {!data.loading && !data.loadError && !data.viewportHtml && (
        <div className="awaiting-panel-empty">等待业务确认表单加载...</div>
      )}
      {data.viewportHtml && (
        <iframe
          ref={iframeRef}
          className="frontend-tool-frame"
          id="awaiting-html-frame"
          srcDoc={data.viewportHtml}
          sandbox="allow-scripts allow-popups allow-same-origin"
          title={`awaiting-${data.viewportKey}`}
        />
      )}

      <div className="awaiting-panel-footer">
        <div className="awaiting-panel-actions">
          <Button
            disabled={actionDisabled}
            type="primary"
            onClick={() => requestCollectFromFrame('submit')}
          >
            提交
          </Button>
          <Button
            disabled={actionDisabled}
            onClick={() => requestCollectFromFrame('reject')}
          >
            驳回
          </Button>
        </div>
      </div>

      {submitStatus && <div className="status-line">{submitStatus}</div>}
      {submitError && <div className="system-alert">{submitError}</div>}
    </div>
  );
};

