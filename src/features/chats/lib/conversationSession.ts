import type {
  ActionState,
  ActiveAwaiting,
  ActiveFrontendTool,
  AgentEvent,
  AppState,
  AIUsageSnapshotEvent,
  FileContentSnapshot,
  FileChangeSummary,
  Message,
  PendingSteer,
  PendingTool,
  PublishedArtifact,
  Plan,
  PlanRuntime,
  TaskItemMeta,
  TimelineNode,
  ToolState,
} from '@/app/state/types';
import { cloneActiveAwaiting, reduceActiveAwaiting } from '@/features/tools/lib/awaitingRuntime';
import { createReplayState, replayEvent, type ReplayState } from '@/features/chats/lib/conversationReplay';
import { bindRunAgentKey, readRunAgentKeyFromEvent } from '@/features/chats/lib/runAgentIdentity';
import { toText } from '@/shared/utils/eventUtils';
import { MAX_EVENTS } from '@/app/state/constants';
import { appendVisibleDebugEvent } from '@/features/timeline/lib/debugEventDisplay';

export interface ConversationSnapshot {
  chatId: string;
  runId: string;
  runAgentById: Map<string, string>;
  currentRunAgentKey: string;
  requestId: string;
  streaming: boolean;
  abortController: AbortController | null;
  messagesById: Map<string, Message>;
  messageOrder: string[];
  events: AgentEvent[];
  debugEvents: AgentEvent[];
  debugLines: string[];
  artifacts: PublishedArtifact[];
  fileChanges: FileChangeSummary[];
  fileContentSnapshots: Map<string, FileContentSnapshot>;
  plan: Plan | null;
  planRuntimeByTaskId: Map<string, PlanRuntime>;
  taskItemsById: Map<string, TaskItemMeta>;
  activeTaskIds: Set<string>;
  planCurrentRunningTaskId: string;
  planLastTouchedTaskId: string;
  toolStates: Map<string, ToolState>;
  toolNodeById: Map<string, string>;
  contentNodeById: Map<string, string>;
  pendingTools: Map<string, PendingTool>;
  reasoningNodeById: Map<string, string>;
  actionStates: Map<string, ActionState>;
  executedActionIds: Set<string>;
  timelineNodes: Map<string, TimelineNode>;
  timelineOrder: string[];
  timelineNodeByMessageId: Map<string, string>;
  timelineCounter: number;
  activeReasoningKey: string;
  activeFrontendTool: ActiveFrontendTool | null;
  activeAwaiting: ActiveAwaiting | null;
  usageSnapshot: AIUsageSnapshotEvent | null;
  steerDraft: string;
  pendingSteers: PendingSteer[];
  downvotedRunKeys: Set<string>;
}

export interface LiveQuerySession {
  requestId: string;
  chatId: string;
  runId: string;
  agentKey: string;
  teamId: string;
  streaming: boolean;
  abortController: AbortController | null;
  snapshot: ConversationSnapshot | null;
  bufferedEvents: AgentEvent[];
  bufferedDebugLines: string[];
  appliedEventCount: number;
  appliedDebugLineCount: number;
}

export function markSessionSnapshotApplied(session: LiveQuerySession): void {
  if (!session.snapshot) {
    session.appliedEventCount = session.bufferedEvents.length;
    session.appliedDebugLineCount = session.bufferedDebugLines.length;
    return;
  }

  // Use bufferedEvents.length rather than snapshot.events.length because
  // the snapshot state already contains the effects of ALL buffered events
  // that were processed while this session was active, but state.events
  // may have been truncated by MAX_EVENTS.  Using the truncated length
  // would replay already-applied events and corrupt content deltas.
  session.appliedEventCount = session.bufferedEvents.length;
  session.appliedDebugLineCount = session.bufferedDebugLines.length;
}

function cloneMap<K, V>(input: Map<K, V>): Map<K, V> {
  return new Map(input);
}

function cloneSet<T>(input: Set<T>): Set<T> {
  return new Set(input);
}

function cloneArtifacts(artifacts: PublishedArtifact[]): PublishedArtifact[] {
  return artifacts.map((item) => ({
    ...item,
    artifact: {
      ...item.artifact,
    },
  }));
}

