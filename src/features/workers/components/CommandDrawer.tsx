import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAppState } from "@/app/state/AppContext";
import { Drawer } from "antd";
import type { Agent, Team } from "@/app/state/types";
import type { CommandOverlayState } from "@/features/workers/lib/commandOverlay";
import {
  buildWorkerSwitchRows,
  resolveCurrentWorkerSummary,
} from "@/features/workers/lib/currentWorker";
import { HistoryModal } from "@/features/chats/components/HistoryModal";
import { AutomationHistoryConsole } from "@/features/automations/components/AutomationHistoryConsole";
import {
  SWITCH_SCOPES,
  SwitchModal,
} from "@/features/workers/components/SwitchModal";
import { AgentConsole } from "@/features/workers/components/AgentConsole";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/icons/material";

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}

interface CommandDrawerProps {
  modal: CommandOverlayState;
  onPatch: (patch: Partial<CommandOverlayState>) => void;
  onClose: (restoreComposerFocus?: boolean) => void;
}

export const CommandDrawer: React.FC<CommandDrawerProps> = ({
  modal,
  onPatch,
  onClose,
}) => {
  const state = useAppState();
  const { t } = useI18n();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const switchListRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const switchItemRefs = useRef<Array<HTMLElement | null>>([]);
  const [agentConsoleDirty, setAgentConsoleDirty] = useState(false);

  const currentWorker = useMemo(
    () => (modal.type === "agents" ? null : resolveCurrentWorkerSummary(state)),
    [modal.type, state],
  );
  const switchRows = useMemo(
    () =>
      modal.type === "switch"
        ? buildWorkerSwitchRows(state.workerRows, modal.scope, modal.searchText)
        : [],
    [modal.scope, modal.searchText, modal.type, state.workerRows],
  );
  const workerIconsByKey = useMemo(() => {
    if (modal.type !== "switch") {
      return undefined;
    }
    const icons = new Map<string, Agent["icon"] | Team["icon"]>();
    for (const agent of state.agents) {
      icons.set(`agent:${agent.key}`, agent.icon);
    }
    for (const team of state.teams) {
      icons.set(`team:${team.teamId}`, team.icon);
    }
    return icons;
  }, [modal.type, state.agents, state.teams]);

  const switchIndex = clampIndex(modal.activeIndex, switchRows.length);

  const closeDrawer = (restoreComposerFocus = true) => {
    if (
      modal.type === "agents" &&
      agentConsoleDirty &&
      !window.confirm(t("agentConsole.confirm.close"))
    ) {
      return;
    }
    onClose(restoreComposerFocus);
  };

  const selectHistoryChat = (chatId: string) => {
    const normalizedChatId = String(chatId || "").trim();
    if (!normalizedChatId) return;
    closeDrawer(false);
    window.dispatchEvent(
      new CustomEvent("agent:load-chat", {
        detail: {
          chatId: normalizedChatId,
          focusComposerOnComplete: true,
        },
      }),
    );
  };

  const selectWorker = (index: number) => {
    const target = switchRows[index];
    if (!target) return;
    closeDrawer(false);
    window.dispatchEvent(
      new CustomEvent("agent:select-worker", {
        detail: {
          workerKey: target.key,
          focusComposerOnComplete: true,
        },
      }),
    );
  };

  useEffect(() => {
    if (!modal.open) return;
    if (modal.type === "switch") {
      if (modal.focusArea === "list") {
        switchListRef.current?.focus();
      } else {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
      return;
    }
    if (modal.type === "history") return;
    cardRef.current?.focus();
  }, [modal.focusArea, modal.open, modal.type]);

  useEffect(() => {
    if (!modal.open || modal.type !== "switch") return;
    switchItemRefs.current[switchIndex]?.scrollIntoView({ block: "nearest" });
  }, [modal.open, modal.type, switchIndex]);

  if (!modal.open || !modal.type) {
    return null;
  }

  const isConsoleModal = modal.type === "automation" || modal.type === "agents";

  return (
    <Drawer
      open={modal.open}
      closable={false}
      destroyOnHidden
      placement="right"
      width="100%"
      className={`copilot-drawer ${isConsoleModal ? "is-automation-console" : ""}`.trim()}
      styles={{
        header: {
          borderBottom: 0,
          flex: "unset",
          padding: 10,
        },
      }}
    >
      <div
        ref={cardRef}
        className={
          isConsoleModal
            ? "command-modal-card is-automation-console"
            : "tw:h-full tw:overflow-auto"
        }
        onKeyDown={(event) => {
          if (modal.type === "switch") {
            if (event.key === "ArrowRight") {
              event.preventDefault();
              const currentScopeIndex = SWITCH_SCOPES.findIndex(
                (item) => item.key === modal.scope,
              );
              const nextScope =
                SWITCH_SCOPES[(currentScopeIndex + 1) % SWITCH_SCOPES.length]
                  ?.key || "all";
              onPatch({ scope: nextScope, activeIndex: 0 });
              return;
            }
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              const currentScopeIndex = SWITCH_SCOPES.findIndex(
                (item) => item.key === modal.scope,
              );
              const nextScope =
                SWITCH_SCOPES[
                  (currentScopeIndex - 1 + SWITCH_SCOPES.length) %
                    SWITCH_SCOPES.length
                ]?.key || "all";
              onPatch({ scope: nextScope, activeIndex: 0 });
              return;
            }
            if (event.key === "ArrowDown" && switchRows.length > 0) {
              event.preventDefault();
              onPatch({
                activeIndex: clampIndex(
                  modal.activeIndex + 1,
                  switchRows.length,
                ),
                focusArea: "list",
              });
              window.requestAnimationFrame(() => {
                switchListRef.current?.focus();
              });
              return;
            }
            if (event.key === "ArrowUp" && switchRows.length > 0) {
              event.preventDefault();
              onPatch({
                activeIndex: clampIndex(
                  modal.activeIndex - 1,
                  switchRows.length,
                ),
                focusArea: "list",
              });
              window.requestAnimationFrame(() => {
                switchListRef.current?.focus();
              });
              return;
            }
            if (event.key === "Enter" && switchRows.length > 0) {
              event.preventDefault();
              selectWorker(switchIndex);
            }
            return;
          }
        }}
      >
        {modal.type === "history" && (
          <HistoryModal
            onSelectChat={selectHistoryChat}
            onClose={() => closeDrawer()}
            titleBarVariant="drawer"
          />
        )}

        {modal.type === "switch" && (
          <SwitchModal
            scope={modal.scope}
            searchText={modal.searchText}
            switchRows={switchRows}
            switchIndex={switchIndex}
            variant="copilot"
            workerIconsByKey={workerIconsByKey}
            searchInputRef={searchInputRef}
            switchListRef={switchListRef}
            switchItemRefs={switchItemRefs}
            onSearchChange={(value) =>
              onPatch({
                searchText: value,
                activeIndex: 0,
                focusArea: "search",
              })
            }
            onScopeChange={(scope) => onPatch({ scope, activeIndex: 0 })}
            onActivateIndex={(index) => onPatch({ activeIndex: index })}
            onSelect={selectWorker}
            onClose={closeDrawer}
          />
        )}

        {modal.type === "automation" && (
          <AutomationHistoryConsole
            currentWorker={currentWorker}
            agents={state.agents}
            teams={state.teams}
            embedded
            onClose={() => closeDrawer()}
            titleBarVariant="drawer"
          />
        )}

        {modal.type === "agents" && (
          <AgentConsole
            embedded
            onClose={() => closeDrawer()}
            titleBarVariant="drawer"
            onDirtyChange={setAgentConsoleDirty}
          />
        )}
      </div>
    </Drawer>
  );
};
