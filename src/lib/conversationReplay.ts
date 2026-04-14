import type {
  ActiveAwaiting,
  AgentEvent,
  PublishedArtifact,
  TimelineNode,
  Plan,
  PlanRuntime,
  ToolState,
  TtsVoiceBlock,
} from '../context/types';
import { cloneActiveAwaiting, reduceActiveAwaiting } from './awaitingRuntime';
import { parseContentSegments } from './contentSegments';
import type { EventCommand, EventProcessorState } from './eventProcessor';
import { processEvent } from './eventProcessor';

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
  activeAwaiting: ActiveAwaiting | null;
  events: AgentEvent[];
  debugLines: string[];
  artifacts: PublishedArtifact[];
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
    activeAwaiting: null,
    events: [],
    debugLines: [],
    artifacts: [],
    plan: null,
    planRuntimeByTaskId: new Map(),
    planCurrentRunningTaskId: '',
    planLastTouchedTaskId: '',
  };
}

function clonePlan(plan: Plan | null): Plan | null {
  return plan
    ? {
        ...plan,
        plan: Array.isArray(plan.plan) ? plan.plan.map((item) => ({ ...item })) : [],
      }
    : null;
}

function upsertReplayArtifact(
  artifacts: PublishedArtifact[],
  nextArtifact: PublishedArtifact,
): PublishedArtifact[] {
  const index = artifacts.findIndex((item) => item.artifactId === nextArtifact.artifactId);
  if (index < 0) {
    return [...artifacts, nextArtifact];
  }
  const next = artifacts.slice();
  next[index] = nextArtifact;
  return next;
}

function cloneArtifacts(artifacts: PublishedArtifact[]): PublishedArtifact[] {
  return artifacts.map((item) => ({
    ...item,
    artifact: {
      ...item.artifact,
    },
  }));
}

export function setReplayPlan(
  rs: ReplayState,
  plan: Plan | null,
  options: { resetRuntime?: boolean } = {},
): void {
  rs.plan = clonePlan(plan);
  if (options.resetRuntime) {
    rs.planRuntimeByTaskId = new Map();
    rs.planCurrentRunningTaskId = '';
    rs.planLastTouchedTaskId = '';
  }
}

export function setReplayArtifacts(
  rs: ReplayState,
  artifacts: PublishedArtifact[],
): void {
  rs.artifacts = cloneArtifacts(artifacts);
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
    case 'UPSERT_ARTIFACT':
      rs.artifacts = upsertReplayArtifact(rs.artifacts, command.artifact);
      return;
    case 'SET_PLAN':
      setReplayPlan(rs, command.plan, { resetRuntime: command.resetRuntime });
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

export function replayEvent(rs: ReplayState, event: AgentEvent): void {
  rs.events.push(event);
  rs.activeAwaiting = reduceActiveAwaiting(rs.activeAwaiting, event);
  const commands = processEvent(event, createReplayProcessorState(rs), {
    mode: 'replay',
    reasoningExpandedDefault: false,
  });
  for (const command of commands) {
    applyReplayEventCommand(rs, command);
  }
  rs.activeAwaiting = cloneActiveAwaiting(rs.activeAwaiting);
}
