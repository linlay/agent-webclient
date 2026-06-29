import type { AgentEvent } from '@/app/state/types';
import {
  AIContentEventTypeEnum,
  AIPlanningEventTypeEnum,
  AIReasoningEventTypeEnum,
  AIToolEventTypeEnum,
} from '@/app/state/types';
import type { TimelineNode } from '@/app/state/types';
import { isDeltaLogsEnabled } from '@/shared/config/featureFlags';

const hiddenDebugEvents = new WeakSet<AgentEvent>();
const deltaLogEventTypes = new Set([
  'content.start',
  'content.delta',
  'content.end',
  'reasoning.start',
  'reasoning.delta',
  'reasoning.end',
  'planning.start',
  'planning.delta',
  'planning.end',
  'tool.start',
  'tool.args',
  'tool.end',
  'action.start',
  'action.args',
  'action.end',
]);

const toolSnapshotPassthroughTypes = new Set([
  'tool.start',
  'tool.args',
  'tool.end',
]);

type StreamFamily = 'content' | 'reasoning' | 'planning' | 'tool';

const streamEndTypes: Record<StreamFamily, string> = {
  content: 'content.end',
  reasoning: 'reasoning.end',
  planning: 'planning.end',
  tool: 'tool.end',
};

const streamSnapshotTypes: Record<StreamFamily, string> = {
  content: AIContentEventTypeEnum.Snapshot,
  reasoning: AIReasoningEventTypeEnum.Snapshot,
  planning: AIPlanningEventTypeEnum.Snapshot,
  tool: AIToolEventTypeEnum.Snapshot,
};

export type DebugEventGroup =
  | 'request'
  | 'chat'
  | 'run'
  | 'awaiting'
  | 'memory'
  | 'content'
  | 'reasoning'
  | 'planning'
  | 'tool'
  | 'action'
  | 'plan'
  | 'task'
  | 'artifact'
  | 'source'
  | '';

export type DebugEventTarget =
  | { kind: 'node'; id: string }
  | { kind: 'task'; id: string };

export interface DebugEventTargetState {
  contentNodeById: Map<string, string>;
  reasoningNodeById: Map<string, string>;
  toolNodeById: Map<string, string>;
  timelineNodes: Map<string, TimelineNode>;
  timelineOrder: string[];
}

export interface DebugSnapshotTextContext {
  contentNodeById?: Map<string, string>;
  reasoningNodeById?: Map<string, string>;
  timelineNodes?: Map<string, TimelineNode>;
  activeReasoningKey?: string;
  runId?: string;
}

function safeStr(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v === null || v === undefined) return '';
  return String(v);
}

function readEventText(event: AgentEvent): string {
  return safeStr(event.text);
}

function readEventArgumentsText(event: AgentEvent): string {
  const raw = (event as Record<string, unknown>).arguments;
  if (raw === null || raw === undefined) {
    return '';
  }
  if (typeof raw === 'string') {
    return raw;
  }
  try {
    return JSON.stringify(raw, null, 2);
  } catch {
    return safeStr(raw);
  }
}

function pickEventValue(
  events: AgentEvent[],
  keys: string[],
): unknown {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const raw = events[index] as Record<string, unknown>;
    for (const key of keys) {
      const value = raw[key];
      if (value !== null && value !== undefined && safeStr(value).trim()) {
        return value;
      }
    }
  }
  return undefined;
}

function getStreamFamily(type: string): StreamFamily | '' {
  const normalized = String(type || '').toLowerCase();
  if (normalized.startsWith('content.')) return 'content';
  if (normalized.startsWith('reasoning.')) return 'reasoning';
  if (normalized.startsWith('planning.')) return 'planning';
  if (normalized.startsWith('tool.')) return 'tool';
  return '';
}

function getStreamId(event: AgentEvent, family: StreamFamily): string {
  if (family === 'content') {
    return safeStr(event.contentId).trim();
  }
  if (family === 'reasoning') {
    return safeStr(event.reasoningId).trim();
  }
  if (family === 'planning') {
    return (
      safeStr(event.planningId).trim() ||
      safeStr((event as Record<string, unknown>).planningKey).trim() ||
      safeStr(event.planId).trim()
    );
  }
  return safeStr(event.toolId).trim();
}

function hasSnapshotForStream(
  events: AgentEvent[],
  family: StreamFamily,
  streamId: string,
): boolean {
  const snapshotType = streamSnapshotTypes[family];
  return events.some((event) => {
    if (String(event.type || '').toLowerCase() !== snapshotType) {
      return false;
    }
    return streamId ? getStreamId(event, family) === streamId : true;
  });
}

