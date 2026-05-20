import React, { useEffect, useMemo, useRef } from "react";
import { useParams } from "react-router-dom";
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

export const AgentChatShell: React.FC = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const params = useParams<{ agentKey?: string }>();
  const lastInitializedAgentKeyRef = useRef("");
  const agentKey = useMemo(
    () => String(params.agentKey || "").trim(),
    [params.agentKey],
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
    if (!agentKey || lastInitializedAgentKeyRef.current === agentKey) {
      return;
    }

    lastInitializedAgentKeyRef.current = agentKey;

    window.dispatchEvent(
      new CustomEvent("agent:start-new-conversation", {
        detail: {
          agentKey,
          preserveWorkerContext: true,
          focusComposerOnComplete: true,
        },
      }),
    );
  }, [agentKey]);

  return (
    <div
      className={`app-shell layout-desktop-fixed layout-agent-route ${state.rightSidebarOpen ? "desktop-debug-enabled" : "desktop-debug-disabled"} ${state.terminalDockOpen ? "terminal-dock-open" : ""}`.trim()}
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
