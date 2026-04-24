import type {
  AgentGroup,
  AgentEvent,
  PublishedArtifact,
  TaskGroupMeta,
  TaskItemMeta,
  TimelineNode,
  ToolState,
} from "@/app/state/types";
import type {
  EventCommand,
  EventProcessorState,
} from "@/features/timeline/lib/eventProcessorTypes";
import { isTerminalStatus, safeText, toText } from "@/shared/utils/eventUtils";
import { pickToolName, resolveViewportKey } from "@/features/timeline/lib/toolEvent";

const INCOMPLETE_TOOL_ARGS_NOTE = "[incomplete tool args]";

interface ResolvedTaskBinding {
  taskId: string;
  taskName: string;
  taskGroupId: string;
  subAgentKey?: string;
}

export function readTaskGroupId(event: AgentEvent): string {
  const raw = event as Record<string, unknown>;
  return toText(raw.groupId) || toText(raw.taskGroupId);
}

export function readTaskGroupTitle(event: AgentEvent): string {
  return toText((event as Record<string, unknown>).taskGroupTitle);
}

export function readSubAgentKey(event: AgentEvent): string {
  return toText((event as Record<string, unknown>).subAgentKey).trim();
}

function normalizeTaskStatus(status: string): string {
  const value = toText(status).trim().toLowerCase();
  if (value === "complete" || value === "completed" || value === "done") {
    return "completed";
  }
  if (value === "fail" || value === "failed" || value === "error") {
    return "failed";
  }
  if (value === "cancel" || value === "canceled" || value === "cancelled") {
    return "canceled";
  }
  if (value === "running" || value === "in_progress") {
    return "running";
  }
  return value || "pending";
}

function buildTaskGroupTitle(input: {
  explicitTitle: string;
  childTaskNames: string[];
}): string {
  if (input.explicitTitle) {
    return input.explicitTitle;
  }
  const names = input.childTaskNames.filter(Boolean);
  if (names.length <= 1) {
    return names[0] || "Task";
  }
  return `Running ${names.length} tasks...`;
}

function computeTaskDurationMs(
  startedAt?: number,
  endedAt?: number,
): number | undefined {
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) {
    return undefined;
  }
  return Math.max(0, Number(endedAt) - Number(startedAt));
}

function resolveVisibleTaskBinding(
  event: AgentEvent,
  state: EventProcessorState,
  existing?: TimelineNode,
): ResolvedTaskBinding | null {
  const explicitTaskId = toText(event.taskId).trim();
  if (explicitTaskId) {
    const task = state.getTaskItem(explicitTaskId);
    const taskGroupId =
      readTaskGroupId(event) ||
      task?.taskGroupId ||
      existing?.taskGroupId ||
      "";
    const taskName =
      toText(event.taskName).trim() ||
      task?.taskName ||
      state.getPlanTaskDescription?.(explicitTaskId) ||
      existing?.taskName ||
      explicitTaskId;
    const subAgentKey =
      readSubAgentKey(event) || task?.subAgentKey || existing?.subAgentKey || "";
    return {
      taskId: explicitTaskId,
      taskName,
      taskGroupId,
      subAgentKey: subAgentKey || undefined,
    };
  }

  if (existing?.taskId) {
    return {
      taskId: existing.taskId,
      taskName: existing.taskName || existing.taskId,
      taskGroupId: existing.taskGroupId || "",
      subAgentKey: existing.subAgentKey,
    };
  }

  const activeTaskIds = state.getActiveTaskIds().filter(Boolean);
  if (activeTaskIds.length !== 1) {
    return null;
  }

  const task = state.getTaskItem(activeTaskIds[0]);
  const taskId = task?.taskId || activeTaskIds[0];
  return {
    taskId,
    taskName: task?.taskName || state.getPlanTaskDescription?.(taskId) || taskId,
    taskGroupId: task?.taskGroupId || "",
    subAgentKey: task?.subAgentKey,
  };
}

export function resolveTaskGroupIdForStart(
  event: AgentEvent,
  state: EventProcessorState,
  existingTask?: TaskItemMeta,
): string {
  const explicitGroupId = readTaskGroupId(event);
  if (explicitGroupId) {
    return explicitGroupId;
  }
  if (existingTask?.taskGroupId) {
    return existingTask.taskGroupId;
  }

  const activeGroupIds = Array.from(
    new Set(
      state
        .getActiveTaskIds()
        .map((taskId) => state.getTaskItem(taskId)?.taskGroupId || "")
        .filter(Boolean),
    ),
  );
  if (activeGroupIds.length === 1) {
    return activeGroupIds[0];
  }

  return `task_group_${toText(event.taskId).trim() || state.peekCounter()}`;
}

