import { useCallback, useRef } from "react";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import { resolveCurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import { useOptionalWorkPanelTransport } from "@/features/transport/components/RealtimeTransportProvider";
import { isDesktopAppMode } from "@/shared/utils/routing";
import { getViewerTargetKey } from "@/features/viewers/lib/viewerTarget";
import { clean, usesAgentIdentity, toSurfaceRouteIntent, viewerTargetFromIntent, resolvePublishedArtifactIntent, openDesktopWorkPanelTarget, buildStandaloneOpenTargetUrl, type OpenTargetIntent } from "../lib/openTarget";

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
    const normalizedIntent = resolvePublishedArtifactIntent(
      resolvedAgentKey && usesAgentIdentity(intent)
        ? { ...intent, agentKey: resolvedAgentKey } as OpenTargetIntent
        : intent,
      state.chatId, state.artifacts,
    );

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
            id: normalizedIntent.id,
            label: normalizedIntent.label || normalizedIntent.id,
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