function collectRelatedStreamEvents(
  event: AgentEvent,
  rawEvents: AgentEvent[],
  family: StreamFamily,
): AgentEvent[] {
  const streamId = getStreamId(event, family);
  if (streamId) {
    return rawEvents.filter((candidate) => {
      const type = String(candidate.type || '').toLowerCase();
      return getStreamFamily(type) === family && getStreamId(candidate, family) === streamId;
    });
  }

  const related: AgentEvent[] = [];
  for (let index = rawEvents.length - 1; index >= 0; index -= 1) {
    const candidate = rawEvents[index];
    const type = String(candidate.type || '').toLowerCase();
    if (getStreamFamily(type) !== family) {
      continue;
    }
    if (type === streamSnapshotTypes[family]) {
      break;
    }
    related.unshift(candidate);
    if (type.endsWith('.start')) {
      break;
    }
  }
  return related;
}

function fillSnapshotFields(
  snapshot: AgentEvent,
  relatedEvents: AgentEvent[],
  keys: string[],
): void {
  for (const key of keys) {
    const existingValue = (snapshot as Record<string, unknown>)[key];
    if (
      existingValue !== null &&
      existingValue !== undefined &&
      safeStr(existingValue).trim()
    ) {
      continue;
    }
    const value = pickEventValue(relatedEvents, [key]);
    if (value !== undefined) {
      (snapshot as Record<string, unknown>)[key] = value;
    }
  }
}

function readTimelineStreamNode(
  event: AgentEvent,
  family: Exclude<StreamFamily, 'tool'>,
  context?: DebugSnapshotTextContext,
): TimelineNode | undefined {
  if (!context?.timelineNodes) {
    return undefined;
  }

  const streamId = getStreamId(event, family);
  if (family === 'content') {
    const nodeId = streamId ? context.contentNodeById?.get(streamId) : undefined;
    return nodeId ? context.timelineNodes.get(nodeId) : undefined;
  }

  if (family === 'reasoning') {
    const reasoningKey = streamId || safeStr(context.activeReasoningKey).trim();
    const nodeId = reasoningKey ? context.reasoningNodeById?.get(reasoningKey) : undefined;
    return nodeId ? context.timelineNodes.get(nodeId) : undefined;
  }

  const planningId =
    safeStr(event.planningId).trim() ||
    safeStr((event as Record<string, unknown>).planningKey).trim();
  const planId = safeStr(event.planId).trim();
  const runId = safeStr(event.runId).trim() || safeStr(context.runId).trim();
  const candidateKeys = [
    planningId ? `planning:${planningId}` : '',
    !planningId && planId ? `planning:${planId}` : '',
    runId ? `planning_run:${runId}` : '',
    streamId,
  ].filter(Boolean);

  for (const key of candidateKeys) {
    const nodeId = context.reasoningNodeById?.get(key);
    const node = nodeId ? context.timelineNodes.get(nodeId) : undefined;
    if (node) {
      return node;
    }
  }

  return undefined;
}

function buildTextSnapshotFromRawEvents(
  event: AgentEvent,
  rawEvents: AgentEvent[],
  family: Exclude<StreamFamily, 'tool'>,
  context?: DebugSnapshotTextContext,
): AgentEvent | null {
  const streamId = getStreamId(event, family);
  if (String(event.type || '').toLowerCase() !== streamEndTypes[family]) {
    return null;
  }
  if (hasSnapshotForStream(rawEvents, family, streamId)) {
    return null;
  }

  const relatedEvents = collectRelatedStreamEvents(event, rawEvents, family);
  if (relatedEvents.length === 0) {
    return null;
  }

  const streamText = relatedEvents
    .map((candidate) => {
      const type = String(candidate.type || '').toLowerCase();
      if (type.endsWith('.delta')) {
        return safeStr(candidate.delta);
      }
      if (type.endsWith('.start')) {
        return readEventText(candidate);
      }
      return '';
    })
    .join('');
  const timelineNode = readTimelineStreamNode(event, family, context);
  const text = readEventText(event) || safeStr(timelineNode?.text) || streamText;

  const snapshot: AgentEvent = { ...event };
  (snapshot as Record<string, unknown>).type = streamSnapshotTypes[family];
  if (text) {
    snapshot.text = text;
  } else {
    delete snapshot.text;
  }

  fillSnapshotFields(snapshot, relatedEvents, [
    family === 'content' ? 'contentId' : family === 'reasoning' ? 'reasoningId' : 'planningId',
    family === 'reasoning' ? 'reasoningLabel' : 'planningLabel',
    'planId',
    'runId',
    'chatId',
    'requestId',
    'taskId',
    'taskName',
    'taskGroupId',
    'groupId',
    'subAgentKey',
  ].filter(Boolean) as string[]);

  if (timelineNode?.reasoningLabel) {
    if (family === 'reasoning' && !safeStr(snapshot.reasoningLabel).trim()) {
      snapshot.reasoningLabel = timelineNode.reasoningLabel;
    }
    if (family === 'planning' && !safeStr(snapshot.planningLabel).trim()) {
      snapshot.planningLabel = timelineNode.reasoningLabel;
    }
  }

  return snapshot;
}

