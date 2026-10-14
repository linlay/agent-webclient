import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  completeDesktopNativeShare,
  parseDesktopNativeShareTarget,
  readDesktopNativeShareFiles,
} from "@/shared/data/desktop/desktopNativeShare";
import { hasDesktopHostBridge } from "@/shared/data/desktop/desktopHostBridge";
import { t } from "@/shared/i18n";

type ImportState = { key: string; status: "loading" | "staged" | "completing" | "error"; error?: string } | null;

export function useDesktopNativeShare(input: {
  enabled: boolean;
  chatId: string;
  pendingAgentKey: string;
  interactionPending?: boolean;
  attachmentResetVersion?: number;
  stageFiles: (files: File[]) => boolean;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const target = input.enabled && hasDesktopHostBridge()
    ? parseDesktopNativeShareTarget(location.pathname, location.search)
    : null;
  // Import deduplication lasts only while the corresponding attachment draft exists.
  const key = target ? `${target.agentKey}\u0000${target.newChat}\u0000${target.batchId}\u0000${input.attachmentResetVersion ?? 0}` : "";
  const interactionPending = input.interactionPending === true;
  // Loading an Agent's input capabilities is not a settled denial of attachments.
  const ready = Boolean(target && !interactionPending && !input.chatId && target.agentKey === input.pendingAgentKey);
  const [importState, setImportState] = useState<ImportState>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const stagedKeyRef = useRef("");
  const controllerRef = useRef<AbortController | null>(null);
  const latest = useRef({ ...input, key, target, location });
  latest.current = { ...input, key, target, location };

  useEffect(() => {
    if (!ready || !target) return;
    if (stagedKeyRef.current === key) {
      setImportState({ key, status: "staged" });
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    setImportState({ key, status: "loading" });
    void readDesktopNativeShareFiles(target, controller.signal).then((files) => {
      if (controller.signal.aborted || latest.current.key !== key || latest.current.chatId || latest.current.interactionPending === true ||
          latest.current.pendingAgentKey !== target.agentKey) return;
      if (!latest.current.stageFiles(files)) throw new Error(t("nativeShare.attachmentRejected"));
      stagedKeyRef.current = key;
      setImportState({ key, status: "staged" });
      window.dispatchEvent(new CustomEvent("agent:focus-composer"));
    }).catch((error) => {
      if (!controller.signal.aborted && latest.current.key === key) {
        setImportState({ key, status: "error", error: (error as Error).message });
      }
    });
    return () => {
      controller.abort();
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, [key, ready, retryVersion]);

  const complete = useCallback(async (): Promise<boolean> => {
    const current = latest.current;
    if (current.key !== key) return false;
    if (!current.target) return true;
    if (stagedKeyRef.current !== current.key || current.chatId) return false;
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    setImportState({ key: current.key, status: "completing" });
    try {
      await completeDesktopNativeShare(current.target, controller.signal);
      if (controller.signal.aborted || latest.current.key !== current.key || latest.current.chatId) return false;
      const params = new URLSearchParams(current.location.search);
      params.delete("shareBatch");
      const search = params.toString();
      stagedKeyRef.current = "";
      setImportState(null);
      navigate(`${current.location.pathname}${search ? `?${search}` : ""}${current.location.hash}`, { replace: true });
      return true;
    } catch (error) {
      if (!controller.signal.aborted && latest.current.key === current.key) {
        setImportState({ key: current.key, status: "error", error: (error as Error).message });
      }
      return false;
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, [key, navigate]);
  const retry = useCallback(() => setRetryVersion((version) => version + 1), []);
  const state = importState?.key === key ? importState : null;
  return {
    pending: Boolean(target),
    busy: Boolean(target && (interactionPending || !state || state.status === "loading" || state.status === "completing")),
    blocked: Boolean(target && stagedKeyRef.current !== key),
    error: state?.status === "error" ? state.error || t("nativeShare.failed") : "",
    retry,
    complete,
  };
}
