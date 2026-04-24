import { useCallback, useEffect } from 'react';
import { useAppContext } from '@/app/state/AppContext';
import type { AppAction } from '@/app/state/AppContext';
import type { TimelineAttachment } from '@/app/state/types';
import { useAgentEventHandler } from '@/features/timeline/hooks/useAgentEventHandler';
import {
  createRequestId,
  setAccessToken,
} from '@/shared/api/apiClient';
import { AIRunEventTypeEnum } from '@/app/state/eventTypes';
import { parseLeadingAgentMention } from '@/features/composer/lib/mentionParser';
import { resolveMentionCandidatesFromState } from '@/features/composer/lib/mentionCandidates';
import {
  resolvePreferredAgentKey,
  resolvePreferredTeamId,
} from '@/features/composer/lib/queryRouting';
import { getVoiceRuntime } from '@/features/voice/lib/voiceRuntime';
import { executeQueryStreamSse } from '@/features/transport/lib/queryStreamRuntime.sse';
import { executeQueryStreamWs } from '@/features/transport/lib/queryStreamRuntime.ws';
import { normalizeTimelineAttachments } from '@/features/artifacts/lib/timelineAttachments';
import { upsertLiveChatSummary as buildLiveChatSummary } from '@/features/chats/lib/chatSummaryLive';
import {
  createLiveQuerySession,
  snapshotConversationState,
  markSessionSnapshotApplied,
  type LiveQuerySession,
} from '@/features/chats/lib/conversationSession';
import type { AgentEvent } from '@/app/state/types';
import { readEventTeamId } from '@/shared/utils/eventFieldReaders';
import { toText } from '@/shared/utils/eventUtils';

interface SendMessageEventDetail {
  message?: unknown;
  references?: unknown;
  attachments?: unknown;
  chatId?: unknown;
  agentKey?: unknown;
  teamId?: unknown;
  params?: unknown;
}

function isTerminalRunEventType(type: string): boolean {
  return type === 'run.error' || type === 'run.complete' || type === 'run.cancel';
}

export function syncLiveSessionTerminalState(
  session: Pick<LiveQuerySession, 'streaming' | 'abortController'>,
  event: AgentEvent,
): boolean {
  const type = toText(event.type);
  if (!isTerminalRunEventType(type)) {
    return false;
  }

  session.streaming = false;
  session.abortController = null;
  return true;
}

export function canSendToTargetChat(input: {
  currentActiveSession: Pick<LiveQuerySession, 'streaming' | 'abortController' | 'chatId'> | null;
  currentStateChatId?: string;
  targetChatId?: string;
  stateStreaming: boolean;
}): boolean {
  const currentSessionChatId = String(
    input.currentActiveSession?.chatId || input.currentStateChatId || '',
  ).trim();
  const targetChatId = String(input.targetChatId || '').trim();
  const isSameChat = !targetChatId || targetChatId === currentSessionChatId;

  if (!input.currentActiveSession?.streaming || !isSameChat) {
    return true;
  }

  if (!input.stateStreaming) {
    input.currentActiveSession.streaming = false;
    input.currentActiveSession.abortController = null;
    return true;
  }

  return false;
}

export function resolveQueryStreamExecutor(transportMode: 'sse' | 'ws') {
  return transportMode === 'sse'
    ? executeQueryStreamSse
    : executeQueryStreamWs;
}

/**
 * useMessageActions — handles sending messages and processing the query stream.
 * Replaces the original messageActions.js.
 */
