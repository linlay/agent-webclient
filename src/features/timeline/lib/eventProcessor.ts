import type {
  AgentEvent,
  PlanItem,
  PublishedArtifact,
  Plan,
  PlanRuntime,
  TimelineNode,
  ToolState,
} from '@/app/state/types';
import { parseContentSegments } from '@/features/timeline/lib/contentSegments';
import { isTerminalStatus, safeText, toText } from '@/shared/utils/eventUtils';
import { parseFrontendToolParams } from '@/features/tools/lib/frontendToolParams';
import { normalizeTimelineAttachments } from '@/features/artifacts/lib/timelineAttachments';
import { pickToolName, resolveViewportKey } from '@/features/timeline/lib/toolEvent';
import {
  getAwaitingItemMeta,
  getAwaitingQuestionMetaByQuestion,
  maskAwaitingAnswerParams,
} from '@/features/tools/lib/awaitingQuestionMeta';

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
  | { cmd: 'UPSERT_ARTIFACT'; artifact: PublishedArtifact }
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

function normalizePublishedArtifact(event: AgentEvent): PublishedArtifact | null {
  const rawArtifact = event.artifact;
  if (!rawArtifact || typeof rawArtifact !== 'object' || Array.isArray(rawArtifact)) {
    return null;
  }

  const record = rawArtifact as Record<string, any>;
  const url = safeText(record.url).trim();
  const fallbackId = toText(event.artifactId).trim()
    || safeText(record.sha256).trim()
    || url
    || safeText(record.name).trim();
  if (!url || !fallbackId) {
    return null;
  }

  const rawSize = Number(record.sizeBytes ?? record.size);
  return {
    artifactId: fallbackId,
    artifact: {
      mimeType: safeText(record.mimeType).trim() || 'application/octet-stream',
      name: safeText(record.name).trim() || fallbackId,
      sha256: safeText(record.sha256).trim(),
      sizeBytes: Number.isFinite(rawSize) && rawSize >= 0 ? rawSize : 0,
      type: 'file',
      url,
    },
    timestamp: Number(event.timestamp) || Date.now(),
  };
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

function formatStructuredEventText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }
    try {
      const parsed = JSON.parse(trimmed);
      return typeof parsed === 'string'
        ? parsed
        : JSON.stringify(parsed, null, 2);
    } catch {
      return value;
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return safeText(value);
  }
}

function maskStructuredAwaitingAnswers(event: AgentEvent): unknown {
  const runId = toText(event.runId);
  const awaitingId = toText(event.awaitingId);
  const rawRecord = event as Record<string, unknown>;
  const answers = rawRecord.answers;
  const approvals = rawRecord.approvals;
  const forms = rawRecord.forms;
  const legacyQuestions = rawRecord.questions;

  if (Array.isArray(answers)) {
    const normalizedAnswers = !runId || !awaitingId
      ? answers
      : maskAwaitingAnswerParams(
          runId,
          awaitingId,
          answers.filter((item): item is any => Boolean(item) && typeof item === 'object'),
        ).map((item) => {
          const meta = getAwaitingItemMeta(runId, awaitingId, item.id);
          return meta?.kind === 'question'
            ? {
                ...item,
                header: meta.header,
                question: meta.question,
              }
            : item;
        });
    return normalizedAnswers;
  }

  if (Array.isArray(approvals) && runId && awaitingId) {
    return approvals.map((item) => {
      if (!item || typeof item !== 'object') {
        return item;
      }
      const id = toText((item as Record<string, unknown>).id);
      const meta = id ? getAwaitingItemMeta(runId, awaitingId, id) : null;
      return meta?.kind === 'approval'
        ? {
            ...item,
            command: meta.command,
            level: meta.level,
          }
        : item;
    });
  }

  if (Array.isArray(forms) && runId && awaitingId) {
    return forms.map((item) => {
      if (!item || typeof item !== 'object') {
        return item;
      }
      const id = toText((item as Record<string, unknown>).id);
      const meta = id ? getAwaitingItemMeta(runId, awaitingId, id) : null;
      return meta?.kind === 'form'
        ? {
            ...item,
            action: meta.action,
          }
        : item;
    });
  }

  if (Array.isArray(legacyQuestions) && runId && awaitingId) {
    return legacyQuestions.map((item) => {
      if (!item || typeof item !== 'object') {
        return item;
      }
      const legacyQuestion = toText((item as Record<string, unknown>).question);
      const meta = legacyQuestion
        ? getAwaitingQuestionMetaByQuestion(runId, awaitingId, legacyQuestion)
        : null;
      if (meta?.type !== 'password') {
        return item;
      }
      return {
        ...item,
        answer: '••••••',
        answers: Array.isArray((item as Record<string, unknown>).answers)
          ? ((item as Record<string, unknown>).answers as unknown[]).map(() => '••••••')
          : undefined,
      };
    });
  }

  return legacyQuestions ?? answers ?? approvals ?? forms;
}

