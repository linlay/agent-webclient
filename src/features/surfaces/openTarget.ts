import { useCallback } from "react";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import { resolveCurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import type { AttachmentPreviewState } from "@/features/artifacts/lib/attachmentPreview";

export type OpenTargetIntent =
  | { version: 1; kind: "summary" | "debug"; chatId: string; runId?: string; agentKey?: string; toggle?: boolean }
  | { version: 1; kind: "terminal"; agentKey: string; terminalKey?: string; title?: string }
  | { version: 1; kind: "artifact"; chatId: string; preview: AttachmentPreviewState; toggle?: boolean }
  | { version: 1; kind: "planning"; chatId: string; nodeId: string; label?: string }
  | { version: 1; kind: "project"; agentKey?: string; chatId?: string; runId?: string }
  | { version: 1; kind: "web"; url: string; title?: string };

function set(params: URLSearchParams, key: string, value: unknown): void {
  const normalized = String(value || "").trim();
  if (normalized) params.set(key, normalized);
}

export function buildStandaloneOpenTargetUrl(intent: OpenTargetIntent): string {
  if (intent.version !== 1) return "";
  if (intent.kind === "web") {
    try {
      const url = new URL(intent.url);
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
    } catch {
      return "";
    }
  }

  const params = new URLSearchParams();
  if (intent.kind === "terminal") {
    set(params, "agentKey", intent.agentKey);
    set(params, "terminalKey", intent.terminalKey || "main");
  } else if (intent.kind === "project") {
    set(params, "agentKey", intent.agentKey);
    set(params, "chatId", intent.chatId);
    set(params, "runId", intent.runId);
  } else if (intent.kind === "artifact") {
    set(params, "chatId", intent.chatId);
    set(params, "view", "artifact");
    set(params, "name", intent.preview.name);
    set(params, "url", intent.preview.url);
    set(params, "downloadUrl", intent.preview.downloadUrl);
    set(params, "kind", intent.preview.kind);
    set(params, "type", intent.preview.type);
    set(params, "mimeType", intent.preview.mimeType);
    set(params, "sourcePath", intent.preview.sourcePath);
    set(params, "line", intent.preview.line);
    set(params, "workspaceAgentKey", intent.preview.workspaceFile?.agentKey);
    set(params, "workspacePath", intent.preview.workspaceFile?.path);
  } else if (intent.kind === "planning") {
    set(params, "chatId", intent.chatId);
    set(params, "view", "planning");
    set(params, "nodeId", intent.nodeId);
    set(params, "label", intent.label);
  } else {
    set(params, "chatId", intent.chatId);
    set(params, "runId", intent.runId);
    set(params, "agentKey", intent.agentKey);
  }
  if (
    (intent.kind === "summary" || intent.kind === "debug" || intent.kind === "artifact" || intent.kind === "planning") &&
    !params.get("chatId")
  ) {
    return "";
  }
  if (intent.kind === "artifact" && (!params.get("url") || !params.get("kind"))) return "";
  if (intent.kind === "planning" && !params.get("nodeId")) return "";
  if (intent.kind === "terminal" && !params.get("agentKey")) return "";
  const query = params.toString();
  const routeKind = intent.kind === "artifact" || intent.kind === "planning"
    ? "summary"
    : intent.kind;
  return `/${routeKind}${query ? `?${query}` : ""}`;
}

export function useOpenTarget(): (intent: OpenTargetIntent) => boolean {
  const dispatch = useAppDispatch();
  const state = useAppState();

  return useCallback((intent: OpenTargetIntent) => {
    if (intent.version !== 1) return false;
    const url = buildStandaloneOpenTargetUrl(intent);
    if (!url) return false;
    const pathname = typeof window === "undefined" ? "/" : window.location.pathname;
    if (pathname === "/") {
      if (intent.kind === "summary" || intent.kind === "debug") {
        const tab = intent.kind === "summary" ? "overview" : "debug";
        if (intent.toggle && state.rightSidebarOpen && state.rightSidebarOpenTab === tab) {
          dispatch({ type: "CLOSE_RIGHT_SIDEBAR" });
        } else {
          dispatch({ type: "OPEN_RIGHT_SIDEBAR", tab });
        }
        return true;
      }
      if (intent.kind === "terminal") {
        const currentWorker = resolveCurrentWorkerSummary(state);
        if (currentWorker?.sourceId === intent.agentKey) {
          dispatch({ type: "SET_TERMINAL_DOCK_OPEN", open: true });
          return true;
        }
      }
      if (intent.kind === "artifact") {
        const isActive =
          state.rightSidebarOpen &&
          state.rightSidebarOpenTab === "preview" &&
          state.activeAttachmentPreviewUrl === intent.preview.url;
        if (intent.toggle && isActive) {
          dispatch({ type: "CLOSE_RIGHT_SIDEBAR" });
        } else if (state.attachmentPreview.some((preview) => preview.url === intent.preview.url)) {
          dispatch({
            type: "OPEN_RIGHT_SIDEBAR",
            tab: "preview",
            activeAttachmentPreviewUrl: intent.preview.url,
          });
        } else {
          dispatch({ type: "OPEN_RIGHT_SIDEBAR", tab: "preview", preview: intent.preview });
        }
        return true;
      }
      if (intent.kind === "planning") {
        dispatch({
          type: "OPEN_RIGHT_SIDEBAR",
          tab: "planningPreview",
          planningPreview: { nodeId: intent.nodeId, label: intent.label || intent.nodeId },
        });
        return true;
      }
      if (intent.kind === "web") {
        dispatch({
          type: "OPEN_RIGHT_SIDEBAR",
          tab: "web",
          webPreview: { url: intent.url, title: intent.title || intent.url },
        });
        return true;
      }
    }

    if (typeof window === "undefined" || typeof window.open !== "function") return false;
    window.open(url, "_blank", "noopener,noreferrer");
    return true;
  }, [dispatch, state]);
}