export function useMessageActions() {
  const {
    state,
    dispatch,
    stateRef,
    querySessionsRef,
    chatQuerySessionIndexRef,
    activeQuerySessionRequestIdRef,
  } = useAppContext();
  const { handleEvent } = useAgentEventHandler();

  /* Apply access token on mount and change */
  useEffect(() => {
    setAccessToken(state.accessToken);
  }, [state.accessToken]);

  const sendMessage = useCallback(
    async (
      inputMessage: string,
      references: unknown[] = [],
      attachments: TimelineAttachment[] = [],
      params: Record<string, unknown> = {},
      preferredChatId = '',
      preferredAgentKey = '',
      preferredTeamId = '',
    ) => {
      const rawMessage = String(inputMessage ?? '').trim();
      const normalizedReferences = Array.isArray(references)
        ? references.filter((reference) => reference != null)
        : [];
      if (!rawMessage && normalizedReferences.length === 0) return;

      /* ── Parallel-query guard ── */
      const currentActiveReqId = String(activeQuerySessionRequestIdRef.current || '').trim();
      const currentActiveSession = currentActiveReqId
        ? querySessionsRef.current.get(currentActiveReqId) ?? null
        : null;
      const targetChatId = String(preferredChatId || '').trim();
      const canSend = canSendToTargetChat({
        currentActiveSession,
        currentStateChatId: String(stateRef.current.chatId || '').trim(),
        targetChatId,
        stateStreaming: Boolean(stateRef.current.streaming),
      });

      if (!canSend) {
        // Same chat is already streaming — block duplicate submit
        return;
      }

      const currentSessionChatId = currentActiveSession?.chatId || String(stateRef.current.chatId || '').trim();
      const isSameChat = !targetChatId || targetChatId === currentSessionChatId;

      if (stateRef.current.streaming && !isSameChat) {
        // Different chat requested while current is streaming — detach current session
        if (currentActiveSession) {
          currentActiveSession.snapshot = snapshotConversationState(stateRef.current);
          currentActiveSession.chatId = currentActiveSession.chatId || currentSessionChatId;
          currentActiveSession.runId = currentActiveSession.runId || String(stateRef.current.runId || '').trim();
          currentActiveSession.streaming = true;
          currentActiveSession.abortController = stateRef.current.abortController;
          markSessionSnapshotApplied(currentActiveSession);
        }
        activeQuerySessionRequestIdRef.current = '';
        dispatch({ type: 'RESET_ACTIVE_CONVERSATION' });
        window.dispatchEvent(new CustomEvent('agent:reset-event-cache'));
      }

      /* Parse @mention */
      const mentionAgents = resolveMentionCandidatesFromState(stateRef.current);
      const mentionEnabled = Array.isArray(mentionAgents) && mentionAgents.length > 0;
      const mention = mentionEnabled
        ? parseLeadingAgentMention(rawMessage, mentionAgents)
        : {
          cleanMessage: rawMessage.trim(),
          mentionAgentKey: '',
          mentionToken: '',
          error: '',
          hasMention: false,
        };
      if (mention.error) {
        dispatch({
          type: 'APPEND_DEBUG',
          line: `[mention] ${mention.error}`,
        });
        return;
      }

      const chatId = String(preferredChatId || stateRef.current.chatId || '').trim();
      const selectedWorker = stateRef.current.workerIndexByKey.get(String(stateRef.current.workerSelectionKey || '').trim()) || null;
      let selectedAgentKey = resolvePreferredAgentKey(stateRef.current, {
        chatId,
        explicitAgentKey: preferredAgentKey,
      });
      let selectedTeamId = resolvePreferredTeamId(stateRef.current, {
        chatId,
        explicitTeamId: preferredTeamId,
      });

      if (mention.mentionAgentKey) {
        selectedAgentKey = mention.mentionAgentKey;
        const keepSelectedTeamScope = !chatId && selectedWorker?.type === 'team';
        if (!keepSelectedTeamScope) {
          selectedTeamId = '';
        }
      }

      const cleanMessage = mention.cleanMessage || rawMessage;

      if (!cleanMessage.trim() && normalizedReferences.length === 0) return;

      dispatch({
        type: 'SET_WORKER_PRIORITY_KEY',
        workerKey: selectedAgentKey ? `agent:${selectedAgentKey}` : '',
      });

      if (mention.mentionAgentKey) {
        if (chatId) {
          dispatch({
            type: 'SET_CHAT_AGENT_BY_ID',
            chatId,
            agentKey: mention.mentionAgentKey,
          });
        } else {
          dispatch({
            type: 'SET_PENDING_NEW_CHAT_AGENT_KEY',
            agentKey: mention.mentionAgentKey,
          });
        }
      }

      /* Add user message to timeline (mention prefix is routing metadata, not message body) */
      const userNodeId = `user_${Date.now()}`;
      dispatch({
        type: 'SET_TIMELINE_NODE',
        id: userNodeId,
        node: {
          id: userNodeId,
          kind: 'message',
          role: 'user',
          text: cleanMessage,
          attachments: attachments.length > 0 ? attachments : undefined,
          ts: Date.now(),
        },
      });
      dispatch({ type: 'APPEND_TIMELINE_ORDER', id: userNodeId });

      getVoiceRuntime()?.resetVoiceRuntime();

      /* Start streaming */
      const requestId = createRequestId('req');
      const abortController = new AbortController();
      if (chatId && selectedAgentKey) {
        dispatch({
          type: 'SET_CHAT_AGENT_BY_ID',
          chatId,
          agentKey: selectedAgentKey,
        });
      }
      const session = createLiveQuerySession({
        requestId,
        chatId,
        agentKey: selectedAgentKey,
        teamId: selectedTeamId,
      });
      querySessionsRef.current.set(requestId, session);
      if (chatId) {
        chatQuerySessionIndexRef.current.set(chatId, requestId);
      }
      activeQuerySessionRequestIdRef.current = requestId;

      const isSessionActive = () => activeQuerySessionRequestIdRef.current === session.requestId;
      const bindSessionIdentity = (event: AgentEvent) => {
        const nextChatId = toText(event.chatId);
        if (nextChatId) {
          session.chatId = nextChatId;
          chatQuerySessionIndexRef.current.set(nextChatId, session.requestId);
          if (session.snapshot && !session.snapshot.chatId) {
            session.snapshot.chatId = nextChatId;
          }
        }
        const nextRunId = toText(event.runId);
        if (nextRunId) {
          session.runId = nextRunId;
          if (session.snapshot && !session.snapshot.runId) {
            session.snapshot.runId = nextRunId;
          }
        }
        const nextAgentKey = toText(event.agentKey);
        if (nextAgentKey) {
          session.agentKey = nextAgentKey;
        }
        const nextTeamId = readEventTeamId(event);
        if (nextTeamId) {
          session.teamId = nextTeamId;
        }
      };
      const upsertBackgroundChatSummary = (event: AgentEvent, lastRunContent?: string) => {
        const next = buildLiveChatSummary({
          event,
          cache: {
            chatId: session.chatId,
            runId: session.runId,
            agentKey: session.agentKey,
            teamId: session.teamId,
          },
          state: stateRef.current,
          selectedContext: {
            agentKey: '',
            teamId: '',
          },
          lastRunContent,
        });
        if (!next) {
          return;
        }

        session.chatId = next.resolved.chatId;
        session.runId = next.resolved.runId;
        session.agentKey = next.resolved.agentKey;
        session.teamId = next.resolved.teamId;
        chatQuerySessionIndexRef.current.set(next.resolved.chatId, session.requestId);
        if (session.snapshot && !session.snapshot.chatId) {
          session.snapshot.chatId = next.resolved.chatId;
        }
        dispatch({ type: 'UPSERT_CHAT', chat: next.chat });
        if (next.resolved.chatId && next.resolved.agentKey) {
          dispatch({
            type: 'SET_CHAT_AGENT_BY_ID',
            chatId: next.resolved.chatId,
            agentKey: next.resolved.agentKey,
          });
        }
      };
      const sessionDispatch = (action: AppAction) => {
        switch (action.type) {
          case 'SET_REQUEST_ID':
            session.requestId = action.requestId;
            if (isSessionActive()) {
              dispatch(action);
            }
            return;
          case 'SET_STREAMING':
            session.streaming = action.streaming;
            if (isSessionActive()) {
              dispatch(action);
            }
            return;
          case 'SET_ABORT_CONTROLLER':
            session.abortController = action.controller;
            if (isSessionActive()) {
              dispatch(action);
            }
            return;
          case 'APPEND_DEBUG':
            session.bufferedDebugLines.push(action.line);
            if (isSessionActive()) {
              dispatch(action);
            }
            return;
          default:
            if (isSessionActive()) {
              dispatch(action);
            }
        }
      };
      const sessionHandleEvent = (event: AgentEvent) => {
        session.bufferedEvents.push(event);
        bindSessionIdentity(event);
        syncLiveSessionTerminalState(session, event);

        if (isSessionActive()) {
          handleEvent(event);
          return;
        }

        const type = toText(event.type);
        if (type === 'request.query') {
          upsertBackgroundChatSummary(event, toText(event.message) || undefined);
          return;
        }
        if (type === 'run.start' || isTerminalRunEventType(type)) {
          upsertBackgroundChatSummary(event);
          return;
        }
        if ((type === 'content.end' || type === 'content.snapshot') && event.contentId) {
          upsertBackgroundChatSummary(event, toText(event.text) || undefined);
        }
      };

      try {
        await resolveQueryStreamExecutor(stateRef.current.transportMode)({
          params: {
            requestId,
            message: cleanMessage,
            agentKey: selectedAgentKey || undefined,
            teamId: selectedTeamId || undefined,
            chatId: chatId || undefined,
            references: normalizedReferences.length > 0 ? normalizedReferences : undefined,
            params: Object.keys(params).length > 0 ? params : undefined,
            planningMode: Boolean(stateRef.current.planningMode),
            signal: abortController.signal,
          },
          dispatch: sessionDispatch,
          handleEvent: sessionHandleEvent,
        });
      } catch (error) {
        const err = error as Error;
        if (err.name !== 'AbortError') {
          if (isSessionActive()) {
            dispatch({
              type: 'APPEND_DEBUG',
              line: `[send error] ${err.message}`,
            });
            const errNodeId = `sys_${Date.now()}`;
            dispatch({
              type: 'SET_TIMELINE_NODE',
              id: errNodeId,
              node: {
                id: errNodeId,
                kind: 'message',
                role: 'system',
                text: `发送失败: ${err.message}`,
                ts: Date.now(),
              },
            });
            dispatch({ type: 'APPEND_TIMELINE_ORDER', id: errNodeId });
          } else {
            const syntheticErrorEvent: AgentEvent = {
              type: AIRunEventTypeEnum.Error,
              chatId: session.chatId || undefined,
              runId: session.runId || undefined,
              requestId: session.requestId,
              error: err.message,
              timestamp: Date.now(),
            };
            session.bufferedDebugLines.push(`[send error] ${err.message}`);
            session.bufferedEvents.push(syntheticErrorEvent);
            upsertBackgroundChatSummary(syntheticErrorEvent);
          }
        }
      }
    },
    [
      activeQuerySessionRequestIdRef,
      chatQuerySessionIndexRef,
      dispatch,
      handleEvent,
      querySessionsRef,
      stateRef,
    ]
  );

  const abortStream = useCallback(() => {
    stateRef.current.abortController?.abort();
    getVoiceRuntime()?.stopAllVoiceSessions('user_stop', { mode: 'stop' });
    dispatch({ type: 'SET_STREAMING', streaming: false });
    dispatch({ type: 'SET_ABORT_CONTROLLER', controller: null });
  }, [dispatch, stateRef]);

  /* Listen for custom send-message events from ComposerArea */
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = ((e as CustomEvent).detail || {}) as SendMessageEventDetail;
      const message = String(detail.message || '');
      const references = Array.isArray(detail.references)
        ? detail.references
        : [];
      const attachments = normalizeTimelineAttachments(detail.attachments);
      const params =
        detail.params && typeof detail.params === 'object' && !Array.isArray(detail.params)
          ? (detail.params as Record<string, unknown>)
          : {};
      const chatId = String(detail.chatId || '').trim();
      const agentKey = String(detail.agentKey || '').trim();
      const teamId = String(detail.teamId || '').trim();
      if (message || references.length > 0) {
        void sendMessage(message, references, attachments, params, chatId, agentKey, teamId);
      }
    };
    window.addEventListener('agent:send-message', handler);
    return () => window.removeEventListener('agent:send-message', handler);
  }, [sendMessage]);

  return { sendMessage, abortStream };
}
