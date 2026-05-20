import React, { useEffect, useMemo, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import type { Agent } from "@/app/state/types";
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
  const lastInitializedAgentKeyRef = useRef("");
  const lastLoadedChatKeyRef = useRef("");
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

  useAppRuntimes();

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
  }, [agentKey, chatId, dispatch]);

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
    </div>
  );
};
