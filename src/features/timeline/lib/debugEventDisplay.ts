import type { AgentEvent } from '@/app/state/types';
import type { TimelineNode } from '@/app/state/types';
import { resolveToolLabel } from '@/features/timeline/lib/toolDisplay';

const hiddenDebugEvents = new WeakSet<AgentEvent>();

export type DebugEventGroup =
  | 'request'
  | 'chat'
  | 'run'
  | 'awaiting'
  | 'memory'
  | 'content'
  | 'reasoning'
  | 'tool'
  | 'action'
  | 'plan'
  | 'task'
  | 'artifact'
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

function safeStr(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v === null || v === undefined) return '';
  return String(v);
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
  if (type.startsWith('tool.')) return 'tool';
  if (type.startsWith('action.')) return 'action';
  if (type.startsWith('plan.')) return 'plan';
  if (type.startsWith('task.')) return 'task';
  if (type.startsWith('artifact.')) return 'artifact';
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
  return !hiddenDebugEvents.has(event);
}

export function getEventRowGroupClass(eventType: string): string {
  const group = classifyEventGroup(eventType);
  return group ? `event-group-${group}` : 'event-group-unrecognized';
}

export function getEventId(event: AgentEvent): string {
  if (String(event.type || '').toLowerCase() === 'artifact.publish') {
    return safeStr(event.runId);
  }
  const keys = [
    'requestId',
    'chatId',
    'runId',
    'awaitingId',
    'contentId',
    'reasoningId',
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
