import type {
  AgentEvent,
  Plan,
  PlanRuntime,
  TimelineNode,
  ToolState,
} from '../context/types';
import { parseContentSegments } from './contentSegments';
import { isTerminalStatus, safeText, toText } from './eventUtils';
import { parseFrontendToolParams } from './frontendToolParams';
import { normalizeTimelineAttachments } from './timelineAttachments';
import { pickToolName, resolveViewportKey } from './toolEvent';

export interface EventProcessorState {
  getContentNodeId(contentId: string): string | undefined;
  getReasoningNodeId(reasoningKey: string): string | undefined;
  getToolNodeId(toolId: string): string | undefined;
  getToolState(toolId: string): ToolState | undefined;
  getTimelineNode(nodeId: string): TimelineNode | undefined;
  getNodeText(nodeId: string): string;
  nextCounter(): number;
  peekCounter(): number;
  activeReasoningKey: string;
  chatId: string;
  runId: string;
  currentRunningPlanTaskId?: string;
  getPlanId?(): string | undefined;
}

export interface EventProcessorConfig {
  mode: 'live' | 'replay';
  reasoningExpandedDefault: boolean;
}

export type EventCommand =
  | { cmd: 'SET_CHAT_ID'; chatId: string }
  | { cmd: 'SET_RUN_ID'; runId: string }
  | { cmd: 'SET_CHAT_AGENT'; chatId: string; agentKey: string }
  | { cmd: 'SET_CONTENT_NODE_ID'; contentId: string; nodeId: string }
  | { cmd: 'SET_REASONING_NODE_ID'; reasoningId: string; nodeId: string }
  | { cmd: 'SET_TOOL_NODE_ID'; toolId: string; nodeId: string }
  | { cmd: 'APPEND_TIMELINE_ORDER'; nodeId: string }
  | { cmd: 'SET_TIMELINE_NODE'; id: string; node: TimelineNode }
  | { cmd: 'SET_TOOL_STATE'; toolId: string; state: ToolState }
  | { cmd: 'SET_ACTIVE_REASONING_KEY'; key: string }
  | { cmd: 'SET_PLAN'; plan: Plan | null; resetRuntime: boolean }
  | { cmd: 'SET_PLAN_RUNTIME'; taskId: string; runtime: PlanRuntime }
  | { cmd: 'SET_PLAN_CURRENT_RUNNING_TASK_ID'; taskId: string }
  | { cmd: 'SET_PLAN_LAST_TOUCHED_TASK_ID'; taskId: string }
  | {
    cmd: 'USER_MESSAGE';
    nodeId: string;
    text: string;
    ts: number;
    variant: 'default' | 'steer' | 'remember' | 'learn';
    attachments?: TimelineNode['attachments'];
    steerId?: string;
  }
  | { cmd: 'SYSTEM_ERROR'; nodeId: string; text: string; ts: number };

const INCOMPLETE_TOOL_ARGS_NOTE = '[incomplete tool args]';

function ensureMappedNode(params: {
  currentNodeId: string | undefined;
  getNode: (nodeId: string) => TimelineNode | undefined;
  setMapCommand: EventCommand;
  prefix: string;
  commands: EventCommand[];
  state: EventProcessorState;
}): string {
  const existingMappedNode = params.currentNodeId
    ? params.getNode(params.currentNodeId)
    : undefined;
  if (params.currentNodeId && !isTerminalStatus(existingMappedNode?.status)) {
    return params.currentNodeId;
  }

  const nodeId = `${params.prefix}_${params.state.nextCounter()}`;
  params.commands.push(params.setMapCommand);
  params.commands.push({ cmd: 'APPEND_TIMELINE_ORDER', nodeId });

  const setMap = params.commands[params.commands.length - 2];
  if (setMap.cmd === 'SET_CONTENT_NODE_ID') {
    setMap.nodeId = nodeId;
  } else if (setMap.cmd === 'SET_REASONING_NODE_ID') {
    setMap.nodeId = nodeId;
  } else if (setMap.cmd === 'SET_TOOL_NODE_ID') {
    setMap.nodeId = nodeId;
  }
  return nodeId;
}