function readAwaitingAnswerText(event: AgentEvent): string {
  const rawRecord = event as Record<string, unknown>;
  return pickEventText(
    formatStructuredEventText(maskStructuredAwaitingAnswers(event)),
    event.text,
    rawRecord.answers,
    rawRecord.approvals,
    rawRecord.forms,
    rawRecord.questions,
    event.message,
  );
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

  if (type === 'request.steer') {
    const text = safeText(event.message);
    if (!text) return commands;
    const counter = config.mode === 'replay' ? state.nextCounter() : null;
    const variant = 'steer';
    const prefix = 'steer';
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

  if (type === 'run.error' || type === 'run.complete' || type === 'run.cancel') {
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
    const reasoningLabel = typeof event.reasoningLabel === 'string'
      ? event.reasoningLabel
      : existing?.reasoningLabel;
    const text = existing
      ? `${state.getNodeText(nodeId)}${delta}`
      : eventText || delta;

    commands.push({
      cmd: 'SET_TIMELINE_NODE',
      id: nodeId,
      node: {
        id: nodeId,
        kind: 'thinking',
        reasoningLabel,
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
        reasoningLabel: existing?.reasoningLabel,
        text,
        status: 'completed',
        expanded: config.reasoningExpandedDefault,
        ts: event.timestamp || existing?.ts || Date.now(),
      },
    });
    commands.push({ cmd: 'SET_ACTIVE_REASONING_KEY', key: '' });
    return commands;
  }

  if (type === 'awaiting.answer') {
    const runId = toText(event.runId);
    const awaitingId = toText(event.awaitingId);
    const nodeId = awaitingId
      ? `awaiting_answer_${runId || 'run'}_${awaitingId}`
      : `awaiting_answer_${state.nextCounter()}`;
    const existing = state.getTimelineNode(nodeId);
    if (!existing) {
      commands.push({ cmd: 'APPEND_TIMELINE_ORDER', nodeId });
    }
    commands.push({
      cmd: 'SET_TIMELINE_NODE',
      id: nodeId,
      node: {
        id: nodeId,
        kind: 'awaiting-answer',
        awaitingId,
        title: '已提交回答',
        text: readAwaitingAnswerText(event) || '（无回答内容）',
        status: 'completed',
        expanded: existing?.expanded ?? false,
        ts: event.timestamp || existing?.ts || Date.now(),
      },
    });
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

  if (type === 'artifact.publish') {
    const artifact = normalizePublishedArtifact(event);
    if (!artifact) {
      return commands;
    }
    commands.push({ cmd: 'UPSERT_ARTIFACT', artifact });
    return commands;
  }

  if ((type === 'plan.create' || type === 'plan.update') && event.plan) {
    const nextPlanId = String(event.planId || 'plan');
    commands.push({
      cmd: 'SET_PLAN',
      plan: { planId: nextPlanId, plan: event.plan.map((item) => ({ ...item })) as PlanItem[] },
      resetRuntime: Boolean(state.getPlanId?.() && state.getPlanId?.() !== nextPlanId),
    });
    return commands;
  }

  if (type === 'task.start') {
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

  if (type === 'task.complete' || type === 'task.fail' || type === 'task.cancel') {
    const taskId = event.taskId || '';
    if (!taskId) return commands;
    const status =
      type === 'task.complete'
        ? 'completed'
        : type === 'task.cancel'
          ? 'canceled'
          : 'failed';
    commands.push({
      cmd: 'SET_PLAN_RUNTIME',
      taskId,
      runtime: {
        status,
        updatedAt: Date.now(),
        error: type === 'task.fail' && event.error ? String(event.error) : '',
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
