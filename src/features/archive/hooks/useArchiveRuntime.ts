import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "antd";
import { useAppContext } from "@/app/state/AppContext";
import type { Chat } from "@/app/state/types";
import {
  archiveChats,
  deleteArchive,
  getArchive,
  getArchives,
  restoreArchives,
  searchArchives,
  type ArchiveDetailResponse,
  type ArchivedSummaryResponse,
  type ChatSummaryResponse,
} from "@/shared/data";
import {
  asArchiveSummary,
  buildArchiveBulkCandidates,
  extractArchivePreviewLines,
  formatArchiveUsageSummary,
  normalizeRestoredChat,
} from "@/features/archive/lib/archiveViewModel";
import { t } from "@/shared/i18n";

const ARCHIVE_PAGE_SIZE = 30;

export type RestoredArchiveChatSummary = Pick<ChatSummaryResponse, "agentKey" | "chatId">;

export interface UseArchiveRuntimeOptions {
  active: boolean;
  selectedChatId?: string;
  onSelectedChatIdChange?: (chatId: string) => void;
  onOpenRestoredChat?: (summary: RestoredArchiveChatSummary) => void;
  showAgentFilter: boolean;
}

export function useArchiveRuntime(options: UseArchiveRuntimeOptions) {
  const { state, dispatch } = useAppContext();
  const [query, setQuery] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [items, setItems] = useState<ArchivedSummaryResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loadingList, setLoadingList] = useState(false);
  const [internalSelectedChatId, setInternalSelectedChatId] = useState("");
  const [detail, setDetail] = useState<ArchiveDetailResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [bulkDays, setBulkDays] = useState(30);
  const [bulkResult, setBulkResult] = useState("");
  const [actionResult, setActionResult] = useState("");

  const selected = options.selectedChatId !== undefined
    ? options.selectedChatId
    : internalSelectedChatId;
  const currentWorker = state.workerIndexByKey.get(state.workerSelectionKey);
  const scopedAgentKey = currentWorker?.type === "agent"
    ? String(currentWorker.sourceId || "")
    : "";
  const archiveAgentKey = options.showAgentFilter ? agentFilter : scopedAgentKey;
  const bulkCandidates = useMemo(
    () => buildArchiveBulkCandidates({
      chats: state.chats,
      workerRelatedChats: state.workerRelatedChats,
      workerSelectionKey: state.workerSelectionKey,
      days: bulkDays,
    }),
    [bulkDays, state.chats, state.workerRelatedChats, state.workerSelectionKey],
  );

  const updateSelected = useCallback((chatId: string) => {
    if (options.onSelectedChatIdChange) {
      options.onSelectedChatIdChange(chatId);
    } else {
      setInternalSelectedChatId(chatId);
    }
  }, [options.onSelectedChatIdChange]);

  const loadArchives = useCallback(async (nextOffset = 0, append = false) => {
    if (!options.active) return;
    setLoadingList(true);
    try {
      const trimmedQuery = query.trim();
      if (trimmedQuery) {
        const response = await searchArchives({
          query: trimmedQuery,
          agentKey: archiveAgentKey || undefined,
          limit: ARCHIVE_PAGE_SIZE,
        });
        const results = (response.data?.results || []).map((item) =>
          asArchiveSummary({
            ...item,
            updatedAt: item.updatedAt ?? item.lastRunAt,
            lastRunContent: item.lastRunContent || item.snippet,
            hasAttachments: false,
          }),
        );
        setItems(results);
        setTotal(response.data?.count || results.length);
        setOffset(results.length);
        return;
      }
      const response = await getArchives({
        agentKey: archiveAgentKey || undefined,
        limit: ARCHIVE_PAGE_SIZE,
        offset: nextOffset,
      });
      const nextItems = response.data?.items || [];
      setItems((current) => append ? [...current, ...nextItems] : nextItems);
      setTotal(response.data?.total || nextItems.length);
      setOffset(nextOffset + nextItems.length);
    } catch (error) {
      dispatch({ type: "APPEND_DEBUG", line: `[archive list error] ${(error as Error).message}` });
      if (!append) setItems([]);
    } finally {
      setLoadingList(false);
    }
  }, [archiveAgentKey, dispatch, options.active, query]);

  const loadArchiveDetail = useCallback(async (chatId: string, updateSelection = true) => {
    const normalizedChatId = String(chatId || "").trim();
    if (!normalizedChatId) return;
    if (updateSelection) updateSelected(normalizedChatId);
    setLoadingDetail(true);
    try {
      const response = await getArchive(normalizedChatId, false);
      setDetail(response.data || null);
    } catch (error) {
      dispatch({ type: "APPEND_DEBUG", line: `[archive detail error] ${(error as Error).message}` });
      setDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }, [dispatch, updateSelected]);

  useEffect(() => {
    if (!options.active) return;
    const timer = window.setTimeout(() => void loadArchives(0, false), 180);
    return () => window.clearTimeout(timer);
  }, [loadArchives, options.active]);

  useEffect(() => {
    if (!options.active) return;
    const normalizedSelected = String(selected || "").trim();
    if (!normalizedSelected) {
      setDetail(null);
      return;
    }
    void loadArchiveDetail(normalizedSelected, false);
  }, [loadArchiveDetail, options.active, selected]);

  const removeArchiveItem = useCallback((chatId: string) => {
    setItems((current) => current.filter((item) => item.chatId !== chatId));
    setTotal((current) => Math.max(0, current - 1));
    if (selected === chatId) {
      updateSelected("");
      setDetail(null);
    }
  }, [selected, updateSelected]);

  const deleteSelected = (chatId: string) => {
    const normalizedChatId = String(chatId || "").trim();
    if (!normalizedChatId) return;
    Modal.confirm({
      title: t("archive.deleteConfirm.title"),
      content: normalizedChatId,
      okText: t("archive.action.delete"),
      okButtonProps: { danger: true },
      cancelText: t("archive.action.cancel"),
      onOk: async () => {
        await deleteArchive({ chatId: normalizedChatId });
        removeArchiveItem(normalizedChatId);
      },
    });
  };

  const restoreSelected = (chatId: string, openAfterRestore = false) => {
    const normalizedChatId = String(chatId || "").trim();
    if (!normalizedChatId) return;
    const selectedItem = items.find((item) => item.chatId === normalizedChatId);
    Modal.confirm({
      title: t("archive.restoreConfirm.title"),
      content: selectedItem?.chatName || normalizedChatId,
      okText: openAfterRestore ? t("archive.action.restoreAndOpen") : t("archive.action.restore"),
      cancelText: t("archive.action.cancel"),
      onOk: async () => {
        const response = await restoreArchives({ chatIds: [normalizedChatId] });
        const result = response.data?.results?.[0];
        if (!result?.success) throw new Error(result?.error || t("archive.restore.failed"));
        const restored = normalizeRestoredChat(result.summary, selectedItem);
        if (restored.chatId) dispatch({ type: "UPSERT_CHAT", chat: restored as Partial<Chat> & Pick<Chat, "chatId"> });
        window.dispatchEvent(new CustomEvent("agent:refresh-worker-data"));
        removeArchiveItem(normalizedChatId);
        setActionResult(t("archive.restore.result"));
        if (openAfterRestore && result.summary) options.onOpenRestoredChat?.(result.summary);
      },
    });
  };

  const bulkArchive = () => {
    if (bulkCandidates.length === 0) return;
    Modal.confirm({
      title: t("archive.bulk.confirmTitle"),
      content: t("archive.bulk.confirmContent", { count: bulkCandidates.length, days: bulkDays }),
      okText: t("archive.action.archive"),
      cancelText: t("archive.action.cancel"),
      onOk: async () => {
        const response = await archiveChats({ chatIds: bulkCandidates.map((item) => item.chatId) });
        const results = response.data?.results || [];
        const succeeded = results.filter((result) => result.success).map((result) => result.chatId);
        succeeded.forEach((chatId) => dispatch({ type: "CHAT_ARCHIVED", chatId }));
        const failed = results.length - succeeded.length;
        setBulkResult(failed > 0
          ? t("archive.bulk.resultWithFailures", { success: succeeded.length, failed })
          : t("archive.bulk.result", { success: succeeded.length }));
        void loadArchives(0, false);
      },
    });
  };

  const selectedItem = items.find((item) => item.chatId === selected);
  return {
    query,
    setQuery,
    agentFilter,
    setAgentFilter,
    items,
    offset,
    loadingList,
    selected,
    detail,
    loadingDetail,
    bulkDays,
    setBulkDays,
    bulkCandidateCount: bulkCandidates.length,
    resultText: [bulkResult, actionResult].filter(Boolean).join(" · "),
    selectedItem,
    previewLines: extractArchivePreviewLines(detail),
    usageSummary: formatArchiveUsageSummary(selectedItem),
    canLoadMore: !query.trim() && items.length < total,
    loadArchives,
    loadArchiveDetail,
    deleteSelected,
    restoreSelected,
    bulkArchive,
  };
}
