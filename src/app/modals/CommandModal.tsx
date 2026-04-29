import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import type { WorkerConversationRow } from "@/app/state/types";
import {
  buildCurrentWorkerDetailView,
  buildWorkerSwitchRows,
  resolveCurrentWorkerSummary,
} from "@/features/workers/lib/currentWorker";
import { CommandModalHeader } from "@/app/modals/CommandModalHeader";
import { DetailModal } from "@/app/modals/DetailModal";
import { HistoryModal } from "@/app/modals/HistoryModal";
import { ScheduleModal } from "@/app/modals/ScheduleModal";
import { SWITCH_SCOPES, SwitchModal } from "@/app/modals/SwitchModal";
import {
  markChatRead,
  searchGlobal,
} from "@/features/transport/lib/apiClientProxy";
import { buildWorkerConversationRows } from "@/features/workers/lib/workerConversationFormatter";

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

export const CommandModal: React.FC = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const historyInputRef = useRef<HTMLInputElement>(null);
  const switchListRef = useRef<HTMLDivElement>(null);
  const historyListRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const switchItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const historyItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const historyDefaultSelectionAppliedRef = useRef(false);
  const [remoteHistoryRows, setRemoteHistoryRows] = useState<
    WorkerConversationRow[] | null
  >(null);

  const modal = state.commandModal;
  const currentWorker = useMemo(
    () => resolveCurrentWorkerSummary(state),
    [state],
  );
  const currentWorkerType = currentWorker?.type || "";
  const currentWorkerSourceId = currentWorker?.sourceId || "";
  const detailView = useMemo(
    () => (currentWorker ? buildCurrentWorkerDetailView(currentWorker) : null),
    [currentWorker],
  );
  const switchRows = useMemo(
    () =>
      buildWorkerSwitchRows(state.workerRows, modal.scope, modal.searchText),
    [modal.scope, modal.searchText, state.workerRows],
  );

  const workerChatsByKey = useMemo(() => {
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
  }, [state.chats, state.workerRows]);
  const filteredHistoryRows = useMemo(() => {
    const rows = workerChatsByKey.get(currentWorker?.key || "") || [];
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
  }, [currentWorker, modal.historySearch, remoteHistoryRows]);
  const switchIndex = clampIndex(modal.activeIndex, switchRows.length);
  const historyIndex = clampIndex(
    modal.activeIndex,
    filteredHistoryRows.length,
  );

  const closeModal = (restoreComposerFocus = true) => {
    dispatch({ type: "CLOSE_COMMAND_MODAL" });
    if (restoreComposerFocus) {
      window.dispatchEvent(new CustomEvent("agent:focus-composer"));
    }
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
    if (modal.type === "schedule") {
      closeButtonRef.current?.focus();
      return;
    }
    if (modal.type === "detail") {
      closeButtonRef.current?.focus();
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
    dispatch({
      type: "PATCH_COMMAND_MODAL",
      modal: { activeIndex: currentChatIndex },
    });
  }, [
    dispatch,
    filteredHistoryRows,
    modal.activeIndex,
    modal.historySearch,
    modal.open,
    modal.type,
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
    modal.type === "schedule"
      ? ""
      : currentWorker
        ? `${currentWorker.type === "team" ? "小组" : "员工"} · ${currentWorker.displayName}`
        : "当前未选中员工";
  return (
    <div
      className="modal"
      id="command-modal"
      onClick={(event) => {
        if (event.target === event.currentTarget) closeModal();
      }}
    >
      <div
	        ref={cardRef}
	        className={`modal-card command-modal-card ${modal.type === "schedule" ? "is-schedule-console" : ""}`}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            closeModal();
            return;
          }

          if (modal.type === "history") {
            const target = event.target;
            if (event.key === "Tab") {
              event.preventDefault();
              if (event.shiftKey) {
                if (target === closeButtonRef.current) {
                  historyListRef.current?.focus();
                  return;
                }
                if (includesTarget(historyListRef.current, target)) {
                  historyInputRef.current?.focus();
                  historyInputRef.current?.select();
                  return;
                }
                closeButtonRef.current?.focus();
                return;
              }
              if (target === historyInputRef.current) {
                historyListRef.current?.focus();
                return;
              }
              if (includesTarget(historyListRef.current, target)) {
                closeButtonRef.current?.focus();
                return;
              }
              historyInputRef.current?.focus();
              historyInputRef.current?.select();
              return;
            }
            if (event.key === "ArrowDown" && filteredHistoryRows.length > 0) {
              event.preventDefault();
              dispatch({
                type: "PATCH_COMMAND_MODAL",
                modal: {
                  activeIndex: clampIndex(
                    modal.activeIndex + 1,
                    filteredHistoryRows.length,
                  ),
                },
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
              dispatch({
                type: "PATCH_COMMAND_MODAL",
                modal: {
                  activeIndex: clampIndex(
                    modal.activeIndex - 1,
                    filteredHistoryRows.length,
                  ),
                },
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
            if (event.key === "Tab") {
              event.preventDefault();
              const nextFocusArea =
                modal.focusArea === "search" ? "list" : "search";
              dispatch({
                type: "PATCH_COMMAND_MODAL",
                modal: { focusArea: nextFocusArea },
              });
              window.requestAnimationFrame(() => {
                if (nextFocusArea === "search") {
                  searchInputRef.current?.focus();
                  searchInputRef.current?.select();
                } else {
                  switchListRef.current?.focus();
                }
              });
              return;
            }
            if (event.key === "ArrowRight") {
              event.preventDefault();
              const currentScopeIndex = SWITCH_SCOPES.findIndex(
                (item) => item.key === modal.scope,
              );
              const nextScope =
                SWITCH_SCOPES[(currentScopeIndex + 1) % SWITCH_SCOPES.length]
                  ?.key || "all";
              dispatch({
                type: "PATCH_COMMAND_MODAL",
                modal: { scope: nextScope, activeIndex: 0 },
              });
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
              dispatch({
                type: "PATCH_COMMAND_MODAL",
                modal: { scope: nextScope, activeIndex: 0 },
              });
              return;
            }
            if (event.key === "ArrowDown" && switchRows.length > 0) {
              event.preventDefault();
              dispatch({
                type: "PATCH_COMMAND_MODAL",
                modal: {
                  activeIndex: clampIndex(
                    modal.activeIndex + 1,
                    switchRows.length,
                  ),
                  focusArea: "list",
                },
              });
              window.requestAnimationFrame(() => {
                switchListRef.current?.focus();
              });
              return;
            }
            if (event.key === "ArrowUp" && switchRows.length > 0) {
              event.preventDefault();
              dispatch({
                type: "PATCH_COMMAND_MODAL",
                modal: {
                  activeIndex: clampIndex(
                    modal.activeIndex - 1,
                    switchRows.length,
                  ),
                  focusArea: "list",
                },
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

          if (modal.type === "schedule") return;
        }}
      >
        <CommandModalHeader
          type={modal.type}
          subtitle={subtitle}
          closeButtonRef={closeButtonRef}
          onClose={() => closeModal()}
        />

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
              dispatch({
                type: "PATCH_COMMAND_MODAL",
                modal: { historySearch: value, activeIndex: 0 },
              });
            }}
            onActivateIndex={(index) =>
              dispatch({
                type: "PATCH_COMMAND_MODAL",
                modal: { activeIndex: index },
              })
            }
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
            searchInputRef={searchInputRef}
            switchListRef={switchListRef}
            switchItemRefs={switchItemRefs}
            onSearchChange={(value) =>
              dispatch({
                type: "PATCH_COMMAND_MODAL",
                modal: {
                  searchText: value,
                  activeIndex: 0,
                  focusArea: "search",
                },
              })
            }
            onScopeChange={(scope) =>
              dispatch({
                type: "PATCH_COMMAND_MODAL",
                modal: { scope, activeIndex: 0 },
              })
            }
            onActivateIndex={(index) =>
              dispatch({
                type: "PATCH_COMMAND_MODAL",
                modal: { activeIndex: index },
              })
            }
            onSelect={selectWorker}
          />
        )}

        {modal.type === "detail" && detailView && (
          <DetailModal detailView={detailView} />
        )}

        {modal.type === "schedule" && (
          <ScheduleModal
            currentWorker={currentWorker}
            agents={state.agents}
            teams={state.teams}
          />
        )}
      </div>
    </div>
  );
};
