import type { AgentEvent } from '@/app/state/types';
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

function safeStr(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v === null || v === undefined) return '';
  return String(v);
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
