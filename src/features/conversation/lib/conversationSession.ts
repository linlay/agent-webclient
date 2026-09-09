import type { ActionState, ActiveAwaiting, ActiveFrontendTool, PendingTool, ToolState } from "@/features/tools/lib/toolsState";
import type { AgentEvent, AIUsageSnapshotEvent } from "@/shared/contracts/agentEvents";
import type { AppState } from "@/app/state/AppContext";
import type { FileChangeSummary } from "@/features/overview/lib/overviewState";
import type { Message } from "@/features/conversation/lib/messageState";
import type { PendingSteer } from "@/features/composer/lib/composerState";
import type { PublishedArtifact } from "@/features/artifacts/lib/artifactsState";
import type { Plan, PlanRuntime } from "@/features/plan/lib/planState";
import type { TaskItemMeta } from "@/features/tasks/lib/tasksState";
import type { TimelineNode } from "@/features/timeline/lib/timelineState";
import {
  cloneActiveAwaiting,
  cloneActiveAwaitingQueue,
} from '@/features/tools/lib/awaitingRuntime';
import type { RunSession } from '@/features/runs/lib/runSession';
import type { RunOwner } from '@/shared/data/runOwner';

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
  pendingAwaitings: ActiveAwaiting[];
  usageSnapshot: AIUsageSnapshotEvent | null;
  pendingSteers: Record<string, PendingSteer[]>;
  downvotedRunKeys: Set<string>;
}

export type LiveQuerySession = RunSession<ConversationSnapshot>;

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
    toolOutput: node.toolOutput
      ? {
          ...node.toolOutput,
          segments: node.toolOutput.segments.map((segment) => ({ ...segment })),
        }
      : undefined,
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

function clonePendingSteersDict(input: Record<string, PendingSteer[]>): Record<string, PendingSteer[]> {
  const result: Record<string, PendingSteer[]> = {};
  for (const chatId of Object.keys(input)) {
    result[chatId] = input[chatId].map((steer) => ({ ...steer }));
  }
  return result;
}

export function createLiveQuerySession(input: {
  requestId: string;
  observationSource?: "query" | "attach";
  chatId?: string;
  agentKey?: string;
  teamId?: string;
  owner?: RunOwner;
  editingMode?: boolean;
}): LiveQuerySession {
  return {
    requestId: String(input.requestId || '').trim(),
    observationSource: input.observationSource,
    chatId: String(input.chatId || '').trim(),
    runId: '',
    agentKey: String(input.agentKey || '').trim(),
    teamId: String(input.teamId || '').trim(),
    owner: input.owner,
    ...(typeof input.editingMode === 'boolean'
      ? { editingMode: input.editingMode }
      : {}),
    streaming: false,
    abortController: null,
    snapshot: null,
    bufferedEvents: [],
    bufferedDebugLines: [],
    appliedEventCount: 0,
    appliedDebugLineCount: 0,
  };
}

function cloneConversationCollections(snapshot: ConversationSnapshot) {
  return {
    messagesById: cloneMap(snapshot.messagesById),
    runAgentById: cloneMap(snapshot.runAgentById),
    messageOrder: snapshot.messageOrder.slice(),
    events: snapshot.events.slice(),
    debugEvents: snapshot.debugEvents.slice(),
    debugLines: snapshot.debugLines.slice(),
    artifacts: cloneArtifacts(snapshot.artifacts),
    fileChanges: cloneFileChanges(snapshot.fileChanges),
    planRuntimeByTaskId: cloneMap(snapshot.planRuntimeByTaskId),
    taskItemsById: cloneTaskItemMap(snapshot.taskItemsById),
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
    pendingAwaitings: cloneActiveAwaitingQueue(snapshot.pendingAwaitings),
    pendingSteers: clonePendingSteersDict(snapshot.pendingSteers),
    downvotedRunKeys: cloneSet(snapshot.downvotedRunKeys),
  };
}

export function snapshotConversationState(state: AppState): ConversationSnapshot {
  return {
    ...cloneConversationCollections(state),
    chatId: String(state.chatId || '').trim(),
    runId: String(state.runId || '').trim(),
    currentRunAgentKey: String(state.currentRunAgentKey || '').trim(),
    requestId: String(state.requestId || '').trim(),
    streaming: Boolean(state.streaming),
    abortController: state.abortController,
    plan: state.plan
      ? {
          ...state.plan,
          plan: Array.isArray(state.plan.plan)
            ? state.plan.plan.map((item) => ({ ...item }))
            : [],
        }
      : null,
    activeTaskIds: cloneSet(state.activeTaskIds),
    planCurrentRunningTaskId: String(state.planCurrentRunningTaskId || '').trim(),
    planLastTouchedTaskId: String(state.planLastTouchedTaskId || '').trim(),
    timelineCounter: state.timelineCounter,
    activeReasoningKey: String(state.activeReasoningKey || '').trim(),
    usageSnapshot: state.usageSnapshot,
  };
}

export function cloneConversationSnapshot(snapshot: ConversationSnapshot): ConversationSnapshot {
  return {
    ...snapshot,
    ...cloneConversationCollections(snapshot),
    plan: snapshot.plan
      ? {
          ...snapshot.plan,
          plan: Array.isArray(snapshot.plan.plan)
            ? snapshot.plan.plan.map((item) => ({ ...item }))
            : [],
        }
      : null,
    activeTaskIds: cloneSet(snapshot.activeTaskIds),
    usageSnapshot: snapshot.usageSnapshot,
  };
}
