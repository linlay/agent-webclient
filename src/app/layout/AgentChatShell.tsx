import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import type { Agent, Chat, WorkerConversationRow } from "@/app/state/types";
import { CommandStatusOverlay } from "@/app/layout/CommandStatusOverlay";
import { TopNav } from "@/app/layout/TopNav";
import { BottomDock } from "@/app/layout/BottomDock";
import { RightSidebar } from "@/app/layout/sidebar/right/RightSidebar";
import { ConversationStage } from "@/features/timeline/components/ConversationStage";
import { SettingsModal } from "@/features/settings/components/SettingsModal";
import { MemoryInfoModal } from "@/features/settings/components/MemoryInfoModal";
import { ArchiveModal } from "@/features/settings/components/ArchiveModal";
import { ActionModal } from "@/app/modals/ActionModal";
import { EventPopover } from "@/app/modals/EventPopover";
import { CommandModal } from "@/app/modals/CommandModal";
import { FireworksCanvas } from "@/app/effects/FireworksCanvas";
import { useAppRuntimes } from "@/app/layout/hooks/useAppRuntimes";
import { TerminalDock } from "./TerminalDock";
import { buildTimelineDisplayItems } from "@/features/timeline/lib/timelineDisplay";
import { SidebarHistorySection } from "@/app/layout/sidebar/SidebarHistorySection";
import { useLeftSidebarData } from "@/app/layout/hooks/useLeftSidebarData";
import { getChats } from "@/features/transport/lib/apiClientProxy";
import { mergeFetchedChats } from "@/features/chats/lib/chatSummary";

function upsertRouteAgent(agents: Agent[], agentKey: string): Agent[] {
  const normalizedAgentKey = String(agentKey || "").trim();
  if (!normalizedAgentKey) {
    return agents;
  }

  const currentAgents = Array.isArray(agents) ? agents : [];
  const existing = currentAgents.find(
    (agent) => String(agent?.key || "").trim() === normalizedAgentKey,
  );
  if (existing) {
    return currentAgents;
  }

  return [
    ...currentAgents,
    {
      key: normalizedAgentKey,
      name: normalizedAgentKey,
      role: "--",
    },
  ];
}

function normalizeRouteTheme(value: string): "light" | "dark" | "" {
  const theme = String(value || "")
    .trim()
    .toLowerCase();
  return theme === "light" || theme === "dark" ? theme : "";
}

