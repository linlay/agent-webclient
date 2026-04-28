import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button, Input, message } from "antd";
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
import { useAwaitingTimeoutCountdown } from "@/features/tools/components/awaitingTimeout";
import { useI18n } from "@/shared/i18n";

interface AwaitingHtmlContainerProps {
  data: FormActiveAwaiting;
  onPatch?: (patch: Partial<FormActiveAwaiting>) => void;
  onSubmit?: (payload: AIAwaitSubmitPayloadData) => Promise<unknown>;
  onClose?: () => void;
  onResolvedByOther?: () => void;
}

export const INVALID_AWAITING_SUBMIT_ERROR = "Invalid awaiting submit payload";

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
export const AWAITING_COLLECT_TIMEOUT_ERROR =
  "Awaiting form did not respond to the collect request";

type AwaitingCollectFlow =
  | { type: "submit" }
  | { type: "reject"; reason: string }
  | { type: "switch"; nextIndex: number };

interface AwaitingCollectLifecycleHandlers {
  onCollectingChange: (decision: AwaitingCollectDecision | null) => void;
  onStatusChange: (status: string) => void;
  onErrorChange: (error: string) => void;
}

export interface AwaitingInitFrame {
  addEventListener: (type: "load", listener: () => void) => void;
  removeEventListener: (type: "load", listener: () => void) => void;
}