function cloneFileChanges(fileChanges: FileChangeSummary[]): FileChangeSummary[] {
  return fileChanges.map((item) => ({ ...item }));
}

function cloneFileContentSnapshots(
  snapshots: Map<string, FileContentSnapshot>,
): Map<string, FileContentSnapshot> {
  return new Map(
    Array.from(snapshots.entries(), ([filePath, snapshot]) => [
      filePath,
      { ...snapshot },
    ]),
  );
}

function cloneTaskItemMap(input: Map<string, TaskItemMeta>): Map<string, TaskItemMeta> {
  return new Map(
    Array.from(input.entries(), ([key, value]) => [
      key,
      {
        ...value,
      },
    ]),
  );
}

function cloneTimelineNode(node: TimelineNode): TimelineNode {
  return {
    ...node,
    attachments: node.attachments ? node.attachments.map((item) => ({ ...item })) : undefined,
    segments: node.segments ? node.segments.map((segment) => ({ ...segment })) : undefined,
    embeddedViewports: node.embeddedViewports
      ? Object.fromEntries(
          Object.entries(node.embeddedViewports).map(([key, value]) => [key, { ...value }]),
        )
      : undefined,
    ttsVoiceBlocks: node.ttsVoiceBlocks
      ? Object.fromEntries(
          Object.entries(node.ttsVoiceBlocks).map(([key, value]) => [key, { ...value }]),
        )
      : undefined,
    result: node.result ? { ...node.result } : node.result,
  };
}

function cloneTimelineNodeMap(input: Map<string, TimelineNode>): Map<string, TimelineNode> {
  return new Map(
    Array.from(input.entries(), ([key, node]) => [key, cloneTimelineNode(node)]),
  );
}

function cloneActiveFrontendTool(tool: ActiveFrontendTool | null): ActiveFrontendTool | null {
  return tool
    ? {
        ...tool,
        toolParams: { ...(tool.toolParams || {}) },
      }
    : null;
}

export function createLiveQuerySession(input: {
  requestId: string;
  chatId?: string;
  agentKey?: string;
  teamId?: string;
}): LiveQuerySession {
  return {
    requestId: String(input.requestId || '').trim(),
    chatId: String(input.chatId || '').trim(),
    runId: '',
    agentKey: String(input.agentKey || '').trim(),
    teamId: String(input.teamId || '').trim(),
    streaming: false,
    abortController: null,
    snapshot: null,
    bufferedEvents: [],
    bufferedDebugLines: [],
    appliedEventCount: 0,
    appliedDebugLineCount: 0,
  };
}

export function snapshotConversationState(state: AppState): ConversationSnapshot {
  return {
    chatId: String(state.chatId || '').trim(),
    runId: String(state.runId || '').trim(),
    runAgentById: cloneMap(state.runAgentById),
    currentRunAgentKey: String(state.currentRunAgentKey || '').trim(),
    requestId: String(state.requestId || '').trim(),
    streaming: Boolean(state.streaming),
    abortController: state.abortController,
    messagesById: cloneMap(state.messagesById),
    messageOrder: state.messageOrder.slice(),
    events: state.events.slice(),
    debugEvents: state.debugEvents.slice(),
    debugLines: state.debugLines.slice(),
    artifacts: cloneArtifacts(state.artifacts),
    fileChanges: cloneFileChanges(state.fileChanges),
    fileContentSnapshots: cloneFileContentSnapshots(state.fileContentSnapshots),
    plan: state.plan
      ? {
          ...state.plan,
          plan: Array.isArray(state.plan.plan)
            ? state.plan.plan.map((item) => ({ ...item }))
            : [],
        }
      : null,
    planRuntimeByTaskId: cloneMap(state.planRuntimeByTaskId),
    taskItemsById: cloneTaskItemMap(state.taskItemsById),
    activeTaskIds: cloneSet(state.activeTaskIds),
    planCurrentRunningTaskId: String(state.planCurrentRunningTaskId || '').trim(),
    planLastTouchedTaskId: String(state.planLastTouchedTaskId || '').trim(),
    toolStates: cloneMap(state.toolStates),
    toolNodeById: cloneMap(state.toolNodeById),
    contentNodeById: cloneMap(state.contentNodeById),
    pendingTools: cloneMap(state.pendingTools),
    reasoningNodeById: cloneMap(state.reasoningNodeById),
    actionStates: cloneMap(state.actionStates),
    executedActionIds: cloneSet(state.executedActionIds),
    timelineNodes: cloneTimelineNodeMap(state.timelineNodes),
    timelineOrder: state.timelineOrder.slice(),
    timelineNodeByMessageId: cloneMap(state.timelineNodeByMessageId),
    timelineCounter: state.timelineCounter,
    activeReasoningKey: String(state.activeReasoningKey || '').trim(),
    activeFrontendTool: cloneActiveFrontendTool(state.activeFrontendTool),
    activeAwaiting: cloneActiveAwaiting(state.activeAwaiting),
    usageSnapshot: state.usageSnapshot,
    steerDraft: String(state.steerDraft || ''),
    pendingSteers: state.pendingSteers.map((steer) => ({ ...steer })),
    downvotedRunKeys: cloneSet(state.downvotedRunKeys),
  };
}