export const AgentChatShell: React.FC = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const params = useParams<{ agentKey?: string }>();
  const [searchParams] = useSearchParams();
  const [historyWorkerKey, setHistoryWorkerKey] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [remoteHistoryRows, setRemoteHistoryRows] = useState<
    WorkerConversationRow[] | null
  >(null);
  const [historyIndex, setHistoryIndex] = useState(0);
  const historyInputRef = useRef<HTMLInputElement>(null);
  const historyListRef = useRef<HTMLDivElement>(null);
  const historyItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const stateRef = useRef(state);
  const lastInitializedAgentKeyRef = useRef("");
  const lastLoadedChatKeyRef = useRef("");
  const lastOpenedHistoryRouteKeyRef = useRef("");
  const agentKey = useMemo(
    () => String(params.agentKey || "").trim(),
    [params.agentKey],
  );
  const chatId = useMemo(
    () => String(searchParams.get("chatId") || "").trim(),
    [searchParams],
  );
  const routeThemeMode = useMemo(
    () => normalizeRouteTheme(searchParams.get("theme") || ""),
    [searchParams],
  );
  const routeHistoryRequested = useMemo(
    () => String(searchParams.get("history") || "").trim() === "1",
    [searchParams],
  );
  const {
    filteredHistoryRows,
    workerChatsByKey,
  } = useLeftSidebarData({
    agents: state.agents,
    chatFilter: state.chatFilter,
    chats: state.chats,
    historySearch,
    historyWorkerKey,
    teams: state.teams,
    workerRows: state.workerRows,
  });
  const historyWorker =
    state.workerIndexByKey.get(historyWorkerKey) ||
    state.workerRows.find((row) => row.key === historyWorkerKey) ||
    null;

  useAppRuntimes();

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!agentKey) {
      return;
    }

    const nextAgents = upsertRouteAgent(state.agents, agentKey);
    if (nextAgents !== state.agents) {
      dispatch({ type: "SET_AGENTS", agents: nextAgents });
    }
  }, [agentKey, dispatch, state.agents]);

  useEffect(() => {
    if (!routeThemeMode || state.themeMode === routeThemeMode) {
      return;
    }

    dispatch({ type: "SET_THEME_MODE", themeMode: routeThemeMode });
  }, [dispatch, routeThemeMode, state.themeMode]);

  useEffect(() => {
    if (!agentKey) {
      return;
    }

    const workerKey = `agent:${agentKey}`;
    dispatch({ type: "SET_CONVERSATION_MODE", mode: "worker" });
    dispatch({ type: "SET_WORKER_SELECTION_KEY", workerKey });
    dispatch({ type: "SET_WORKER_PRIORITY_KEY", workerKey });
    dispatch({ type: "SET_PENDING_NEW_CHAT_AGENT_KEY", agentKey });

    if (chatId) {
      const routeKey = `${agentKey}\u0000${chatId}`;
      if (lastLoadedChatKeyRef.current === routeKey) {
        return;
      }
      lastLoadedChatKeyRef.current = routeKey;
      lastInitializedAgentKeyRef.current = "";
      window.dispatchEvent(
        new CustomEvent("agent:load-chat", {
          detail: {
            chatId,
            focusComposerOnComplete: true,
          },
        }),
      );
      return;
    }

    if (routeHistoryRequested) {
      lastInitializedAgentKeyRef.current = "";
      lastLoadedChatKeyRef.current = "";
      window.dispatchEvent(new CustomEvent("agent:focus-composer"));
      return;
    }

    if (lastInitializedAgentKeyRef.current === agentKey) {
      return;
    }
    lastInitializedAgentKeyRef.current = agentKey;
    lastLoadedChatKeyRef.current = "";
    window.dispatchEvent(
      new CustomEvent("agent:start-new-conversation", {
        detail: {
          agentKey,
          preserveWorkerContext: true,
          focusComposerOnComplete: true,
        },
      }),
    );
  }, [agentKey, chatId, dispatch, routeHistoryRequested]);

  const openRouteHistoryForWorker = useCallback((workerKey: string) => {
    const normalizedWorkerKey = String(workerKey || "").trim();
    if (!normalizedWorkerKey) return;
    const workerChats = workerChatsByKey.get(normalizedWorkerKey) || [];
    const currentChatIndex = workerChats.findIndex(
      (row) => String(row.chatId || "") === String(stateRef.current.chatId || ""),
    );
    setHistoryWorkerKey(normalizedWorkerKey);
    setHistorySearch("");
    setRemoteHistoryRows(null);
    setHistoryIndex(currentChatIndex >= 0 ? currentChatIndex : 0);

    const worker =
      stateRef.current.workerIndexByKey.get(normalizedWorkerKey) ||
      stateRef.current.workerRows.find((item) => item.key === normalizedWorkerKey);
    if (!worker || worker.type !== "agent") return;

    void getChats({ agentKey: worker.sourceId })
      .then((response) => {
        const fetchedChats = (Array.isArray(response.data) ? response.data : []) as Chat[];
        const chats = mergeFetchedChats(stateRef.current.chats, fetchedChats);
        dispatch({ type: "SET_CHATS", chats });
      })
      .catch((error) => {
        dispatch({
          type: "APPEND_DEBUG",
          line: `[loadChats error] ${(error as Error).message}`,
        });
      });
  }, [dispatch, workerChatsByKey]);

  useEffect(() => {
    if (!routeHistoryRequested || !agentKey) return;
    const workerKey = `agent:${agentKey}`;
    const routeKey = `${agentKey}\u0000${chatId}\u0000history`;
    if (lastOpenedHistoryRouteKeyRef.current === routeKey) return;
    if (!state.workerIndexByKey.has(workerKey)) return;

    lastOpenedHistoryRouteKeyRef.current = routeKey;
    window.dispatchEvent(
      new CustomEvent("agent:open-worker-history", {
        detail: { workerKey, agentKey },
      }),
    );
    openRouteHistoryForWorker(workerKey);
  }, [
    agentKey,
    chatId,
    openRouteHistoryForWorker,
    routeHistoryRequested,
    state.workerIndexByKey,
  ]);

  useEffect(() => {
    if (!historyWorkerKey) return;
    historyInputRef.current?.focus();
    historyInputRef.current?.select();
  }, [historyWorkerKey]);

  const handleCloseHistory = () => {
    setHistoryWorkerKey("");
    setHistorySearch("");
    setHistoryIndex(0);
    setRemoteHistoryRows(null);
  };

  const handleSelectHistoryChat = (selectedChatId: string) => {
    window.dispatchEvent(
      new CustomEvent("agent:load-chat", {
        detail: {
          chatId: selectedChatId,
          focusComposerOnComplete: true,
        },
      }),
    );
  };

  const timelineEntries = useMemo(() => {
    return state.timelineOrder
      .map((id) => state.timelineNodes.get(id))
      .filter((node): node is NonNullable<typeof node> => Boolean(node));
  }, [state.timelineOrder, state.timelineNodes]);
  const isTimelineEmpty = useMemo(() => {
    return (
      buildTimelineDisplayItems(timelineEntries, state.events).length === 0
    );
  }, [timelineEntries, state.events]);
  return (
    <div
      className={`app-shell layout-desktop-fixed layout-agent-route ${state.rightSidebarOpen ? "desktop-debug-enabled" : "desktop-debug-disabled"} ${state.terminalDockOpen ? "terminal-dock-open" : ""} ${isTimelineEmpty ? "timeline-empty-layout" : ""}`.trim()}
      id="app"
    >
      <TopNav />
      <ConversationStage />
      <RightSidebar />
      <BottomDock />
      {state.terminalDockOpen ? <TerminalDock /> : null}
      <CommandStatusOverlay />
      {state.archiveOpen ? <ArchiveModal /> : null}
      {state.memoryInfoOpen ? <MemoryInfoModal /> : null}
      {state.settingsOpen && <SettingsModal />}
      <CommandModal />
      <ActionModal />
      <EventPopover />
      <FireworksCanvas />
      <SidebarHistorySection
        open={Boolean(historyWorkerKey)}
        historyWorker={historyWorker}
        historyRows={remoteHistoryRows ?? filteredHistoryRows}
        historyIndex={historyIndex}
        historySearch={historySearch}
        historyInputRef={historyInputRef}
        historyListRef={historyListRef}
        historyItemRefs={historyItemRefs}
        onClose={handleCloseHistory}
        onHistorySearchChange={(value) => {
          setHistorySearch(value);
          setHistoryIndex(0);
          if (!value.trim()) {
            setRemoteHistoryRows(null);
          }
        }}
        onActivateIndex={setHistoryIndex}
        onSelectChat={handleSelectHistoryChat}
        onChatDeleted={(deletedChatId) => {
          setRemoteHistoryRows((rows) =>
            rows
              ? rows.filter((row) => String(row.chatId || "") !== deletedChatId)
              : rows,
          );
        }}
      />
    </div>
  );
};