function parseToolArgsBuffer(
  nextArgsBuffer: string,
  existingToolParams: Record<string, unknown> | null,
): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(nextArgsBuffer);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Partial JSON chunks are expected while streaming tool args.
  }
  return existingToolParams;
}

function parseToolArgsObject(nextArgsBuffer: string): Record<string, unknown> | null {
  return parseToolArgsBuffer(nextArgsBuffer, null);
}

function appendIncompleteToolArgsNote(argsText: string): string {
  const trimmed = argsText.trim();
  if (!trimmed) {
    return INCOMPLETE_TOOL_ARGS_NOTE;
  }
  if (trimmed.endsWith(INCOMPLETE_TOOL_ARGS_NOTE)) {
    return argsText;
  }
  return `${argsText}\n\n${INCOMPLETE_TOOL_ARGS_NOTE}`;
}

function resolveFinalToolArgsText(
  existingArgsText: string,
  argsBuffer: string,
  eventArgsText: string,
): string {
  const parsedBuffer = parseToolArgsObject(argsBuffer);
  if (parsedBuffer) {
    return JSON.stringify(parsedBuffer, null, 2);
  }

  const parsedEventArgs = parseToolArgsObject(eventArgsText);
  if (parsedEventArgs) {
    return JSON.stringify(parsedEventArgs, null, 2);
  }

  const chosen = existingArgsText || argsBuffer || eventArgsText;
  if (!argsBuffer.trim()) {
    return chosen;
  }
  return appendIncompleteToolArgsNote(chosen || argsBuffer);
}

function pickEventText(...candidates: Array<unknown>): string {
  for (const candidate of candidates) {
    const text = safeText(candidate);
    if (text.trim()) {
      return text;
    }
  }
  return '';
}

function readToolDescription(event: AgentEvent): string {
  const raw = event as Record<string, unknown>;
  return pickEventText(raw.toolDescription, event.description);
}

function readToolArgumentsText(event: AgentEvent): string {
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
    return safeText(raw);
  }
}

function buildToolTimelineNode(input: {
  nodeId: string;
  event: AgentEvent;
  existing?: TimelineNode;
  existingToolState?: ToolState;
  argsText: string;
  status: string;
  result: TimelineNode['result'];
  ts: number;
}): TimelineNode {
  const { nodeId, event, existing, existingToolState, argsText, result, status, ts } = input;
  return {
    id: nodeId,
    kind: 'tool',
    toolId: toText(event.toolId) || existing?.toolId || existingToolState?.toolId || '',
    toolLabel: toText(event.toolLabel) || existing?.toolLabel || existingToolState?.toolLabel || '',
    toolName: pickToolName(existing?.toolName, existingToolState?.toolName, event.toolName),
    viewportKey: resolveViewportKey(event) || existing?.viewportKey || existingToolState?.viewportKey || '',
    description: pickEventText(
      readToolDescription(event),
      existing?.description,
      existingToolState?.description,
    ),
    argsText,
    status,
    result,
    ts,
  };
}

