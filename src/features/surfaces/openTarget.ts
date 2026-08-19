import { useCallback, useRef } from "react";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import type { TimelineSource } from "@/app/state/types";
import { classifyResourceUrl } from "@/shared/data";
import { resolveCurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import {
  buildFileViewerTarget,
  buildResourceViewerTargetFromUrl,
  getViewerTargetKey,
  type ResourceViewerTarget,
  type ViewerTarget,
} from "@/features/viewers/lib/viewerTarget";
import type { WorkPanelItemDescriptor } from "@/features/transport/contracts/generated/agentWebclientBridge";
import { useOptionalWorkPanelTransport } from "@/features/transport/components/RealtimeTransportProvider";
import { isDesktopAppMode } from "@/shared/utils/routing";
import {
  buildSurfaceRoute,
  readSurfacePresentationContext,
  type SurfaceRouteIntent,
} from "@/features/surfaces/surfaceRoutes";

type AgentIntent = { agentKey?: string };

export type OpenTargetIntent =
  | ({ version: 1; kind: "overview" | "debug"; chatId: string; toggle?: boolean } & AgentIntent)
  | ({ version: 1; kind: "btw"; chatId: string; btwId?: string; title?: string } & AgentIntent)
  | ({
      version: 1;
      kind: "source";
      chatId: string;
      publishId: string;
      sourceId: string;
      chunkId?: string;
      btwId?: string;
      source?: TimelineSource;
      title?: string;
    } & AgentIntent)
  | ({
      version: 1;
      kind: "planning";
      chatId: string;
      planningId: string;
      nodeId?: string;
      label?: string;
    } & AgentIntent)
  | ({
      version: 1;
      kind: "artifact";
      artifactId: string;
      chatId: string;
      resourceTarget?: ResourceViewerTarget;
      toggle?: boolean;
      title?: string;
    } & AgentIntent)
  | ({
      version: 1;
      kind: "reference";
      referenceId: string;
      chatId: string;
      resourceTarget?: ResourceViewerTarget;
      toggle?: boolean;
      title?: string;
    } & AgentIntent)
  | ({
      version: 1;
      kind: "resource";
      chatId: string;
      file: string;
      resourceTarget?: ResourceViewerTarget;
      toggle?: boolean;
      title?: string;
    } & AgentIntent)
  | { version: 1; kind: "file"; agentKey: string; path: string; line?: number; toggle?: boolean; title?: string }
  | { version: 1; kind: "terminal"; agentKey: string; terminalKey?: string; title?: string }
  | ({ version: 1; kind: "project"; chatId?: string; runId?: string; path?: string; openFiles?: string[]; view?: "content" | "diff" } & AgentIntent)
  | ({ version: 1; kind: "file-diff"; chatId: string; runId: string; relativePath: string; title?: string } & AgentIntent)
  | { version: 1; kind: "history" }
  | { version: 1; kind: "web"; url: string; title?: string }
  | { version: 1; kind: "skill"; key: string; label?: string; title?: string };

function clean(value: unknown): string {
  return String(value || "").trim();
}

export function normalizeWorkspaceFileRequestPath(value: unknown): string {
  const requestedPath = typeof value === "string" ? value : "";
  if (
    !requestedPath.trim() ||
    requestedPath.length > 2_048 ||
    /[\u0000-\u001f\u007f]/u.test(requestedPath)
  ) return "";
  return requestedPath.replace(/\\/g, "/");
}

function usesAgentIdentity(intent: OpenTargetIntent): intent is OpenTargetIntent & AgentIntent {
  return intent.kind !== "web" && intent.kind !== "history" && intent.kind !== "skill";
}

function resourceRouteIntent(input: {
  agentKey: string;
  chatId: string;
  file: string;
}): SurfaceRouteIntent | null {
  const file = clean(input.file);
  const classification = classifyResourceUrl(file, clean(input.chatId));
  return classification.kind === "chat" || classification.kind === "absolute"
    ? {
        kind: "resource",
        agentKey: input.agentKey,
        chatId: input.chatId,
        file,
      }
    : null;
}

function toSurfaceRouteIntent(intent: OpenTargetIntent): SurfaceRouteIntent | null {
  if (intent.kind === "web") return { kind: "web", url: intent.url, title: intent.title };
  if (intent.kind === "history") return { kind: "history" };
  if (intent.kind === "skill") return { kind: "skill", key: clean(intent.key) };
  if (intent.kind === "overview" || intent.kind === "debug") {
    return { kind: intent.kind, chatId: intent.chatId };
  }
  if (intent.kind === "btw") {
    return { kind: "btw", chatId: intent.chatId, btwId: intent.btwId };
  }
  if (intent.kind === "source") {
    return {
      kind: "source",
      chatId: intent.chatId,
      sourceId: intent.sourceId,
      chunkId: intent.chunkId,
    };
  }
  if (intent.kind === "planning") {
    return { kind: "planning", chatId: intent.chatId, planningId: intent.planningId };
  }
  const agentKey = clean(intent.agentKey);
  if (!agentKey) return null;
  switch (intent.kind) {
    case "artifact":
      return resourceRouteIntent({
        agentKey,
        chatId: intent.chatId,
        file: clean(intent.resourceTarget?.url),
      });
    case "reference":
      return resourceRouteIntent({
        agentKey,
        chatId: intent.chatId,
        file: clean(intent.resourceTarget?.url),
      });
    case "resource":
      return resourceRouteIntent({
        agentKey,
        chatId: intent.chatId,
        file: intent.file,
      });
    case "file": {
      const path = normalizeWorkspaceFileRequestPath(intent.path);
      return path ? { kind: "file", agentKey, path, line: intent.line } : null;
    }
    case "terminal":
      return { kind: "terminal", agentKey, terminalKey: intent.terminalKey };
    case "project":
      return {
        kind: "project",
        agentKey,
        chatId: intent.chatId,
        runId: intent.runId,
        path: intent.path,
        openFiles: intent.openFiles,
        view: intent.view,
      };
    case "file-diff":
      return {
        kind: "project",
        agentKey,
        chatId: intent.chatId,
        runId: intent.runId,
        path: intent.relativePath,
        view: "diff",
      };
  }
}

export function buildStandaloneOpenTargetUrl(
  intent: OpenTargetIntent,
  currentSearch = "",
): string {
  if (intent.version !== 1) return "";
  const routeIntent = toSurfaceRouteIntent(intent);
  return routeIntent
    ? buildSurfaceRoute(routeIntent, readSurfacePresentationContext(currentSearch))
    : "";
}

export function normalizeProjectRelativePath(
  value: unknown,
  workspaceDir = "",
): string {
  let path = clean(value).replace(/\\/g, "/");
  const configuredWorkspace = clean(workspaceDir).replace(/\\/g, "/").replace(/\/$/, "");
  const workspace = configuredWorkspace || (
    path === "/workspace" || path.startsWith("/workspace/") ? "/workspace" : ""
  );
  const absolute = path.startsWith("/") || /^[a-z]:\//i.test(path) || path.startsWith("//");
  if (absolute) {
    if (!workspace || (path !== workspace && !path.startsWith(`${workspace}/`))) return "";
    path = path.slice(workspace.length).replace(/^\/+/, "");
  }
  const parts = path.split("/").filter((part) => part && part !== ".");
  if (parts.length === 0 || parts.some((part) => part === "..")) return "";
  return parts.join("/");
}

function resourceWorkPanelIdentity(file: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < file.length; index += 1) {
    hash ^= file.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `resource:${file.length}:${(hash >>> 0).toString(36)}`;
}

export function buildDesktopWorkPanelDescriptor(
  intent: OpenTargetIntent,
  currentSearch = "",
  workspaceDir = "",
): WorkPanelItemDescriptor | null {
  if (intent.version !== 1 || intent.kind === "terminal" || intent.kind === "history") return null;
  if (intent.kind === "web") {
    try {
      const url = new URL(intent.url);
      if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) return null;
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

  if (intent.kind === "skill") {
    const key = clean(intent.key);
    if (!key) return null;
    return {
      kind: "webclient",
      module: "skill",
      route,
      context: { key },
      ...(intent.title || intent.label
        ? { title: intent.title || intent.label }
        : {}),
    };
  }

  if (intent.kind === "planning") {
    const chatId = clean(intent.chatId);
    const planningId = clean(intent.planningId);
    if (!chatId || !planningId) return null;
    return {
      kind: "webclient",
      module: "planning",
      route,
      context: { chatId, planningId },
      ...(intent.label ? { title: intent.label } : {}),
    };
  }

  const agentKey = clean(intent.agentKey);
  if (!agentKey) return null;

  if (intent.kind === "overview" || intent.kind === "debug") {
    const chatId = clean(intent.chatId);
    if (!chatId) return null;
    return {
      kind: "webclient",
      module: intent.kind,
      route,
      context: { agentKey, chatId },
    };
  }
  if (intent.kind === "btw") {
    const chatId = clean(intent.chatId);
    if (!chatId) return null;
    return {
      kind: "webclient",
      module: "btw",
      route,
      context: { agentKey, chatId, ...(clean(intent.btwId) ? { btwId: clean(intent.btwId) } : {}) },
      ...(intent.title ? { title: intent.title } : {}),
    };
  }
  if (intent.kind === "source") {
    const chatId = clean(intent.chatId);
    const publishId = clean(intent.publishId);
    const sourceId = clean(intent.sourceId);
    if (!chatId || !publishId || !sourceId) return null;
    return {
      kind: "webclient",
      module: "source",
      route,
      context: {
        agentKey,
        chatId,
        publishId,
        sourceId,
        ...(clean(intent.btwId) ? { btwId: clean(intent.btwId) } : {}),
      },
      ...(intent.title ? { title: intent.title } : {}),
    };
  }
  if (intent.kind === "resource") {
    const chatId = clean(intent.chatId);
    const file = clean(intent.file);
    if (!chatId || !file) return null;
    return {
      kind: "webclient",
      module: "artifact",
      route,
      context: {
        agentKey,
        chatId,
        artifactId: resourceWorkPanelIdentity(file),
      },
      ...(intent.title || intent.resourceTarget?.name
        ? { title: intent.title || intent.resourceTarget?.name }
        : {}),
    };
  }
  if (intent.kind === "artifact") {
    const chatId = clean(intent.chatId);
    const artifactId = clean(intent.artifactId);
    if (!chatId || !artifactId) return null;
    return {
      kind: "webclient",
      module: "artifact",
      route,
      context: { agentKey, chatId, artifactId },
      ...(intent.title || intent.resourceTarget?.name ? { title: intent.title || intent.resourceTarget?.name } : {}),
    };
  }
  if (intent.kind === "reference") {
    const chatId = clean(intent.chatId);
    const referenceId = clean(intent.referenceId);
    if (!chatId || !referenceId) return null;
    return {
      kind: "webclient",
      module: "reference",
      route,
      context: { agentKey, chatId, referenceId },
      ...(intent.title || intent.resourceTarget?.name ? { title: intent.title || intent.resourceTarget?.name } : {}),
    };
  }
  if (intent.kind === "file") {
    const path = normalizeWorkspaceFileRequestPath(intent.path);
    if (!path) return null;
    const fileRoute = buildStandaloneOpenTargetUrl({ ...intent, path }, currentSearch);
    if (!fileRoute) return null;
    return {
      kind: "webclient",
      module: "file",
      route: fileRoute,
      context: { agentKey, path },
      ...(intent.title ? { title: intent.title } : {}),
    };
  }
  if (intent.kind === "project") {
    return {
      kind: "webclient",
      module: "project",
      route,
      context: {
        agentKey,
        ...(clean(intent.chatId) ? { chatId: clean(intent.chatId) } : {}),
        ...(clean(intent.runId) ? { runId: clean(intent.runId) } : {}),
        ...(clean(intent.path) ? { path: clean(intent.path) } : {}),
      },
    };
  }

  if (intent.kind !== "file-diff") return null;

  const relativePath = normalizeProjectRelativePath(intent.relativePath, workspaceDir);
  if (!clean(intent.chatId) || !clean(intent.runId) || !relativePath) return null;
  const fileRoute = buildStandaloneOpenTargetUrl({ ...intent, relativePath }, currentSearch);
  if (!fileRoute) return null;
  return {
    kind: "webclient",
    module: "file-diff",
    route: fileRoute,
    context: {
      agentKey,
      chatId: clean(intent.chatId),
      runId: clean(intent.runId),
      path: relativePath,
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

function viewerTargetFromIntent(intent: OpenTargetIntent): ViewerTarget | null {
  if (intent.kind === "file") {
    return buildFileViewerTarget({
      agentKey: intent.agentKey,
      path: normalizeWorkspaceFileRequestPath(intent.path),
      line: intent.line,
    });
  }
  if (intent.kind === "resource") {
    return intent.resourceTarget || buildResourceViewerTargetFromUrl(intent.file);
  }
  if (intent.kind === "artifact" || intent.kind === "reference") {
    return intent.resourceTarget || null;
  }
  return null;
}

export function useOpenTarget(): (intent: OpenTargetIntent) => boolean {
  const dispatch = useAppDispatch();
  const state = useAppState();
  const workPanel = useOptionalWorkPanelTransport();
  // state 每次 reducer 更新都是新对象；通过 ref 读取最新值，
  // 让 openTarget 引用保持稳定，避免下游 useCallback/useMemo 链
  // 在无关状态变化（如 Composer 输入草稿）时整体失效并引发组件 remount。
  const stateRef = useRef(state);
  stateRef.current = state;

  return useCallback((intent) => {
    const state = stateRef.current;
    if (intent.version !== 1) return false;
    const pathname = typeof window === "undefined" ? "/" : window.location.pathname;
    const desktopMode = isDesktopAppMode();
    const currentWorker = resolveCurrentWorkerSummary(state);
    const chatId = "chatId" in intent ? clean(intent.chatId) : "";
    const chat = chatId
      ? state.chats.find((item) => clean(item?.chatId) === chatId)
      : undefined;
    const explicitAgentKey = usesAgentIdentity(intent) ? clean(intent.agentKey) : "";
    const resolvedAgentKey = usesAgentIdentity(intent)
      ? clean(
        explicitAgentKey ||
        (chatId === state.chatId ? state.currentRunAgentKey : "") ||
        state.chatAgentById.get(chatId) ||
        chat?.agentKey ||
        chat?.firstAgentKey ||
        (currentWorker?.type === "agent" ? currentWorker.sourceId : ""),
      )
      : "";
    const normalizedIntent = resolvedAgentKey && usesAgentIdentity(intent)
      ? { ...intent, agentKey: resolvedAgentKey } as OpenTargetIntent
      : intent;

    if (!desktopMode && pathname === "/") {
      if (normalizedIntent.kind === "overview" || normalizedIntent.kind === "debug") {
        const tab = normalizedIntent.kind;
        if (normalizedIntent.toggle && state.rightSidebarOpen && state.rightSidebarOpenTab === tab) {
          dispatch({ type: "CLOSE_RIGHT_SIDEBAR" });
        } else {
          dispatch({ type: "OPEN_RIGHT_SIDEBAR", tab });
        }
        return true;
      }
      if (normalizedIntent.kind === "terminal" && currentWorker?.sourceId === normalizedIntent.agentKey) {
        dispatch({ type: "SET_TERMINAL_DOCK_OPEN", open: true });
        return true;
      }
      if (
        normalizedIntent.kind === "artifact" ||
        normalizedIntent.kind === "reference" ||
        normalizedIntent.kind === "resource" ||
        normalizedIntent.kind === "file"
      ) {
        if (!toSurfaceRouteIntent(normalizedIntent)) return false;
        const viewerTarget = viewerTargetFromIntent(normalizedIntent);
        if (!viewerTarget) return false;
        const viewerKey = getViewerTargetKey(viewerTarget);
        const isActive = state.rightSidebarOpen &&
          state.rightSidebarOpenTab === "viewer" &&
          state.activeViewerKey === viewerKey;
        if (normalizedIntent.toggle && isActive) {
          dispatch({ type: "CLOSE_RIGHT_SIDEBAR" });
        } else {
          dispatch({ type: "OPEN_RIGHT_SIDEBAR", tab: "viewer", viewerTarget });
        }
        return true;
      }
      if (normalizedIntent.kind === "planning" && normalizedIntent.nodeId) {
        dispatch({
          type: "OPEN_RIGHT_SIDEBAR",
          tab: "planningPreview",
          planningPreview: {
            nodeId: normalizedIntent.nodeId,
            label: normalizedIntent.label || normalizedIntent.planningId,
          },
        });
        return true;
      }
      if (normalizedIntent.kind === "source" && normalizedIntent.source) {
        dispatch({ type: "OPEN_RIGHT_SIDEBAR", tab: "sourceDetail", sourceDetail: normalizedIntent.source });
        return true;
      }
      if (normalizedIntent.kind === "web") {
        dispatch({
          type: "OPEN_RIGHT_SIDEBAR",
          tab: "web",
          webPreview: { url: normalizedIntent.url, title: normalizedIntent.title || normalizedIntent.url },
        });
        return true;
      }
      if (normalizedIntent.kind === "skill") {
        dispatch({
          type: "OPEN_RIGHT_SIDEBAR",
          tab: "skill",
          skillPreview: {
            key: normalizedIntent.key,
            label: normalizedIntent.label || normalizedIntent.key,
          },
        });
        return true;
      }
    }

    const currentSearch = typeof window === "undefined" ? "" : window.location.search;
    if (desktopMode && normalizedIntent.kind !== "terminal" && normalizedIntent.kind !== "history") {
      return openDesktopWorkPanelTarget({
        intent: normalizedIntent,
        workPanel,
        currentSearch,
        workspaceDir: currentWorker?.row.workspaceDir,
        onError: (line) => dispatch({ type: "APPEND_DEBUG", line }),
      });
    }
    const url = buildStandaloneOpenTargetUrl(normalizedIntent, currentSearch);
    if (!url || typeof window === "undefined" || typeof window.open !== "function") return false;
    window.open(url, "_blank", "noopener,noreferrer");
    return true;
  }, [dispatch, workPanel]);
}
