import {
  isAwaitingAnswerLike,
  isAwaitingAskLike,
  type AgentEvent,
  type AppState,
  type Chat,
} from '@/app/state/types';
import { resolveChatSummaryActiveRun } from '@/features/chats/lib/chatRunState';
import {
  readEventChatName,
  readEventFirstAgentName,
  readEventTeamId,
} from '@/shared/utils/eventFieldReaders';
import { toText } from '@/shared/utils/eventUtils';
import { isEpochMillis } from '@/shared/utils/platformTime';
import { toRunOwner } from '@/shared/data/runOwner';
import { readExplicitEditingMode } from '@/features/runs/lib/editingMode';

export interface LiveChatSummaryCache {
  chatId: string;
  runId: string;
  agentKey: string;
  teamId: string;
  editingMode?: boolean;
}

export interface LiveChatSummaryContext {
  agentKey: string;
  teamId: string;
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
  // A persisted Team route is the authoritative chat owner.  In particular,
  // member events may carry agentKey but must never change it into an Agent chat.
  const owner =
    toRunOwner(existingChat) ||
    toRunOwner({ teamId: cache.teamId, agentKey: cache.agentKey }) ||
    toRunOwner({ teamId: readEventTeamId(event), agentKey: event.agentKey }) ||
    toRunOwner(selectedContext);
  const agentKey = owner?.kind === 'agent'
    ? owner.agentKey
    : '';
  const teamId = owner?.kind === 'orchestrated-team'
    ? owner.teamId
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
      teamId: teamId || undefined,
      owner: owner || undefined,
      source: source || undefined,
      lastRunId: runId || undefined,
      lastRunContent,
      updatedAt,
      hasPendingAwaiting,
      hasActiveRun,
      activeRun: hasActiveRun === true
        ? {
            runId,
            ...(agentKey ? { agentKey } : {}),
            ...(teamId ? { teamId } : {}),
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
      teamId,
      ...(typeof editingMode === 'boolean' ? { editingMode } : {}),
    },
  };
}
