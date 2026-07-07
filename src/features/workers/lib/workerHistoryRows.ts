import type { Chat, WorkerConversationRow, WorkerRow } from '@/app/state/types';
import { buildWorkerConversationRows } from '@/features/workers/lib/workerConversationFormatter';
import type { GlobalSearchResult } from '@/shared/data';
import { toText } from '@/shared/utils/eventUtils';
import { readEpochMillis } from '@/shared/utils/platformTime';

export interface HistoryRowVisibilityState {
  running: boolean;
  chatId: string;
}

function shouldHideRunningChat(
  row: Pick<WorkerConversationRow, 'chatId'>,
  state: HistoryRowVisibilityState,
): boolean {
  return Boolean(
    state.running &&
      toText(state.chatId) &&
      toText(row?.chatId) === toText(state.chatId),
  );
}

export function excludeRunningCurrentChat<T extends Pick<WorkerConversationRow, 'chatId'>>(
  rows: T[],
  state: HistoryRowVisibilityState,
): T[] {
  if (!state.running || !toText(state.chatId)) {
    return rows;
  }
  return rows.filter((row) => !shouldHideRunningChat(row, state));
}

export const excludeStreamingCurrentChat = excludeRunningCurrentChat;

export function buildWorkerHistoryRowsFromChats(input: {
  chats: Chat[];
  worker: WorkerRow | null;
}): WorkerConversationRow[] {
  return buildWorkerConversationRows({
    chats: input.chats,
    worker: input.worker,
  });
}

export function buildRemoteWorkerHistoryRows(input: {
  chats: Chat[];
  worker: WorkerRow | null;
  visibility: HistoryRowVisibilityState;
}): WorkerConversationRow[] {
  return excludeRunningCurrentChat(
    buildWorkerHistoryRowsFromChats({
      chats: input.chats,
      worker: input.worker,
    }),
    input.visibility,
  );
}

export function mapSearchResultsToHistoryRows(input: {
  results: GlobalSearchResult[];
}): WorkerConversationRow[] {
  return (Array.isArray(input.results) ? input.results : [])
    .map((result) => ({
      chatId: toText(result?.chatId),
      chatName: toText(result?.chatName),
      agentKey: result?.agentKey,
      teamId: result?.teamId,
      updatedAt: readEpochMillis(result?.timestamp),
      lastRunId: toText(result?.runId),
      lastRunContent: toText(result?.snippet),
      searchSnippet: toText(result?.snippet),
      isRead: true,
    }))
    .filter((row) => row.chatId);
}

export function filterHistoryRowsBySearch(
  rows: WorkerConversationRow[],
  searchText: string,
): WorkerConversationRow[] {
  const search = toText(searchText).trim().toLowerCase();
  if (!search) return rows;
  return rows.filter((row) => {
    const haystack = [row.chatName, row.chatId, row.lastRunContent]
      .join(' ')
      .toLowerCase();
    return haystack.includes(search);
  });
}