export function bindAwaitingInitListener(
  frame: AwaitingInitFrame,
  sendInit: () => void,
): () => void {
  frame.addEventListener("load", sendInit);
  sendInit();
  return () => {
    frame.removeEventListener("load", sendInit);
  };
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
  onStatusChange("collecting");
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

function cloneAwaitingFormData(
  form: Record<string, any> | null | undefined,
): Record<string, any> | null {
  return form ? { ...form } : null;
}

function hasFormField(param: AIAwaitFormSubmitParamData): boolean {
  return Object.prototype.hasOwnProperty.call(param, "form");
}

function buildRejectParam(
  id: string,
  reason?: string,
): AIAwaitFormSubmitParamData {
  const trimmedReason = typeof reason === "string" ? reason.trim() : "";
  return {
    id,
    action: "reject",
    ...(trimmedReason ? { reason: trimmedReason } : {}),
  };
}

export function mergeSubmittedParamsIntoAwaitingForms(
  forms: FormActiveAwaiting["forms"],
  params: AIAwaitFormSubmitParamData[],
): FormActiveAwaiting["forms"] {
  const formById = new Map<string, Record<string, unknown> | null>();

  for (const param of params) {
    if (param.action !== "submit" || !hasFormField(param)) {
      continue;
    }
    formById.set(param.id, cloneAwaitingFormData(param.form));
  }

  if (formById.size === 0) {
    return forms;
  }

  return forms.map((form) => {
    if (!formById.has(form.id)) {
      return form;
    }
    return {
      ...form,
      form: formById.get(form.id) ?? null,
    };
  });
}

export function buildAggregatedAwaitingSubmitPayload(
  awaiting: FormActiveAwaiting,
  collectedParams: AIAwaitFormSubmitParamData[],
): AIAwaitSubmitPayloadData {
  const collectedParamById = new Map<string, AIAwaitFormSubmitParamData>();
  const firstCollectedAction = collectedParams[0]?.action;
  const sharedNonSubmitAction =
    (firstCollectedAction === "reject" || firstCollectedAction === "cancel") &&
    collectedParams.length > 0 &&
    collectedParams.every((param) => param.action === firstCollectedAction)
      ? firstCollectedAction
      : null;

  if (
    sharedNonSubmitAction === "reject" ||
    sharedNonSubmitAction === "cancel"
  ) {
    return {
      runId: awaiting.runId,
      awaitingId: awaiting.awaitingId,
      params: awaiting.forms.map((form) =>
        sharedNonSubmitAction === "reject"
          ? buildRejectParam(form.id, collectedParams[0]?.reason)
          : ({
              id: form.id,
              action: "cancel",
            } as const),
      ),
    };
  }

  for (const param of collectedParams) {
    collectedParamById.set(
      param.id,
      param.action === "submit"
        ? {
            ...param,
            ...(hasFormField(param)
              ? { form: cloneAwaitingFormData(param.form) }
              : {}),
          }
        : { ...param },
    );
  }

  const params: AIAwaitFormSubmitParamData[] = awaiting.forms.map((form) => {
    const collected = collectedParamById.get(form.id);
    collectedParamById.delete(form.id);
    if (collected?.action === "reject") {
      return buildRejectParam(form.id, collected.reason);
    }
    if (collected?.action === "cancel") {
      return {
        id: form.id,
        action: collected.action,
      };
    }
    const submittedForm =
      collected?.action === "submit" && hasFormField(collected)
        ? cloneAwaitingFormData(collected.form)
        : cloneAwaitingFormData(form.form);
    return {
      id: form.id,
      action: "submit" as const,
      form: submittedForm,
    };
  });

  for (const param of collectedParamById.values()) {
    if (param.action === "submit") {
      params.push({
        id: param.id,
        action: "submit",
        ...(hasFormField(param)
          ? ({ form: cloneAwaitingFormData(param.form) } as any)
          : {}),
      });
      continue;
    }
    if (param.action === "reject") {
      params.push(buildRejectParam(param.id, param.reason));
      continue;
    }
    params.push({
      id: param.id,
      action: param.action,
    });
  }

  return {
    runId: awaiting.runId,
    awaitingId: awaiting.awaitingId,
    params,
  };
}

export function buildCancelAwaitingSubmitPayload(
  awaiting: FormActiveAwaiting,
): AIAwaitSubmitPayloadData {
  return {
    runId: awaiting.runId,
    awaitingId: awaiting.awaitingId,
    params: awaiting.forms.map((form) => ({
      id: form.id,
      action: "cancel" as const,
    })),
  };
}

export function buildRejectAwaitingSubmitPayload(
  awaiting: FormActiveAwaiting,
  reason?: string,
  forms?: FormActiveAwaiting["forms"],
): AIAwaitSubmitPayloadData {
  const sourceForms = forms ?? awaiting.forms;
  return {
    runId: awaiting.runId,
    awaitingId: awaiting.awaitingId,
    params: sourceForms.map((form) =>
      buildRejectParam(form.id, reason),
    ),
  };
}

export const AwaitingHtmlContainer: React.FC<AwaitingHtmlContainerProps> = ({
  data,
  onPatch,
  onSubmit,
  onClose,
  onResolvedByOther,
}) => {
  const { t } = useI18n();
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
  const [timeoutExpired, setTimeoutExpired] = useState(false);
  const [collectingDecision, setCollectingDecision] =
    useState<AwaitingCollectDecision | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const currentForm = data.forms[activeFormIndex];
  const panelCaption =
    String(
      currentForm?.title ||
        currentForm?.action ||
        currentForm?.id ||
        data.viewportKey ||
        "",
    ).trim();

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

  const submitAggregatedPayload = useCallback(
    async (
      forms: FormActiveAwaiting["forms"],
      collectedParams: AIAwaitFormSubmitParamData[],
      autoSubmit = timeoutExpired,
    ) => {
      if (!onSubmit) {
        setSubmitStatus("");
        setSubmitError(t("awaiting.submit.missingHandler"));
        return;
      }

      setSubmitStatus(autoSubmit ? "autoSubmitting" : "submitting");
      setSubmitError("");
      const result = await onSubmit(
        buildAggregatedAwaitingSubmitPayload(
          {
            ...data,
            forms,
          },
          collectedParams,
        ),
      );
      const errorText = getSubmitErrorText(result);
      if (errorText) {
        setSubmitStatus("");
        setSubmitError(
          t("awaiting.submit.failedWithDetail", { detail: errorText }),
        );
        return;
      }
      setSubmitStatus("");
      setSubmitError("");
    },
    [data, onSubmit, t, timeoutExpired],
  );

  const handleAutoSubmit = useCallback(() => {
    if (
      data.resolvedByOther ||
      submitStatus === "submitting" ||
      submitStatus === "autoSubmitting" ||
      Boolean(collectingDecision)
    ) {
      return;
    }

    setTimeoutExpired(true);

    if (iframeRef.current?.contentWindow && data.viewportHtml) {
      requestCollectFromFrame("submit", { type: "submit" });
      return;
    }

    void submitAggregatedPayload(data.forms, [], true);
  }, [
    collectingDecision,
    data.forms,
    data.resolvedByOther,
    data.viewportHtml,
    requestCollectFromFrame,
    submitAggregatedPayload,
    submitStatus,
  ]);

  const timeoutCountdown = useAwaitingTimeoutCountdown({
    awaitingKey: data.key,
    timeout: data.timeout,
    createdAt: data.createdAt,
    onExpire: handleAutoSubmit,
  });

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
    setTimeoutExpired(false);
    setRejectReason("");
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
    void message.info(t("awaiting.resolvedByOther"));
    onResolvedByOther?.();
  }, [clearCollectTimeout, data.resolvedByOther, onResolvedByOther, t]);

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
          loadError: t("awaiting.load.failedWithDetail", {
            detail: (error as Error).message,
          }),
          viewportHtml: "",
        });
      });
  }, [data.key, data.loading, data.viewportHtml, data.viewportKey, onPatch, t]);

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

    return bindAwaitingInitListener(frame, sendInit);
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
        clearCollectTimeout();
        collectFlowRef.current = null;
        setCollectingDecision(null);
        if (!onSubmit) {
          setSubmitStatus("");
          setSubmitError(t("awaiting.submit.missingHandler"));
          return;
        }
        setSubmitStatus("submitting");
        setSubmitError("");
        const result = await onSubmit(buildCancelAwaitingSubmitPayload(data));
        const errorText = getSubmitErrorText(result);
        if (errorText) {
          setSubmitStatus("");
          setSubmitError(
            t("awaiting.submit.failedWithDetail", { detail: errorText }),
          );
          return;
        }
        setSubmitStatus("");
        setSubmitError("");
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

      if (flow?.type === "reject") {
        setSubmitStatus("submitting");
        setSubmitError("");
        const result = await onSubmit?.(
          buildRejectAwaitingSubmitPayload(data, flow.reason, nextForms),
        );
        const errorText = getSubmitErrorText(result);
        if (errorText) {
          setSubmitStatus("");
          setSubmitError(
            t("awaiting.submit.failedWithDetail", { detail: errorText }),
          );
          return;
        }
        setSubmitStatus("");
        setSubmitError("");
        return;
      }

      await submitAggregatedPayload(nextForms, collectedParams);
    };

    window.addEventListener("message", onWindowMessage);
    return () => window.removeEventListener("message", onWindowMessage);
  }, [
    clearCollectTimeout,
    data,
    onClose,
    onPatch,
    onSubmit,
    submitAggregatedPayload,
    t,
  ]);

  const switchDisabled =
    data.loading ||
    !data.viewportHtml ||
    Boolean(collectingDecision) ||
    submitStatus === "submitting" ||
    submitStatus === "autoSubmitting";

  const submitStatusText = submitStatus
    ? t(`awaiting.status.${submitStatus}`)
    : "";

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

  const handleReject = useCallback(async () => {
    const trimmedReason = rejectReason.trim();
    if (!trimmedReason) {
      setSubmitStatus("");
      setSubmitError(t("awaiting.rejectReason.placeholder"));
      return;
    }

    if (!onSubmit) {
      setSubmitStatus("");
      setSubmitError(t("awaiting.submit.missingHandler"));
      return;
    }

    if (iframeRef.current?.contentWindow && data.viewportHtml) {
      requestCollectFromFrame("submit", {
        type: "reject",
        reason: trimmedReason,
      });
      return;
    }
    setSubmitStatus("submitting");
    setSubmitError("");
    const result = await onSubmit(
      buildRejectAwaitingSubmitPayload(data, trimmedReason),
    );
    const errorText = getSubmitErrorText(result);
    if (errorText) {
      setSubmitStatus("");
      setSubmitError(
        t("awaiting.submit.failedWithDetail", { detail: errorText }),
      );
      return;
    }
    setSubmitStatus("");
    setSubmitError("");
  }, [data, onSubmit, rejectReason, requestCollectFromFrame, t]);

  const reasonInputDisabled =
    data.loading ||
    !onSubmit ||
    Boolean(collectingDecision) ||
    submitStatus === "submitting" ||
    submitStatus === "autoSubmitting";

  const submitDisabled =
    data.loading ||
    !data.viewportHtml ||
    !onSubmit ||
    Boolean(collectingDecision) ||
    submitStatus === "submitting" ||
    submitStatus === "autoSubmitting";

  return (
    <div className="awaiting-panel" id="awaiting-html-panel">
      <div className="awaiting-panel-header">
        <div className="awaiting-panel-header-main">
          <strong className="awaiting-panel-title">{panelCaption}</strong>
        </div>
        <div className="awaiting-panel-header-side">
          {timeoutCountdown.label && (
            <span className="awaiting-timeout-badge">
              {timeoutExpired &&
              (submitStatus === "collecting" ||
                submitStatus === "submitting" ||
                submitStatus === "autoSubmitting")
                ? t("awaiting.status.autoSubmitting")
                : t("awaiting.timeout.countdown", {
                    label: timeoutCountdown.label,
                  })}
            </span>
          )}
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
                    ·{" "}
                    {currentForm.title || currentForm.action || currentForm.id}
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
      </div>

      {data.loading && (
        <div className="status-line">{t("awaiting.load.loading")}</div>
      )}
      {data.loadError && (
        <div className="awaiting-panel-error">{data.loadError}</div>
      )}
      {!data.loading && !data.loadError && !data.viewportHtml && (
        <div className="awaiting-panel-empty">{t("awaiting.load.waiting")}</div>
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
        <div className="awaiting-panel-footer-hints">
          <Button
            className="awaiting-panel-submit-line"
            disabled={submitDisabled}
            type="primary"
            onClick={() =>
              requestCollectFromFrame("submit", { type: "submit" })
            }
          >
            {t("awaiting.hint.submitEditable")}
          </Button>
          <Input
            aria-label={t("awaiting.rejectReason.placeholder")}
            className="awaiting-reject-reason-input"
            disabled={reasonInputDisabled}
            placeholder={t("awaiting.rejectReason.placeholder")}
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            onPressEnter={() => void handleReject()}
          />
        </div>
      </div>

      {submitStatusText && (
        <div className="status-line">{submitStatusText}</div>
      )}
      {submitError && <div className="system-alert">{submitError}</div>}
    </div>
  );
};