export function processEvent(
  event: AgentEvent,
  state: EventProcessorState,
  config: EventProcessorConfig,
): EventCommand[] {
  const commands: EventCommand[] = [];
  const type = toText(event.type);

  if (type === 'request.query') {
    if (config.mode !== 'replay') return commands;
    const text = safeText(event.message);
    const attachments = normalizeTimelineAttachments((event as Record<string, unknown>).references);
    if (!text && attachments.length === 0) return commands;
    const counter = state.nextCounter();
    const suffix = toText(event.requestId) || String(counter);
    commands.push({
      cmd: 'USER_MESSAGE',
      nodeId: `user_${suffix}`,
      text,
      ts: event.timestamp || Date.now(),
      variant: 'default',
      attachments: attachments.length > 0 ? attachments : undefined,
    });
    return commands;
  }

  if (type === 'request.steer' || type === 'request.remember' || type === 'request.learn') {
    const text = safeText(event.message);
    if (!text) return commands;
    const counter = config.mode === 'replay' ? state.nextCounter() : null;
    const variant = type === 'request.steer'
      ? 'steer'
      : type === 'request.remember'
        ? 'remember'
        : 'learn';
    const prefix = variant === 'steer' ? 'steer' : variant;
    const suffix = toText(event.steerId) || toText(event.requestId) || String(counter ?? Date.now());
    if (event.chatId) commands.push({ cmd: 'SET_CHAT_ID', chatId: event.chatId });
    if (event.runId) commands.push({ cmd: 'SET_RUN_ID', runId: String(event.runId) });
    commands.push({
      cmd: 'USER_MESSAGE',
      nodeId: `${prefix}_${suffix}`,
      text,
      ts: event.timestamp || Date.now(),
      variant,
      steerId: variant === 'steer' ? toText(event.steerId) || suffix : undefined,
    });
    return commands;
  }

  if (type === 'run.start') {
    if (event.runId) commands.push({ cmd: 'SET_RUN_ID', runId: event.runId });
    if (event.chatId) commands.push({ cmd: 'SET_CHAT_ID', chatId: event.chatId });
    if (event.agentKey && (event.chatId || state.chatId)) {
      commands.push({
        cmd: 'SET_CHAT_AGENT',
        chatId: event.chatId || state.chatId,
        agentKey: String(event.agentKey),
      });
    }
    return commands;
  }

  if (type === 'run.end' || type === 'run.error' || type === 'run.complete' || type === 'run.cancel') {
    if (type === 'run.error' && event.error) {
      commands.push({
        cmd: 'SYSTEM_ERROR',
        nodeId: `sys_${config.mode === 'replay' ? state.nextCounter() : Date.now()}`,
        text: safeText(event.error),
        ts: Date.now(),
      });
    }
    return commands;
  }

  if (type === 'content.start' && event.contentId) {
    const contentId = String(event.contentId);
    const nodeId = ensureMappedNode({
      currentNodeId: state.getContentNodeId(contentId),
      getNode: state.getTimelineNode,
      setMapCommand: { cmd: 'SET_CONTENT_NODE_ID', contentId, nodeId: '' },
      prefix: 'content',
      commands,
      state,
    });
    const text = typeof event.text === 'string' ? event.text : '';
    commands.push({
      cmd: 'SET_TIMELINE_NODE',
      id: nodeId,
      node: {
        id: nodeId,
        kind: 'content',
        contentId,
        text,
        segments: text ? parseContentSegments(contentId, text) : [],
        ts: event.timestamp || Date.now(),
      },
    });
    return commands;
  }

  if (type === 'content.delta' && event.contentId) {
    const contentId = String(event.contentId);
    const nodeId = ensureMappedNode({
      currentNodeId: state.getContentNodeId(contentId),
      getNode: state.getTimelineNode,
      setMapCommand: { cmd: 'SET_CONTENT_NODE_ID', contentId, nodeId: '' },
      prefix: 'content',
      commands,
      state,
    });
    const existing = state.getTimelineNode(nodeId);
    const newText = `${state.getNodeText(nodeId)}${typeof event.delta === 'string' ? event.delta : ''}`;
    commands.push({
      cmd: 'SET_TIMELINE_NODE',
      id: nodeId,
      node: {
        id: nodeId,
        kind: 'content',
        contentId,
        text: newText,
        segments: parseContentSegments(contentId, newText),
        ts: event.timestamp || existing?.ts || Date.now(),
      },
    });
    return commands;
  }

  if (type === 'content.end' && event.contentId) {
    const contentId = String(event.contentId);
    const nodeId = ensureMappedNode({
      currentNodeId: state.getContentNodeId(contentId),
      getNode: state.getTimelineNode,
      setMapCommand: { cmd: 'SET_CONTENT_NODE_ID', contentId, nodeId: '' },
      prefix: 'content',
      commands,
      state,
    });
    const existing = state.getTimelineNode(nodeId);
    const finalText = typeof event.text === 'string' && event.text.trim()
      ? event.text
      : state.getNodeText(nodeId);
    commands.push({
      cmd: 'SET_TIMELINE_NODE',
      id: nodeId,
      node: {
        id: nodeId,
        kind: 'content',
        contentId,
        text: finalText,
        segments: parseContentSegments(contentId, finalText),
        status: 'completed',
        ts: event.timestamp || existing?.ts || Date.now(),
      },
    });
    return commands;
  }

  if (type === 'content.snapshot' && event.contentId) {
    const contentId = String(event.contentId);
    const nodeId = ensureMappedNode({
      currentNodeId: state.getContentNodeId(contentId),
      getNode: state.getTimelineNode,
      setMapCommand: { cmd: 'SET_CONTENT_NODE_ID', contentId, nodeId: '' },
      prefix: 'content',
      commands,
      state,
    });
    const text = typeof event.text === 'string' ? event.text : '';
    commands.push({
      cmd: 'SET_TIMELINE_NODE',
      id: nodeId,
      node: {
        id: nodeId,
        kind: 'content',
        contentId,
        text,
        segments: parseContentSegments(contentId, text),
        status: 'completed',
        ts: event.timestamp || Date.now(),
      },
    });
    return commands;
  }

  if (type === 'reasoning.start' || type === 'reasoning.delta') {
    let reasoningKey = event.reasoningId ? String(event.reasoningId) : '';
    if (!reasoningKey) {
      reasoningKey = type === 'reasoning.start' || !state.activeReasoningKey
        ? `implicit_reasoning_${state.peekCounter()}`
        : state.activeReasoningKey;
    }
    commands.push({ cmd: 'SET_ACTIVE_REASONING_KEY', key: reasoningKey });

    const nodeId = ensureMappedNode({
      currentNodeId: state.getReasoningNodeId(reasoningKey),
      getNode: state.getTimelineNode,
      setMapCommand: { cmd: 'SET_REASONING_NODE_ID', reasoningId: reasoningKey, nodeId: '' },
      prefix: 'thinking',
      commands,
      state,
    });

    const existing = state.getTimelineNode(nodeId);
    const delta = typeof event.delta === 'string' ? event.delta : '';
    const eventText = typeof event.text === 'string' ? event.text : '';
    const text = existing
      ? `${state.getNodeText(nodeId)}${delta}`
      : eventText || delta;

    commands.push({
      cmd: 'SET_TIMELINE_NODE',
      id: nodeId,
      node: {
        id: nodeId,
        kind: 'thinking',
        text,
        status: 'running',
        expanded: config.reasoningExpandedDefault,
        ts: event.timestamp || existing?.ts || Date.now(),
      },
    });
    return commands;
  }

  if (type === 'reasoning.end' || type === 'reasoning.snapshot') {
    const reasoningKey = event.reasoningId
      ? String(event.reasoningId)
      : state.activeReasoningKey || `implicit_snap_${state.peekCounter()}`;
    const nodeId = ensureMappedNode({
      currentNodeId: state.getReasoningNodeId(reasoningKey),
      getNode: state.getTimelineNode,
      setMapCommand: { cmd: 'SET_REASONING_NODE_ID', reasoningId: reasoningKey, nodeId: '' },
      prefix: 'thinking',
      commands,
      state,
    });
    const existing = state.getTimelineNode(nodeId);
    const text = typeof event.text === 'string' ? event.text : state.getNodeText(nodeId);
    commands.push({
      cmd: 'SET_TIMELINE_NODE',
      id: nodeId,
      node: {
        id: nodeId,
        kind: 'thinking',
        text,
        status: 'completed',
        expanded: config.reasoningExpandedDefault,
        ts: event.timestamp || existing?.ts || Date.now(),
      },
    });
    commands.push({ cmd: 'SET_ACTIVE_REASONING_KEY', key: '' });
    return commands;
  }

  if ((type === 'tool.start' || type === 'tool.snapshot') && event.toolId) {
    const toolId = event.toolId;
    const existingToolState = state.getToolState(toolId);
    const nodeId = ensureMappedNode({
      currentNodeId: state.getToolNodeId(toolId),
      getNode: state.getTimelineNode,
      setMapCommand: { cmd: 'SET_TOOL_NODE_ID', toolId, nodeId: '' },
      prefix: 'tool',
      commands,
      state,
    });
    const existing = state.getTimelineNode(nodeId);
    const params = parseFrontendToolParams(event);
    const resolvedParams = params.found && params.params ? params.params : null;
    const rawArgsText = readToolArgumentsText(event);
    const prettyArgsText = resolvedParams ? JSON.stringify(resolvedParams, null, 2) : '';
    const argsText = resolvedParams
      ? prettyArgsText
      : rawArgsText || existing?.argsText || existingToolState?.argsBuffer || '';
    const description = pickEventText(
      readToolDescription(event),
      existing?.description,
      existingToolState?.description,
    );
    const viewportKey = resolveViewportKey(event) || existing?.viewportKey || existingToolState?.viewportKey || '';
    const argsBuffer = rawArgsText || prettyArgsText || existingToolState?.argsBuffer || '';

    commands.push({
      cmd: 'SET_TIMELINE_NODE',
      id: nodeId,
      node: buildToolTimelineNode({
        nodeId,
        event,
        existing,
        existingToolState,
        argsText,
        status: type === 'tool.snapshot' ? 'completed' : 'running',
        result: existing?.result || null,
        ts: event.timestamp || existing?.ts || Date.now(),
      }),
    });
    commands.push({
      cmd: 'SET_TOOL_STATE',
      toolId,
      state: {
        toolId,
        argsBuffer,
        toolLabel: event.toolLabel || existingToolState?.toolLabel || '',
        toolName: pickToolName(existingToolState?.toolName, event.toolName),
        toolType: event.toolType || existingToolState?.toolType || '',
        viewportKey,
        toolTimeout: event.toolTimeout ?? existingToolState?.toolTimeout ?? null,
        toolParams: resolvedParams || existingToolState?.toolParams || null,
        description,
        runId: event.runId || existingToolState?.runId || state.runId,
      },
    });
    return commands;
  }

  if (type === 'tool.args' && event.toolId) {
    const toolId = event.toolId;
    const existingToolState = state.getToolState(toolId);
    const nextArgsBuffer = `${existingToolState?.argsBuffer || ''}${String(event.delta || '')}`;
    const parsedToolParams = parseToolArgsBuffer(nextArgsBuffer, existingToolState?.toolParams || null);
    const viewportKey = resolveViewportKey(event) || existingToolState?.viewportKey || '';
    const description = pickEventText(
      readToolDescription(event),
      existingToolState?.description,
    );
    const nextToolState: ToolState = {
      toolId,
      argsBuffer: nextArgsBuffer,
      toolLabel: event.toolLabel || existingToolState?.toolLabel || '',
      toolName: pickToolName(existingToolState?.toolName, event.toolName),
      toolType: event.toolType || existingToolState?.toolType || '',
      viewportKey,
      toolTimeout: event.toolTimeout ?? existingToolState?.toolTimeout ?? null,
      toolParams: parsedToolParams,
      description,
      runId: event.runId || existingToolState?.runId || state.runId,
    };
    commands.push({ cmd: 'SET_TOOL_STATE', toolId, state: nextToolState });

    const nodeId = ensureMappedNode({
      currentNodeId: state.getToolNodeId(toolId),
      getNode: state.getTimelineNode,
      setMapCommand: { cmd: 'SET_TOOL_NODE_ID', toolId, nodeId: '' },
      prefix: 'tool',
      commands,
      state,
    });
    const existingNode = state.getTimelineNode(nodeId);
    commands.push({
      cmd: 'SET_TIMELINE_NODE',
      id: nodeId,
      node: {
        id: nodeId,
        kind: 'tool',
        toolId,
        toolLabel: nextToolState.toolLabel || existingNode?.toolLabel || '',
        toolName: pickToolName(existingNode?.toolName, nextToolState.toolName),
        viewportKey: viewportKey || existingNode?.viewportKey || '',
        description: nextToolState.description || existingNode?.description || '',
        argsText: parsedToolParams ? JSON.stringify(parsedToolParams, null, 2) : nextArgsBuffer || existingNode?.argsText || '',
        status: 'running',
        result: existingNode?.result || null,
        ts: event.timestamp || existingNode?.ts || Date.now(),
      },
    });
    return commands;
  }

  if (type === 'tool.result') {
    const toolId = event.toolId || '';
    if (!toolId) return commands;
    let nodeId = state.getToolNodeId(toolId);
    if (!nodeId) {
      nodeId = `tool_${state.nextCounter()}`;
      commands.push({ cmd: 'SET_TOOL_NODE_ID', toolId, nodeId });
      commands.push({ cmd: 'APPEND_TIMELINE_ORDER', nodeId });
    }
    const existing = state.getTimelineNode(nodeId);
    const existingToolState = state.getToolState(toolId);
    const resultValue = event.result ?? event.output ?? event.text ?? '';
    const resultText = typeof resultValue === 'string' ? resultValue : JSON.stringify(resultValue, null, 2);
    const argsText = resolveFinalToolArgsText(
      existing?.argsText || '',
      existingToolState?.argsBuffer || '',
      readToolArgumentsText(event),
    );
    commands.push({
      cmd: 'SET_TIMELINE_NODE',
      id: nodeId,
      node: buildToolTimelineNode({
        nodeId,
        event,
        existing,
        existingToolState,
        argsText,
        status: event.error ? 'failed' : 'completed',
        result: { text: resultText, isCode: typeof resultValue !== 'string' },
        ts: existing?.ts || event.timestamp || Date.now(),
      }),
    });
    return commands;
  }

  if (type === 'tool.end') {
    const toolId = event.toolId || '';
    if (!toolId) return commands;
    let nodeId = state.getToolNodeId(toolId);
    if (!nodeId) {
      nodeId = `tool_${state.nextCounter()}`;
      commands.push({ cmd: 'SET_TOOL_NODE_ID', toolId, nodeId });
      commands.push({ cmd: 'APPEND_TIMELINE_ORDER', nodeId });
    }
    const existing = state.getTimelineNode(nodeId);
    const existingToolState = state.getToolState(toolId);
    const argsText = resolveFinalToolArgsText(
      existing?.argsText || '',
      existingToolState?.argsBuffer || '',
      readToolArgumentsText(event),
    );
    commands.push({
      cmd: 'SET_TIMELINE_NODE',
      id: nodeId,
      node: buildToolTimelineNode({
        nodeId,
        event,
        existing,
        existingToolState,
        argsText,
        status: event.error ? 'failed' : (existing?.status === 'failed' ? 'failed' : 'completed'),
        result: existing?.result || null,
        ts: existing?.ts || event.timestamp || Date.now(),
      }),
    });
    return commands;
  }

  if (type.startsWith('action.')) {
    return commands;
  }

  if ((type === 'plan.update' || type === 'plan.snapshot') && event.plan) {
    const nextPlanId = String(event.planId || 'plan');
    commands.push({
      cmd: 'SET_PLAN',
      plan: { planId: nextPlanId, plan: event.plan },
      resetRuntime: Boolean(state.getPlanId?.() && state.getPlanId?.() !== nextPlanId),
    });
    return commands;
  }

  if (type === 'plan.task.start') {
    const taskId = event.taskId || '';
    if (!taskId) return commands;
    commands.push({ cmd: 'SET_PLAN_CURRENT_RUNNING_TASK_ID', taskId });
    commands.push({ cmd: 'SET_PLAN_LAST_TOUCHED_TASK_ID', taskId });
    commands.push({
      cmd: 'SET_PLAN_RUNTIME',
      taskId,
      runtime: { status: 'running', updatedAt: Date.now(), error: '' },
    });
    return commands;
  }

  if (type === 'plan.task.end') {
    const taskId = event.taskId || '';
    if (!taskId) return commands;
    commands.push({
      cmd: 'SET_PLAN_RUNTIME',
      taskId,
      runtime: {
        status: event.error ? 'failed' : 'completed',
        updatedAt: Date.now(),
        error: event.error ? String(event.error) : '',
      },
    });
    commands.push({ cmd: 'SET_PLAN_LAST_TOUCHED_TASK_ID', taskId });
    if (state.currentRunningPlanTaskId === taskId) {
      commands.push({ cmd: 'SET_PLAN_CURRENT_RUNNING_TASK_ID', taskId: '' });
    }
    return commands;
  }

  return commands;
}