export function cloneConversationSnapshot(snapshot: ConversationSnapshot): ConversationSnapshot {
  return {
    ...snapshot,
    messagesById: cloneMap(snapshot.messagesById),
    runAgentById: cloneMap(snapshot.runAgentById),
    messageOrder: snapshot.messageOrder.slice(),
    events: snapshot.events.slice(),
    debugEvents: snapshot.debugEvents.slice(),
    debugLines: snapshot.debugLines.slice(),
    artifacts: cloneArtifacts(snapshot.artifacts),
    fileChanges: cloneFileChanges(snapshot.fileChanges),
    fileContentSnapshots: cloneFileContentSnapshots(snapshot.fileContentSnapshots),
    plan: snapshot.plan
      ? {
          ...snapshot.plan,
          plan: Array.isArray(snapshot.plan.plan)
            ? snapshot.plan.plan.map((item) => ({ ...item }))
            : [],
        }
      : null,
    planRuntimeByTaskId: cloneMap(snapshot.planRuntimeByTaskId),
    taskItemsById: cloneTaskItemMap(snapshot.taskItemsById),
    activeTaskIds: cloneSet(snapshot.activeTaskIds),
    toolStates: cloneMap(snapshot.toolStates),
    toolNodeById: cloneMap(snapshot.toolNodeById),
    contentNodeById: cloneMap(snapshot.contentNodeById),
    pendingTools: cloneMap(snapshot.pendingTools),
    reasoningNodeById: cloneMap(snapshot.reasoningNodeById),
    actionStates: cloneMap(snapshot.actionStates),
    executedActionIds: cloneSet(snapshot.executedActionIds),
    timelineNodes: cloneTimelineNodeMap(snapshot.timelineNodes),
    timelineOrder: snapshot.timelineOrder.slice(),
    timelineNodeByMessageId: cloneMap(snapshot.timelineNodeByMessageId),
    activeFrontendTool: cloneActiveFrontendTool(snapshot.activeFrontendTool),
    activeAwaiting: cloneActiveAwaiting(snapshot.activeAwaiting),
    usageSnapshot: snapshot.usageSnapshot,
    pendingSteers: snapshot.pendingSteers.map((steer) => ({ ...steer })),
    downvotedRunKeys: cloneSet(snapshot.downvotedRunKeys),
  };
}

