import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import { Modal } from "antd";
import type { Agent, Team, WorkerConversationRow } from "@/app/state/types";
import { resolveCurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import { buildWorkerConversationRows } from "@/features/workers/lib/workerConversationFormatter";
import { buildGlobalRows } from "@/features/search/lib/globalSearchRows";
import type { GlobalRow } from "@/features/search/lib/globalSearchRows";
import { GlobalSearchPanel } from "@/features/search/components/GlobalSearchPanel";
import { searchGlobal } from "@/shared/data";
import { useI18n } from "@/shared/i18n";
import { useSettingsOverlayActions } from "@/features/settings/components/SettingsOverlayProvider";
import {
  useGlobalSearchActions,
  useGlobalSearchOpen,
} from "@/features/search/components/GlobalSearchOverlayProvider";
import { useCommandOverlayActions } from "@/features/workers/components/CommandOverlayProvider";
import { readEpochMillis } from "@/shared/utils/platformTime";

export const GlobalSearchOverlay: React.FC = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { t } = useI18n();
  const { openOverlay } = useSettingsOverlayActions();
  const isOpen = useGlobalSearchOpen();
  const { closeGlobalSearch } = useGlobalSearchActions();
  const { openCommandOverlay } = useCommandOverlayActions();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchText, setSearchText] = useState("");

  const currentWorker = useMemo(
    () => resolveCurrentWorkerSummary(state),
    [state],
  );

  const workerIconsByKey = useMemo(() => {
    const icons = new Map<string, Agent["icon"] | Team["icon"]>();
    for (const agent of state.agents) {
      icons.set(`agent:${agent.key}`, agent.icon);
    }
    for (const team of state.teams) {
      icons.set(`team:${team.teamId}`, team.icon);
    }
    return icons;
  }, [state.agents, state.teams]);

  const globalLocalHistoryRows = useMemo(() => {
    if (!currentWorker) return [];
    return buildWorkerConversationRows({
      chats: state.chats,
      worker: currentWorker.row,
    });
  }, [currentWorker, state.chats]);

  const [globalRemoteState, setGlobalRemoteState] = useState<
    WorkerConversationRow[] | null
  >(null);

  const globalHistoryRows = useMemo(() => {
    if (globalRemoteState) return globalRemoteState;
    return globalLocalHistoryRows;
  }, [globalLocalHistoryRows, globalRemoteState]);

  const globalRows = useMemo(() => {
    return buildGlobalRows({
      workerRows: state.workerRows,
      historyRows: globalHistoryRows,
      searchText,
      hasCurrentWorker: Boolean(currentWorker),
      workerIcons: workerIconsByKey,
      t: t as (key: string, params?: Record<string, unknown>) => string,
    });
  }, [
    currentWorker,
    globalHistoryRows,
    searchText,
    state.workerRows,
    t,
    workerIconsByKey,
  ]);

  const handleClose = () => {
    closeGlobalSearch();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("agent:focus-composer"));
    }
  };

  const handleGlobalAction = (action: string) => {
    const cw = currentWorker;
    switch (action) {
      case "newConversation":
        handleClose();
        window.dispatchEvent(
          new CustomEvent("agent:start-new-conversation", {
            detail: {
              ...(cw?.type === "agent" && cw.sourceId
                ? { agentKey: cw.sourceId }
                : {}),
              preserveWorkerContext: true,
              focusComposerOnComplete: false,
            },
          }),
        );
        break;
      case "history":
        handleClose();
        openCommandOverlay({ type: "history" });
        break;
      case "switch":
        handleClose();
        openCommandOverlay({ type: "switch" });
        break;
      case "settings":
        handleClose();
        openOverlay("settings");
        break;
      case "debug":
        handleClose();
        dispatch({ type: "OPEN_RIGHT_SIDEBAR", tab: "debug" });
        break;
    }
  };

  const selectGlobalRow = (row: GlobalRow) => {
    if (row.kind === "action") {
      handleGlobalAction(row.action);
      return;
    }
    if (row.kind === "worker") {
      handleClose();
      window.dispatchEvent(
        new CustomEvent("agent:select-worker", {
          detail: {
            workerKey: row.key,
            focusComposerOnComplete: true,
          },
        }),
      );
      return;
    }
    if (row.kind === "history") {
      handleClose();
      window.dispatchEvent(
        new CustomEvent("agent:load-chat", {
          detail: {
            chatId: row.chatId,
            focusComposerOnComplete: true,
          },
        }),
      );
      return;
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setSearchText("");
      setGlobalRemoteState(null);
      return;
    }
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, [isOpen]);

  useEffect(() => {
    const query = searchText.trim();
    if (!isOpen || !currentWorker?.type || !currentWorker?.sourceId || !query) {
      setGlobalRemoteState(null);
      return;
    }
    setGlobalRemoteState(null);
    const params =
      currentWorker.type === "team"
        ? { query, teamId: currentWorker.sourceId, limit: 30 }
        : { query, agentKey: currentWorker.sourceId, limit: 30 };
    const timer = window.setTimeout(() => {
      void searchGlobal(params)
        .then((response) => {
          const results = Array.isArray(response.data?.results)
            ? response.data.results
            : [];
          setGlobalRemoteState(
            results
              .map((result) => ({
                chatId: String(result.chatId || ""),
                chatName: String(result.chatName || result.chatId || ""),
                agentKey: result.agentKey,
                teamId: result.teamId,
                updatedAt: readEpochMillis(result.timestamp),
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
            line: `[global search error] ${(error as Error).message}`,
          });
          setGlobalRemoteState([]);
        });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [
    currentWorker?.sourceId,
    currentWorker?.type,
    dispatch,
    isOpen,
    searchText,
  ]);

  return (
    <Modal
      open={isOpen}
      onCancel={handleClose}
      footer={null}
      destroyOnHidden
      width="min(640px, calc(100vw - 32px))"
      closable={false}
      styles={{
        mask: {
          background: "transparent",
          backdropFilter: "blur(2px)",
        },
        content: {
          padding: 4,
          borderRadius: 20,
        },
      }}
    >
      <GlobalSearchPanel
        searchText={searchText}
        searchInputRef={searchInputRef}
        placeholder={t("globalSearch.placeholder")}
        emptyText={t("globalSearch.empty")}
        rows={globalRows}
        onSearchChange={(value) => {
          setSearchText(value);
        }}
        onSelectRow={selectGlobalRow}
      />
    </Modal>
  );
};
