import { useCallback, useEffect, useRef } from "react";
import { useAppContext } from "@/app/state/AppContext";
import { getMemoryRecord, getMemoryRecords } from "@/shared/data";
import { useI18n } from "@/shared/i18n";
import { resolveMemoryAgentContext } from "@/features/memory/lib/memoryInfo";
import { toText } from "@/shared/utils/eventUtils";

// Initialization and console surfaces write to the same provider state. A newer
// request must supersede older requests even when they belong to another surface.
const requestsByProvider = new WeakMap<object, { list: number; detail: number }>();

export function useMemoryRecords(open = true) {
  const { stateRef, dispatch } = useAppContext();
  const { t } = useI18n();
  const ownedRequestsRef = useRef({ list: 0, detail: 0 });
  let requests = requestsByProvider.get(stateRef);
  if (!requests) {
    requests = { list: 0, detail: 0 };
    requestsByProvider.set(stateRef, requests);
  }
  const pending = requests;
  const agentKey = resolveMemoryAgentContext(stateRef.current).agentKey;

  useEffect(() => {
    return () => {
      if (
        ownedRequestsRef.current.list &&
        ownedRequestsRef.current.list === pending.list
      ) {
        pending.list += 1;
        dispatch({ type: "SET_MEMORY_INFO_LOADING", loading: false });
      }
      if (
        ownedRequestsRef.current.detail &&
        ownedRequestsRef.current.detail === pending.detail
      ) {
        pending.detail += 1;
        dispatch({ type: "SET_MEMORY_INFO_DETAIL_LOADING", loading: false });
      }
    };
  }, [open, agentKey, dispatch, pending]);

  const loadDetail = useCallback(async (id: string, agentKeyOverride?: string) => {
    const seq = ++pending.detail;
    ownedRequestsRef.current.detail = seq;
    const contextAgentKey = resolveMemoryAgentContext(stateRef.current).agentKey;
    const recordAgentKey = toText(agentKeyOverride) || contextAgentKey;
    const isCurrent = () =>
      seq === pending.detail &&
      contextAgentKey === resolveMemoryAgentContext(stateRef.current).agentKey &&
      id === stateRef.current.memoryInfoSelectedRecordId;
    if (!id) {
      dispatch({ type: "SET_MEMORY_INFO_DETAIL", detail: null });
      dispatch({ type: "SET_MEMORY_INFO_DETAIL_ERROR", error: "" });
      dispatch({ type: "SET_MEMORY_INFO_DETAIL_LOADING", loading: false });
      return;
    }
    dispatch({ type: "SET_MEMORY_INFO_DETAIL_LOADING", loading: true });
    dispatch({ type: "SET_MEMORY_INFO_DETAIL_ERROR", error: "" });
    try {
      let response: Awaited<ReturnType<typeof getMemoryRecord>>;
      try {
        response = await getMemoryRecord(recordAgentKey || undefined, id);
      } catch (error) {
        if (!isCurrent()) return;
        if (!recordAgentKey) throw error;
        response = await getMemoryRecord(undefined, id);
      }
      if (isCurrent()) {
        dispatch({ type: "SET_MEMORY_INFO_DETAIL", detail: response.data });
      }
    } catch (error) {
      if (!isCurrent()) return;
      const detail = error instanceof Error ? error.message : String(error);
      dispatch({
        type: "SET_MEMORY_INFO_DETAIL_ERROR",
        error: t("memoryInfo.errors.loadDetail", { detail }),
      });
      dispatch({ type: "SET_MEMORY_INFO_DETAIL", detail: null });
    } finally {
      if (seq === pending.detail) {
        dispatch({ type: "SET_MEMORY_INFO_DETAIL_LOADING", loading: false });
      }
    }
  }, [dispatch, pending, stateRef, t]);

  const loadRecords = useCallback(async ({ includeDetail = true } = {}) => {
    const seq = ++pending.list;
    ownedRequestsRef.current.list = seq;
    const current = stateRef.current;
    const contextAgentKey = resolveMemoryAgentContext(current).agentKey;
    const filters = current.memoryInfoFilters;
    const isCurrent = () =>
      seq === pending.list &&
      contextAgentKey === resolveMemoryAgentContext(stateRef.current).agentKey &&
      filters === stateRef.current.memoryInfoFilters;
    dispatch({ type: "SET_MEMORY_INFO_LOADING", loading: true });
    dispatch({ type: "SET_MEMORY_INFO_ERROR", error: "" });
    try {
      const baseRequest = {
        keyword: filters.keyword,
        kind: filters.kind,
        scopeType: filters.scopeType,
        status: filters.status,
        category: filters.category,
        limit: filters.limit,
      };
      const hasExplicitFilter = [
        filters.keyword,
        filters.kind,
        filters.scopeType,
        filters.status,
        filters.category,
      ].some((value) => Boolean(toText(value)));
      let response = await getMemoryRecords({
        agentKey: contextAgentKey || undefined,
        ...baseRequest,
      });
      if (!isCurrent()) return;
      if (
        contextAgentKey &&
        !hasExplicitFilter &&
        (!Array.isArray(response.data?.results) || !response.data.results.length)
      ) {
        response = await getMemoryRecords(baseRequest);
      }
      if (!isCurrent()) return;
      const records = Array.isArray(response.data?.results)
        ? response.data.results
        : [];
      // Selection may have changed while the query was in flight.
      const selectedId = stateRef.current.memoryInfoSelectedRecordId;
      const selected =
        records.find((record) => record.id === selectedId) || records[0];
      dispatch({
        type: "SET_MEMORY_INFO_RECORDS",
        records,
        nextCursor: response.data?.nextCursor || "",
        selectedRecordId: selected?.id || "",
      });
      if (
        includeDetail &&
        (!selected || !ownedRequestsRef.current.detail ||
          stateRef.current.memoryInfoDetail?.id !== selected.id)
      ) {
        void loadDetail(
          selected?.id || "",
          selected?.agentKey || contextAgentKey || undefined,
        );
      }
    } catch (error) {
      if (!isCurrent()) return;
      const detail = error instanceof Error ? error.message : String(error);
      dispatch({
        type: "SET_MEMORY_INFO_ERROR",
        error: t("memoryInfo.errors.loadRecords", { detail }),
      });
      dispatch({
        type: "SET_MEMORY_INFO_RECORDS",
        records: [],
        nextCursor: "",
        selectedRecordId: "",
      });
      if (includeDetail) void loadDetail("");
    } finally {
      if (seq === pending.list) {
        dispatch({ type: "SET_MEMORY_INFO_LOADING", loading: false });
      }
    }
  }, [dispatch, loadDetail, pending, stateRef, t]);

  return { agentKey, loadRecords, loadDetail };
}
