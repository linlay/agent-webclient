import { useCallback, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import type {
  AgentEvent,
  AppState,
  TimelineNode,
  ToolState,
  UiTimerHandle,
} from '../context/types';
import { parseContentSegments } from '../lib/contentSegments';
import { parseFrontendToolParams } from '../lib/frontendToolParams';
import {
  FRONTEND_VIEWPORT_TYPES,
  PLAN_AUTO_COLLAPSE_MS,
  REASONING_AUTO_COLLAPSE_MS,
} from '../context/constants';
import {
  clearReasoningAutoCollapseTimer,
  scheduleReasoningAutoCollapseTimer,
} from '../lib/reasoningAutoCollapse';
import { pickToolName, resolveViewportKey } from '../lib/toolEvent';
import { getVoiceRuntime } from '../lib/voiceRuntime';

/**
 * Safely extract a string value from an event field.
 */
function safeText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    try { return JSON.stringify(value); } catch { return ''; }
  }
  return String(value);
}

function toText(value: unknown): string {
  return String(value || '').trim();
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
  nodeText: Map<string, string>;  // nodeId -> accumulated text
  counter: number;
  activeReasoningKey: string;
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
    nodeText: new Map(),
    counter: 0,
    activeReasoningKey: '',
    chatId: '',
    runId: '',
    agentKey: '',
    teamId: '',
  };
}

function isTerminalStatus(status?: string): boolean {
  const value = String(status || '').trim().toLowerCase();
  return value === 'completed' || value === 'failed' || value === 'canceled' || value === 'cancelled';
}

