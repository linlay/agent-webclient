import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  useAppDispatch,
  useAppState,
  useOptionalAppContext,
} from "@/app/state/AppContext";
import { Modal } from "antd";
import type { WorkerConversationRow } from "@/app/state/types";
import type { CommandOverlayState } from "@/features/workers/lib/commandOverlay";
import { resolveCurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import { useWorkerHistoryRows } from "@/features/workers/hooks/useWorkerHistoryRows";
import { HistoryModal } from "@/features/chats/components/HistoryModal";
import { AutomationModal } from "@/app/modals/AutomationModal";
import { AgentConsole } from "@/features/workers/components/AgentConsole";
import { markChatRead } from "@/shared/data";
import { useI18n } from "@/shared/i18n";

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}

function includesTarget(
  container: HTMLElement | null,
  target: EventTarget | null,
): boolean {
  return Boolean(
    container && target instanceof Node && container.contains(target),
  );
}

function findChatIndex(rows: WorkerConversationRow[], chatId: string): number {
  const normalizedChatId = String(chatId || "").trim();
  if (!normalizedChatId) return -1;
  return rows.findIndex(
    (row) => String(row.chatId || "").trim() === normalizedChatId,
  );
}

interface CommandModalProps {
  modal: CommandOverlayState;
  onPatch: (patch: Partial<CommandOverlayState>) => void;
  onClose: (restoreComposerFocus?: boolean) => void;
  variant?: "default" | "copilot";
}