function replayStateFromSnapshot(snapshot: ConversationSnapshot): ReplayState {
  const rs = createReplayState();
  rs.timelineNodes = cloneTimelineNodeMap(snapshot.timelineNodes);
  rs.timelineOrder = snapshot.timelineOrder.slice();
  rs.contentNodeById = cloneMap(snapshot.contentNodeById);
  rs.reasoningNodeById = cloneMap(snapshot.reasoningNodeById);
  rs.toolNodeById = cloneMap(snapshot.toolNodeById);
  rs.toolStates = cloneMap(snapshot.toolStates);
  rs.timelineCounter = snapshot.timelineCounter;
  rs.activeReasoningKey = snapshot.activeReasoningKey;
  rs.chatId = snapshot.chatId;
  rs.runId = snapshot.runId;
  rs.runAgentById = cloneMap(snapshot.runAgentById);
  rs.currentRunAgentKey = snapshot.currentRunAgentKey;
  rs.activeAwaiting = cloneActiveAwaiting(snapshot.activeAwaiting);
  rs.events = snapshot.events.slice();
  rs.debugEvents = snapshot.debugEvents.slice();
  rs.debugLines = snapshot.debugLines.slice();
  rs.artifacts = cloneArtifacts(snapshot.artifacts);
  rs.fileChanges = cloneFileChanges(snapshot.fileChanges);
  rs.fileContentSnapshots = cloneFileContentSnapshots(snapshot.fileContentSnapshots);
  rs.plan = snapshot.plan
    ? {
        ...snapshot.plan,
        plan: snapshot.plan.plan.map((item) => ({ ...item })),
      }
    : null;
  rs.planRuntimeByTaskId = cloneMap(snapshot.planRuntimeByTaskId);
  rs.taskItemsById = cloneTaskItemMap(snapshot.taskItemsById);
  rs.activeTaskIds = cloneSet(snapshot.activeTaskIds);
  rs.planCurrentRunningTaskId = snapshot.planCurrentRunningTaskId;
  rs.planLastTouchedTaskId = snapshot.planLastTouchedTaskId;
  return rs;
}

function applyReplayStateToSnapshot(
  snapshot: ConversationSnapshot,
  rs: ReplayState,
): ConversationSnapshot {
  const next = cloneConversationSnapshot(snapshot);
  next.chatId = rs.chatId;
  next.runId = rs.runId;
  next.runAgentById = cloneMap(rs.runAgentById);
  next.currentRunAgentKey = rs.currentRunAgentKey;
  next.timelineNodes = rs.timelineNodes;
  next.timelineOrder = rs.timelineOrder;
  next.contentNodeById = rs.contentNodeById;
  next.reasoningNodeById = rs.reasoningNodeById;
  next.toolNodeById = rs.toolNodeById;
  next.toolStates = rs.toolStates;
  next.timelineCounter = rs.timelineCounter;
  next.activeReasoningKey = rs.activeReasoningKey;
  next.activeAwaiting = cloneActiveAwaiting(rs.activeAwaiting);
  next.events = rs.events;
  next.debugEvents = rs.debugEvents;
  next.artifacts = rs.artifacts;
  next.fileChanges = rs.fileChanges;
  next.fileContentSnapshots = rs.fileContentSnapshots;
  next.plan = rs.plan;
  next.planRuntimeByTaskId = rs.planRuntimeByTaskId;
  next.taskItemsById = rs.taskItemsById;
  next.activeTaskIds = rs.activeTaskIds;
  next.planCurrentRunningTaskId = rs.planCurrentRunningTaskId;
  next.planLastTouchedTaskId = rs.planLastTouchedTaskId;
  return next;
}

export function applyPendingSessionUpdates(
  snapshot: ConversationSnapshot,
  session: LiveQuerySession,
): ConversationSnapshot {
  const rs = replayStateFromSnapshot(snapshot);
  const pendingEvents = session.bufferedEvents.slice(session.appliedEventCount);

  for (const event of pendingEvents) {
    const binding = readRunAgentKeyFromEvent(event);
    if (binding) {
      rs.runAgentById = bindRunAgentKey(rs.runAgentById, binding.runId, binding.agentKey);
      if (!rs.runId || rs.runId === binding.runId) {
        rs.currentRunAgentKey = binding.agentKey;
      }
    }
    if (toText(event.type) === 'request.query') {
      rs.events.push(event);
      rs.debugEvents = appendVisibleDebugEvent(rs.debugEvents, event, MAX_EVENTS, rs.events);
      rs.activeAwaiting = reduceActiveAwaiting(rs.activeAwaiting, event, {
        agentKey: rs.currentRunAgentKey,
      });
      if (event.chatId) {
        rs.chatId = String(event.chatId);
      }
      if (event.runId) {
        rs.runId = String(event.runId);
      }
      if (event.agentKey && event.chatId) {
        rs.chatAgentById.set(String(event.chatId), String(event.agentKey));
      }
      continue;
    }
    replayEvent(rs, event);
  }

  const next = applyReplayStateToSnapshot(snapshot, rs);
  next.chatId = session.chatId || next.chatId;
  next.runId = session.runId || next.runId;
  next.runAgentById = cloneMap(rs.runAgentById);
  if (session.runId) {
    next.currentRunAgentKey =
      next.runAgentById.get(session.runId) || session.agentKey || next.currentRunAgentKey;
  }
  if (session.runId && session.agentKey) {
    next.runAgentById = bindRunAgentKey(next.runAgentById, session.runId, session.agentKey);
    next.currentRunAgentKey = session.agentKey;
  }
  next.requestId = session.requestId;
  next.streaming = Boolean(session.streaming);
  next.abortController = session.abortController;
  next.debugLines = [
    ...next.debugLines,
    ...session.bufferedDebugLines.slice(session.appliedDebugLineCount),
  ];
  return next;
}

