import type {
  ActionState,
  ActiveFrontendTool,
  AgentEvent,
  AppState,
  DebugSseEntry,
  Message,
  PendingSteer,
  PendingTool,
  PublishedArtifact,
  Plan,
  PlanRuntime,
  TimelineNode,
  ToolState,
} from '../context/types';
import { createReplayState, replayEvent, type ReplayState } from './conversationReplay';
import { toText } from './eventUtils';

export interface ConversationSnapshot {
  chatId: string;
  runId: string;
  requestId: string;
  streaming: boolean;
  abortController: AbortController | null;
  messagesById: Map<string, Message>;
  messageOrder: string[];
  events: AgentEvent[];
  debugLines: string[];
  rawSseEntries: DebugSseEntry[];
  artifacts: PublishedArtifact[];
  plan: Plan | null;
  planRuntimeByTaskId: Map<string, PlanRuntime>;
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
  bufferedRawSseEntries: DebugSseEntry[];
  bufferedDebugLines: string[];
  appliedEventCount: number;
  appliedRawSseEntryCount: number;
  appliedDebugLineCount: number;
}

export function markSessionSnapshotApplied(session: LiveQuerySession): void {
  if (!session.snapshot) {
    session.appliedEventCount = session.bufferedEvents.length;
    session.appliedRawSseEntryCount = session.bufferedRawSseEntries.length;
    session.appliedDebugLineCount = session.bufferedDebugLines.length;
    return;
  }

  // Use bufferedEvents.length rather than snapshot.events.length because
  // the snapshot state already contains the effects of ALL buffered events
  // that were processed while this session was active, but state.events
  // may have been truncated by MAX_EVENTS.  Using the truncated length
  // would replay already-applied events and corrupt content deltas.
  session.appliedEventCount = session.bufferedEvents.length;
  session.appliedRawSseEntryCount = session.bufferedRawSseEntries.length;
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
    bufferedRawSseEntries: [],
    bufferedDebugLines: [],
    appliedEventCount: 0,
    appliedRawSseEntryCount: 0,
    appliedDebugLineCount: 0,
  };
}

export function snapshotConversationState(state: AppState): ConversationSnapshot {
  return {
    chatId: String(state.chatId || '').trim(),
    runId: String(state.runId || '').trim(),
    requestId: String(state.requestId || '').trim(),
    streaming: Boolean(state.streaming),
    abortController: state.abortController,
    messagesById: cloneMap(state.messagesById),
    messageOrder: state.messageOrder.slice(),
    events: state.events.slice(),
    debugLines: state.debugLines.slice(),
    rawSseEntries: state.rawSseEntries.slice(),
    artifacts: cloneArtifacts(state.artifacts),
    plan: state.plan
      ? {
          ...state.plan,
          plan: Array.isArray(state.plan.plan)
            ? state.plan.plan.map((item) => ({ ...item }))
            : [],
        }
      : null,
    planRuntimeByTaskId: cloneMap(state.planRuntimeByTaskId),
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
    steerDraft: String(state.steerDraft || ''),
    pendingSteers: state.pendingSteers.map((steer) => ({ ...steer })),
    downvotedRunKeys: cloneSet(state.downvotedRunKeys),
  };
}

export function cloneConversationSnapshot(snapshot: ConversationSnapshot): ConversationSnapshot {
  return {
    ...snapshot,
    messagesById: cloneMap(snapshot.messagesById),
    messageOrder: snapshot.messageOrder.slice(),
    events: snapshot.events.slice(),
    debugLines: snapshot.debugLines.slice(),
    rawSseEntries: snapshot.rawSseEntries.slice(),
    artifacts: cloneArtifacts(snapshot.artifacts),
    plan: snapshot.plan
      ? {
          ...snapshot.plan,
          plan: Array.isArray(snapshot.plan.plan)
            ? snapshot.plan.plan.map((item) => ({ ...item }))
            : [],
        }
      : null,
    planRuntimeByTaskId: cloneMap(snapshot.planRuntimeByTaskId),
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
  rs.events = snapshot.events.slice();
  rs.debugLines = snapshot.debugLines.slice();
  rs.artifacts = cloneArtifacts(snapshot.artifacts);
  rs.plan = snapshot.plan
    ? {
        ...snapshot.plan,
        plan: snapshot.plan.plan.map((item) => ({ ...item })),
      }
    : null;
  rs.planRuntimeByTaskId = cloneMap(snapshot.planRuntimeByTaskId);
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
  next.timelineNodes = rs.timelineNodes;
  next.timelineOrder = rs.timelineOrder;
  next.contentNodeById = rs.contentNodeById;
  next.reasoningNodeById = rs.reasoningNodeById;
  next.toolNodeById = rs.toolNodeById;
  next.toolStates = rs.toolStates;
  next.timelineCounter = rs.timelineCounter;
  next.activeReasoningKey = rs.activeReasoningKey;
  next.events = rs.events;
  next.artifacts = rs.artifacts;
  next.plan = rs.plan;
  next.planRuntimeByTaskId = rs.planRuntimeByTaskId;
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
    if (toText(event.type) === 'request.query') {
      rs.events.push(event);
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
  next.requestId = session.requestId;
  next.streaming = Boolean(session.streaming);
  next.abortController = session.abortController;
  next.rawSseEntries = [
    ...next.rawSseEntries,
    ...session.bufferedRawSseEntries.slice(session.appliedRawSseEntryCount),
  ];
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
    requestId: snapshot.requestId,
    streaming: snapshot.streaming,
    abortController: snapshot.abortController,
    messagesById: cloneMap(snapshot.messagesById),
    messageOrder: snapshot.messageOrder.slice(),
    events: snapshot.events.slice(),
    debugLines: snapshot.debugLines.slice(),
    rawSseEntries: snapshot.rawSseEntries.slice(),
    artifacts: cloneArtifacts(snapshot.artifacts),
    plan: snapshot.plan
      ? {
          ...snapshot.plan,
          plan: snapshot.plan.plan.map((item) => ({ ...item })),
        }
      : null,
    planRuntimeByTaskId: cloneMap(snapshot.planRuntimeByTaskId),
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
    artifactExpanded: false,
    artifactManualOverride: null,
    artifactAutoCollapseTimer: null,
    steerDraft: snapshot.steerDraft,
    pendingSteers: snapshot.pendingSteers.map((steer) => ({ ...steer })),
    downvotedRunKeys: cloneSet(snapshot.downvotedRunKeys),
  };
}
