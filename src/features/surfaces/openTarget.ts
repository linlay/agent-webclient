import { useCallback } from "react";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import { resolveCurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import type { AttachmentPreviewState } from "@/features/artifacts/lib/attachmentPreview";
import type { WorkPanelItemDescriptor } from "@/features/transport/contracts/generated/agentWebclientBridge";
import { useOptionalWorkPanelTransport } from "@/features/transport/components/RealtimeTransportProvider";
import { isDesktopAppMode } from "@/shared/utils/routing";

export type OpenTargetIntent =
  | { version: 1; kind: "overview" | "debug"; chatId: string; runId?: string; agentKey?: string; toggle?: boolean }
  | { version: 1; kind: "terminal"; agentKey: string; terminalKey?: string; title?: string }
  | { version: 1; kind: "artifact"; artifactId?: string; chatId: string; runId?: string; agentKey?: string; preview: AttachmentPreviewState; toggle?: boolean }
  | { version: 1; kind: "planning"; chatId: string; runId?: string; agentKey?: string; nodeId: string; label?: string }
  | { version: 1; kind: "project"; projectId?: string; agentKey?: string; chatId?: string; runId?: string }
  | { version: 1; kind: "file-diff"; chatId: string; runId: string; relativePath: string; agentKey?: string; title?: string }
  | { version: 1; kind: "web"; url: string; title?: string };

function set(params: URLSearchParams, key: string, value: unknown): void {
  const normalized = String(value || "").trim();
  if (normalized) params.set(key, normalized);
}

function buildSurfaceContextParams(currentSearch: string): URLSearchParams {
  const source = new URLSearchParams(currentSearch || "");
  const params = new URLSearchParams();
  set(params, "lang", source.get("lang"));
  set(params, "theme", source.get("theme"));
  return params;
}

function usesAgentIdentity(intent: OpenTargetIntent): boolean {
  return intent.kind === "overview" ||
    intent.kind === "debug" ||
    intent.kind === "artifact" ||
    intent.kind === "planning" ||
    intent.kind === "file-diff";
}

export function buildStandaloneOpenTargetUrl(
  intent: OpenTargetIntent,
  currentSearch = "",
): string {
  if (intent.version !== 1) return "";
  if (intent.kind === "web") {
    try {
      const url = new URL(intent.url);
      return (
        (url.protocol === "http:" || url.protocol === "https:")
        && !url.username
        && !url.password
      ) ? url.href : "";
    } catch {
      return "";
    }
  }

  const params = buildSurfaceContextParams(currentSearch);
  if (intent.kind === "terminal") {
    set(params, "agentKey", intent.agentKey);
    set(params, "terminalKey", intent.terminalKey || "main");
  } else if (intent.kind === "project") {
    set(params, "projectId", intent.projectId);
    set(params, "agentKey", intent.agentKey);
    set(params, "chatId", intent.chatId);
    set(params, "runId", intent.runId);
  } else if (intent.kind === "artifact") {
    set(params, "chatId", intent.chatId);
    set(params, "runId", intent.runId);
    set(params, "agentKey", intent.agentKey);
    set(params, "artifactId", intent.artifactId);
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
    set(params, "runId", intent.runId);
    set(params, "agentKey", intent.agentKey);
    set(params, "view", "planning");
    set(params, "nodeId", intent.nodeId);
    set(params, "label", intent.label);
  } else if (intent.kind === "file-diff") {
    set(params, "chatId", intent.chatId);
    set(params, "runId", intent.runId);
    set(params, "agentKey", intent.agentKey);
    set(params, "path", intent.relativePath);
    set(params, "view", "diff");
  } else {
    set(params, "chatId", intent.chatId);
    set(params, "runId", intent.runId);
    set(params, "agentKey", intent.agentKey);
  }
  if (
    (intent.kind === "overview" || intent.kind === "debug" || intent.kind === "artifact" || intent.kind === "planning") &&
    !params.get("chatId")
  ) {
    return "";
  }
  if (intent.kind === "artifact" && (!params.get("url") || !params.get("kind"))) return "";
  if (intent.kind === "planning" && !params.get("nodeId")) return "";
  if (intent.kind === "terminal" && !params.get("agentKey")) return "";
  if (intent.kind === "file-diff" && (!params.get("runId") || !params.get("path"))) return "";
  const query = params.toString();
  const routeKind = intent.kind === "artifact" || intent.kind === "planning"
    ? "overview"
    : intent.kind === "file-diff"
      ? "project"
    : intent.kind;
  const routePath = `/${routeKind}`;
  return `${routePath}${query ? `?${query}` : ""}`;
}

export function normalizeProjectRelativePath(
  value: unknown,
  workspaceDir = "",
): string {
  let path = String(value || "").trim().replace(/\\/g, "/");
  const workspace = String(workspaceDir || "").trim().replace(/\\/g, "/").replace(/\/$/, "");
  const absolute = path.startsWith("/") || /^[a-z]:\//i.test(path) || path.startsWith("//");
  if (absolute) {
    if (!workspace || (path !== workspace && !path.startsWith(`${workspace}/`))) return "";
    path = path.slice(workspace.length).replace(/^\/+/, "");
  }
  const parts = path.split("/").filter((part) => part && part !== ".");
  if (parts.length === 0 || parts.some((part) => part === "..")) return "";
  return parts.join("/");
}

export function buildDesktopWorkPanelDescriptor(
  intent: OpenTargetIntent,
  currentSearch = "",
  workspaceDir = "",
): WorkPanelItemDescriptor | null {
  if (intent.version !== 1 || intent.kind === "terminal") return null;
  if (intent.kind === "web") {
    try {
      const url = new URL(intent.url);
      if (
        (url.protocol !== "http:" && url.protocol !== "https:") ||
        url.username ||
        url.password
      ) return null;
      return {
        kind: "web",
        url: url.toString(),
        ...(intent.title ? { title: intent.title } : {}),
      };
    } catch {
      return null;
    }
  }

  const route = buildStandaloneOpenTargetUrl(intent, currentSearch);
  if (!route) return null;
  if (intent.kind === "overview" || intent.kind === "debug") {
    const chatId = String(intent.chatId || "").trim();
    if (!chatId) return null;
    return {
      kind: "webclient",
      module: intent.kind === "overview" ? "overview" : "debug",
      route,
      context: {
        chatId,
        ...(intent.runId ? { runId: intent.runId } : {}),
        ...(intent.agentKey ? { agentKey: intent.agentKey } : {}),
      },
    };
  }
  if (intent.kind === "artifact") {
    const artifactId = String(intent.artifactId || "").trim();
    const chatId = String(intent.chatId || "").trim();
    const runId = String(intent.runId || "").trim();
    const agentKey = String(intent.agentKey || "").trim();
    if (!artifactId || !chatId) return null;
    return {
      kind: "webclient",
      module: "artifact",
      route,
      context: {
        artifactId,
        chatId,
        ...(runId ? { runId } : {}),
        ...(agentKey ? { agentKey } : {}),
      },
      title: intent.preview.name,
    };
  }
  if (intent.kind === "planning") {
    const nodeId = String(intent.nodeId || "").trim();
    const chatId = String(intent.chatId || "").trim();
    const runId = String(intent.runId || "").trim();
    const agentKey = String(intent.agentKey || "").trim();
    if (!nodeId || !chatId) return null;
    return {
      kind: "webclient",
      module: "planning",
      route,
      context: {
        nodeId,
        chatId,
        ...(runId ? { runId } : {}),
        ...(agentKey ? { agentKey } : {}),
      },
      ...(intent.label ? { title: intent.label } : {}),
    };
  }
  if (intent.kind === "project") {
    const projectId = String(intent.projectId || "").trim();
    const chatId = String(intent.chatId || "").trim();
    const runId = String(intent.runId || "").trim();
    const agentKey = String(intent.agentKey || "").trim();
    if (!projectId) return null;
    return {
      kind: "webclient",
      module: "project",
      route,
      context: {
        projectId,
        ...(chatId ? { chatId } : {}),
        ...(runId ? { runId } : {}),
        ...(agentKey ? { agentKey } : {}),
      },
    };
  }
  if (intent.kind !== "file-diff") return null;
  const chatId = String(intent.chatId || "").trim();
  const runId = String(intent.runId || "").trim();
  const agentKey = String(intent.agentKey || "").trim();
  if (!chatId || !runId) return null;
  const relativePath = normalizeProjectRelativePath(intent.relativePath, workspaceDir);
  if (!relativePath) return null;
  const fileRoute = buildStandaloneOpenTargetUrl(
    { ...intent, relativePath },
    currentSearch,
  );
  return {
    kind: "webclient",
    module: "file-diff",
    route: fileRoute,
    context: {
      chatId,
      runId,
      relativePath,
      ...(agentKey ? { agentKey } : {}),
    },
    ...(intent.title ? { title: intent.title } : {}),
  };
}

type DesktopWorkPanelTargetOpener = {
  openDescriptor(descriptor: WorkPanelItemDescriptor): Promise<unknown>;
};

export function openDesktopWorkPanelTarget(input: {
  intent: OpenTargetIntent;
  workPanel: DesktopWorkPanelTargetOpener | null | undefined;
  currentSearch?: string;
  workspaceDir?: string;
  onError?: (message: string) => void;
}): boolean {
  if (!input.workPanel) return false;
  const descriptor = buildDesktopWorkPanelDescriptor(
    input.intent,
    input.currentSearch,
    input.workspaceDir,
  );
  if (!descriptor) {
    input.onError?.(`[workpanel] invalid or unsupported ${input.intent.kind} target`);
    return false;
  }
  void input.workPanel.openDescriptor(descriptor).catch((error) => {
    input.onError?.(`[workpanel] ${error instanceof Error ? error.message : String(error)}`);
  });
  return true;
}

export function useOpenTarget(): (intent: OpenTargetIntent) => boolean {
  const dispatch = useAppDispatch();
  const state = useAppState();
  const workPanel = useOptionalWorkPanelTransport();

  return useCallback((intent: OpenTargetIntent) => {
    if (intent.version !== 1) return false;
    const pathname = typeof window === "undefined" ? "/" : window.location.pathname;
    const desktopMode = isDesktopAppMode();
    const currentWorker = resolveCurrentWorkerSummary(state);
    if (!desktopMode && pathname === "/") {
      if (intent.kind === "overview" || intent.kind === "debug") {
        const tab = intent.kind;
        if (intent.toggle && state.rightSidebarOpen && state.rightSidebarOpenTab === tab) {
          dispatch({ type: "CLOSE_RIGHT_SIDEBAR" });
        } else {
          dispatch({ type: "OPEN_RIGHT_SIDEBAR", tab });
        }
        return true;
      }
      if (intent.kind === "terminal" && currentWorker?.sourceId === intent.agentKey) {
        dispatch({ type: "SET_TERMINAL_DOCK_OPEN", open: true });
        return true;
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
          planningPreview: {
            nodeId: intent.nodeId,
            label: intent.label || intent.nodeId,
          },
        });
        return true;
      }
    }
    const chatId = "chatId" in intent ? String(intent.chatId || "").trim() : "";
    const chat = chatId
      ? state.chats.find((item) => String(item?.chatId || "").trim() === chatId)
      : undefined;
    const explicitAgentKey = "agentKey" in intent ? intent.agentKey : "";
    const resolvedAgentKey = usesAgentIdentity(intent)
      ? String(
        explicitAgentKey ||
        (chatId === state.chatId ? state.currentRunAgentKey : "") ||
        state.chatAgentById.get(chatId) ||
        chat?.agentKey ||
        chat?.firstAgentKey ||
        (currentWorker?.type === "agent" ? currentWorker.sourceId : "") ||
        "",
      ).trim()
      : "";
    const normalizedIntent = resolvedAgentKey && usesAgentIdentity(intent)
      ? { ...intent, agentKey: resolvedAgentKey } as OpenTargetIntent
      : intent;
    const currentSearch = typeof window === "undefined" ? "" : window.location.search;
    if (desktopMode) {
      return openDesktopWorkPanelTarget({
        intent: normalizedIntent,
        workPanel,
        currentSearch,
        workspaceDir: currentWorker?.row.workspaceDir,
        onError: (line) => dispatch({ type: "APPEND_DEBUG", line }),
      });
    }
    const url = buildStandaloneOpenTargetUrl(normalizedIntent, currentSearch);
    if (!url) return false;
    if (pathname === "/" && normalizedIntent.kind === "web") {
      dispatch({
        type: "OPEN_RIGHT_SIDEBAR",
        tab: "web",
        webPreview: {
          url: normalizedIntent.url,
          title: normalizedIntent.title || normalizedIntent.url,
        },
      });
      return true;
    }

    if (typeof window === "undefined" || typeof window.open !== "function") return false;
    window.open(url, "_blank", "noopener,noreferrer");
    return true;
  }, [dispatch, state, workPanel]);
}
