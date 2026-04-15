import { useCallback, useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import type { AppAction } from '../context/AppContext';
import type {
  ActiveAwaiting,
  AgentEvent,
  AppState,
  TimelineNode,
  ToolState,
  UiTimerHandle,
} from '../context/types';
import { upsertLiveChatSummary as buildLiveChatSummary } from '../lib/chatSummaryLive';
import type { EventCommand, EventProcessorState } from '../lib/eventProcessor';
import { processEvent } from '../lib/eventProcessor';
import { toText } from '../lib/eventUtils';
import {
  ARTIFACT_AUTO_COLLAPSE_MS,
  FRONTEND_VIEWPORT_TYPES,
  PLAN_AUTO_COLLAPSE_MS,
  REASONING_AUTO_COLLAPSE_MS,
} from '../context/constants';
import {
  clearReasoningAutoCollapseTimer,
  scheduleReasoningAutoCollapseTimer,
} from '../lib/reasoningAutoCollapse';
import { getVoiceRuntime } from '../lib/voiceRuntime';
import { stripSpecialBlocksFromText } from '../lib/contentSegments';
import { reduceActiveAwaiting } from '../lib/awaitingRuntime';

function readEventTeamId(event: AgentEvent): string {
  return toText((event as Record<string, unknown>)?.teamId);
}

function resolveSelectedWorkerContext(state: AppState): { agentKey: string; teamId: string } {
  const selectedWorker = state.workerIndexByKey.get(toText(state.workerSelectionKey)) || null;
  if (!selectedWorker) {
    return { agentKey: '', teamId: '' };
  }
  if (selectedWorker.type === 'agent') {
    return {
      agentKey: toText(selectedWorker.sourceId),
      teamId: '',
    };
  }
  return {
    agentKey: '',
    teamId: toText(selectedWorker.sourceId),
  };
}

/**
 * Local mutable cache to track node IDs and text between React renders.
 * This is critical because React 18 batches dispatches, so stateRef
 * may not reflect the latest state when multiple events arrive rapidly.
 */
interface LocalCache {
  contentNodeById: Map<string, string>;
  reasoningNodeById: Map<string, string>;
  toolNodeById: Map<string, string>;
  toolStateById: Map<string, ToolState>;
  nodeById: Map<string, TimelineNode>;
  nodeText: Map<string, string>;  // nodeId -> accumulated text
  counter: number;
  activeReasoningKey: string;
  activeAwaiting: ActiveAwaiting | null;
  chatId: string;
  runId: string;
  agentKey: string;
  teamId: string;
}

function createLocalCache(): LocalCache {
  return {
    contentNodeById: new Map(),
    reasoningNodeById: new Map(),
    toolNodeById: new Map(),
    toolStateById: new Map(),
    nodeById: new Map(),
    nodeText: new Map(),
    counter: 0,
    activeReasoningKey: '',
    activeAwaiting: null,
    chatId: '',
    runId: '',
    agentKey: '',
    teamId: '',
  };
}

export function createLocalCacheFromState(state: AppState): LocalCache {
  const chatId = toText(state.chatId);
  const nodeText = new Map<string, string>();
  state.timelineNodes.forEach((node, nodeId) => {
    nodeText.set(nodeId, node.text || '');
  });
  return {
    contentNodeById: new Map(state.contentNodeById),
    reasoningNodeById: new Map(state.reasoningNodeById),
    toolNodeById: new Map(state.toolNodeById),
    toolStateById: new Map(state.toolStates),
    nodeById: new Map(state.timelineNodes),
    nodeText,
    counter: state.timelineCounter,
    activeReasoningKey: toText(state.activeReasoningKey),
    activeAwaiting: state.activeAwaiting,
    chatId,
    runId: toText(state.runId),
    agentKey: chatId ? toText(state.chatAgentById.get(chatId)) : '',
    teamId: '',
  };
}

function getCachedNode(cache: LocalCache, state: AppState, nodeId: string): TimelineNode | undefined {
  const cachedNode = cache.nodeById.get(nodeId);
  if (cachedNode !== undefined) {
    return cachedNode;
  }
  return state.timelineNodes.get(nodeId);
}

function getCachedNodeText(cache: LocalCache, state: AppState, nodeId: string): string {
  const cachedText = cache.nodeText.get(nodeId);
  if (cachedText !== undefined) {
    return cachedText;
  }
  const cachedNode = cache.nodeById.get(nodeId);
  if (cachedNode?.text !== undefined) {
    return cachedNode.text;
  }
  return state.timelineNodes.get(nodeId)?.text || '';
}

function hasStateAheadNodeMap(
  cacheMap: Map<string, string>,
  stateMap: Map<string, string>,
): boolean {
  if (stateMap.size > cacheMap.size) {
    return true;
  }
  for (const key of stateMap.keys()) {
    if (!cacheMap.has(key)) {
      return true;
    }
  }
  return false;
}

function shouldSyncNodeTextFromState(
  cacheText: string | undefined,
  stateText: string,
  streaming: boolean,
): boolean {
  if (cacheText === undefined) {
    return true;
  }
  if (cacheText === stateText) {
    return false;
  }
  if (stateText.startsWith(cacheText)) {
    return true;
  }
  if (cacheText.startsWith(stateText)) {
    return false;
  }
  return !streaming;
}

function hasStateAheadNodeText(cache: LocalCache, state: AppState): boolean {
  for (const [nodeId, node] of state.timelineNodes.entries()) {
    if (node.kind !== 'content' && node.kind !== 'thinking' && node.kind !== 'tool') {
      continue;
    }
    const stateText = node.text || '';
    const cacheText = cache.nodeText.get(nodeId);
    if (shouldSyncNodeTextFromState(cacheText, stateText, state.streaming)) {
      return true;
    }
  }
  return false;
}

export function shouldSyncLiveCache(cache: LocalCache, state: AppState): boolean {
  const visibleChatId = toText(state.chatId);
  const visibleRunId = toText(state.runId);
  const hasVisibleConversation =
    state.timelineOrder.length > 0
    || Boolean(visibleChatId)
    || Boolean(visibleRunId)
    || state.streaming;

  if (!hasVisibleConversation) {
    return false;
  }

  return (
    cache.chatId !== visibleChatId
    || cache.runId !== visibleRunId
    || cache.activeAwaiting !== state.activeAwaiting
    || cache.counter < state.timelineCounter
    || hasStateAheadNodeMap(cache.contentNodeById, state.contentNodeById)
    || hasStateAheadNodeMap(cache.reasoningNodeById, state.reasoningNodeById)
    || hasStateAheadNodeMap(cache.toolNodeById, state.toolNodeById)
    || hasStateAheadNodeText(cache, state)
  );
}

export function createLiveProcessorState(cache: LocalCache, state: AppState): EventProcessorState {
  return {
    getContentNodeId: (contentId) => cache.contentNodeById.get(contentId) ?? state.contentNodeById.get(contentId),
    getReasoningNodeId: (reasoningKey) => cache.reasoningNodeById.get(reasoningKey) ?? state.reasoningNodeById.get(reasoningKey),
    getToolNodeId: (toolId) => cache.toolNodeById.get(toolId) ?? state.toolNodeById.get(toolId),
    getToolState: (toolId) => cache.toolStateById.get(toolId) ?? state.toolStates.get(toolId),
    getTimelineNode: (nodeId) => getCachedNode(cache, state, nodeId),
    getNodeText: (nodeId) => getCachedNodeText(cache, state, nodeId),
    nextCounter: () => cache.counter++,
    peekCounter: () => cache.counter,
    activeReasoningKey: cache.activeReasoningKey || state.activeReasoningKey,
    chatId: cache.chatId || toText(state.chatId),
    runId: cache.runId || toText(state.runId),
    currentRunningPlanTaskId: state.planCurrentRunningTaskId,
    getPlanId: () => state.plan?.planId,
  };
}

function applyLiveEventCommand(input: {
  command: EventCommand;
  cache: LocalCache;
  state: AppState;
  dispatch: (action: AppAction) => void;
}): void {
  const { command, cache, state, dispatch } = input;

  switch (command.cmd) {
    case 'SET_CHAT_ID':
      cache.chatId = command.chatId;
      dispatch({ type: 'SET_CHAT_ID', chatId: command.chatId });
      return;
    case 'SET_RUN_ID':
      cache.runId = command.runId;
      dispatch({ type: 'SET_RUN_ID', runId: command.runId });
      return;
    case 'SET_CHAT_AGENT':
      cache.agentKey = command.agentKey;
      dispatch({ type: 'SET_CHAT_AGENT_BY_ID', chatId: command.chatId, agentKey: command.agentKey });
      return;
    case 'SET_CONTENT_NODE_ID':
      cache.contentNodeById.set(command.contentId, command.nodeId);
      dispatch({ type: 'INCREMENT_TIMELINE_COUNTER' });
      dispatch({ type: 'SET_CONTENT_NODE_BY_ID', contentId: command.contentId, nodeId: command.nodeId });
      return;
    case 'SET_REASONING_NODE_ID':
      cache.reasoningNodeById.set(command.reasoningId, command.nodeId);
      dispatch({ type: 'INCREMENT_TIMELINE_COUNTER' });
      dispatch({ type: 'SET_REASONING_NODE_BY_ID', reasoningId: command.reasoningId, nodeId: command.nodeId });
      return;
    case 'SET_TOOL_NODE_ID':
      cache.toolNodeById.set(command.toolId, command.nodeId);
      dispatch({ type: 'INCREMENT_TIMELINE_COUNTER' });
      dispatch({ type: 'SET_TOOL_NODE_BY_ID', toolId: command.toolId, nodeId: command.nodeId });
      return;
    case 'APPEND_TIMELINE_ORDER':
      dispatch({ type: 'APPEND_TIMELINE_ORDER', id: command.nodeId });
      return;
    case 'SET_TIMELINE_NODE': {
      const existingNode = getCachedNode(cache, state, command.id);
      const nextNode: TimelineNode = command.node.kind === 'content'
        ? {
            ...command.node,
            ttsVoiceBlocks: existingNode?.kind === 'content' ? (existingNode.ttsVoiceBlocks || {}) : {},
          }
        : command.node;
      cache.nodeById.set(command.id, nextNode);
      cache.nodeText.set(command.id, nextNode.text || '');
      dispatch({ type: 'SET_TIMELINE_NODE', id: command.id, node: nextNode });
      return;
    }
    case 'SET_TOOL_STATE':
      cache.toolStateById.set(command.toolId, command.state);
      dispatch({ type: 'SET_TOOL_STATE', key: command.toolId, state: command.state });
      return;
    case 'SET_ACTIVE_REASONING_KEY':
      cache.activeReasoningKey = command.key;
      dispatch({ type: 'SET_ACTIVE_REASONING_KEY', key: command.key });
      return;
    case 'UPSERT_ARTIFACT':
      dispatch({ type: 'UPSERT_ARTIFACT', artifact: command.artifact });
      return;
    case 'SET_PLAN':
      if (command.resetRuntime) {
        dispatch({
          type: 'BATCH_UPDATE',
          updates: {
            planRuntimeByTaskId: new Map(),
            planCurrentRunningTaskId: '',
            planLastTouchedTaskId: '',
          },
        });
      }
      dispatch({ type: 'SET_PLAN', plan: command.plan });
      return;
    case 'SET_PLAN_RUNTIME':
      dispatch({ type: 'SET_PLAN_RUNTIME', taskId: command.taskId, runtime: command.runtime });
      return;
    case 'SET_PLAN_CURRENT_RUNNING_TASK_ID':
      dispatch({ type: 'SET_PLAN_CURRENT_RUNNING_TASK_ID', taskId: command.taskId });
      return;
    case 'SET_PLAN_LAST_TOUCHED_TASK_ID':
      dispatch({ type: 'SET_PLAN_LAST_TOUCHED_TASK_ID', taskId: command.taskId });
      return;
    case 'USER_MESSAGE':
      cache.nodeById.set(command.nodeId, {
        id: command.nodeId,
        kind: 'message',
        role: 'user',
        messageVariant: command.variant,
        steerId: command.steerId,
        text: command.text,
        attachments: command.attachments,
        ts: command.ts,
      });
      cache.nodeText.set(command.nodeId, command.text);
      dispatch({
        type: 'SET_TIMELINE_NODE',
        id: command.nodeId,
        node: {
          id: command.nodeId,
          kind: 'message',
          role: 'user',
          messageVariant: command.variant,
          steerId: command.steerId,
          text: command.text,
          attachments: command.attachments,
          ts: command.ts,
        },
      });
      dispatch({ type: 'APPEND_TIMELINE_ORDER', id: command.nodeId });
      return;
    case 'SYSTEM_ERROR':
      cache.nodeById.set(command.nodeId, {
        id: command.nodeId,
        kind: 'message',
        role: 'system',
        text: command.text,
        ts: command.ts,
      });
      cache.nodeText.set(command.nodeId, command.text);
      dispatch({
        type: 'SET_TIMELINE_NODE',
        id: command.nodeId,
        node: {
          id: command.nodeId,
          kind: 'message',
          role: 'system',
          text: command.text,
          ts: command.ts,
        },
      });
      dispatch({ type: 'APPEND_TIMELINE_ORDER', id: command.nodeId });
      return;
  }
}

export function findMatchingPendingSteer(state: AppState, event: AgentEvent) {
  const steerId = toText(event.steerId);
  if (!steerId) {
    return null;
  }
  return state.pendingSteers.find((steer) => toText(steer.steerId) === steerId) || null;
}

/**
 * useAgentEventHandler — processes incoming SSE events and updates state.
 * Uses a local mutable cache to track node IDs between React renders,
 * avoiding React 18 batching issues with rapid event processing.
 *
 * NOTE: request.query is NOT handled here — user messages during live
 * streaming are created by useMessageActions.sendMessage(). request.steer
 * is rendered here because the UI does not create a local optimistic node.
 * During history replay, both are handled by useChatActions.replayEvent().
 */
export function useAgentEventHandler() {
  const { dispatch, stateRef } = useAppContext();
  const cacheRef = useRef<LocalCache>(createLocalCache());

  /** Reset the local cache (called when conversation resets) */
  const resetCache = useCallback(() => {
    cacheRef.current = createLocalCache();
  }, []);

  const clearPlanAutoCollapse = useCallback(() => {
    const timer = stateRef.current.planAutoCollapseTimer;
    if (timer) {
      window.clearTimeout(timer);
      dispatch({ type: 'SET_PLAN_AUTO_COLLAPSE_TIMER', timer: null });
    }
  }, [dispatch, stateRef]);

  const clearArtifactAutoCollapse = useCallback(() => {
    const timer = stateRef.current.artifactAutoCollapseTimer;
    if (timer) {
      window.clearTimeout(timer);
      dispatch({ type: 'SET_ARTIFACT_AUTO_COLLAPSE_TIMER', timer: null });
    }
  }, [dispatch, stateRef]);

  useEffect(() => {
    const handler = () => {
      resetCache();
    };
    window.addEventListener('agent:reset-event-cache', handler);
    return () => window.removeEventListener('agent:reset-event-cache', handler);
  }, [resetCache]);

  const schedulePlanAutoCollapse = useCallback(() => {
    clearPlanAutoCollapse();
    const timer: UiTimerHandle = window.setTimeout(() => {
      dispatch({ type: 'SET_PLAN_EXPANDED', expanded: false });
      dispatch({ type: 'SET_PLAN_AUTO_COLLAPSE_TIMER', timer: null });
      dispatch({ type: 'SET_PLAN_MANUAL_OVERRIDE', override: null });
    }, PLAN_AUTO_COLLAPSE_MS);
    dispatch({ type: 'SET_PLAN_AUTO_COLLAPSE_TIMER', timer });
  }, [clearPlanAutoCollapse, dispatch]);

  const scheduleArtifactAutoCollapse = useCallback(() => {
    clearArtifactAutoCollapse();
    const timer: UiTimerHandle = window.setTimeout(() => {
      dispatch({ type: 'SET_ARTIFACT_EXPANDED', expanded: false });
      dispatch({ type: 'SET_ARTIFACT_AUTO_COLLAPSE_TIMER', timer: null });
      dispatch({ type: 'SET_ARTIFACT_MANUAL_OVERRIDE', override: null });
    }, ARTIFACT_AUTO_COLLAPSE_MS);
    dispatch({ type: 'SET_ARTIFACT_AUTO_COLLAPSE_TIMER', timer });
  }, [clearArtifactAutoCollapse, dispatch]);

  const expandPlanForUpdate = useCallback(() => {
    dispatch({ type: 'SET_PLAN_EXPANDED', expanded: true });
    dispatch({ type: 'SET_PLAN_MANUAL_OVERRIDE', override: null });
    schedulePlanAutoCollapse();
  }, [dispatch, schedulePlanAutoCollapse]);

  const expandArtifactForUpdate = useCallback(() => {
    dispatch({ type: 'SET_ARTIFACT_EXPANDED', expanded: true });
    dispatch({ type: 'SET_ARTIFACT_MANUAL_OVERRIDE', override: null });
    scheduleArtifactAutoCollapse();
  }, [dispatch, scheduleArtifactAutoCollapse]);

  const clearReasoningAutoCollapse = useCallback((reasoningKey: string) => {
    clearReasoningAutoCollapseTimer({
      reasoningId: reasoningKey,
      getState: () => stateRef.current,
      dispatch,
    });
  }, [dispatch, stateRef]);

  const scheduleReasoningAutoCollapse = useCallback((reasoningKey: string, nodeId: string) => {
    scheduleReasoningAutoCollapseTimer({
      reasoningId: reasoningKey,
      nodeId,
      delayMs: REASONING_AUTO_COLLAPSE_MS,
      getState: () => stateRef.current,
      dispatch,
    });
  }, [dispatch, stateRef]);

  const upsertLiveChatSummary = useCallback((input: {
    event: AgentEvent;
    cache: LocalCache;
    state: AppState;
    lastRunContent?: string;
  }) => {
    const next = buildLiveChatSummary({
      event: input.event,
      cache: {
        chatId: input.cache.chatId,
        runId: input.cache.runId,
        agentKey: input.cache.agentKey,
        teamId: input.cache.teamId,
      },
      state: input.state,
      selectedContext: resolveSelectedWorkerContext(input.state),
      lastRunContent: input.lastRunContent,
    });
    if (!next) {
      return;
    }

    input.cache.chatId = next.resolved.chatId;
    input.cache.runId = next.resolved.runId;
    input.cache.agentKey = next.resolved.agentKey;
    input.cache.teamId = next.resolved.teamId;

    dispatch({ type: 'UPSERT_CHAT', chat: next.chat });
  }, [dispatch]);

  const handleEvent = useCallback(
    (event: AgentEvent) => {
      const state = stateRef.current;
      let cache = cacheRef.current;
      const type = toText(event.type);
      if (shouldSyncLiveCache(cache, state)) {
        cache = createLocalCacheFromState(state);
        cacheRef.current = cache;
      }

      // Sync counter from React state if it's ahead
      if (state.timelineCounter > cache.counter) {
        cache.counter = state.timelineCounter;
      }
      if (!state.streaming && !state.chatId && !event.chatId) {
        cache.chatId = '';
        cache.runId = '';
        cache.agentKey = '';
        cache.teamId = '';
      }

      dispatch({ type: 'PUSH_EVENT', event });
      dispatch({ type: 'APPEND_DEBUG', line: `[${new Date().toLocaleTimeString()}] ${type}` });

      const nextAwaiting = reduceActiveAwaiting(cache.activeAwaiting, event);
      if (nextAwaiting !== cache.activeAwaiting) {
        cache.activeAwaiting = nextAwaiting;
        dispatch({ type: 'SET_ACTIVE_AWAITING', awaiting: nextAwaiting });
      }

      if (type === 'request.query') {
        const text = toText(event.message);
        if (event.chatId) dispatch({ type: 'SET_CHAT_ID', chatId: event.chatId });
        if (event.agentKey && event.chatId) {
          dispatch({ type: 'SET_CHAT_AGENT_BY_ID', chatId: event.chatId, agentKey: String(event.agentKey) });
        }
        if (event.agentKey) {
          dispatch({ type: 'SET_WORKER_PRIORITY_KEY', workerKey: `agent:${String(event.agentKey)}` });
        }
        cache.chatId = toText(event.chatId) || toText(state.chatId);
        cache.runId = '';
        cache.agentKey = toText(event.agentKey) || toText(state.chatAgentById.get(cache.chatId)) || resolveSelectedWorkerContext(state).agentKey;
        cache.teamId = readEventTeamId(event) || resolveSelectedWorkerContext(state).teamId;
        upsertLiveChatSummary({
          event,
          cache,
          state,
          lastRunContent: type === 'request.query' ? text || undefined : undefined,
        });
        return;
      }

      if (type === 'request.steer') {
        const text = toText(event.message);
        const pendingSteer = findMatchingPendingSteer(state, event);
        const steerId = toText(event.steerId);
        if (!pendingSteer || !steerId || !text) {
          dispatch({
            type: 'APPEND_DEBUG',
            line: `[steer] ignored request.steer without pending match steerId=${steerId || '-'}`,
          });
          return;
        }
        dispatch({ type: 'REMOVE_PENDING_STEER', steerId });
      }

      const previousActiveReasoningKey = cache.activeReasoningKey || state.activeReasoningKey;
      const commands = processEvent(event, createLiveProcessorState(cache, state), {
        mode: 'live',
        reasoningExpandedDefault: true,
      });

      for (const command of commands) {
        applyLiveEventCommand({ command, cache, state, dispatch });
      }

      if (type === 'run.start') {
        cache.chatId = toText(event.chatId) || cache.chatId || toText(state.chatId);
        cache.runId = toText(event.runId) || cache.runId;
        cache.agentKey = toText(event.agentKey) || cache.agentKey || resolveSelectedWorkerContext(state).agentKey;
        cache.teamId = readEventTeamId(event) || cache.teamId || resolveSelectedWorkerContext(state).teamId;
        if (event.agentKey) {
          dispatch({ type: 'SET_WORKER_PRIORITY_KEY', workerKey: `agent:${String(event.agentKey)}` });
        }
        upsertLiveChatSummary({ event, cache, state });
        return;
      }

      if (type === 'run.error' || type === 'run.complete' || type === 'run.cancel') {
        upsertLiveChatSummary({ event, cache, state });
        dispatch({ type: 'SET_STREAMING', streaming: false });
        const isActiveVoiceRequest =
          state.inputMode === 'voice'
          && Boolean(state.voiceChat.activeRequestId)
          && state.voiceChat.activeRequestId === state.requestId;
        if (!isActiveVoiceRequest) {
          getVoiceRuntime()?.stopAllVoiceSessions(type, { mode: type === 'run.cancel' ? 'stop' : 'commit' });
        }
        return;
      }

      if (
        (type === 'content.start' || type === 'content.delta' || type === 'content.end' || type === 'content.snapshot')
        && event.contentId
      ) {
        const contentId = String(event.contentId);
        const nodeId = cache.contentNodeById.get(contentId) ?? state.contentNodeById.get(contentId) ?? '';
        const text = nodeId ? getCachedNodeText(cache, state, nodeId) : '';
        const voiceStatus = type === 'content.end' || type === 'content.snapshot' ? 'completed' : 'running';
        const activeVoiceRequestId = String(state.voiceChat.activeRequestId || '').trim();
        const activeVoiceContentId = String(state.voiceChat.activeAssistantContentId || '').trim();
        const isVoiceRequestActive =
          state.inputMode === 'voice'
          && Boolean(activeVoiceRequestId)
          && activeVoiceRequestId === state.requestId;
        const shouldAttachVoiceContent =
          isVoiceRequestActive
          && (!activeVoiceContentId || activeVoiceContentId === contentId);
        if (shouldAttachVoiceContent && !activeVoiceContentId) {
          dispatch({
            type: 'PATCH_VOICE_CHAT',
            patch: { activeAssistantContentId: contentId },
          });
        }

        if (shouldAttachVoiceContent) {
          const spokenText = stripSpecialBlocksFromText(text || '');
          dispatch({
            type: 'PATCH_VOICE_CHAT',
            patch: {
              activeAssistantContentId: contentId,
              partialAssistantText: spokenText,
            },
          });
          if (spokenText) {
            void getVoiceRuntime()
              ?.syncVoiceChatSession(contentId, spokenText, {
                voice: state.voiceChat.selectedVoice,
                speechRate: state.voiceChat.speechRate,
              })
              .then((result) => {
                if (!result.appended) return;
                dispatch({
                  type: 'PATCH_VOICE_CHAT',
                  patch: {
                    status: 'speaking',
                    error: '',
                    activeTtsTaskId: result.taskId || state.voiceChat.activeTtsTaskId,
                    ttsCommitted: false,
                  },
                });
              })
              .catch((error) => {
                dispatch({
                  type: 'PATCH_VOICE_CHAT',
                  patch: {
                    status: 'error',
                    error: (error as Error).message,
                    sessionActive: false,
                  },
                });
              });
          }
        } else {
          getVoiceRuntime()?.processTtsVoiceBlocks(contentId, text, voiceStatus, 'live');
        }

        if (voiceStatus === 'completed') {
          upsertLiveChatSummary({
            event,
            cache,
            state,
            lastRunContent: text || undefined,
          });
        }
        return;
      }

      if (type === 'reasoning.start' || type === 'reasoning.delta') {
        if (cache.activeReasoningKey) {
          clearReasoningAutoCollapse(cache.activeReasoningKey);
        }
        return;
      }

      if (type === 'reasoning.end' || type === 'reasoning.snapshot') {
        const reasoningKey = toText(event.reasoningId) || previousActiveReasoningKey;
        const nodeId = reasoningKey
          ? (cache.reasoningNodeById.get(reasoningKey) ?? state.reasoningNodeById.get(reasoningKey) ?? '')
          : '';
        if (reasoningKey && nodeId) {
          scheduleReasoningAutoCollapse(reasoningKey, nodeId);
        }
        return;
      }

      if ((type === 'tool.start' || type === 'tool.snapshot' || type === 'tool.args') && event.toolId) {
        const toolId = String(event.toolId);
        const nextToolState = cache.toolStateById.get(toolId) ?? state.toolStates.get(toolId);
        if (type === 'tool.start' && nextToolState) {
          const toolType = String(nextToolState.toolType || '').trim().toLowerCase();
          if (nextToolState.viewportKey && FRONTEND_VIEWPORT_TYPES.has(toolType)) {
            dispatch({
              type: 'SET_ACTIVE_FRONTEND_TOOL',
              tool: {
                key: `${nextToolState.runId || ''}#${toolId}`,
                runId: nextToolState.runId || '',
                toolId,
                viewportKey: nextToolState.viewportKey,
                toolType,
                toolLabel: nextToolState.toolLabel || '',
                toolName: nextToolState.toolName || '',
                description: nextToolState.description || '',
                toolTimeout: nextToolState.toolTimeout ?? null,
                toolParams: nextToolState.toolParams || {},
                loading: false,
                loadError: '',
                viewportHtml: '',
              },
            });
          }
        }

        if (type === 'tool.args' && nextToolState?.toolParams) {
          const active = state.activeFrontendTool;
          const activeKey = `${nextToolState.runId || state.runId || ''}#${toolId}`;
          if (active && active.key === activeKey) {
            dispatch({
              type: 'SET_ACTIVE_FRONTEND_TOOL',
              tool: {
                ...active,
                toolLabel: nextToolState.toolLabel || active.toolLabel || '',
                toolName: nextToolState.toolName || active.toolName || '',
                toolParams: nextToolState.toolParams,
              },
            });
          }
        }
        return;
      }

      if (type === 'artifact.publish') {
        if (commands.length > 0) {
          expandArtifactForUpdate();
        }
        return;
      }

      if (type === 'plan.create' || type === 'plan.update' || type === 'task.start' || type === 'task.complete' || type === 'task.fail' || type === 'task.cancel') {
        if (commands.length > 0) {
          expandPlanForUpdate();
        }
        return;
      }
    },
    [
      clearReasoningAutoCollapse,
      dispatch,
      expandArtifactForUpdate,
      expandPlanForUpdate,
      scheduleReasoningAutoCollapse,
      stateRef,
      upsertLiveChatSummary,
    ]
  );

  return { handleEvent, resetCache };
}
