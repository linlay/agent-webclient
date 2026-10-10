import { isAwaitingAnswerLike, isAwaitingAskLike } from "@/shared/contracts/agentEvents";
import type { AgentEvent } from "@/shared/contracts/agentEvents";
import type { AppState } from "@/app/state/AppContext";
import type { Chat } from "@/features/chats/lib/chatState";
import { resolveChatSummaryActiveRun } from '@/features/chats/lib/chatRunState';
import {
  readEventChatName,
  readEventFirstAgentName,
} from '@/features/events/lib/eventFields';
import { toText } from '@/shared/utils/eventUtils';
import { isEpochMillis } from '@/shared/utils/platformTime';
import { toRunOwner } from '@/shared/data/runOwner';
import { readExplicitEditingMode } from '@/features/events/lib/eventFields';

export interface LiveChatSummaryCache {
  chatId: string;
  runId: string;
  agentKey: string;

  editingMode?: boolean;
}

export interface LiveChatSummaryContext {
  agentKey: string;

}

export function resolveChatSummaryUpdatedAt(
  event: AgentEvent,
): number | undefined {
  const raw = event as Record<string, unknown>;
  const fields = [
    'updatedAt',
    'createdAt',
    'startedAt',
    'finishedAt',
    'answeredAt',
    'readAt',
    'timestamp',
  ] as const;
  for (const field of fields) {
    if (isEpochMillis(raw[field])) {
      return raw[field];
    }
  }
  return undefined;
}

export function resolveChatSummaryPendingAwaiting(
  event: AgentEvent,
): boolean | undefined {
  const type = toText(event.type);
  if (isAwaitingAskLike(type)) {
    return true;
  }
  if (
    isAwaitingAnswerLike(type)
    || type === 'request.query'
    || type === 'run.start'
    || type === 'run.complete'
    || type === 'run.error'
    || type === 'run.cancel'
  ) {
    return false;
  }
  return undefined;
}

export function resolveChatCanContinue(event: AgentEvent): boolean | undefined {
  if (event.taskId || event.hidden === true || (event.lane && event.lane !== 'main')) return undefined;
  if (event.type === 'run.error' || event.type === 'run.cancel') return Boolean(toText(event.runId));
  if (event.type === 'run.complete') {
    // run.finished pushes normalize to run.complete but preserve finishReason.
    return Boolean(toText(event.runId)) && ['error', 'cancel', 'cancelled', 'canceled', 'interrupted'].includes(toText(event.finishReason).toLowerCase());
  }
  if (event.type === 'request.query' || event.type === 'run.start' || isAwaitingAskLike(event.type)) return false;
  return undefined;
}

export function upsertLiveChatSummary(input: {
  event: AgentEvent;
  cache: LiveChatSummaryCache;
  state: Pick<AppState, 'chatId' | 'runId' | 'chats' | 'chatAgentById'>;
  selectedContext: LiveChatSummaryContext;
  lastRunContent?: string;
}): {
  chat: Partial<Chat> & Pick<Chat, 'chatId'>;
  resolved: LiveChatSummaryCache;
} | null {
  const { event, cache, state, selectedContext, lastRunContent } = input;
  if (event.taskId || event.hidden === true || (event.lane && event.lane !== 'main')) return null;
  const chatId = toText(event.chatId) || cache.chatId || toText(state.chatId);
  if (!chatId) {
    return null;
  }

  const runId = toText(event.runId) || cache.runId || toText(state.runId);
  const existingChat = state.chats.find((chat) => toText(chat?.chatId) === chatId);
  const rememberedAgentKey = toText(state.chatAgentById.get(chatId));
  // The persisted root Agent remains the Chat owner across member events.
  const owner =
    toRunOwner(existingChat) ||
    toRunOwner({  agentKey: cache.agentKey }) ||
    toRunOwner({  agentKey: event.agentKey }) ||
    toRunOwner(selectedContext);
  const agentKey = owner?.kind === 'agent'
    ? owner.agentKey
    : '';

  const source = toText(event.source) || toText(existingChat?.source);
  const updatedAt = resolveChatSummaryUpdatedAt(event);
  const hasPendingAwaiting = resolveChatSummaryPendingAwaiting(event);
  const hasActiveRun = resolveChatSummaryActiveRun(event);
  const eventEditingMode = readExplicitEditingMode(event);
  const editingMode =
    eventEditingMode !== undefined ? eventEditingMode : cache.editingMode;

  return {
    chat: {
      chatId,
      chatName: readEventChatName(event) || toText(existingChat?.chatName) || undefined,
      firstAgentName:
        readEventFirstAgentName(event) ||
        toText(existingChat?.firstAgentName) ||
        undefined,
      ...(agentKey
        ? { firstAgentKey: agentKey, agentKey }
        : { firstAgentKey: undefined, agentKey: undefined }),

      owner: owner || undefined,
      source: source || undefined,
      lastRunId: runId || undefined,
      lastRunContent,
      canContinue: resolveChatCanContinue(event),
      updatedAt,
      hasPendingAwaiting,
      hasActiveRun,
      activeRun: hasActiveRun === true
        ? {
            runId,
            ...(agentKey ? { agentKey } : {}),

            ...(owner ? { owner } : {}),
            ...(typeof editingMode === 'boolean' ? { editingMode } : {}),
          }
        : hasActiveRun === false
          ? null
          : undefined,
    },
    resolved: {
      chatId,
      runId,
      agentKey,

      ...(typeof editingMode === 'boolean' ? { editingMode } : {}),
    },
  };
}
