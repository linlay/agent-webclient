import { useCallback, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { useAgentEventHandler } from './useAgentEventHandler';
import {
  createRequestId,
  createQueryStream,
  setAccessToken,
} from '../lib/apiClient';
import { consumeJsonSseStream } from '../lib/sseParser';
import { parseLeadingAgentMention } from '../lib/mentionParser';
import { resolveMentionCandidatesFromState } from '../lib/mentionCandidates';
import { getVoiceRuntime } from '../lib/voiceRuntime';
import type { AgentEvent } from '../context/types';

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
    async (inputMessage: string) => {
      const rawMessage = String(inputMessage ?? '').trim();
      if (!rawMessage) return;
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

      const chatId = String(stateRef.current.chatId || '').trim();
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

      if (!cleanMessage.trim()) return;

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
          ts: Date.now(),
        },
      });
      dispatch({ type: 'APPEND_TIMELINE_ORDER', id: userNodeId });

      getVoiceRuntime()?.resetVoiceRuntime();

      /* Start streaming */
      const requestId = createRequestId('req');
      const abortController = new AbortController();
      dispatch({ type: 'SET_REQUEST_ID', requestId });
      dispatch({ type: 'SET_STREAMING', streaming: true });
      dispatch({ type: 'SET_ABORT_CONTROLLER', controller: abortController });

      try {
        const response = await createQueryStream({
          requestId,
          message: cleanMessage,
          agentKey: selectedAgentKey || undefined,
          teamId: selectedTeamId || undefined,
          chatId: chatId || undefined,
          runId: stateRef.current.runId || undefined,
          planningMode: Boolean(stateRef.current.planningMode),
          stream: true,
          signal: abortController.signal,
        });

        if (!response.ok) {
          const text = await response.text();
          let errMsg: string;
          try {
            const json = JSON.parse(text);
            errMsg = json?.msg ? `${json.msg} (HTTP ${response.status})` : `HTTP ${response.status}: ${text}`;
          } catch {
            errMsg = `HTTP ${response.status}: ${text}`;
          }
          throw new Error(errMsg);
        }

        await consumeJsonSseStream(response, {
          signal: abortController.signal,
          onJson: (json) => {
            handleEvent(json as AgentEvent);
          },
          onParseError: (error, rawData) => {
            dispatch({
              type: 'APPEND_DEBUG',
              line: `[SSE parse error] ${error.message}: ${rawData.slice(0, 200)}`,
            });
          },
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
      } finally {
        dispatch({ type: 'SET_STREAMING', streaming: false });
        dispatch({ type: 'SET_ABORT_CONTROLLER', controller: null });
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
      const message = (e as CustomEvent).detail?.message;
      if (message) sendMessage(message);
    };
    window.addEventListener('agent:send-message', handler);
    return () => window.removeEventListener('agent:send-message', handler);
  }, [sendMessage]);

  return { sendMessage, abortStream };
}