function buildToolSnapshotFromRawEvents(
  event: AgentEvent,
  rawEvents: AgentEvent[],
): AgentEvent | null {
  const toolId = safeStr(event.toolId).trim();
  if (!toolId || String(event.type || '').toLowerCase() !== 'tool.end') {
    return null;
  }
  if (hasSnapshotForStream(rawEvents, 'tool', toolId)) {
    return null;
  }

  const relatedEvents = collectRelatedStreamEvents(event, rawEvents, 'tool').filter((candidate) =>
    toolSnapshotPassthroughTypes.has(String(candidate.type || '').toLowerCase()),
  );
  if (relatedEvents.length === 0) {
    return null;
  }

  const argsText = relatedEvents
    .map((candidate) => {
      const type = String(candidate.type || '').toLowerCase();
      if (type === 'tool.args') {
        return safeStr(candidate.delta);
      }
      return readEventArgumentsText(candidate);
    })
    .filter((text) => text.length > 0)
    .join('');

  const snapshot: AgentEvent = {
    ...event,
    type: AIToolEventTypeEnum.Snapshot,
    toolId,
  };
  if (argsText) {
    (snapshot as Record<string, unknown>).arguments = argsText;
  }

  fillSnapshotFields(snapshot, relatedEvents, [
    'toolName',
    'toolLabel',
    'toolType',
    'viewportKey',
    'toolTimeout',
    'runId',
    'chatId',
    'requestId',
    'taskId',
    'taskName',
    'taskGroupId',
    'groupId',
    'subAgentKey',
  ]);

  const description = pickEventValue(relatedEvents, ['toolDescription', 'description']);
  if (description !== undefined) {
    (snapshot as Record<string, unknown>).toolDescription = description;
  }

  return snapshot;
}

function buildSnapshotFromRawEvents(
  event: AgentEvent,
  rawEvents: AgentEvent[],
  context?: DebugSnapshotTextContext,
): AgentEvent | null {
  const type = String(event.type || '').toLowerCase();
  if (type === 'content.end') {
    return buildTextSnapshotFromRawEvents(event, rawEvents, 'content', context);
  }
  if (type === 'reasoning.end') {
    return buildTextSnapshotFromRawEvents(event, rawEvents, 'reasoning', context);
  }
  if (type === 'planning.end') {
    return buildTextSnapshotFromRawEvents(event, rawEvents, 'planning', context);
  }
  if (type === 'tool.end') {
    return buildToolSnapshotFromRawEvents(event, rawEvents);
  }
  return null;
}

function findClosestTimelineNodeId(
  timestamp: number | undefined,
  state: DebugEventTargetState,
): string {
  if (!Number.isFinite(timestamp)) {
    return '';
  }
  let closestNodeId = '';
  let smallestDistance = Number.POSITIVE_INFINITY;
  state.timelineOrder.forEach((nodeId) => {
    const node = state.timelineNodes.get(nodeId);
    if (!node || !Number.isFinite(node.ts)) {
      return;
    }
    const distance = Math.abs(Number(node.ts) - Number(timestamp));
    if (distance < smallestDistance) {
      smallestDistance = distance;
      closestNodeId = nodeId;
    }
  });
  return closestNodeId;
}

function findRequestNodeId(
  requestId: string,
  state: DebugEventTargetState,
): string {
  if (!requestId) return '';
  const directNodeId = `user_${requestId}`;
  if (state.timelineNodes.has(directNodeId)) {
    return directNodeId;
  }
  const fallbackNodeId = state.timelineOrder.find((nodeId) => {
    const node = state.timelineNodes.get(nodeId);
    return node?.kind === 'message' && node?.role === 'user' && nodeId.endsWith(requestId);
  });
  return fallbackNodeId || '';
}

