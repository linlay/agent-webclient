import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button, message } from "antd";
import { LeftOutlined, RightOutlined } from "@ant-design/icons";
import type {
  AIAwaitFormSubmitParamData,
  AIAwaitSubmitPayloadData,
  FormActiveAwaiting,
} from "@/app/state/types";
import { getViewport } from "@/features/transport/lib/apiClientProxy";
import {
  type AwaitingCollectDecision,
  buildAwaitingCollectMessage,
  buildAwaitingInitMessage,
  buildAwaitingUpdateMessage,
  buildAwaitingViewportSignature,
  isAwaitingFrameCloseMessage,
  readAwaitingSubmitPayload,
} from "@/features/tools/components/protocol";

interface AwaitingHtmlContainerProps {
  data: FormActiveAwaiting;
  onPatch?: (patch: Partial<FormActiveAwaiting>) => void;
  onSubmit?: (payload: AIAwaitSubmitPayloadData) => Promise<unknown>;
  onClose?: () => void;
  onResolvedByOther?: () => void;
}

export const INVALID_AWAITING_SUBMIT_ERROR =
  "收集表单信息异常：提交数据结构不合法";

function getSubmitErrorText(result: unknown): string {
  if (typeof result === "string" && result.trim()) {
    return result.trim();
  }
  if (result instanceof Error && result.message.trim()) {
    return result.message.trim();
  }
  return "";
}

export const AWAITING_COLLECT_TIMEOUT_MS = 5_000;
export const AWAITING_COLLECT_TIMEOUT_ERROR = "业务表单未响应采集请求";