export function buildNextTaskItem(input: {
  event: AgentEvent;
  state: EventProcessorState;
  taskId: string;
  status: string;
  updatedAt: number;
  existing?: TaskItemMeta;
  groupId: string;
}): TaskItemMeta {
  const { event, state, taskId, status, updatedAt, existing, groupId } = input;
  const taskName =
    toText(event.taskName).trim() ||
    existing?.taskName ||
    state.getPlanTaskDescription?.(taskId) ||
    taskId;
  const startedAt =
    status === "running"
      ? existing?.startedAt ?? (event.timestamp || updatedAt)
      : existing?.startedAt ?? event.timestamp ?? updatedAt;
  const endedAt = status === "running" ? undefined : event.timestamp || updatedAt;

  return {
    taskId,
    taskName,
    taskGroupId: groupId,
    subAgentKey: readSubAgentKey(event) || existing?.subAgentKey || "",
    runId: toText(event.runId) || existing?.runId || state.runId,
    status,
    startedAt,
    endedAt,
    durationMs: computeTaskDurationMs(startedAt, endedAt),
    updatedAt,
    error: status === "failed" ? toText(event.error) || existing?.error || "" : "",
  };
}

export function buildNextTaskGroup(input: {
  event: AgentEvent;
  state: EventProcessorState;
  groupId: string;
  explicitTitle: string;
  nextTask: TaskItemMeta;
  existing?: TaskGroupMeta;
}): TaskGroupMeta {
  const { event, state, groupId, explicitTitle, nextTask, existing } = input;
  const childTaskIdSet = new Set(existing?.childTaskIds || []);
  childTaskIdSet.add(nextTask.taskId);
  const childTaskIds = Array.from(childTaskIdSet);
  const childTasks = childTaskIds
    .map((taskId) =>
      taskId === nextTask.taskId ? nextTask : state.getTaskItem(taskId),
    )
    .filter((task): task is TaskItemMeta => Boolean(task));

  const startedAtCandidates = childTasks
    .map((task) => task.startedAt)
    .filter((value): value is number => Number.isFinite(value));
  const endedAtCandidates = childTasks
    .map((task) => task.endedAt)
    .filter((value): value is number => Number.isFinite(value));
  const startedAt =
    startedAtCandidates.length > 0 ? Math.min(...startedAtCandidates) : undefined;
  const hasRunning = childTasks.some(
    (task) => normalizeTaskStatus(task.status) === "running",
  );
  const hasFailed = childTasks.some(
    (task) => normalizeTaskStatus(task.status) === "failed",
  );
  const hasCompleted = childTasks.some(
    (task) => normalizeTaskStatus(task.status) === "completed",
  );
  const hasCanceled = childTasks.some(
    (task) => normalizeTaskStatus(task.status) === "canceled",
  );
  const endedAt =
    !hasRunning && endedAtCandidates.length > 0
      ? Math.max(...endedAtCandidates)
      : undefined;

  let status = "pending";
  if (hasRunning) {
    status = "running";
  } else if (hasFailed) {
    status = "failed";
  } else if (hasCompleted) {
    status = "completed";
  } else if (hasCanceled) {
    status = "canceled";
  }

  return {
    groupId,
    runId: toText(event.runId) || existing?.runId || nextTask.runId,
    title: buildTaskGroupTitle({
      explicitTitle: explicitTitle || existing?.explicitTitle || "",
      childTaskNames: childTasks.map((task) => task.taskName),
    }),
    explicitTitle: explicitTitle || existing?.explicitTitle || "",
    status,
    startedAt,
    endedAt,
    durationMs: computeTaskDurationMs(startedAt, endedAt),
    updatedAt: nextTask.updatedAt,
    childTaskIds,
  };
}

export function buildNextAgentGroup(input: {
  groupId: string;
  mainToolId: string;
  taskId: string;
  createdAt: number;
  existing?: AgentGroup;
}): AgentGroup {
  const taskIds = input.existing?.taskIds ? input.existing.taskIds.slice() : [];
  if (!taskIds.includes(input.taskId)) {
    taskIds.push(input.taskId);
  }
  return {
    groupId: input.groupId,
    mainToolId: input.mainToolId || input.existing?.mainToolId || "",
    taskIds,
    createdAt: input.existing?.createdAt || input.createdAt,
  };
}

