import { useCallback, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import type { TimelineAttachment } from '../context/types';
import { useAgentEventHandler } from './useAgentEventHandler';
import {
  createRequestId,
  setAccessToken,
} from '../lib/apiClient';
import { parseLeadingAgentMention } from '../lib/mentionParser';
import { resolveMentionCandidatesFromState } from '../lib/mentionCandidates';
import { getVoiceRuntime } from '../lib/voiceRuntime';
import { executeQueryStream } from '../lib/queryStreamRuntime';

interface SendMessageAttachmentDetail {
  name?: unknown;
  size?: unknown;
}

interface SendMessageEventDetail {
  message?: unknown;
  references?: unknown;
  attachments?: unknown;
  chatId?: unknown;
}

function normalizeTimelineAttachments(attachments: unknown): TimelineAttachment[] {
  if (!Array.isArray(attachments)) {
    return [];
  }

  return attachments.reduce<TimelineAttachment[]>((acc, attachment) => {
    const name = String((attachment as SendMessageAttachmentDetail | null)?.name || '').trim();
    if (!name) {
      return acc;
    }

    const rawSize = Number((attachment as SendMessageAttachmentDetail | null)?.size);
    acc.push({
      name,
      size: Number.isFinite(rawSize) && rawSize >= 0 ? rawSize : undefined,
    });
    return acc;
  }, []);
}

/**
 * useMessageActions — handles sending messages and processing SSE stream.
 * Replaces the original messageActions.js.
 */
export function useMessageActions() {
  const { state, dispatch, stateRef } = useAppContext();
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
      preferredChatId = '',
    ) => {
      const rawMessage = String(inputMessage ?? '').trim();
      const normalizedReferences = Array.isArray(references)
        ? references.filter((reference) => reference != null)
        : [];
      if (!rawMessage && normalizedReferences.length === 0) return;
      if (stateRef.current.streaming) return;

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
      const rememberedChatAgentKey = chatId
        ? String(stateRef.current.chatAgentById.get(chatId) || '').trim()
        : '';
      const selectedWorker = stateRef.current.workerIndexByKey.get(String(stateRef.current.workerSelectionKey || '').trim()) || null;
      let selectedAgentKey = rememberedChatAgentKey || '';
      let selectedTeamId = '';

      if (!chatId && selectedWorker) {
        if (selectedWorker.type === 'agent') {
          selectedAgentKey = String(selectedWorker.sourceId || '').trim();
        } else if (selectedWorker.type === 'team') {
          selectedAgentKey = '';
          selectedTeamId = String(selectedWorker.sourceId || '').trim();
        }
      }

      if (mention.mentionAgentKey) {
        selectedAgentKey = mention.mentionAgentKey;
        const keepSelectedTeamScope = !chatId && selectedWorker?.type === 'team';
        if (!keepSelectedTeamScope) {
          selectedTeamId = '';
        }
      }

      if (!selectedAgentKey) {
        selectedAgentKey = stateRef.current.pendingNewChatAgentKey || '';
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

      try {
        await executeQueryStream({
          params: {
            requestId,
            message: cleanMessage,
            agentKey: selectedAgentKey || undefined,
            teamId: selectedTeamId || undefined,
            chatId: chatId || undefined,
            references: normalizedReferences.length > 0 ? normalizedReferences : undefined,
            planningMode: Boolean(stateRef.current.planningMode),
            signal: abortController.signal,
          },
          dispatch,
          handleEvent,
        });
      } catch (error) {
        const err = error as Error;
        if (err.name !== 'AbortError') {
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
        }
      }
    },
    [dispatch, stateRef, handleEvent]
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
      const chatId = String(detail.chatId || '').trim();
      if (message || references.length > 0) {
        void sendMessage(message, references, attachments, chatId);
      }
    };
    window.addEventListener('agent:send-message', handler);
    return () => window.removeEventListener('agent:send-message', handler);
  }, [sendMessage]);

  return { sendMessage, abortStream };
}