type AwaitingCollectFlow =
  | { type: "submit" | "reject" }
  | { type: "switch"; nextIndex: number };

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

  postMessage(buildAwaitingCollectMessage(awaiting, decision), "*");
  onCollectingChange(decision);
  onStatusChange("采集中...");
  onErrorChange("");

  return scheduleTimeout(() => {
    onCollectingChange(null);
    onStatusChange("");
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
  handlers?.onStatusChange?.("");
}

export function reportInvalidAwaitingSubmitPayload(
  awaitingId: string,
  eventData: unknown,
  onErrorChange: (error: string) => void,
): void {
  console.warn("[awaiting-html] invalid frontend_awaiting_submit payload", {
    awaitingId,
    eventData,
  });
  onErrorChange(INVALID_AWAITING_SUBMIT_ERROR);
}

function clampAwaitingFormIndex(index: number, formsLength: number): number {
  if (formsLength <= 1) {
    return 0;
  }
  return Math.min(formsLength - 1, Math.max(0, index));
}

function cloneAwaitingFormPayload(
  payload: Record<string, any> | null | undefined,
): Record<string, any> | null {
  return payload ? { ...payload } : null;
}

function hasPayloadField(param: AIAwaitFormSubmitParamData): boolean {
  return Object.prototype.hasOwnProperty.call(param, "payload");
}

export function mergeSubmittedParamsIntoAwaitingForms(
  forms: FormActiveAwaiting["forms"],
  params: AIAwaitFormSubmitParamData[],
): FormActiveAwaiting["forms"] {
  const payloadById = new Map<string, Record<string, unknown> | null>();

  for (const param of params) {
    if (!hasPayloadField(param)) {
      continue;
    }
    payloadById.set(param.id, cloneAwaitingFormPayload(param.payload));
  }

  if (payloadById.size === 0) {
    return forms;
  }

  return forms.map((form) => {
    if (!payloadById.has(form.id)) {
      return form;
    }
    return {
      ...form,
      payload: payloadById.get(form.id) ?? null,
    };
  });
}

export function buildAggregatedAwaitingSubmitPayload(
  awaiting: FormActiveAwaiting,
  collectedParams: AIAwaitFormSubmitParamData[],
): AIAwaitSubmitPayloadData {
  const collectedParamById = new Map<string, AIAwaitFormSubmitParamData>();

  for (const param of collectedParams) {
    collectedParamById.set(param.id, {
      ...param,
      ...(hasPayloadField(param)
        ? { payload: cloneAwaitingFormPayload(param.payload) }
        : {}),
    });
  }

  const params = awaiting.forms.map((form) => {
    const collected = collectedParamById.get(form.id);
    const payload = hasPayloadField(collected ?? { id: form.id })
      ? cloneAwaitingFormPayload(collected?.payload)
      : cloneAwaitingFormPayload(form.payload);

    collectedParamById.delete(form.id);

    return {
      id: form.id,
      payload,
      ...(collected?.reason ? { reason: collected.reason } : {}),
    };
  });

  for (const param of collectedParamById.values()) {
    params.push({
      ...param,
      ...(hasPayloadField(param)
        ? ({ payload: cloneAwaitingFormPayload(param.payload) } as any)
        : null),
    });
  }

  return {
    runId: awaiting.runId,
    awaitingId: awaiting.awaitingId,
    params,
  };
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
  const requestedKeyRef = useRef("");
  const currentFrameKeyRef = useRef("");
  const lastPostedSignatureRef = useRef("");
  const resolvedByOtherHandledRef = useRef(false);
  const collectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const collectFlowRef = useRef<AwaitingCollectFlow | null>(null);
  const [activeFormIndex, setActiveFormIndex] = useState(0);
  const [submitStatus, setSubmitStatus] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [collectingDecision, setCollectingDecision] =
    useState<AwaitingCollectDecision | null>(null);
  const currentForm = data.forms[activeFormIndex];

  const viewportSignature = useMemo(
    () => buildAwaitingViewportSignature(data, activeFormIndex),
    [activeFormIndex, data],
  );

  const clearCollectTimeout = useCallback(() => {
    if (!collectTimeoutRef.current) {
      return;
    }
    clearTimeout(collectTimeoutRef.current);
    collectTimeoutRef.current = null;
  }, []);

  const postToFrame = useCallback(
    (kind: "init" | "update") => {
      const frame = iframeRef.current;
      if (!frame?.contentWindow) {
        return;
      }

      frame.contentWindow.postMessage(
        kind === "init"
          ? buildAwaitingInitMessage(data, activeFormIndex)
          : buildAwaitingUpdateMessage(data, activeFormIndex),
        "*",
      );
      lastPostedSignatureRef.current = viewportSignature;
    },
    [activeFormIndex, data, viewportSignature],
  );

  const requestCollectFromFrame = useCallback(
    (decision: AwaitingCollectDecision, flow: AwaitingCollectFlow) => {
      const frame = iframeRef.current;
      if (!frame?.contentWindow) {
        return;
      }

      collectFlowRef.current = flow;
      clearCollectTimeout();
      collectTimeoutRef.current = beginAwaitingCollectRequest({
        awaiting: data,
        decision,
        postMessage: (messageValue, targetOrigin) => {
          frame.contentWindow?.postMessage(messageValue, targetOrigin);
        },
        scheduleTimeout: (callback, delay) =>
          setTimeout(() => {
            collectFlowRef.current = null;
            callback();
          }, delay),
        onCollectingChange: setCollectingDecision,
        onStatusChange: setSubmitStatus,
        onErrorChange: setSubmitError,
      });
    },
    [clearCollectTimeout, data],
  );

  useEffect(() => {
    activeKeyRef.current = data.key;
  }, [data.key]);

  useEffect(() => {
    clearCollectTimeout();
    collectFlowRef.current = null;
    requestedKeyRef.current = "";
    currentFrameKeyRef.current = "";
    lastPostedSignatureRef.current = "";
    setActiveFormIndex(0);
    setCollectingDecision(null);
    setSubmitStatus("");
    setSubmitError("");
  }, [clearCollectTimeout, data.key]);

  useEffect(() => {
    setActiveFormIndex((prev) =>
      clampAwaitingFormIndex(prev, data.forms.length),
    );
  }, [data.forms.length]);

  useEffect(() => {
    if (!data.resolvedByOther) {
      resolvedByOtherHandledRef.current = false;
      return;
    }
    if (resolvedByOtherHandledRef.current) {
      return;
    }
    clearCollectTimeout();
    collectFlowRef.current = null;
    resolvedByOtherHandledRef.current = true;
    setCollectingDecision(null);
    setSubmitStatus("");
    setSubmitError("");
    void message.info("已被其他终端提交");
    onResolvedByOther?.();
  }, [clearCollectTimeout, data.resolvedByOther, onResolvedByOther]);

  useEffect(
    () => () => {
      clearCollectTimeout();
      collectFlowRef.current = null;
    },
    [clearCollectTimeout],
  );

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
      loadError: "",
      viewportHtml: "",
    });

    getViewport(data.viewportKey)
      .then((response) => {
        if (activeKeyRef.current !== expectedKey) {
          return;
        }
        const payload = response.data as Record<string, unknown> | null;
        const html =
          typeof payload?.html === "string" ? payload.html.trim() : "";
        if (!html) {
          throw new Error("Viewport response does not contain html");
        }
        onPatch?.({
          loading: false,
          loadError: "",
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
          viewportHtml: "",
        });
      });
  }, [data.key, data.loading, data.viewportHtml, data.viewportKey, onPatch]);

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
      postToFrame("init");
    };

    frame.addEventListener("load", sendInit);
    if (frame.contentDocument?.readyState === "complete") {
      sendInit();
    }

    return () => {
      frame.removeEventListener("load", sendInit);
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

    postToFrame("update");
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
        reportInvalidAwaitingSubmitPayload(
          data.awaitingId,
          event.data,
          setSubmitError,
        );
        return;
      }
      clearCollectTimeout();
      clearAwaitingCollectRequest(clearTimeout, null, {
        onCollectingChange: setCollectingDecision,
      });
      const flow = collectFlowRef.current;
      collectFlowRef.current = null;
      const collectedParams = payload.params as AIAwaitFormSubmitParamData[];
      const nextForms = mergeSubmittedParamsIntoAwaitingForms(
        data.forms,
        collectedParams,
      );

      if (nextForms !== data.forms) {
        onPatch?.({ forms: nextForms });
      }

      if (flow?.type === "switch") {
        setActiveFormIndex(
          clampAwaitingFormIndex(flow.nextIndex, nextForms.length),
        );
        setSubmitStatus("");
        setSubmitError("");
        return;
      }

      if (!onSubmit) {
        setSubmitStatus("");
        setSubmitError("提交失败：缺少提交流程处理器");
        return;
      }

      setSubmitStatus("提交中...");
      setSubmitError("");
      const result = await onSubmit(
        buildAggregatedAwaitingSubmitPayload(
          {
            ...data,
            forms: nextForms,
          },
          collectedParams,
        ),
      );
      const errorText = getSubmitErrorText(result);
      if (errorText) {
        setSubmitStatus("");
        setSubmitError(`提交失败：${errorText}`);
        return;
      }
      setSubmitStatus("");
      setSubmitError("");
    };

    window.addEventListener("message", onWindowMessage);
    return () => window.removeEventListener("message", onWindowMessage);
  }, [clearCollectTimeout, data, onClose, onPatch, onSubmit]);

  const actionDisabled = useMemo(
    () =>
      data.loading ||
      !data.viewportHtml ||
      !onSubmit ||
      Boolean(collectingDecision) ||
      submitStatus === "提交中...",
    [
      collectingDecision,
      data.loading,
      data.viewportHtml,
      onSubmit,
      submitStatus,
    ],
  );
  const switchDisabled =
    data.loading ||
    !data.viewportHtml ||
    Boolean(collectingDecision) ||
    submitStatus === "提交中...";

  const handleSwitchForm = useCallback(
    (nextIndex: number) => {
      const resolvedIndex = clampAwaitingFormIndex(
        nextIndex,
        data.forms.length,
      );
      if (resolvedIndex === activeFormIndex) {
        return;
      }
      if (!iframeRef.current?.contentWindow || !data.viewportHtml) {
        setActiveFormIndex(resolvedIndex);
        return;
      }
      requestCollectFromFrame("submit", {
        type: "switch",
        nextIndex: resolvedIndex,
      });
    },
    [
      activeFormIndex,
      data.forms.length,
      data.viewportHtml,
      requestCollectFromFrame,
    ],
  );

  return (
    <div className="awaiting-panel" id="awaiting-html-panel">
      <div className="awaiting-panel-header">
        <div className="awaiting-panel-header-main">
          <strong className="awaiting-panel-title">业务确认</strong>
          <span className="awaiting-panel-caption">{data.viewportKey}</span>
        </div>
        {data.forms.length > 1 && (
          <div className="awaiting-panel-form-switcher">
            <Button
              disabled={switchDisabled || activeFormIndex <= 0}
              icon={<LeftOutlined style={{ fontSize: 12 }} />}
              size="small"
              type="text"
              onClick={() => handleSwitchForm(activeFormIndex - 1)}
            />
            <span
              className="awaiting-panel-form-switcher-label"
              title={
                currentForm?.title ||
                currentForm?.action ||
                currentForm?.id ||
                ""
              }
            >
              {activeFormIndex + 1} / {data.forms.length}
              {currentForm && (
                <>
                  {" "}
                  · {currentForm.title || currentForm.action || currentForm.id}
                </>
              )}
            </span>
            <Button
              disabled={
                switchDisabled || activeFormIndex >= data.forms.length - 1
              }
              icon={<RightOutlined style={{ fontSize: 12 }} />}
              size="small"
              type="text"
              onClick={() => handleSwitchForm(activeFormIndex + 1)}
            />
          </div>
        )}
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
            onClick={() =>
              requestCollectFromFrame("submit", { type: "submit" })
            }
          >
            提交
          </Button>
          <Button
            disabled={actionDisabled}
            onClick={() =>
              requestCollectFromFrame("reject", { type: "reject" })
            }
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