export function classifyEventGroup(eventType: string): DebugEventGroup {
  const type = String(eventType || '').toLowerCase();
  if (type.startsWith('request.')) return 'request';
  if (type.startsWith('chat.')) return 'chat';
  if (type.startsWith('run.')) return 'run';
  if (type.startsWith('awaiting.')) return 'awaiting';
  if (type.startsWith('memory.')) return 'memory';
  if (type.startsWith('content.')) return 'content';
  if (type.startsWith('reasoning.')) return 'reasoning';
  if (type.startsWith('planning.')) return 'planning';
  if (type.startsWith('tool.')) return 'tool';
  if (type.startsWith('action.')) return 'action';
  if (type.startsWith('plan.')) return 'plan';
  if (type.startsWith('task.')) return 'task';
  if (type.startsWith('artifact.')) return 'artifact';
  if (type.startsWith('source.')) return 'source';
  return '';
}

export function isErrorEventType(eventType: string): boolean {
  const type = String(eventType || '').toLowerCase();
  return /(\.error|\.fail|\.cancel|\.cancelled)$/.test(type);
}

export function markDebugEventHidden(event: AgentEvent): void {
  hiddenDebugEvents.add(event);
}

export function shouldDisplayDebugEvent(event: AgentEvent): boolean {
  if (hiddenDebugEvents.has(event)) {
    return false;
  }
  if (isDeltaLogsEnabled()) {
    return true;
  }
  return !deltaLogEventTypes.has(String(event.type || '').toLowerCase());
}

export function appendVisibleDebugEvent(
  events: AgentEvent[],
  event: AgentEvent,
  maxEvents: number,
  rawEvents: AgentEvent[] = [event],
  context?: DebugSnapshotTextContext,
): AgentEvent[] {
  let visibleEvent = event;
  if (!isDeltaLogsEnabled()) {
    const snapshot = buildSnapshotFromRawEvents(event, rawEvents, context);
    if (snapshot) {
      visibleEvent = snapshot;
    }
  }

  if (!shouldDisplayDebugEvent(visibleEvent)) {
    return events;
  }
  if (events.length >= maxEvents) {
    return [...events.slice(-Math.floor(maxEvents * 0.8)), visibleEvent];
  }
  return [...events, visibleEvent];
}

export function getEventRowGroupClass(eventType: string): string {
  const group = classifyEventGroup(eventType);
  return group ? `event-group-${group}` : 'event-group-unrecognized';
}

export function getEventId(event: AgentEvent): string {
  if (String(event.type || '').toLowerCase() === 'artifact.publish') {
    return safeStr(event.runId);
  }
  if (String(event.type || '').toLowerCase() === 'source.publish') {
    return safeStr((event as Record<string, unknown>).publishId) || safeStr(event.runId);
  }
  const keys = [
    'requestId',
    'chatId',
    'runId',
    'awaitingId',
    'contentId',
    'reasoningId',
    'planningId',
    'toolId',
    'actionId',
    'planId',
    'taskId',
  ];
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(event, key)) {
      return safeStr(event[key]);
    }
  }
  return ''
}

export function resolveDebugEventTarget(
  event: AgentEvent,
  state: DebugEventTargetState,
): DebugEventTarget | null {
  const taskId = safeStr(event.taskId);
  if (taskId) {
    return { kind: 'task', id: taskId };
  }

  const contentId = safeStr(event.contentId);
  const contentNodeId = contentId ? safeStr(state.contentNodeById.get(contentId)) : '';
  if (contentNodeId) {
    return { kind: 'node', id: contentNodeId };
  }

  const reasoningId = safeStr(event.reasoningId);
  const reasoningNodeId = reasoningId ? safeStr(state.reasoningNodeById.get(reasoningId)) : '';
  if (reasoningNodeId) {
    return { kind: 'node', id: reasoningNodeId };
  }

  const toolId = safeStr(event.toolId);
  const toolNodeId = toolId ? safeStr(state.toolNodeById.get(toolId)) : '';
  if (toolNodeId) {
    return { kind: 'node', id: toolNodeId };
  }

  const requestNodeId = findRequestNodeId(safeStr(event.requestId), state);
  if (requestNodeId) {
    return { kind: 'node', id: requestNodeId };
  }

  const closestNodeId = findClosestTimelineNodeId(
    typeof event.timestamp === 'number' ? event.timestamp : undefined,
    state,
  );
  if (closestNodeId) {
    return { kind: 'node', id: closestNodeId };
  }

  return null;
}
