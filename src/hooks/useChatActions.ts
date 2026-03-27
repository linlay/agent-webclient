import { useCallback, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { getChat } from '../lib/apiClient';
import type { Chat, AgentEvent, TimelineNode, Plan, PlanRuntime, ToolState, WorkerRow, TtsVoiceBlock } from '../context/types';
import { parseContentSegments } from '../lib/contentSegments';
import type { EventCommand, EventProcessorState } from '../lib/eventProcessor';
import { processEvent } from '../lib/eventProcessor';
import { createWorkerKeyFromChat } from '../lib/workerListFormatter';
import { buildWorkerConversationRows } from '../lib/workerConversationFormatter';
import { useWorkerData } from './useWorkerData';

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

function createReplayProcessorState(rs: ReplayState): EventProcessorState {
  return {
    getContentNodeId: (contentId) => rs.contentNodeById.get(contentId),
    getReasoningNodeId: (reasoningKey) => rs.reasoningNodeById.get(reasoningKey),
    getToolNodeId: (toolId) => rs.toolNodeById.get(toolId),
    getToolState: (toolId) => rs.toolStates.get(toolId),
    getTimelineNode: (nodeId) => rs.timelineNodes.get(nodeId),
    getNodeText: (nodeId) => rs.timelineNodes.get(nodeId)?.text || '',
    nextCounter: () => {
      const next = rs.timelineCounter;
      rs.timelineCounter += 1;
      return next;
    },
    peekCounter: () => rs.timelineCounter,
    activeReasoningKey: rs.activeReasoningKey,
    chatId: rs.chatId,
    runId: rs.runId,
    currentRunningPlanTaskId: rs.planCurrentRunningTaskId,
    getPlanId: () => rs.plan?.planId,
  };
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

function applyReplayEventCommand(rs: ReplayState, command: EventCommand): void {
  switch (command.cmd) {
    case 'SET_CHAT_ID':
      rs.chatId = command.chatId;
      return;
    case 'SET_RUN_ID':
      rs.runId = command.runId;
      return;
    case 'SET_CHAT_AGENT':
      rs.chatAgentById.set(command.chatId, command.agentKey);
      return;
    case 'SET_CONTENT_NODE_ID':
      rs.contentNodeById.set(command.contentId, command.nodeId);
      return;
    case 'SET_REASONING_NODE_ID':
      rs.reasoningNodeById.set(command.reasoningId, command.nodeId);
      return;
    case 'SET_TOOL_NODE_ID':
      rs.toolNodeById.set(command.toolId, command.nodeId);
      return;
    case 'APPEND_TIMELINE_ORDER':
      rs.timelineOrder.push(command.nodeId);
      return;
    case 'SET_TIMELINE_NODE': {
      const existing = rs.timelineNodes.get(command.id);
      if (command.node.kind === 'content') {
        rs.timelineNodes.set(command.id, {
          ...command.node,
          ttsVoiceBlocks: buildHistoryTtsVoiceBlocks(
            command.node.segments || [],
            existing?.kind === 'content' ? existing.ttsVoiceBlocks : undefined,
          ),
        });
        return;
      }
      rs.timelineNodes.set(command.id, command.node);
      return;
    }
    case 'SET_TOOL_STATE':
      rs.toolStates.set(command.toolId, command.state);
      return;
    case 'SET_ACTIVE_REASONING_KEY':
      rs.activeReasoningKey = command.key;
      return;
    case 'SET_PLAN':
      rs.plan = command.plan;
      if (command.resetRuntime) {
        rs.planRuntimeByTaskId = new Map();
        rs.planCurrentRunningTaskId = '';
        rs.planLastTouchedTaskId = '';
      }
      return;
    case 'SET_PLAN_RUNTIME':
      rs.planRuntimeByTaskId.set(command.taskId, command.runtime);
      return;
    case 'SET_PLAN_CURRENT_RUNNING_TASK_ID':
      rs.planCurrentRunningTaskId = command.taskId;
      return;
    case 'SET_PLAN_LAST_TOUCHED_TASK_ID':
      rs.planLastTouchedTaskId = command.taskId;
      return;
    case 'USER_MESSAGE':
      rs.timelineNodes.set(command.nodeId, {
        id: command.nodeId,
        kind: 'message',
        role: 'user',
        messageVariant: command.variant,
        steerId: command.steerId,
        text: command.text,
        attachments: command.attachments,
        ts: command.ts,
      });
      rs.timelineOrder.push(command.nodeId);
      return;
    case 'SYSTEM_ERROR':
      rs.timelineNodes.set(command.nodeId, {
        id: command.nodeId,
        kind: 'message',
        role: 'system',
        text: command.text,
        ts: command.ts,
      });
      rs.timelineOrder.push(command.nodeId);
      return;
  }
}

/**
 * Process a single event into the mutable replay state.
 * This mirrors useAgentEventHandler logic but writes to mutable state.
 */
export function replayEvent(rs: ReplayState, event: AgentEvent): void {
  rs.events.push(event);
  const commands = processEvent(event, createReplayProcessorState(rs), {
    mode: 'replay',
    reasoningExpandedDefault: false,
  });
  for (const command of commands) {
    applyReplayEventCommand(rs, command);
  }
}

/**
 * useChatActions — handles loading agents, chats, and switching chat context.
 */
export function useChatActions() {
  const { dispatch, stateRef } = useAppContext();
  const loadSeqRef = useRef(0);

  const clearPlanAutoCollapseTimer = useCallback(() => {
    const timer = stateRef.current.planAutoCollapseTimer;
    if (timer) {
      window.clearTimeout(timer);
      dispatch({ type: 'SET_PLAN_AUTO_COLLAPSE_TIMER', timer: null });
    }
  }, [dispatch, stateRef]);

  const focusComposerSoon = useCallback(() => {
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent('agent:focus-composer'));
    });
  }, []);

  const loadChat = useCallback(
    async (chatId: string, options: { focusComposerOnComplete?: boolean } = {}) => {
      if (!chatId) return;
      const focusComposerOnComplete = Boolean(options.focusComposerOnComplete);

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
        if (focusComposerOnComplete) {
          focusComposerSoon();
        }
      } catch (error) {
        dispatch({ type: 'APPEND_DEBUG', line: `[loadChat error] ${(error as Error).message}` });
        if (focusComposerOnComplete) {
          focusComposerSoon();
        }
      }
    },
    [clearPlanAutoCollapseTimer, dispatch, focusComposerSoon, stateRef]
  );

  const selectWorkerConversation = useCallback(async (
    workerKey: string,
    options: { focusComposerOnComplete?: boolean } = {},
  ) => {
    const normalized = String(workerKey || '').trim();
    if (!normalized) return;
    const focusComposerOnComplete = Boolean(options.focusComposerOnComplete);

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
      await loadChat(row.latestChatId, { focusComposerOnComplete });
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
    if (focusComposerOnComplete) {
      focusComposerSoon();
    }
  }, [clearPlanAutoCollapseTimer, dispatch, focusComposerSoon, loadChat, stateRef]);
  const workerData = useWorkerData({ loadChat, selectWorkerConversation });

  return {
    ...workerData,
    loadChat,
    selectWorkerConversation,
  };
}
