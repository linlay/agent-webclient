import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import { Modal } from "antd";
import type { Agent, Team, WorkerConversationRow } from "@/app/state/types";
import type { CommandOverlayState } from "@/features/workers/lib/commandOverlay";
import {
  buildCurrentWorkerDetailView,
  buildWorkerSwitchRows,
  resolveCurrentWorkerSummary,
} from "@/features/workers/lib/currentWorker";
import { DetailModal } from "@/features/workers/components/DetailModal";
import { HistoryModal } from "@/app/modals/HistoryModal";
import { AutomationModal } from "@/app/modals/AutomationModal";
import { SWITCH_SCOPES, SwitchModal } from "@/features/workers/components/SwitchModal";
import { AgentConsole } from "@/features/workers/components/AgentConsole";
import {
  markChatRead,
  searchGlobal,
} from "@/shared/data";
import { buildWorkerConversationRows } from "@/features/workers/lib/workerConversationFormatter";
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
  const { t } = useI18n();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const historyInputRef = useRef<HTMLInputElement>(null);
  const switchListRef = useRef<HTMLDivElement>(null);
  const historyListRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const switchItemRefs = useRef<Array<HTMLElement | null>>([]);
  const historyItemRefs = useRef<Array<HTMLElement | null>>([]);
  const historyDefaultSelectionAppliedRef = useRef(false);
  const [remoteHistoryRows, setRemoteHistoryRows] = useState<
    WorkerConversationRow[] | null
  >(null);

  const currentWorker = useMemo(
    () => (modal.type === "agents" ? null : resolveCurrentWorkerSummary(state)),
    [modal.type, state],
  );
  const currentWorkerKey = currentWorker?.key || "";
  const currentWorkerType = currentWorker?.type || "";
  const currentWorkerSourceId = currentWorker?.sourceId || "";
  const detailView = useMemo(
    () =>
      modal.type === "detail" && currentWorker
        ? buildCurrentWorkerDetailView(currentWorker)
        : null,
    [currentWorker, modal.type],
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

  const workerChatsByKey = useMemo(() => {
    if (modal.type !== "history") {
      return null;
    }
    const chatsByKey = new Map<string, WorkerConversationRow[]>();
    for (const row of state.workerRows) {
      chatsByKey.set(
        row.key,
        buildWorkerConversationRows({
          chats: state.chats,
          worker: row,
        }),
      );
    }
    return chatsByKey;
  }, [modal.type, state.chats, state.workerRows]);
  const filteredHistoryRows = useMemo(() => {
    if (modal.type !== "history") {
      return [];
    }
    const rows =
      remoteHistoryRows ?? workerChatsByKey?.get(currentWorkerKey) ?? [];
    const search = String(modal.historySearch || "")
      .trim()
      .toLowerCase();
    if (!search) return rows;
    return rows.filter((row) => {
      const haystack = [row.chatName, row.chatId, row.lastRunContent]
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    });
  }, [
    currentWorkerKey,
    modal.historySearch,
    modal.type,
    remoteHistoryRows,
    workerChatsByKey,
  ]);
  const switchIndex = clampIndex(modal.activeIndex, switchRows.length);
  const historyIndex = clampIndex(
    modal.activeIndex,
    filteredHistoryRows.length,
  );

  const closeModal = (restoreComposerFocus = true) => {
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

  const selectWorker = (index: number) => {
    const target = switchRows[index];
    if (!target) return;
    closeModal(false);
    window.dispatchEvent(
      new CustomEvent("agent:select-worker", {
        detail: {
          workerKey: target.key,
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
    if (modal.type === "switch") {
      if (modal.focusArea === "list") {
        switchListRef.current?.focus();
      } else {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
      return;
    }
    if (modal.type === "history") {
      historyInputRef.current?.focus();
      historyInputRef.current?.select();
      return;
    }
    if (modal.type === "automation") {
      cardRef.current?.focus();
      return;
    }
    if (modal.type === "detail") {
      cardRef.current?.focus();
      return;
    }
    cardRef.current?.focus();
  }, [modal.focusArea, modal.open, modal.type]);

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

  useEffect(() => {
    const query = String(modal.historySearch || "").trim();
    if (
      !modal.open ||
      modal.type !== "history" ||
      !currentWorkerType ||
      !currentWorkerSourceId ||
      !query
    ) {
      setRemoteHistoryRows(null);
      return;
    }
    setRemoteHistoryRows(null);
    const timer = window.setTimeout(() => {
      const params =
        currentWorkerType === "team"
          ? { query, teamId: currentWorkerSourceId, limit: 30 }
          : { query, agentKey: currentWorkerSourceId, limit: 30 };
      void searchGlobal(params)
        .then((response) => {
          const results = Array.isArray(response.data?.results)
            ? response.data.results
            : [];
          setRemoteHistoryRows(
            results
              .map((result) => ({
                chatId: String(result.chatId || ""),
                chatName: String(result.chatName || result.chatId || ""),
                agentKey: result.agentKey,
                teamId: result.teamId,
                updatedAt: Number(result.timestamp) || 0,
                lastRunId: String(result.runId || ""),
                lastRunContent: String(result.snippet || ""),
                searchSnippet: String(result.snippet || ""),
                isRead: true,
              }))
              .filter((row) => row.chatId),
          );
        })
        .catch((error) => {
          dispatch({
            type: "APPEND_DEBUG",
            line: `[search error] ${(error as Error).message}`,
          });
          setRemoteHistoryRows([]);
        });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [
    currentWorkerSourceId,
    currentWorkerType,
    dispatch,
    modal.historySearch,
    modal.open,
    modal.type,
  ]);

  useEffect(() => {
    if (!modal.open || modal.type !== "switch") return;
    switchItemRefs.current[switchIndex]?.scrollIntoView({ block: "nearest" });
  }, [modal.open, modal.type, switchIndex]);

  if (!modal.open || !modal.type) {
    return null;
  }

  const subtitle =
    modal.type === "automation" || modal.type === "agents"
      ? ""
      : currentWorker
        ? `${currentWorker.type === "team" ? t("switch.workerType.team") : t("switch.workerType.agent")} · ${currentWorker.displayName}`
        : t("topNav.noSelection");
  const isConsoleModal = modal.type === "automation" || modal.type === "agents";
  const titleKey =
    modal.type === "history"
      ? "commandModal.history.title"
      : modal.type === "switch"
        ? "commandModal.switch.title"
        : modal.type === "detail"
          ? "commandModal.detail.title"
          : modal.type === "automation"
            ? "commandModal.automation.title"
            : "commandModal.agents.title";
  const title = (
    <div className="command-modal-title">
      <span>{t(titleKey)}</span>
      {subtitle ? <p className="command-modal-subtitle">{subtitle}</p> : null}
    </div>
  );

  return (
    <Modal
      open={modal.open}
      onCancel={() => closeModal()}
      title={title}
      footer={null}
      destroyOnHidden
      getContainer={false}
      width={
        isConsoleModal
          ? "min(1120px, calc(100vw - 32px))"
          : "min(780px, calc(100vw - 32px))"
      }
      className={`command-modal ${isConsoleModal ? "is-automation-console" : ""}`.trim()}
    >
      <div
        ref={cardRef}
        className={`command-modal-card ${isConsoleModal ? "is-automation-console" : ""}`}
        tabIndex={-1}
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

          if (modal.type === "automation" || modal.type === "agents") return;
        }}
      >
        {modal.type === "history" && (
          <HistoryModal
            historyRows={filteredHistoryRows}
            historyIndex={historyIndex}
            historySearch={modal.historySearch}
            historyInputRef={historyInputRef}
            historyListRef={historyListRef}
            historyItemRefs={historyItemRefs}
            onHistorySearchChange={(value) => {
              if (!value.trim()) {
                setRemoteHistoryRows(null);
              }
              onPatch({ historySearch: value, activeIndex: 0 });
            }}
            onActivateIndex={(index) => onPatch({ activeIndex: index })}
            onMarkAllRead={
              currentWorker?.type === "agent"
                ? markCurrentWorkerAllRead
                : undefined
            }
            onChatDeleted={(chatId) => {
              setRemoteHistoryRows((rows) =>
                rows
                  ? rows.filter((row) => String(row.chatId || "") !== chatId)
                  : rows,
              );
            }}
            onSelect={selectHistory}
          />
        )}

        {modal.type === "switch" && (
          <SwitchModal
            scope={modal.scope}
            searchText={modal.searchText}
            switchRows={switchRows}
            switchIndex={switchIndex}
            variant={variant === "copilot" ? "copilot" : "default"}
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
            onScopeChange={(scope) =>
              onPatch({ scope, activeIndex: 0 })
            }
            onActivateIndex={(index) => onPatch({ activeIndex: index })}
            onSelect={selectWorker}
          />
        )}

        {modal.type === "detail" && detailView && (
          <DetailModal detailView={detailView} />
        )}

        {modal.type === "automation" && (
          <AutomationModal
            currentWorker={currentWorker}
            agents={state.agents}
            teams={state.teams}
          />
        )}

        {modal.type === "agents" && <AgentConsole embedded />}
      </div>
    </Modal>
  );
};
