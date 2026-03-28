import type { AgentEvent } from '../context/types';
import { resolveToolLabel } from './toolDisplay';

export type DebugEventGroup =
  | 'chat'
  | 'run'
  | 'content'
  | 'reasoning'
  | 'tool'
  | 'action'
  | 'plan'
  | '';

function safeStr(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v === null || v === undefined) return '';
  return String(v);
}

export function classifyEventGroup(eventType: string): DebugEventGroup {
  const type = String(eventType || '').toLowerCase();
  if (
    type === 'request.query'
    || type === 'request.steer'
    || type === 'request.remember'
    || type === 'request.learn'
    || type.startsWith('chat.')
  ) return 'chat';
  if (type.startsWith('run.')) return 'run';
  if (type.startsWith('content.')) return 'content';
  if (type.startsWith('reasoning.')) return 'reasoning';
  if (type.startsWith('tool.')) return 'tool';
  if (type.startsWith('action.')) return 'action';
  if (type.startsWith('plan.') || type.startsWith('task.')) return 'plan';
  return '';
}

export function isErrorEventType(eventType: string): boolean {
  const type = String(eventType || '').toLowerCase();
  return /(\.error|\.fail|\.cancel|\.cancelled)$/.test(type);
}

export function summarizeEvent(event: AgentEvent): string {
  const keys = [
    'chatId',
    'runId',
    'contentId',
    'reasoningId',
    'toolId',
    'actionId',
    'planId',
    'taskId',
  ];

  const kv = keys
    .filter((key) => Object.prototype.hasOwnProperty.call(event, key))
    .map((key) => `${key}=${safeStr(event[key])}`)
    .join(' ');

  if (
    event.type === 'request.query'
    || event.type === 'request.steer'
    || event.type === 'request.remember'
    || event.type === 'request.learn'
  ) {
    const message = safeStr(event.message).trim();
    return message || kv;
  }

  if (String(event.type || '').startsWith('tool.')) {
    const label = resolveToolLabel({
      toolLabel: safeStr(event.toolLabel),
      toolName: safeStr(event.toolName),
      viewportKey: safeStr(event.viewportKey),
      toolId: safeStr(event.toolId),
    }, '');
    return [label, kv].filter(Boolean).join(' ').trim();
  }

  if (kv) return kv;

  if (event.type === 'content.delta' || event.type === 'reasoning.delta') {
    return safeStr(event.delta).slice(0, 120);
  }

  if (event.type === 'content.snapshot' || event.type === 'reasoning.snapshot') {
    return safeStr(event.text).slice(0, 120);
  }

  if (event.type === 'tool.result') {
    const result = event.result;
    return typeof result === 'string'
      ? result.slice(0, 120)
      : safeStr(JSON.stringify(result)).slice(0, 120);
  }

  return '';
}