/**
 * useAgentEventHandler — processes incoming SSE events and updates state.
 * Uses a local mutable cache to track node IDs between React renders,
 * avoiding React 18 batching issues with rapid event processing.
 *
 * NOTE: request.query is NOT handled here — user messages during live
 * streaming are created by useMessageActions.sendMessage(). During history
 * replay, request.query is handled by useChatActions.replayEvent().
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

  const schedulePlanAutoCollapse = useCallback(() => {
    clearPlanAutoCollapse();
    const timer: UiTimerHandle = window.setTimeout(() => {
      dispatch({ type: 'SET_PLAN_EXPANDED', expanded: false });
      dispatch({ type: 'SET_PLAN_AUTO_COLLAPSE_TIMER', timer: null });
      dispatch({ type: 'SET_PLAN_MANUAL_OVERRIDE', override: null });
    }, PLAN_AUTO_COLLAPSE_MS);
    dispatch({ type: 'SET_PLAN_AUTO_COLLAPSE_TIMER', timer });
  }, [clearPlanAutoCollapse, dispatch]);

  const expandPlanForUpdate = useCallback(() => {
    dispatch({ type: 'SET_PLAN_EXPANDED', expanded: true });
    dispatch({ type: 'SET_PLAN_MANUAL_OVERRIDE', override: null });
    schedulePlanAutoCollapse();
  }, [dispatch, schedulePlanAutoCollapse]);

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
    const { event, cache, state, lastRunContent } = input;
    const selectedContext = resolveSelectedWorkerContext(state);
    const chatId = toText(event.chatId) || cache.chatId || toText(state.chatId);
    if (!chatId) {
      return;
    }

    const runId = toText(event.runId) || cache.runId || toText(state.runId);
    const existingChat = state.chats.find(
      (chat) => toText(chat?.chatId) === chatId,
    );
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
    const timestamp = event.timestamp || Date.now();

    cache.chatId = chatId;
    cache.runId = runId;
    cache.agentKey = agentKey;
    cache.teamId = teamId;

    dispatch({
      type: 'UPSERT_CHAT',
      chat: {
        chatId,
        chatName: readEventChatName(event) || undefined,
        firstAgentName:
          readEventFirstAgentName(event) ||
          toText(existingChat?.firstAgentName) ||
          undefined,
        firstAgentKey: agentKey || undefined,
        agentKey: agentKey || undefined,
        teamId: teamId || undefined,
        lastRunId: runId || undefined,
        lastRunContent,
        updatedAt: timestamp,
      },
    });
  }, [dispatch]);

  const handleEvent = useCallback(
    (event: AgentEvent) => {
      const state = stateRef.current;
      const cache = cacheRef.current;
      const type = String(event.type || '');

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

      /* request.query — SKIP in live mode; user node is already created by sendMessage */
      if (type === 'request.query') {
        // During live streaming, sendMessage already created the user node.
        // During history replay, replayEvent handles this.
        // So we only need to extract chatId/agentKey here if present.
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
          lastRunContent: toText(event.message) || undefined,
        });
        return;
      }

      /* run.start */
      if (type === 'run.start') {
        cache.chatId = toText(event.chatId) || cache.chatId || toText(state.chatId);
        cache.runId = toText(event.runId) || cache.runId;
        cache.agentKey = toText(event.agentKey) || cache.agentKey || resolveSelectedWorkerContext(state).agentKey;
        cache.teamId = readEventTeamId(event) || cache.teamId || resolveSelectedWorkerContext(state).teamId;
        if (event.runId) dispatch({ type: 'SET_RUN_ID', runId: event.runId });
        if (event.chatId) dispatch({ type: 'SET_CHAT_ID', chatId: event.chatId });
        if (event.agentKey && (event.chatId || state.chatId)) {
          dispatch({ type: 'SET_CHAT_AGENT_BY_ID', chatId: event.chatId || state.chatId, agentKey: String(event.agentKey) });
        }
        if (event.agentKey) {
          dispatch({ type: 'SET_WORKER_PRIORITY_KEY', workerKey: `agent:${String(event.agentKey)}` });
        }
        upsertLiveChatSummary({
          event,
          cache,
          state,
        });
        return;
      }

      /* run.end / run.complete / run.error */
      if (type === 'run.end' || type === 'run.error' || type === 'run.complete') {
        upsertLiveChatSummary({
          event,
          cache,
          state,
        });
        dispatch({ type: 'SET_STREAMING', streaming: false });
        getVoiceRuntime()?.stopAllVoiceSessions(type, { mode: 'commit' });
        if (type === 'run.error' && event.error) {
          const nodeId = `sys_${Date.now()}`;
          dispatch({
            type: 'SET_TIMELINE_NODE', id: nodeId,
            node: { id: nodeId, kind: 'message', role: 'system', text: safeText(event.error), ts: Date.now() },
          });
          dispatch({ type: 'APPEND_TIMELINE_ORDER', id: nodeId });
        }
        return;
      }

      /* content.start */
      if (type === 'content.start' && event.contentId) {
        const contentId = String(event.contentId);
        const text = typeof event.text === 'string' ? event.text : '';
        let nodeId = cache.contentNodeById.get(contentId);
        const existingMappedNode = nodeId ? state.timelineNodes.get(nodeId) : undefined;
        if (!nodeId || isTerminalStatus(existingMappedNode?.status)) {
          nodeId = `content_${cache.counter++}`;
          cache.contentNodeById.set(contentId, nodeId);
          cache.nodeText.set(nodeId, text);
          const existingContentNode = state.timelineNodes.get(nodeId);
          dispatch({ type: 'INCREMENT_TIMELINE_COUNTER' });
          dispatch({ type: 'SET_CONTENT_NODE_BY_ID', contentId, nodeId });
          dispatch({ type: 'APPEND_TIMELINE_ORDER', id: nodeId });
          dispatch({
            type: 'SET_TIMELINE_NODE', id: nodeId,
            node: {
              id: nodeId, kind: 'content', contentId, text,
              segments: text ? parseContentSegments(contentId, text) : [],
              ttsVoiceBlocks: existingContentNode?.ttsVoiceBlocks || {},
              ts: event.timestamp || Date.now(),
            },
          });
        }
        getVoiceRuntime()?.processTtsVoiceBlocks(contentId, text, 'running', 'live');
        return;
      }

      /* content.delta */
      if (type === 'content.delta' && event.contentId) {
        const contentId = String(event.contentId);
        let nodeId = cache.contentNodeById.get(contentId);
        const existingMappedNode = nodeId ? state.timelineNodes.get(nodeId) : undefined;
        if (!nodeId || isTerminalStatus(existingMappedNode?.status)) {
          nodeId = `content_${cache.counter++}`;
          cache.contentNodeById.set(contentId, nodeId);
          cache.nodeText.set(nodeId, '');
          dispatch({ type: 'INCREMENT_TIMELINE_COUNTER' });
          dispatch({ type: 'SET_CONTENT_NODE_BY_ID', contentId, nodeId });
          dispatch({ type: 'APPEND_TIMELINE_ORDER', id: nodeId });
        }
        const delta = typeof event.delta === 'string' ? event.delta : '';
        const prevText = cache.nodeText.get(nodeId) || '';
        const newText = prevText + delta;
        cache.nodeText.set(nodeId, newText);
        const segments = parseContentSegments(contentId, newText);
        const existingNode = state.timelineNodes.get(nodeId);
        dispatch({
          type: 'SET_TIMELINE_NODE', id: nodeId,
          node: {
            id: nodeId, kind: 'content', contentId, text: newText, segments,
            ttsVoiceBlocks: existingNode?.kind === 'content' ? (existingNode.ttsVoiceBlocks || {}) : {},
            ts: event.timestamp || Date.now(),
          },
        });
        getVoiceRuntime()?.processTtsVoiceBlocks(contentId, newText, 'running', 'live');
        return;
      }

      /* content.end */
      if (type === 'content.end' && event.contentId) {
        const contentId = String(event.contentId);
        let nodeId = cache.contentNodeById.get(contentId);
        const existingMappedNode = nodeId ? state.timelineNodes.get(nodeId) : undefined;
        if (!nodeId || isTerminalStatus(existingMappedNode?.status)) {
          nodeId = `content_${cache.counter++}`;
          cache.contentNodeById.set(contentId, nodeId);
          dispatch({ type: 'INCREMENT_TIMELINE_COUNTER' });
          dispatch({ type: 'SET_CONTENT_NODE_BY_ID', contentId, nodeId });
          dispatch({ type: 'APPEND_TIMELINE_ORDER', id: nodeId });
        }
        if (nodeId) {
          const prevText = cache.nodeText.get(nodeId) || '';
          const finalText = typeof event.text === 'string' && event.text.trim() ? event.text : prevText;
          cache.nodeText.set(nodeId, finalText);
          const existingNode = state.timelineNodes.get(nodeId);
          dispatch({
            type: 'SET_TIMELINE_NODE', id: nodeId,
            node: {
              id: nodeId, kind: 'content', contentId, text: finalText,
              segments: parseContentSegments(contentId, finalText),
              ttsVoiceBlocks: existingNode?.kind === 'content' ? (existingNode.ttsVoiceBlocks || {}) : {},
              status: 'completed', ts: event.timestamp || Date.now(),
            },
          });
          getVoiceRuntime()?.processTtsVoiceBlocks(contentId, finalText, 'completed', 'live');
          upsertLiveChatSummary({
            event,
            cache,
            state,
            lastRunContent: finalText || undefined,
          });
        }
        return;
      }

      /* content.snapshot */
      if (type === 'content.snapshot' && event.contentId) {
        const contentId = String(event.contentId);
        let nodeId = cache.contentNodeById.get(contentId);
        const existingMappedNode = nodeId ? state.timelineNodes.get(nodeId) : undefined;
        if (!nodeId || isTerminalStatus(existingMappedNode?.status)) {
          nodeId = `content_${cache.counter++}`;
          cache.contentNodeById.set(contentId, nodeId);
          dispatch({ type: 'INCREMENT_TIMELINE_COUNTER' });
          dispatch({ type: 'SET_CONTENT_NODE_BY_ID', contentId, nodeId });
          dispatch({ type: 'APPEND_TIMELINE_ORDER', id: nodeId });
        }
        const text = typeof event.text === 'string' ? event.text : '';
        cache.nodeText.set(nodeId, text);
        const existingNode = state.timelineNodes.get(nodeId);
        dispatch({
          type: 'SET_TIMELINE_NODE', id: nodeId,
          node: {
            id: nodeId, kind: 'content', contentId, text,
            segments: parseContentSegments(contentId, text),
            ttsVoiceBlocks: existingNode?.kind === 'content' ? (existingNode.ttsVoiceBlocks || {}) : {},
            status: 'completed', ts: event.timestamp || Date.now(),
          },
        });
        getVoiceRuntime()?.processTtsVoiceBlocks(contentId, text, 'completed', 'live');
        upsertLiveChatSummary({
          event,
          cache,
          state,
          lastRunContent: text || undefined,
        });
        return;
      }

      /* reasoning.start / reasoning.delta */
      if (type === 'reasoning.start' || type === 'reasoning.delta') {
        let reasoningKey = event.reasoningId ? String(event.reasoningId) : '';
        if (!reasoningKey) {
          if (type === 'reasoning.start' || !cache.activeReasoningKey) {
            reasoningKey = `implicit_reasoning_${cache.counter}`;
          } else {
            reasoningKey = cache.activeReasoningKey;
          }
        }
        cache.activeReasoningKey = reasoningKey;
        dispatch({ type: 'SET_ACTIVE_REASONING_KEY', key: reasoningKey });
        clearReasoningAutoCollapse(reasoningKey);

        const delta = typeof event.delta === 'string' ? event.delta : '';
        const eventText = typeof event.text === 'string' ? event.text : '';
        let nodeId = cache.reasoningNodeById.get(reasoningKey);
        const existingMappedNode = nodeId ? state.timelineNodes.get(nodeId) : undefined;
        if (!nodeId || isTerminalStatus(existingMappedNode?.status)) {
          nodeId = `thinking_${cache.counter++}`;
          cache.reasoningNodeById.set(reasoningKey, nodeId);
          cache.nodeText.set(nodeId, eventText || delta);
          dispatch({ type: 'INCREMENT_TIMELINE_COUNTER' });
          dispatch({ type: 'SET_REASONING_NODE_BY_ID', reasoningId: reasoningKey, nodeId });
          dispatch({ type: 'APPEND_TIMELINE_ORDER', id: nodeId });
          dispatch({
            type: 'SET_TIMELINE_NODE', id: nodeId,
            node: {
              id: nodeId, kind: 'thinking', text: eventText || delta,
              status: 'running', expanded: true, ts: event.timestamp || Date.now(),
            },
          });
        } else {
          const prevText = cache.nodeText.get(nodeId) || '';
          const newText = prevText + delta;
          cache.nodeText.set(nodeId, newText);
          dispatch({
            type: 'SET_TIMELINE_NODE', id: nodeId,
            node: {
              id: nodeId, kind: 'thinking', text: newText,
              status: 'running', expanded: true, ts: event.timestamp || Date.now(),
            },
          });
        }
        return;
      }

      /* reasoning.end / reasoning.snapshot */
      if (type === 'reasoning.end' || type === 'reasoning.snapshot') {
        const reasoningKey = event.reasoningId ? String(event.reasoningId) : (cache.activeReasoningKey || `implicit_snap_${cache.counter}`);
        let nodeId = cache.reasoningNodeById.get(reasoningKey);
        const existingMappedNode = nodeId ? state.timelineNodes.get(nodeId) : undefined;
        if (!nodeId || isTerminalStatus(existingMappedNode?.status)) {
          nodeId = `thinking_${cache.counter++}`;
          cache.reasoningNodeById.set(reasoningKey, nodeId);
          dispatch({ type: 'INCREMENT_TIMELINE_COUNTER' });
          dispatch({ type: 'SET_REASONING_NODE_BY_ID', reasoningId: reasoningKey, nodeId });
          dispatch({ type: 'APPEND_TIMELINE_ORDER', id: nodeId });
        }
        const text = typeof event.text === 'string' ? event.text : (cache.nodeText.get(nodeId) || '');
        cache.nodeText.set(nodeId, text);
        dispatch({
          type: 'SET_TIMELINE_NODE', id: nodeId,
          node: {
            id: nodeId, kind: 'thinking', text, status: 'completed', expanded: true,
            ts: event.timestamp || Date.now(),
          },
        });
        scheduleReasoningAutoCollapse(reasoningKey, nodeId);
        cache.activeReasoningKey = '';
        dispatch({ type: 'SET_ACTIVE_REASONING_KEY', key: '' });
        return;
      }

      /* tool.start / tool.snapshot */
      if (type === 'tool.start' || type === 'tool.snapshot') {
        const toolId = event.toolId || '';
        if (!toolId) return;
        const viewportKey = resolveViewportKey(event);

        let nodeId = cache.toolNodeById.get(toolId);
        const existingMappedNode = nodeId ? state.timelineNodes.get(nodeId) : undefined;
        if (!nodeId || isTerminalStatus(existingMappedNode?.status)) {
          nodeId = `tool_${cache.counter++}`;
          cache.toolNodeById.set(toolId, nodeId);
          dispatch({ type: 'INCREMENT_TIMELINE_COUNTER' });
          dispatch({ type: 'SET_TOOL_NODE_BY_ID', toolId, nodeId });
          dispatch({ type: 'APPEND_TIMELINE_ORDER', id: nodeId });
        }

        const existing = state.timelineNodes.get(nodeId);
        const params = parseFrontendToolParams(event);
        const resolvedParams = params.found && params.params ? params.params : null;
        const argsText = resolvedParams
          ? JSON.stringify(resolvedParams, null, 2)
          : (existing?.argsText || '');

        dispatch({
          type: 'SET_TIMELINE_NODE', id: nodeId,
          node: {
            id: nodeId, kind: 'tool', toolId,
            toolLabel: event.toolLabel || existing?.toolLabel || '',
            toolName: pickToolName(existing?.toolName, event.toolName),
            viewportKey: viewportKey || existing?.viewportKey || '',
            description: event.description || existing?.description || '',
            argsText,
            status: type === 'tool.snapshot' ? 'completed' : 'running',
            result: existing?.result || null,
            ts: event.timestamp || existing?.ts || Date.now(),
          },
        });
        dispatch({
          type: 'SET_TOOL_STATE', key: toolId,
          state: {
            toolId, argsBuffer: '',
            toolLabel: event.toolLabel || '',
            toolName: pickToolName(event.toolName),
            toolType: event.toolType || '',
            viewportKey,
            toolTimeout: event.toolTimeout ?? null,
            toolParams: resolvedParams,
            description: event.description || '',
            runId: event.runId || '',
          },
        });
        cache.toolStateById.set(toolId, {
          toolId,
          argsBuffer: '',
          toolLabel: event.toolLabel || '',
          toolName: pickToolName(event.toolName),
          toolType: event.toolType || '',
          viewportKey,
          toolTimeout: event.toolTimeout ?? null,
          toolParams: resolvedParams,
          description: event.description || '',
          runId: event.runId || '',
        });
        /* Activate frontend tool overlay for special tool types (e.g. fireworks) */
        const toolType = String(event.toolType || '').trim().toLowerCase();
        if (type === 'tool.start' && viewportKey && FRONTEND_VIEWPORT_TYPES.has(toolType)) {
          dispatch({
            type: 'SET_ACTIVE_FRONTEND_TOOL',
            tool: {
              key: `${event.runId || ''}#${toolId}`,
              runId: event.runId || '',
              toolId,
              viewportKey,
              toolType,
              toolLabel: event.toolLabel || '',
              toolName: pickToolName(event.toolName),
              description: event.description || '',
              toolTimeout: event.toolTimeout ?? null,
              toolParams: resolvedParams || {},
              loading: false,
              loadError: '',
              viewportHtml: '',
            },
          });
        }
        return;
      }

      /* tool.result */
      if (type === 'tool.args' && event.toolId) {
        const toolId = event.toolId;
        const existingToolState =
          cache.toolStateById.get(toolId) ||
          state.toolStates.get(toolId);
        const nextArgsBuffer = `${existingToolState?.argsBuffer || ''}${String(event.delta || '')}`;
        const viewportKey = resolveViewportKey(event) || existingToolState?.viewportKey || '';

        let parsedToolParams: Record<string, unknown> | null = existingToolState?.toolParams || null;
        try {
          const parsed = JSON.parse(nextArgsBuffer);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            parsedToolParams = parsed as Record<string, unknown>;
          }
        } catch {
          // Partial JSON chunk is expected during streaming; keep buffering.
        }

        const nextToolState: ToolState = {
          toolId,
          argsBuffer: nextArgsBuffer,
          toolLabel: event.toolLabel || existingToolState?.toolLabel || '',
          toolName: pickToolName(existingToolState?.toolName, event.toolName),
          toolType: event.toolType || existingToolState?.toolType || '',
          viewportKey,
          toolTimeout:
            event.toolTimeout ??
            existingToolState?.toolTimeout ??
            null,
          toolParams: parsedToolParams,
          description: event.description || existingToolState?.description || '',
          runId: event.runId || existingToolState?.runId || state.runId || '',
        };

        dispatch({
          type: 'SET_TOOL_STATE',
          key: toolId,
          state: nextToolState,
        });
        cache.toolStateById.set(toolId, nextToolState);

        let nodeId = cache.toolNodeById.get(toolId) || state.toolNodeById.get(toolId);
        const existingMappedNode = nodeId ? state.timelineNodes.get(nodeId) : undefined;
        if (!nodeId || isTerminalStatus(existingMappedNode?.status)) {
          nodeId = `tool_${cache.counter++}`;
          cache.toolNodeById.set(toolId, nodeId);
          dispatch({ type: 'INCREMENT_TIMELINE_COUNTER' });
          dispatch({ type: 'SET_TOOL_NODE_BY_ID', toolId, nodeId });
          dispatch({ type: 'APPEND_TIMELINE_ORDER', id: nodeId });
        }
        if (nodeId) {
          const existingNode = state.timelineNodes.get(nodeId);
          const argsText = parsedToolParams
            ? JSON.stringify(parsedToolParams, null, 2)
            : nextArgsBuffer || existingNode?.argsText || '';

          dispatch({
            type: 'SET_TIMELINE_NODE',
            id: nodeId,
            node: {
              id: nodeId,
              kind: 'tool',
              toolId,
              toolLabel: nextToolState.toolLabel || existingNode?.toolLabel || '',
              toolName: pickToolName(existingNode?.toolName, nextToolState.toolName),
              viewportKey: viewportKey || existingNode?.viewportKey || '',
              description: nextToolState.description || existingNode?.description || '',
              argsText,
              status: 'running',
              result: existingNode?.result || null,
              ts: event.timestamp || existingNode?.ts || Date.now(),
            },
          });
        }

        const active = state.activeFrontendTool;
        const runId = nextToolState.runId || state.runId || '';
        const activeKey = `${runId}#${toolId}`;
        if (active && active.key === activeKey && parsedToolParams) {
          dispatch({
            type: 'SET_ACTIVE_FRONTEND_TOOL',
            tool: {
              ...active,
              toolLabel: nextToolState.toolLabel || active.toolLabel || '',
              toolName: nextToolState.toolName || active.toolName || '',
              toolParams: parsedToolParams,
            },
          });
        }

        return;
      }

      /* tool.result */
      if (type === 'tool.result') {
        const toolId = event.toolId || '';
        const existingToolState =
          cache.toolStateById.get(toolId) ||
          state.toolStates.get(toolId);
        const nodeId = cache.toolNodeById.get(toolId) || state.toolNodeById.get(toolId);
        if (nodeId) {
          const existing = state.timelineNodes.get(nodeId);
          if (existing) {
            const resultValue = event.result ?? event.output ?? event.text ?? '';
            const resultText = typeof resultValue === 'string' ? resultValue : JSON.stringify(resultValue, null, 2);
            dispatch({
              type: 'SET_TIMELINE_NODE', id: nodeId,
              node: {
                ...existing,
                toolName: pickToolName(existing.toolName, existingToolState?.toolName, event.toolName),
                status: event.error ? 'failed' : 'completed',
                result: { text: resultText, isCode: typeof resultValue !== 'string' },
              },
            });
          }
        }
        return;
      }

      /* tool.end */
      if (type === 'tool.end') {
        const toolId = event.toolId || '';
        const existingToolState =
          cache.toolStateById.get(toolId) ||
          state.toolStates.get(toolId);
        const nodeId = cache.toolNodeById.get(toolId) || state.toolNodeById.get(toolId);
        if (nodeId) {
          const existing = state.timelineNodes.get(nodeId);
          if (existing) {
            dispatch({
              type: 'SET_TIMELINE_NODE', id: nodeId,
              node: {
                ...existing,
                toolName: pickToolName(existing.toolName, existingToolState?.toolName, event.toolName),
                status: event.error ? 'failed' : (existing.status === 'failed' ? 'failed' : 'completed'),
              },
            });
          }
        }
        return;
      }

      /* action events — just track for debugging */
      if (type.startsWith('action.')) {
        // Actions are tracked via events list and debug lines already
        return;
      }

      /* plan events */
      if (type === 'plan.update' || type === 'plan.snapshot') {
        if (event.plan) {
          const previousPlanId = String(state.plan?.planId || '');
          const nextPlanId = String(event.planId || 'plan');
          if (previousPlanId && previousPlanId !== nextPlanId) {
            dispatch({
              type: 'BATCH_UPDATE',
              updates: {
                planRuntimeByTaskId: new Map(),
                planCurrentRunningTaskId: '',
                planLastTouchedTaskId: '',
              },
            });
          }
          dispatch({
            type: 'SET_PLAN',
            plan: { planId: nextPlanId, plan: event.plan },
          });
          expandPlanForUpdate();
        }
        return;
      }

      if (type === 'plan.task.start') {
        const taskId = event.taskId || '';
        if (taskId) {
          dispatch({ type: 'SET_PLAN_CURRENT_RUNNING_TASK_ID', taskId });
          dispatch({ type: 'SET_PLAN_LAST_TOUCHED_TASK_ID', taskId });
          dispatch({
            type: 'SET_PLAN_RUNTIME', taskId,
            runtime: { status: 'running', updatedAt: Date.now(), error: '' },
          });
          expandPlanForUpdate();
        }
        return;
      }

      if (type === 'plan.task.end' || type === 'plan.task.complete') {
        const taskId = event.taskId || '';
        if (taskId) {
          dispatch({
            type: 'SET_PLAN_RUNTIME', taskId,
            runtime: {
              status: event.error ? 'failed' : 'completed',
              updatedAt: Date.now(),
              error: event.error ? String(event.error) : '',
            },
          });
          if (stateRef.current.planCurrentRunningTaskId === taskId) {
            dispatch({ type: 'SET_PLAN_CURRENT_RUNNING_TASK_ID', taskId: '' });
          }
          dispatch({ type: 'SET_PLAN_LAST_TOUCHED_TASK_ID', taskId });
          expandPlanForUpdate();
        }
        return;
      }
    },
    [
      clearReasoningAutoCollapse,
      dispatch,
      expandPlanForUpdate,
      scheduleReasoningAutoCollapse,
      stateRef,
      upsertLiveChatSummary,
    ]
  );

  return { handleEvent, resetCache };
}