export function buildConversationStateUpdates(
  snapshot: ConversationSnapshot,
): Partial<AppState> {
  return {
    chatId: snapshot.chatId,
    runId: snapshot.runId,
    runAgentById: cloneMap(snapshot.runAgentById),
    currentRunAgentKey: snapshot.currentRunAgentKey,
    requestId: snapshot.requestId,
    streaming: snapshot.streaming,
    abortController: snapshot.abortController,
    messagesById: cloneMap(snapshot.messagesById),
    messageOrder: snapshot.messageOrder.slice(),
    events: snapshot.events.slice(),
    debugEvents: snapshot.debugEvents.slice(),
    debugLines: snapshot.debugLines.slice(),
    artifacts: cloneArtifacts(snapshot.artifacts),
    fileChanges: cloneFileChanges(snapshot.fileChanges),
    fileContentSnapshots: cloneFileContentSnapshots(snapshot.fileContentSnapshots),
    plan: snapshot.plan
      ? {
          ...snapshot.plan,
          plan: snapshot.plan.plan.map((item) => ({ ...item })),
        }
      : null,
    planRuntimeByTaskId: cloneMap(snapshot.planRuntimeByTaskId),
    taskItemsById: cloneTaskItemMap(snapshot.taskItemsById),
    planCurrentRunningTaskId: snapshot.planCurrentRunningTaskId,
    planLastTouchedTaskId: snapshot.planLastTouchedTaskId,
    toolStates: cloneMap(snapshot.toolStates),
    toolNodeById: cloneMap(snapshot.toolNodeById),
    contentNodeById: cloneMap(snapshot.contentNodeById),
    pendingTools: cloneMap(snapshot.pendingTools),
    reasoningNodeById: cloneMap(snapshot.reasoningNodeById),
    actionStates: cloneMap(snapshot.actionStates),
    executedActionIds: cloneSet(snapshot.executedActionIds),
    timelineNodes: cloneTimelineNodeMap(snapshot.timelineNodes),
    timelineOrder: snapshot.timelineOrder.slice(),
    timelineNodeByMessageId: cloneMap(snapshot.timelineNodeByMessageId),
    timelineDomCache: new Map(),
    timelineCounter: snapshot.timelineCounter,
    renderQueue: {
      dirtyNodeIds: new Set(),
      scheduled: false,
      stickToBottomRequested: false,
      fullSyncNeeded: false,
    },
    activeReasoningKey: snapshot.activeReasoningKey,
    activeFrontendTool: cloneActiveFrontendTool(snapshot.activeFrontendTool),
    activeAwaiting: cloneActiveAwaiting(snapshot.activeAwaiting),
    usageSnapshot: snapshot.usageSnapshot,
    artifactExpanded: false,
    artifactManualOverride: null,
    artifactAutoCollapseTimer: null,
    steerDraft: snapshot.steerDraft,
    pendingSteers: snapshot.pendingSteers.map((steer) => ({ ...steer })),
    downvotedRunKeys: cloneSet(snapshot.downvotedRunKeys),
  };
}