export const CommandModal: React.FC<CommandModalProps> = ({
  modal,
  onPatch,
  onClose,
  variant = "default",
}) => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const appContext =
    typeof useOptionalAppContext === "function"
      ? useOptionalAppContext()
      : null;
  const querySessionsRef = appContext?.querySessionsRef || {
    current: new Map(),
  };
  const { t } = useI18n();
  const historyInputRef = useRef<HTMLInputElement>(null);
  const historyListRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const historyItemRefs = useRef<Array<HTMLElement | null>>([]);
  const historyDefaultSelectionAppliedRef = useRef(false);
  const [agentConsoleDirty, setAgentConsoleDirty] = useState(false);

  const currentWorker = useMemo(
    () => (modal.type === "agents" ? null : resolveCurrentWorkerSummary(state)),
    [modal.type, state],
  );

  const {
    historyRows: filteredHistoryRows,
    historyLoading,
    historyError,
    removeHistoryRow,
  } = useWorkerHistoryRows({
    modal,
    currentWorker,
    state,
    querySessionsRef,
    dispatch,
  });
  const historyIndex = clampIndex(
    modal.activeIndex,
    filteredHistoryRows.length,
  );

  const closeModal = (restoreComposerFocus = true) => {
    if (
      modal.type === "agents" &&
      agentConsoleDirty &&
      !window.confirm(t("agentConsole.confirm.close"))
    ) {
      return;
    }
    onClose(restoreComposerFocus);
  };

  const selectHistory = (index: number) => {
    const target = filteredHistoryRows[index];
    if (!target) return;
    closeModal(false);
    window.dispatchEvent(
      new CustomEvent("agent:load-chat", {
        detail: {
          chatId: target.chatId,
          focusComposerOnComplete: true,
        },
      }),
    );
  };

  const markCurrentWorkerAllRead = async (
    event: React.MouseEvent<HTMLElement>,
  ) => {
    event.stopPropagation();
    if (!currentWorker || currentWorker.type !== "agent") return;
    const agentKey = String(currentWorker.sourceId || "").trim();
    if (!agentKey) return;
    dispatch({ type: "MARK_AGENT_CHATS_READ", agentKey });
    try {
      await markChatRead({ agentKey });
    } catch (error) {
      dispatch({
        type: "APPEND_DEBUG",
        line: `[mark all read error] ${(error as Error).message}`,
      });
      window.dispatchEvent(new CustomEvent("agent:refresh-worker-data"));
    }
  };

  useEffect(() => {
    if (!modal.open) return;
    if (modal.type === "history") {
      historyInputRef.current?.focus();
      historyInputRef.current?.select();
      return;
    }
    cardRef.current?.focus();
  }, [modal.open, modal.type]);

  useEffect(() => {
    if (!modal.open || modal.type !== "history") return;
    historyItemRefs.current[historyIndex]?.scrollIntoView({ block: "nearest" });
  }, [historyIndex, modal.open, modal.type]);

  useEffect(() => {
    if (!modal.open || modal.type !== "history" || modal.historySearch) {
      historyDefaultSelectionAppliedRef.current = false;
      return;
    }
    if (historyDefaultSelectionAppliedRef.current) return;

    const currentChatIndex = findChatIndex(filteredHistoryRows, state.chatId);
    if (currentChatIndex < 0) return;

    historyDefaultSelectionAppliedRef.current = true;
    if (modal.activeIndex === currentChatIndex) return;
    onPatch({ activeIndex: currentChatIndex });
  }, [
    filteredHistoryRows,
    modal.activeIndex,
    modal.historySearch,
    modal.open,
    modal.type,
    onPatch,
    state.chatId,
  ]);

  if (!modal.open || !modal.type) {
    return null;
  }

  const subtitle =
    modal.type === "automation" || modal.type === "agents"
      ? ""
      : currentWorker
        ? `${currentWorker.type === "team" ? t("worker.kindLabel.team") : t("worker.kindLabel.agent")} · ${currentWorker.displayName}`
        : t("topNav.noSelection");
  const isConsoleModal = modal.type === "automation" || modal.type === "agents";
  const titleKey =
    modal.type === "history"
      ? "commandModal.history.title"
      : modal.type === "automation"
        ? "commandModal.automation.title"
        : "commandModal.agents.title";
  const title = (
    <div className="command-modal-title">
      <span>{t(titleKey)}</span>
      {subtitle ? <span className="command-modal-subtitle">{subtitle}</span> : null}
    </div>
  );

  return (
    <Modal
      open={modal.open}
      onCancel={() => closeModal()}
      title={title}
      footer={null}
      centered
      destroyOnHidden
      getContainer={false}
      width={
        isConsoleModal
          ? "min(1120px, calc(100vw - 32px))"
          : "min(780px, calc(100vw - 32px))"
      }
      className={`command-modal ${isConsoleModal ? "is-automation-console" : ""} ${variant === "copilot" ? "copilot-modal" : ""}`.trim()}
    >
      <div
        ref={cardRef}
        className={`command-modal-card ${isConsoleModal ? "is-automation-console" : ""}`}
        onKeyDown={(event) => {
          if (modal.type === "history") {
            const target = event.target;
            if (event.key === "ArrowDown" && filteredHistoryRows.length > 0) {
              event.preventDefault();
              onPatch({
                activeIndex: clampIndex(
                  modal.activeIndex + 1,
                  filteredHistoryRows.length,
                ),
              });
              if (
                target === historyInputRef.current ||
                !includesTarget(historyListRef.current, event.target)
              ) {
                window.requestAnimationFrame(() => {
                  historyListRef.current?.focus();
                });
              }
              return;
            }
            if (event.key === "ArrowUp" && filteredHistoryRows.length > 0) {
              event.preventDefault();
              onPatch({
                activeIndex: clampIndex(
                  modal.activeIndex - 1,
                  filteredHistoryRows.length,
                ),
              });
              if (
                event.target === historyInputRef.current ||
                !includesTarget(historyListRef.current, event.target)
              ) {
                window.requestAnimationFrame(() => {
                  historyListRef.current?.focus();
                });
              }
              return;
            }
            if (event.key === "Enter" && filteredHistoryRows.length > 0) {
              event.preventDefault();
              selectHistory(historyIndex);
            }
            return;
          }

          if (modal.type === "automation" || modal.type === "agents") return;

        }}
      >
        {modal.type === "history" && (
          <HistoryModal
            historyRows={filteredHistoryRows}
            historyIndex={historyIndex}
            historySearch={modal.historySearch}
            historyLoading={historyLoading}
            historyError={historyError}
            historyInputRef={historyInputRef}
            historyListRef={historyListRef}
            historyItemRefs={historyItemRefs}
            onHistorySearchChange={(value) => {
              onPatch({ historySearch: value, activeIndex: 0 });
            }}
            onActivateIndex={(index) => onPatch({ activeIndex: index })}
            onMarkAllRead={
              currentWorker?.type === "agent"
                ? markCurrentWorkerAllRead
                : undefined
            }
            onChatDeleted={(chatId) => {
              removeHistoryRow(chatId);
            }}
            onSelect={selectHistory}
          />
        )}

        {modal.type === "automation" && (
          <AutomationModal
            currentWorker={currentWorker}
            agents={state.agents}
            teams={state.teams}
            embedded
          />
        )}

        {modal.type === "agents" && (
          <AgentConsole embedded onDirtyChange={setAgentConsoleDirty} />
        )}
      </div>
    </Modal>
  );
};
