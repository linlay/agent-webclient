import { useEffect, useMemo, useRef } from "react";
import { useAppContext } from "@/app/state/AppContext";
import { getMemoryRecords } from "@/shared/data";
import { useI18n } from "@/shared/i18n";
import { resolveMemoryAgentContext } from "@/features/settings/lib/memoryInfo";
import { toText } from "@/shared/utils/eventUtils";
import { isAppMode } from "@/shared/utils/routing";

export function useMemoryRecordsInitialization(): void {
  const { state, dispatch, stateRef } = useAppContext();
  const { t } = useI18n();
  const initialRecordsLoadStartedRef = useRef(false);

  const agentContext = useMemo(
    () =>
      resolveMemoryAgentContext({
        agents: state.agents,
        teams: state.teams,
        chats: state.chats,
        chatId: state.chatId,
        chatAgentById: state.chatAgentById,
        workerSelectionKey: state.workerSelectionKey,
        workerIndexByKey: state.workerIndexByKey,
        workerRows: state.workerRows,
        workerRelatedChats: state.workerRelatedChats,
      }),
    [
      state.agents,
      state.teams,
      state.chats,
      state.chatId,
      state.chatAgentById,
      state.workerSelectionKey,
      state.workerIndexByKey,
      state.workerRows,
      state.workerRelatedChats,
    ],
  );

  useEffect(() => {
    if (initialRecordsLoadStartedRef.current) {
      return;
    }
    if (isAppMode() && !toText(state.accessToken)) {
      return;
    }

    initialRecordsLoadStartedRef.current = true;
    dispatch({ type: "SET_MEMORY_INFO_LOADING", loading: true });
    dispatch({ type: "SET_MEMORY_INFO_ERROR", error: "" });

    const current = stateRef.current;
    const filters = current.memoryInfoFilters;
    const baseRequest = {
      keyword: filters.keyword,
      kind: filters.kind,
      scopeType: filters.scopeType,
      status: filters.status,
      category: filters.category,
      limit: filters.limit,
    };
    const hasExplicitFilter = Boolean(
      toText(baseRequest.keyword) ||
        toText(baseRequest.kind) ||
        toText(baseRequest.scopeType) ||
        toText(baseRequest.status) ||
        toText(baseRequest.category),
    );
    const selectedRecordId = current.memoryInfoSelectedRecordId;
    const agentKey = agentContext.agentKey;

    getMemoryRecords({
      agentKey: agentKey || undefined,
      ...baseRequest,
    })
      .then(async (response) => {
        if (
          agentKey &&
          !hasExplicitFilter &&
          (!Array.isArray(response.data?.results) ||
            response.data.results.length === 0)
        ) {
          return getMemoryRecords(baseRequest);
        }
        return response;
      })
      .then((response) => {
        const records = Array.isArray(response.data?.results)
          ? response.data.results
          : [];
        const nextSelectedRecordId = records.some(
          (item) => item.id === selectedRecordId,
        )
          ? selectedRecordId
          : records[0]?.id || "";
        dispatch({
          type: "SET_MEMORY_INFO_RECORDS",
          records,
          nextCursor: response.data?.nextCursor || "",
          selectedRecordId: nextSelectedRecordId,
        });
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        dispatch({
          type: "SET_MEMORY_INFO_ERROR",
          error: t("memoryInfo.errors.loadRecords", { detail: message }),
        });
        dispatch({
          type: "SET_MEMORY_INFO_RECORDS",
          records: [],
          nextCursor: "",
          selectedRecordId: "",
        });
      })
      .finally(() => {
        dispatch({ type: "SET_MEMORY_INFO_LOADING", loading: false });
      });
  }, [agentContext.agentKey, dispatch, state.accessToken, stateRef, t]);
}
