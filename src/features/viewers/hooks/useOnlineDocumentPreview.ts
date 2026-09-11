import React from "react";
import type { DocumentPreviewCapabilities, DocumentPreviewResponse } from "@/shared/data/api/dto/resources";
import { getDocumentPreviewCapabilities, prepareDocumentPreview } from "@/shared/data/api/requests/documentPreview";
import { createRequestId } from "@/shared/data/api/http";
import { useI18n } from "@/shared/i18n";
import { isValidDocumentPreview, resolveDocumentPreviewSource } from "../lib/documentPreview";
import type { ViewerTarget } from "../lib/viewerTarget";

interface PreviewState {
  key: string;
  pending?: boolean;
  result?: DocumentPreviewResponse;
  error?: string;
  expired?: boolean;
}

export function useOnlineDocumentPreview(input: {
  target: ViewerTarget; chatId: string; name: string; sizeBytes?: number; refreshKey: number;
  initialResult?: DocumentPreviewResponse;
  onReady?: (result: DocumentPreviewResponse) => void;
}) {
  const { t } = useI18n();
  const source = resolveDocumentPreviewSource(input.target, input.chatId);
  const key = JSON.stringify([source, input.target, input.refreshKey, input.initialResult]);
  const currentKey = React.useRef(key);
  currentKey.current = key;
  const extension = input.name.split(".").pop()?.toLowerCase() || "";
  const candidate = ["docx", "pptx", "xlsx"].includes(extension);
  const [capabilities, setCapabilities] = React.useState<DocumentPreviewCapabilities | null>(null);
  const [checking, setChecking] = React.useState(candidate);
  const [state, setState] = React.useState<PreviewState>({ key, result: input.initialResult });
  const controller = React.useRef<AbortController | null>(null);
  const active = state.key === key ? state : { key };

  React.useEffect(() => {
    controller.current?.abort(); controller.current = null;
    setState({ key, result: input.initialResult }); setCapabilities(null);
    if (!candidate || !source) { setChecking(false); return; }
    const capabilityRequest = new AbortController(); setChecking(true);
    void getDocumentPreviewCapabilities(capabilityRequest.signal)
      .then(({ data }) => { if (!capabilityRequest.signal.aborted) setCapabilities(data); })
      .catch(() => { /* Older Platforms have no preview capability endpoint. */ })
      .finally(() => { if (!capabilityRequest.signal.aborted) setChecking(false); });
    return () => { capabilityRequest.abort(); controller.current?.abort(); controller.current = null; };
  }, [key, candidate]);

  React.useEffect(() => {
    if (!active.result) return;
    const timer = window.setTimeout(() => setState((value) => value.key === key
      ? { ...value, expired: true } : value), Math.max(0, active.result.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [key, active.result]);

  const reason = !candidate ? t("contentViewer.preview.unsupported")
    : !source ? t("contentViewer.preview.sourceUnavailable")
    : checking ? t("contentViewer.preview.checking")
    : !capabilities?.enabled ? t("contentViewer.preview.unconfigured")
    : !capabilities.supportedExtensions?.includes(extension) ? t("contentViewer.preview.unsupported")
    : input.sizeBytes !== undefined && input.sizeBytes > capabilities.maxFileBytes ? t("contentViewer.preview.tooLarge") : "";

  const prepare = async () => {
    if (reason || !source || controller.current) return;
    const request = new AbortController(); controller.current = request;
    setState({ key, pending: true });
    try {
      const { data } = await prepareDocumentPreview({ source, requestId: createRequestId("preview") }, request.signal);
      if (!isValidDocumentPreview(data, window.location.origin)) throw new Error(t("contentViewer.preview.invalidResponse"));
      if (!request.signal.aborted && currentKey.current === key) {
        if (input.onReady) {
          setState({ key });
          input.onReady(data);
        } else {
          setState({ key, result: data });
        }
      }
    } catch (error) {
      if (!request.signal.aborted && currentKey.current === key) setState({ key, error: error instanceof Error ? error.message : t("contentViewer.preview.failed") });
    } finally { if (controller.current === request) controller.current = null; }
  };

  return {
    ...active, reason, prepare,
    dismiss: () => { controller.current?.abort(); controller.current = null; setState({ key }); },
  };
}

export type OnlineDocumentPreviewState = ReturnType<typeof useOnlineDocumentPreview>;
