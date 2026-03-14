import { useCallback, useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { getAgents, getTeams, getChats, getChat, setAccessToken } from '../lib/apiClient';
import type { Chat, Agent, AgentEvent, TimelineNode, Plan, PlanRuntime, ToolState, Team, WorkerRow, TtsVoiceBlock } from '../context/types';
import { parseContentSegments } from '../lib/contentSegments';
import { parseFrontendToolParams } from '../lib/frontendToolParams';
import { pickToolName, resolveViewportKey } from '../lib/toolEvent';
import { buildWorkerRows, createWorkerKeyFromChat } from '../lib/workerListFormatter';
import { buildWorkerConversationRows } from '../lib/workerConversationFormatter';
import {
  buildSelectedWorkerConversationRows,
  mergeFetchedChats,
} from '../lib/chatSummary';

type WorkerDataSnapshot = {
  agents: Agent[];
  teams: Team[];
  chats: Chat[];
  workerSelectionKey: string;
  workerPriorityKey: string;
};

type WorkerRefreshOverrides = Partial<WorkerDataSnapshot>;

interface WorkerRefreshCoordinatorOptions {
  fetchAgents: () => Promise<Agent[]>;
  fetchTeams: () => Promise<Team[]>;
  fetchChats: () => Promise<Chat[]>;
  getSnapshot: () => WorkerDataSnapshot;
  applyAgents: (agents: Agent[]) => void;
  applyTeams: (teams: Team[]) => void;
  applyChats: (chats: Chat[]) => void;
  rebuildWorkerRows: (overrides: WorkerRefreshOverrides) => void;
  appendDebug: (line: string) => void;
}

type SettledListResult<T> = PromiseSettledResult<T[]>;

function settledValueOrFallback<T>(
  result: SettledListResult<T>,
  fallback: T[],
  onRejected: (message: string) => void,
): T[] {
  if (result.status === 'fulfilled') {
    return Array.isArray(result.value) ? result.value : [];
  }
  onRejected(result.reason instanceof Error ? result.reason.message : String(result.reason || 'unknown error'));
  return fallback;
}

export async function refreshWorkerDataWithCoordinator(
  options: WorkerRefreshCoordinatorOptions,
): Promise<void> {
  const agentsPromise = options.fetchAgents();
  const teamsPromise = options.fetchTeams();
  const chatsPromise = options.fetchChats();

  const [agentsResult, teamsResult, chatsResult] = await Promise.allSettled([
    agentsPromise,
    teamsPromise,
    chatsPromise,
  ]) as [SettledListResult<Agent>, SettledListResult<Team>, SettledListResult<Chat>];

  const current = options.getSnapshot();
  const nextAgents = settledValueOrFallback(agentsResult, current.agents, (message) => {
    options.appendDebug(`[loadAgents error] ${message}`);
  });
  const nextTeams = settledValueOrFallback(teamsResult, current.teams, (message) => {
    options.appendDebug(`[loadTeams error] ${message}`);
  });
  const fetchedChats = settledValueOrFallback(chatsResult, current.chats, (message) => {
    options.appendDebug(`[loadChats error] ${message}`);
  });
  const nextChats = mergeFetchedChats(current.chats, fetchedChats);

  if (agentsResult.status === 'fulfilled') {
    options.applyAgents(nextAgents);
  }
  if (teamsResult.status === 'fulfilled') {
    options.applyTeams(nextTeams);
  }
  if (chatsResult.status === 'fulfilled') {
    options.applyChats(nextChats);
  }

  if (
    agentsResult.status === 'fulfilled'
    || teamsResult.status === 'fulfilled'
    || chatsResult.status === 'fulfilled'
  ) {
    options.rebuildWorkerRows({
      agents: nextAgents,
      teams: nextTeams,
      chats: nextChats,
      workerSelectionKey: current.workerSelectionKey,
      workerPriorityKey: current.workerPriorityKey,
    });
  }
}

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

/**
 * Replay state — mutable structure used during synchronous event replay.
 * Avoids React batching issues by building up the full timeline locally,
 * then dispatching the complete result via BATCH_UPDATE.
 */
export interface ReplayState {
  timelineNodes: Map<string, TimelineNode>;
  timelineOrder: string[];
  contentNodeById: Map<string, string>;
  reasoningNodeById: Map<string, string>;
  toolNodeById: Map<string, string>;
  toolStates: Map<string, ToolState>;
  chatAgentById: Map<string, string>;
  timelineCounter: number;
  activeReasoningKey: string;
  chatId: string;
  runId: string;
  events: AgentEvent[];
  debugLines: string[];
  plan: Plan | null;
  planRuntimeByTaskId: Map<string, PlanRuntime>;
  planCurrentRunningTaskId: string;
  planLastTouchedTaskId: string;
}

export function createReplayState(): ReplayState {
  return {
    timelineNodes: new Map(),
    timelineOrder: [],
    contentNodeById: new Map(),
    reasoningNodeById: new Map(),
    toolNodeById: new Map(),
    toolStates: new Map(),
    chatAgentById: new Map(),
    timelineCounter: 0,
    activeReasoningKey: '',
    chatId: '',
    runId: '',
    events: [],
    debugLines: [],
    plan: null,
    planRuntimeByTaskId: new Map(),
    planCurrentRunningTaskId: '',
    planLastTouchedTaskId: '',
  };
}

function isTerminalStatus(status?: string): boolean {
  const value = String(status || '').trim().toLowerCase();
  return value === 'completed' || value === 'failed' || value === 'canceled' || value === 'cancelled';
}

function buildHistoryTtsVoiceBlocks(
  segments: ReturnType<typeof parseContentSegments>,
  existing?: Record<string, TtsVoiceBlock>,
): Record<string, TtsVoiceBlock> | undefined {
  const next: Record<string, TtsVoiceBlock> = {};
  let hasVoice = false;

  for (const segment of segments) {
    if (segment.kind !== 'ttsVoice' || !segment.signature) continue;
    hasVoice = true;
    const previous = existing?.[segment.signature];
    next[segment.signature] = {
      signature: segment.signature,
      text: String(segment.text || previous?.text || ''),
      closed: Boolean(segment.closed),
      expanded: Boolean(previous?.expanded),
      status: previous?.status || 'ready',
      error: String(previous?.error || ''),
      sampleRate: previous?.sampleRate,
      channels: previous?.channels,
    };
  }

  return hasVoice ? next : undefined;
}

/**
 * Process a single event into the mutable replay state.
 * This mirrors useAgentEventHandler logic but writes to mutable state.
 */
export function replayEvent(rs: ReplayState, event: AgentEvent): void {
  const type = String(event.type || '');
  rs.events.push(event);

  /* request.query */
  if (type === 'request.query') {
    const text = safeText(event.message);
    if (text) {
      const nodeId = `user_${event.requestId || rs.timelineCounter}`;
      rs.timelineCounter++;
      rs.timelineNodes.set(nodeId, {
        id: nodeId, kind: 'message', role: 'user', text,
        ts: event.timestamp || Date.now(),
      });
      rs.timelineOrder.push(nodeId);
    }
    return;
  }

  /* run.start */
  if (type === 'run.start') {
    if (event.runId) rs.runId = event.runId;
    if (event.chatId) rs.chatId = event.chatId;
    if (event.agentKey && (event.chatId || rs.chatId)) {
      rs.chatAgentById.set(event.chatId || rs.chatId, String(event.agentKey));
    }
    return;
  }

  /* run.end / run.complete / run.error */
  if (type === 'run.end' || type === 'run.error' || type === 'run.complete') {
    if (type === 'run.error' && event.error) {
      const nodeId = `sys_${rs.timelineCounter}`;
      rs.timelineCounter++;
      rs.timelineNodes.set(nodeId, {
        id: nodeId, kind: 'message', role: 'system',
        text: safeText(event.error), ts: Date.now(),
      });
      rs.timelineOrder.push(nodeId);
    }
    return;
  }

  /* content.start */
  if (type === 'content.start' && event.contentId) {
    const contentId = String(event.contentId);
    let nodeId = rs.contentNodeById.get(contentId);
    const existingMappedNode = nodeId ? rs.timelineNodes.get(nodeId) : undefined;
    if (!nodeId || isTerminalStatus(existingMappedNode?.status)) {
      nodeId = `content_${rs.timelineCounter}`;
      rs.timelineCounter++;
      const text = typeof event.text === 'string' ? event.text : '';
      const segments = text ? parseContentSegments(contentId, text) : [];
      rs.contentNodeById.set(contentId, nodeId);
      rs.timelineNodes.set(nodeId, {
        id: nodeId, kind: 'content', contentId, text,
        segments,
        ttsVoiceBlocks: buildHistoryTtsVoiceBlocks(segments),
        ts: event.timestamp || Date.now(),
      });
      rs.timelineOrder.push(nodeId);
    }
    return;
  }

  /* content.delta */
  if (type === 'content.delta' && event.contentId) {
    const contentId = String(event.contentId);
    let nodeId = rs.contentNodeById.get(contentId);
    const existingMappedNode = nodeId ? rs.timelineNodes.get(nodeId) : undefined;
    if (!nodeId || isTerminalStatus(existingMappedNode?.status)) {
      nodeId = `content_${rs.timelineCounter}`;
      rs.timelineCounter++;
      rs.contentNodeById.set(contentId, nodeId);
      rs.timelineOrder.push(nodeId);
    }
    const existing = rs.timelineNodes.get(nodeId);
    const delta = typeof event.delta === 'string' ? event.delta : '';
    const newText = (existing?.text || '') + delta;
    const segments = parseContentSegments(contentId, newText);
    rs.timelineNodes.set(nodeId, {
      id: nodeId, kind: 'content', contentId, text: newText,
      segments,
      ttsVoiceBlocks: buildHistoryTtsVoiceBlocks(segments, existing?.kind === 'content' ? existing.ttsVoiceBlocks : undefined),
      ts: event.timestamp || existing?.ts || Date.now(),
    });
    return;
  }

  /* content.end */
  if (type === 'content.end' && event.contentId) {
    const contentId = String(event.contentId);
    let nodeId = rs.contentNodeById.get(contentId);
    const existingMappedNode = nodeId ? rs.timelineNodes.get(nodeId) : undefined;
    if (!nodeId || isTerminalStatus(existingMappedNode?.status)) {
      nodeId = `content_${rs.timelineCounter}`;
      rs.timelineCounter++;
      rs.contentNodeById.set(contentId, nodeId);
      rs.timelineOrder.push(nodeId);
    }
    if (nodeId) {
      const existing = rs.timelineNodes.get(nodeId);
      const finalText = typeof event.text === 'string' && event.text.trim()
        ? event.text : existing?.text || '';
      const segments = parseContentSegments(contentId, finalText);
      rs.timelineNodes.set(nodeId, {
        id: nodeId, kind: 'content', contentId, text: finalText,
        segments,
        ttsVoiceBlocks: buildHistoryTtsVoiceBlocks(segments, existing?.kind === 'content' ? existing.ttsVoiceBlocks : undefined),
        status: 'completed',
        ts: event.timestamp || existing?.ts || Date.now(),
      });
    }
    return;
  }

  /* content.snapshot */
  if (type === 'content.snapshot' && event.contentId) {
    const contentId = String(event.contentId);
    let nodeId = rs.contentNodeById.get(contentId);
    const existingMappedNode = nodeId ? rs.timelineNodes.get(nodeId) : undefined;
    if (!nodeId || isTerminalStatus(existingMappedNode?.status)) {
      nodeId = `content_${rs.timelineCounter}`;
      rs.timelineCounter++;
      rs.contentNodeById.set(contentId, nodeId);
      rs.timelineOrder.push(nodeId);
    }
    const text = typeof event.text === 'string' ? event.text : '';
    const segments = parseContentSegments(contentId, text);
    rs.timelineNodes.set(nodeId, {
      id: nodeId, kind: 'content', contentId, text,
      segments,
      ttsVoiceBlocks: buildHistoryTtsVoiceBlocks(segments),
      status: 'completed',
      ts: event.timestamp || Date.now(),
    });
    return;
  }

  /* reasoning */
  if (type === 'reasoning.start' || type === 'reasoning.delta') {
    let reasoningKey = event.reasoningId ? String(event.reasoningId) : '';
    if (!reasoningKey) {
      if (type === 'reasoning.start' || !rs.activeReasoningKey) {
        reasoningKey = `implicit_reasoning_${rs.timelineCounter}`;
      } else {
        reasoningKey = rs.activeReasoningKey;
      }
    }
    rs.activeReasoningKey = reasoningKey;

    const delta = typeof event.delta === 'string' ? event.delta : '';
    const eventText = typeof event.text === 'string' ? event.text : '';
    let nodeId = rs.reasoningNodeById.get(reasoningKey);
    const existingMappedNode = nodeId ? rs.timelineNodes.get(nodeId) : undefined;
    if (!nodeId || isTerminalStatus(existingMappedNode?.status)) {
      nodeId = `thinking_${rs.timelineCounter}`;
      rs.timelineCounter++;
      rs.reasoningNodeById.set(reasoningKey, nodeId);
      rs.timelineOrder.push(nodeId);
      rs.timelineNodes.set(nodeId, {
        id: nodeId, kind: 'thinking', text: eventText || delta,
        status: 'running', expanded: false,
        ts: event.timestamp || Date.now(),
      });
    } else {
      const existing = rs.timelineNodes.get(nodeId);
      if (existing) {
        rs.timelineNodes.set(nodeId, {
          ...existing, text: (existing.text || '') + delta,
          status: 'running',
        });
      }
    }
    return;
  }

  if (type === 'reasoning.end' || type === 'reasoning.snapshot') {
    const reasoningKey = event.reasoningId ? String(event.reasoningId) : (rs.activeReasoningKey || `implicit_snap_${rs.timelineCounter}`);
    let nodeId = rs.reasoningNodeById.get(reasoningKey);
    const existingMappedNode = nodeId ? rs.timelineNodes.get(nodeId) : undefined;
    if (!nodeId || isTerminalStatus(existingMappedNode?.status)) {
      /* Create node if it doesn't exist — matches original ensureReasoningNode */
      nodeId = `thinking_${rs.timelineCounter}`;
      rs.timelineCounter++;
      rs.reasoningNodeById.set(reasoningKey, nodeId);
      rs.timelineOrder.push(nodeId);
    }
    const existing = rs.timelineNodes.get(nodeId);
    const text = typeof event.text === 'string' ? event.text : (existing?.text || '');
    rs.timelineNodes.set(nodeId, {
      id: nodeId, kind: 'thinking', text, status: 'completed', expanded: false,
      ts: event.timestamp || existing?.ts || Date.now(),
    });
    rs.activeReasoningKey = '';
    return;
  }

  /* tool.start / tool.snapshot */
  if (type === 'tool.start' || type === 'tool.snapshot') {
    const toolId = event.toolId || '';
    if (!toolId) return;
    const viewportKey = resolveViewportKey(event);
    let nodeId = rs.toolNodeById.get(toolId);
    const existingMappedNode = nodeId ? rs.timelineNodes.get(nodeId) : undefined;
    if (!nodeId || isTerminalStatus(existingMappedNode?.status)) {
      nodeId = `tool_${rs.timelineCounter}`;
      rs.timelineCounter++;
      rs.toolNodeById.set(toolId, nodeId);
      rs.timelineOrder.push(nodeId);
    }
    const existing = rs.timelineNodes.get(nodeId);
    const params = parseFrontendToolParams(event);
    const resolvedParams = params.found && params.params ? params.params : null;
    const argsText = resolvedParams
      ? JSON.stringify(resolvedParams, null, 2)
      : (existing?.argsText || '');
    rs.timelineNodes.set(nodeId, {
      id: nodeId, kind: 'tool', toolId,
      toolLabel: event.toolLabel || existing?.toolLabel || '',
      toolName: pickToolName(existing?.toolName, event.toolName),
      viewportKey: viewportKey || existing?.viewportKey || '',
      description: event.description || existing?.description || '',
      argsText,
      status: type === 'tool.snapshot' ? 'completed' : 'running',
      result: existing?.result || null,
      ts: event.timestamp || existing?.ts || Date.now(),
    });
    /* Also update toolStates for the Tools debug tab */
    const existingTs = rs.toolStates.get(toolId);
    rs.toolStates.set(toolId, {
      toolId,
      argsBuffer: existingTs?.argsBuffer || '',
      toolLabel: event.toolLabel || existingTs?.toolLabel || '',
      toolName: pickToolName(existingTs?.toolName, event.toolName),
      toolType: event.toolType || existingTs?.toolType || '',
      viewportKey: viewportKey || existingTs?.viewportKey || '',
      toolTimeout: event.toolTimeout ?? existingTs?.toolTimeout ?? null,
      toolParams: resolvedParams || existingTs?.toolParams || null,
      description: event.description || existingTs?.description || '',
      runId: event.runId || existingTs?.runId || rs.runId,
    });
    return;
  }

  /* tool.result */
  if (type === 'tool.result') {
    const toolId = event.toolId || '';
    const nodeId = rs.toolNodeById.get(toolId);
    if (nodeId) {
      const existing = rs.timelineNodes.get(nodeId);
      if (existing) {
        const resultValue = event.result ?? event.output ?? event.text ?? '';
        const resultText = typeof resultValue === 'string' ? resultValue : JSON.stringify(resultValue, null, 2);
        rs.timelineNodes.set(nodeId, {
          ...existing,
          toolLabel: existing.toolLabel || rs.toolStates.get(toolId)?.toolLabel || '',
          status: event.error ? 'failed' : 'completed',
          result: { text: resultText, isCode: typeof resultValue !== 'string' },
        });
      }
    }
    return;
  }

  /* tool.end */
  if (type === 'tool.end') {
    const toolId = event.toolId || '';
    const nodeId = rs.toolNodeById.get(toolId);
    if (nodeId) {
      const existing = rs.timelineNodes.get(nodeId);
      if (existing) {
        rs.timelineNodes.set(nodeId, {
          ...existing,
          toolLabel: existing.toolLabel || rs.toolStates.get(toolId)?.toolLabel || '',
          status: event.error ? 'failed' : (existing.status === 'failed' ? 'failed' : 'completed'),
        });
      }
    }
    return;
  }

  /* plan events */
  if (type === 'plan.update' || type === 'plan.snapshot') {
    if (event.plan) {
      rs.plan = { planId: event.planId || 'plan', plan: event.plan };
    }
    return;
  }

  if (type === 'plan.task.start') {
    const taskId = event.taskId || '';
    if (taskId) {
      rs.planCurrentRunningTaskId = taskId;
      rs.planLastTouchedTaskId = taskId;
      rs.planRuntimeByTaskId.set(taskId, { status: 'running', updatedAt: Date.now(), error: '' });
    }
    return;
  }

  if (type === 'plan.task.end' || type === 'plan.task.complete') {
    const taskId = event.taskId || '';
    if (taskId) {
      rs.planRuntimeByTaskId.set(taskId, {
        status: event.error ? 'failed' : 'completed',
        updatedAt: Date.now(),
        error: event.error ? String(event.error) : '',
      });
      if (rs.planCurrentRunningTaskId === taskId) {
        rs.planCurrentRunningTaskId = '';
      }
    }
    return;
  }
}

/**
 * useChatActions — handles loading agents, chats, and switching chat context.
 */
export function useChatActions() {
  const { state, dispatch, stateRef } = useAppContext();
  const loadSeqRef = useRef(0);
  const bootstrappedRef = useRef(false);

  const clearPlanAutoCollapseTimer = useCallback(() => {
    const timer = stateRef.current.planAutoCollapseTimer;
    if (timer) {
      window.clearTimeout(timer);
      dispatch({ type: 'SET_PLAN_AUTO_COLLAPSE_TIMER', timer: null });
    }
  }, [dispatch, stateRef]);

  const findDefaultTeamWorkerKey = useCallback((rows: WorkerRow[]): string => {
    const matched = rows.find((row) => {
      if (row.type !== 'team') return false;
      const name = String(row.displayName || '').trim().toLowerCase();
      const sourceId = String(row.sourceId || '').trim().toLowerCase();
      return name === 'default team'
        || name === 'default_team'
        || name === '默认小组'
        || sourceId === 'default_team'
        || sourceId === 'default';
    });
    return matched?.key || '';
  }, []);

  const ensureWorkerSelection = useCallback((rows: WorkerRow[], preferredWorkerKey = ''): string => {
    const preferred = String(preferredWorkerKey || '').trim();
    if (preferred && rows.some((row) => row.key === preferred)) {
      return preferred;
    }
    const current = String(stateRef.current.workerSelectionKey || '').trim();
    if (current && rows.some((row) => row.key === current)) {
      return current;
    }
    const defaultTeamKey = findDefaultTeamWorkerKey(rows);
    if (defaultTeamKey) return defaultTeamKey;
    return rows[0]?.key || '';
  }, [findDefaultTeamWorkerKey, stateRef]);

  const rebuildWorkerRowsFromState = useCallback((overrides: WorkerRefreshOverrides = {}) => {
    const current = stateRef.current;
    const agents = overrides.agents ?? current.agents;
    const teams = overrides.teams ?? current.teams;
    const chats = overrides.chats ?? current.chats;
    const rows = buildWorkerRows({
      agents,
      teams,
      chats,
      workerPriorityKey: overrides.workerPriorityKey ?? current.workerPriorityKey,
    });
    const workerSelectionKey = ensureWorkerSelection(rows, overrides.workerSelectionKey ?? current.workerSelectionKey);
    if (workerSelectionKey) {
      dispatch({ type: 'SET_WORKER_SELECTION_KEY', workerKey: workerSelectionKey });
    }
    dispatch({ type: 'SET_WORKER_ROWS', rows });

    const workerIndexByKey = new Map(rows.map((row) => [row.key, row] as const));
    const workerChats = buildSelectedWorkerConversationRows({
      chats,
      workerSelectionKey,
      workerIndexByKey,
    });
    dispatch({ type: 'SET_WORKER_RELATED_CHATS', chats: workerChats });
  }, [dispatch, ensureWorkerSelection, stateRef]);

  const getWorkerDataSnapshot = useCallback((): WorkerDataSnapshot => ({
    agents: stateRef.current.agents,
    teams: stateRef.current.teams,
    chats: stateRef.current.chats,
    workerSelectionKey: stateRef.current.workerSelectionKey,
    workerPriorityKey: stateRef.current.workerPriorityKey,
  }), [stateRef]);

  const loadAgents = useCallback(async () => {
    try {
      const response = await getAgents();
      const agents = (response.data as Agent[]) || [];
      dispatch({ type: 'SET_AGENTS', agents });
      rebuildWorkerRowsFromState({ agents });
    } catch (error) {
      dispatch({ type: 'APPEND_DEBUG', line: `[loadAgents error] ${(error as Error).message}` });
    }
  }, [dispatch, rebuildWorkerRowsFromState]);

  const loadTeams = useCallback(async () => {
    try {
      const response = await getTeams();
      const teams = (response.data as Team[]) || [];
      dispatch({ type: 'SET_TEAMS', teams });
      rebuildWorkerRowsFromState({ teams });
    } catch (error) {
      dispatch({ type: 'APPEND_DEBUG', line: `[loadTeams error] ${(error as Error).message}` });
    }
  }, [dispatch, rebuildWorkerRowsFromState]);

  const loadChats = useCallback(async () => {
    try {
      const response = await getChats();
      const chats = mergeFetchedChats(stateRef.current.chats, (response.data as Chat[]) || []);
      dispatch({ type: 'SET_CHATS', chats });
      rebuildWorkerRowsFromState({ chats });
    } catch (error) {
      dispatch({ type: 'APPEND_DEBUG', line: `[loadChats error] ${(error as Error).message}` });
    }
  }, [dispatch, rebuildWorkerRowsFromState, stateRef]);

  const refreshWorkerData = useCallback(async () => {
    await refreshWorkerDataWithCoordinator({
      fetchAgents: async () => {
        const response = await getAgents();
        return (response.data as Agent[]) || [];
      },
      fetchTeams: async () => {
        const response = await getTeams();
        return (response.data as Team[]) || [];
      },
      fetchChats: async () => {
        const response = await getChats();
        return (response.data as Chat[]) || [];
      },
      getSnapshot: getWorkerDataSnapshot,
      applyAgents: (agents) => {
        dispatch({ type: 'SET_AGENTS', agents });
      },
      applyTeams: (teams) => {
        dispatch({ type: 'SET_TEAMS', teams });
      },
      applyChats: (chats) => {
        dispatch({ type: 'SET_CHATS', chats });
      },
      rebuildWorkerRows: rebuildWorkerRowsFromState,
      appendDebug: (line) => {
        dispatch({ type: 'APPEND_DEBUG', line });
      },
    });
  }, [dispatch, getWorkerDataSnapshot, rebuildWorkerRowsFromState]);

  const loadChat = useCallback(
    async (chatId: string) => {
      if (!chatId) return;

      const seq = ++loadSeqRef.current;
      dispatch({ type: 'SET_CHAT_ID', chatId });
      clearPlanAutoCollapseTimer();
      dispatch({ type: 'RESET_CONVERSATION' });
      window.dispatchEvent(new CustomEvent('agent:voice-reset'));

      const currentChat = stateRef.current.chats.find((chat) => String(chat?.chatId || '') === String(chatId));
      const workerKey = createWorkerKeyFromChat((currentChat || {}) as Chat);
      if (workerKey) {
        dispatch({ type: 'SET_WORKER_SELECTION_KEY', workerKey });
        const worker = stateRef.current.workerIndexByKey.get(workerKey) as WorkerRow | undefined;
        const workerChats = buildWorkerConversationRows({
          chats: stateRef.current.chats,
          worker: worker || null,
        });
        dispatch({ type: 'SET_WORKER_RELATED_CHATS', chats: workerChats });
      }

      try {
        const response = await getChat(chatId, false);
        if (seq !== loadSeqRef.current) return;

        const chatData = response.data as Record<string, unknown>;

        /* Replay events into a LOCAL MUTABLE state to avoid React batching issues */
        const events = Array.isArray(chatData?.events) ? chatData.events : [];
        const rs = createReplayState();
        rs.chatId = chatId;

        for (const event of events) {
          if (seq !== loadSeqRef.current) return;
          const evt = event as AgentEvent;
          if (evt?.chatId && String(evt.chatId) !== String(chatId)) continue;
          replayEvent(rs, evt);
        }

        /* Dispatch the complete replay result as a single batch update */
        dispatch({
          type: 'BATCH_UPDATE',
          updates: {
            chatId: rs.chatId,
            runId: rs.runId,
            timelineNodes: rs.timelineNodes,
            timelineOrder: rs.timelineOrder,
            contentNodeById: rs.contentNodeById,
            reasoningNodeById: rs.reasoningNodeById,
            toolNodeById: rs.toolNodeById,
            toolStates: rs.toolStates,
            timelineCounter: rs.timelineCounter,
            activeReasoningKey: rs.activeReasoningKey,
            events: rs.events,
            plan: rs.plan,
            planRuntimeByTaskId: rs.planRuntimeByTaskId,
            planCurrentRunningTaskId: rs.planCurrentRunningTaskId,
            planLastTouchedTaskId: rs.planLastTouchedTaskId,
          },
        });

        /* Set agent for this chat */
        const agentKey = String(chatData?.firstAgentKey || chatData?.agentKey || '');
        if (agentKey) {
          dispatch({ type: 'SET_CHAT_AGENT_BY_ID', chatId, agentKey });
        }
        // Also set any agents discovered during replay
        rs.chatAgentById.forEach((agentKey, cid) => {
          dispatch({ type: 'SET_CHAT_AGENT_BY_ID', chatId: cid, agentKey });
        });
      } catch (error) {
        dispatch({ type: 'APPEND_DEBUG', line: `[loadChat error] ${(error as Error).message}` });
      }
    },
    [clearPlanAutoCollapseTimer, dispatch, stateRef]
  );

  const selectWorkerConversation = useCallback(async (workerKey: string) => {
    const normalized = String(workerKey || '').trim();
    if (!normalized) return;

    const row = stateRef.current.workerIndexByKey.get(normalized) as WorkerRow | undefined;
    if (!row) return;

    dispatch({ type: 'SET_WORKER_SELECTION_KEY', workerKey: normalized });
    const workerChats = buildWorkerConversationRows({
      chats: stateRef.current.chats,
      worker: row,
    });
    dispatch({ type: 'SET_WORKER_RELATED_CHATS', chats: workerChats });
    dispatch({
      type: 'SET_WORKER_CHAT_PANEL_COLLAPSED',
      collapsed: true,
    });

    if (row.hasHistory && row.latestChatId) {
      await loadChat(row.latestChatId);
      return;
    }

    dispatch({ type: 'SET_CHAT_ID', chatId: '' });
    clearPlanAutoCollapseTimer();
    dispatch({ type: 'RESET_CONVERSATION' });
    window.dispatchEvent(new CustomEvent('agent:voice-reset'));
    dispatch({
      type: 'APPEND_DEBUG',
      line: `[worker] ${row.type === 'team' ? '小组' : '员工'} ${row.displayName} 暂无历史对话，发送首条消息将创建新对话`,
    });
  }, [clearPlanAutoCollapseTimer, dispatch, loadChat, stateRef]);

  /* Bootstrap: load worker data on mount */
  useEffect(() => {
    if (bootstrappedRef.current) {
      return;
    }
    bootstrappedRef.current = true;

    setAccessToken(stateRef.current.accessToken);
    refreshWorkerData().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Load chat when sidebar triggers */
  useEffect(() => {
    const handler = (e: Event) => {
      const chatId = (e as CustomEvent).detail?.chatId;
      if (chatId) loadChat(chatId);
    };
    window.addEventListener('agent:load-chat', handler);
    return () => window.removeEventListener('agent:load-chat', handler);
  }, [loadChat]);

  /* Refresh agents list on-demand */
  useEffect(() => {
    const handler = () => {
      loadAgents().catch(() => undefined);
    };
    window.addEventListener('agent:refresh-agents', handler);
    return () => window.removeEventListener('agent:refresh-agents', handler);
  }, [loadAgents]);

  /* Refresh teams list on-demand */
  useEffect(() => {
    const handler = () => {
      loadTeams().catch(() => undefined);
    };
    window.addEventListener('agent:refresh-teams', handler);
    return () => window.removeEventListener('agent:refresh-teams', handler);
  }, [loadTeams]);

  /* Refresh chats list on-demand */
  useEffect(() => {
    const handler = () => {
      loadChats().catch(() => undefined);
    };
    window.addEventListener('agent:refresh-chats', handler);
    return () => window.removeEventListener('agent:refresh-chats', handler);
  }, [loadChats]);

  /* Refresh worker data with coordinated state application */
  useEffect(() => {
    const handler = () => {
      refreshWorkerData().catch(() => undefined);
    };
    window.addEventListener('agent:refresh-worker-data', handler);
    return () => window.removeEventListener('agent:refresh-worker-data', handler);
  }, [refreshWorkerData]);

  useEffect(() => {
    rebuildWorkerRowsFromState({
      workerPriorityKey: state.workerPriorityKey,
    });
  }, [rebuildWorkerRowsFromState, state.workerPriorityKey]);

  useEffect(() => {
    rebuildWorkerRowsFromState({
      chats: state.chats,
    });
  }, [rebuildWorkerRowsFromState, state.chats]);

  /* Switch conversation mode */
  useEffect(() => {
    const handler = (e: Event) => {
      const mode = (e as CustomEvent).detail?.mode === 'worker' ? 'worker' : 'chat';
      dispatch({ type: 'SET_CONVERSATION_MODE', mode });
      if (mode === 'worker') {
        rebuildWorkerRowsFromState();
        dispatch({ type: 'SET_WORKER_CHAT_PANEL_COLLAPSED', collapsed: true });
      } else {
        dispatch({ type: 'SET_WORKER_CHAT_PANEL_COLLAPSED', collapsed: true });
      }
    };
    window.addEventListener('agent:set-conversation-mode', handler);
    return () => window.removeEventListener('agent:set-conversation-mode', handler);
  }, [dispatch, rebuildWorkerRowsFromState]);

  /* Select worker/team row */
  useEffect(() => {
    const handler = (e: Event) => {
      const workerKey = (e as CustomEvent).detail?.workerKey;
      if (workerKey) {
        selectWorkerConversation(workerKey).catch(() => undefined);
      }
    };
    window.addEventListener('agent:select-worker', handler);
    return () => window.removeEventListener('agent:select-worker', handler);
  }, [selectWorkerConversation]);

  return {
    loadAgents,
    loadTeams,
    loadChats,
    refreshWorkerData,
    loadChat,
    selectWorkerConversation,
  };
}