export function ensureMappedNode(params: {
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
  params.commands.push({ cmd: "APPEND_TIMELINE_ORDER", nodeId });

  const setMap = params.commands[params.commands.length - 2];
  if (setMap.cmd === "SET_CONTENT_NODE_ID") {
    setMap.nodeId = nodeId;
  } else if (setMap.cmd === "SET_REASONING_NODE_ID") {
    setMap.nodeId = nodeId;
  } else if (setMap.cmd === "SET_TOOL_NODE_ID") {
    setMap.nodeId = nodeId;
  }
  return nodeId;
}

export function parseToolArgsBuffer(
  nextArgsBuffer: string,
  existingToolParams: Record<string, unknown> | null,
): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(nextArgsBuffer);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
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

function normalizeArtifactRecord(
  record: Record<string, any>,
  timestamp: number,
): PublishedArtifact | null {
  const url = safeText(record.url).trim();
  const artifactId =
    safeText(record.artifactId).trim() ||
    safeText(record.sha256).trim() ||
    url ||
    safeText(record.name).trim();
  if (!url || !artifactId) {
    return null;
  }

  const rawSize = Number(record.sizeBytes ?? record.size);
  return {
    artifactId,
    artifact: {
      mimeType: safeText(record.mimeType).trim() || "application/octet-stream",
      name: safeText(record.name).trim() || artifactId,
      sha256: safeText(record.sha256).trim(),
      sizeBytes: Number.isFinite(rawSize) && rawSize >= 0 ? rawSize : 0,
      type: "file",
      url,
    },
    timestamp,
  };
}

export function normalizePublishedArtifacts(event: AgentEvent): PublishedArtifact[] {
  const rawArtifacts = event.artifacts;
  if (!Array.isArray(rawArtifacts) || rawArtifacts.length === 0) {
    return [];
  }

  const timestamp = Number(event.timestamp) || Date.now();
  return rawArtifacts
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }
      return normalizeArtifactRecord(item as Record<string, any>, timestamp);
    })
    .filter((item): item is PublishedArtifact => Boolean(item));
}

export function resolveFinalToolArgsText(
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

export function pickEventText(...candidates: Array<unknown>): string {
  for (const candidate of candidates) {
    const text = safeText(candidate);
    if (text.trim()) {
      return text;
    }
  }
  return "";
}

export function readToolDescription(event: AgentEvent): string {
  const raw = event as Record<string, unknown>;
  return pickEventText(raw.toolDescription, event.description);
}

export function readToolArgumentsText(event: AgentEvent): string {
  const raw = (event as Record<string, unknown>).arguments;
  if (raw === null || raw === undefined) {
    return "";
  }
  if (typeof raw === "string") {
    return raw;
  }
  try {
    return JSON.stringify(raw, null, 2);
  } catch {
    return safeText(raw);
  }
}

export function formatStructuredEventText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return "";
    }
    try {
      const parsed = JSON.parse(trimmed);
      return typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2);
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

export function applyTaskBindingToNode(
  event: AgentEvent,
  state: EventProcessorState,
  existing: TimelineNode | undefined,
): Pick<TimelineNode, "taskId" | "taskName" | "taskGroupId" | "subAgentKey"> {
  const binding = resolveVisibleTaskBinding(event, state, existing);
  return binding
    ? {
        taskId: binding.taskId,
        taskName: binding.taskName,
        taskGroupId: binding.taskGroupId,
        subAgentKey: binding.subAgentKey,
      }
    : {
        taskId: existing?.taskId,
        taskName: existing?.taskName,
        taskGroupId: existing?.taskGroupId,
        subAgentKey: existing?.subAgentKey,
      };
}

export function buildToolTimelineNode(input: {
  nodeId: string;
  event: AgentEvent;
  existing?: TimelineNode;
  existingToolState?: ToolState;
  argsText: string;
  status: string;
  result: TimelineNode["result"];
  ts: number;
  state: EventProcessorState;
}): TimelineNode {
  const {
    nodeId,
    event,
    existing,
    existingToolState,
    argsText,
    result,
    status,
    ts,
    state,
  } = input;
  const taskBinding = applyTaskBindingToNode(event, state, existing);
  return {
    id: nodeId,
    kind: "tool",
    ...taskBinding,
    toolId: toText(event.toolId) || existing?.toolId || existingToolState?.toolId || "",
    toolLabel:
      toText(event.toolLabel) || existing?.toolLabel || existingToolState?.toolLabel || "",
    toolName: pickToolName(
      existing?.toolName,
      existingToolState?.toolName,
      event.toolName,
    ),
    viewportKey:
      resolveViewportKey(event) ||
      existing?.viewportKey ||
      existingToolState?.viewportKey ||
      "",
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

