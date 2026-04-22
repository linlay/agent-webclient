import type { AgentEvent, AppState, Chat } from '@/app/state/types';
import { toText } from '@/shared/utils/eventUtils';

export interface LiveChatSummaryCache {
  chatId: string;
  runId: string;
  agentKey: string;
  teamId: string;
}

export interface LiveChatSummaryContext {
  agentKey: string;
  teamId: string;
}

function readEventTeamId(event: AgentEvent): string {
  return toText((event as Record<string, unknown>)?.teamId);
}

function readEventChatName(event: AgentEvent): string {
  return toText((event as Record<string, unknown>)?.chatName);
}

function readEventFirstAgentName(event: AgentEvent): string {
  return toText((event as Record<string, unknown>)?.firstAgentName);
}

export function resolveChatSummaryUpdatedAt(
  event: AgentEvent,
): string | number {
  const raw = event as Record<string, unknown>;
  if (typeof raw.updatedAt === 'string') {
    return raw.updatedAt;
  }
  if (typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt)) {
    return raw.updatedAt;
  }
  if (typeof raw.createdAt === 'string') {
    return raw.createdAt;
  }
  if (typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt)) {
    return raw.createdAt;
  }
  if (typeof event.timestamp === 'number' && Number.isFinite(event.timestamp)) {
    return event.timestamp;
  }
  return Date.now();
}

export function resolveChatSummaryPendingAwaiting(
  event: AgentEvent,
): boolean | undefined {
  const type = toText(event.type);
  if (type === 'awaiting.ask') {
    return true;
  }
  if (
    type === 'awaiting.answer'
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
  const chatId = toText(event.chatId) || cache.chatId || toText(state.chatId);
  if (!chatId) {
    return null;
  }

  const runId = toText(event.runId) || cache.runId || toText(state.runId);
  const existingChat = state.chats.find((chat) => toText(chat?.chatId) === chatId);
  const rememberedAgentKey = toText(state.chatAgentById.get(chatId));
  const agentKey =
    toText(event.agentKey) ||
    cache.agentKey ||
    rememberedAgentKey ||
    toText(existingChat?.agentKey || existingChat?.firstAgentKey) ||
    selectedContext.agentKey;
  const teamId =
    readEventTeamId(event) ||
    cache.teamId ||
    toText(existingChat?.teamId) ||
    selectedContext.teamId;
  const updatedAt = resolveChatSummaryUpdatedAt(event);
  const hasPendingAwaiting = resolveChatSummaryPendingAwaiting(event);

  return {
    chat: {
      chatId,
      chatName: readEventChatName(event) || toText(existingChat?.chatName) || undefined,
      firstAgentName:
        readEventFirstAgentName(event) ||
        toText(existingChat?.firstAgentName) ||
        undefined,
      firstAgentKey: agentKey || undefined,
      agentKey: agentKey || undefined,
      teamId: teamId || undefined,
      lastRunId: runId || undefined,
      lastRunContent,
      updatedAt,
      hasPendingAwaiting,
    },
    resolved: {
      chatId,
      runId,
      agentKey,
      teamId,
    },
  };
}
