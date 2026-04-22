import type {
  AgentEvent,
  TaskGroupMeta,
  TaskItemMeta,
  TimelineNode,
} from '@/app/state/types';
import { resolveToolLabel } from '@/features/timeline/lib/toolDisplay';

export type TimelineRenderEntry =
  | {
    kind: 'node';
    key: string;
    node: TimelineNode;
  }
  | {
    kind: 'tool-group';
    key: string;
    toolName: string;
    toolLabel: string;
    count: number;
    nodes: TimelineNode[];
  };

export interface TaskItemDisplayItem {
  taskId: string;
  taskName: string;
  taskGroupId: string;
  subAgentKey?: string;
  status: string;
  startedAt?: number;
  endedAt?: number;
  durationMs?: number;
  latestSummary: string;
  nodes: TimelineNode[];
  renderEntries: TimelineRenderEntry[];
}

export interface TaskGroupDisplayItem {
  groupId: string;
  title: string;
  status: string;
  startedAt?: number;
  endedAt?: number;
  durationMs?: number;
  childTasks: TaskItemDisplayItem[];
  nodes: TimelineNode[];
  renderEntries: TimelineRenderEntry[];
}

export type TimelineRunSection =
  | {
    kind: 'mainline';
    key: string;
    renderEntries: TimelineRenderEntry[];
  }
  | {
    kind: 'task-group';
    key: string;
    group: TaskGroupDisplayItem;
  };

export type TimelineDisplayItem =
  | {
    kind: 'query';
    key: string;
    node: TimelineNode;
  }
  | {
    kind: 'run';
    key: string;
    queryNode: TimelineNode;
    nodes: TimelineNode[];
    renderEntries: TimelineRenderEntry[];
    sections: TimelineRunSection[];
    completedAt?: number;
    responseDurationMs?: number;
  }
  | {
    kind: 'standalone';
    key: string;
    node: TimelineNode;
  };

export interface BuildTimelineDisplayOptions {
  taskItemsById?: Map<string, TaskItemMeta>;
  taskGroupsById?: Map<string, TaskGroupMeta>;
  now?: number;
}

interface RunTerminalInfo {
  timestamp?: number;
}

function normalizeToolGroupValue(value: unknown): string {
  return String(value || '').trim();
}

function buildAutoTaskGroupTitle(childTaskNames: string[]): string {
  const names = childTaskNames.filter(Boolean);
  if (names.length <= 1) {
    return names[0] || 'Task';
  }
  return `Running ${names.length} tasks...`;
}

function pickFirstLine(text: string): string {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.split('\n').find(Boolean)?.trim() || '';
}

function computeLiveDurationMs(startedAt?: number, endedAt?: number, now = Date.now()): number | undefined {
  if (!Number.isFinite(startedAt)) {
    return undefined;
  }
  if (Number.isFinite(endedAt)) {
    return Math.max(0, Number(endedAt) - Number(startedAt));
  }
  return Math.max(0, now - Number(startedAt));
}

function resolveTaskSummary(nodes: TimelineNode[]): string {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index];
    if (node.kind === 'tool') {
      return resolveToolLabel(node);
    }
    if (node.kind === 'awaiting-answer') {
      return node.title || pickFirstLine(node.text || '') || '已提交回答';
    }
    const line = pickFirstLine(node.text || '');
    if (line) {
      return line;
    }
  }
  return '';
}

export function buildRunRenderEntries(nodes: TimelineNode[]): TimelineRenderEntry[] {
  const entries: TimelineRenderEntry[] = [];
  let pendingToolNodes: TimelineNode[] = [];
  let pendingToolName = '';
  let pendingToolLabel = '';

  const flushPendingTools = (): void => {
    if (pendingToolNodes.length === 0) return;

    if (pendingToolNodes.length === 1) {
      const node = pendingToolNodes[0];
      entries.push({
        kind: 'node',
        key: `node_${node.id}`,
        node,
      });
    } else {
      const firstNode = pendingToolNodes[0];
      entries.push({
        kind: 'tool-group',
        key: `tool_group_${firstNode.id}`,
        toolName: firstNode.toolName || '',
        toolLabel: firstNode.toolLabel || '',
        count: pendingToolNodes.length,
        nodes: pendingToolNodes,
      });
    }

    pendingToolNodes = [];
    pendingToolName = '';
    pendingToolLabel = '';
  };

  for (const node of nodes) {
    if (node.kind !== 'tool') {
      flushPendingTools();
      entries.push({
        kind: 'node',
        key: `node_${node.id}`,
        node,
      });
      continue;
    }

    const nextToolName = normalizeToolGroupValue(node.toolName);
    const nextToolLabel = normalizeToolGroupValue(node.toolLabel);
    const shouldMerge = pendingToolNodes.length > 0
      && pendingToolName === nextToolName
      && pendingToolLabel === nextToolLabel;

    if (!shouldMerge) {
      flushPendingTools();
      pendingToolName = nextToolName;
      pendingToolLabel = nextToolLabel;
    }

    pendingToolNodes.push(node);
  }

  flushPendingTools();

  return entries;
}

function collectRunTerminals(events: AgentEvent[]): RunTerminalInfo[] {
  return events
    .filter((event) => {
      const type = String(event.type || '');
      return type === 'run.complete' || type === 'run.error' || type === 'run.cancel';
    })
    .map((event) => ({
      timestamp: typeof event.timestamp === 'number' ? event.timestamp : undefined,
    }));
}

function overlapsRunWindow(
  task: TaskItemMeta,
  runStartedAt: number,
  nextRunStartedAt?: number,
): boolean {
  const startedAt = task.startedAt;
  if (!Number.isFinite(startedAt)) {
    return false;
  }
  const overlapEnd = Number.isFinite(task.endedAt) ? Number(task.endedAt) : Number(startedAt);
  if (Number.isFinite(nextRunStartedAt) && Number(startedAt) >= Number(nextRunStartedAt)) {
    return false;
  }
  return overlapEnd >= runStartedAt;
}

function normalizeTaskStatus(status: string): string {
  const value = String(status || '').trim().toLowerCase();
  if (!value) return 'pending';
  if (value === 'complete') return 'completed';
  if (value === 'cancel') return 'canceled';
  if (value === 'fail') return 'failed';
  return value;
}

function hasSubAgentKey(value: unknown): boolean {
  return String(value || '').trim().length > 0;
}

function buildTaskRunSections(
  runNodes: TimelineNode[],
  queryNode: TimelineNode,
  nextQueryNode: TimelineNode | null,
  options: BuildTimelineDisplayOptions,
): TimelineRunSection[] {
  const taskItemsById = options.taskItemsById || new Map<string, TaskItemMeta>();
  const taskGroupsById = options.taskGroupsById || new Map<string, TaskGroupMeta>();
  const now = options.now ?? Date.now();
  const runStartedAt = queryNode.ts;
  const nextRunStartedAt = nextQueryNode?.ts;
  const taskNodesById = new Map<string, TimelineNode[]>();

  for (const node of runNodes) {
    const taskId = String(node.taskId || '').trim();
    if (!taskId) {
      continue;
    }
    const existing = taskNodesById.get(taskId) || [];
    existing.push(node);
    taskNodesById.set(taskId, existing);
  }

  const includedTaskIds = new Set<string>(taskNodesById.keys());
  for (const task of taskItemsById.values()) {
    if (overlapsRunWindow(task, runStartedAt, nextRunStartedAt)) {
      includedTaskIds.add(task.taskId);
    }
  }

  const taskItemsInRun = new Map<string, TaskItemMeta>();
  for (const taskId of includedTaskIds) {
    const nodes = taskNodesById.get(taskId) || [];
    const existing = taskItemsById.get(taskId);
    const fallbackStartedAt = nodes.length > 0 ? Math.min(...nodes.map((node) => node.ts)) : undefined;
    const fallbackEndedAt = nodes.length > 0
      ? Math.max(...nodes.map((node) => node.ts))
      : undefined;
    const nextTask: TaskItemMeta = existing
      ? { ...existing }
      : {
          taskId,
          taskName: String(nodes[0]?.taskName || taskId),
          taskGroupId: String(nodes[0]?.taskGroupId || `task_group_${taskId}`),
          subAgentKey: String(nodes[0]?.subAgentKey || '').trim() || undefined,
          runId: '',
          status: String(nodes[nodes.length - 1]?.status || 'running'),
          startedAt: fallbackStartedAt,
          endedAt: fallbackEndedAt,
          durationMs: computeLiveDurationMs(fallbackStartedAt, fallbackEndedAt, now),
          updatedAt: fallbackEndedAt || fallbackStartedAt || now,
          error: '',
        };
    taskItemsInRun.set(taskId, nextTask);
  }

  const groupDisplayById = new Map<string, TaskGroupDisplayItem>();
  for (const task of taskItemsInRun.values()) {
    if (!hasSubAgentKey(task.subAgentKey)) {
      continue;
    }
    const groupId = String(task.taskGroupId || `task_group_${task.taskId}`);
    const current = groupDisplayById.get(groupId);
    if (!current) {
      groupDisplayById.set(groupId, {
      groupId,
      title: '',
      status: 'pending',
      startedAt: undefined,
      endedAt: undefined,
      durationMs: undefined,
      childTasks: [],
      nodes: [],
      renderEntries: [],
    });
    }
  }

  for (const [groupId] of groupDisplayById) {
    const groupMeta = taskGroupsById.get(groupId);
    const childTasks = Array.from(taskItemsInRun.values())
      .filter((task) => String(task.taskGroupId || `task_group_${task.taskId}`) === groupId)
      .sort((a, b) => {
        const aStarted = Number.isFinite(a.startedAt) ? Number(a.startedAt) : Number.MAX_SAFE_INTEGER;
        const bStarted = Number.isFinite(b.startedAt) ? Number(b.startedAt) : Number.MAX_SAFE_INTEGER;
        if (aStarted !== bStarted) return aStarted - bStarted;
        return a.taskId.localeCompare(b.taskId);
      })
      .map((task) => {
        const taskNodes = taskNodesById.get(task.taskId) || [];
        return {
          taskId: task.taskId,
          taskName: task.taskName || task.taskId,
          taskGroupId: task.taskGroupId,
          subAgentKey: task.subAgentKey,
          status: normalizeTaskStatus(task.status),
          startedAt: task.startedAt,
          endedAt: task.endedAt,
          durationMs: computeLiveDurationMs(task.startedAt, task.endedAt, now),
          latestSummary: resolveTaskSummary(taskNodes),
          nodes: taskNodes,
          renderEntries: buildRunRenderEntries(taskNodes),
        };
      });

    const startedAtCandidates = childTasks
      .map((task) => task.startedAt)
      .filter((value): value is number => Number.isFinite(value));
    const endedAtCandidates = childTasks
      .map((task) => task.endedAt)
      .filter((value): value is number => Number.isFinite(value));
    const hasRunning = childTasks.some((task) => task.status === 'running');
    const hasFailed = childTasks.some((task) => task.status === 'failed');
    const hasCompleted = childTasks.some((task) => task.status === 'completed');
    const hasCanceled = childTasks.some((task) => task.status === 'canceled');

    let status = normalizeTaskStatus(groupMeta?.status || '');
    if (!status || status === 'pending') {
      if (hasRunning) {
        status = 'running';
      } else if (hasFailed) {
        status = 'failed';
      } else if (hasCompleted) {
        status = 'completed';
      } else if (hasCanceled) {
        status = 'canceled';
      } else {
        status = 'pending';
      }
    }

    groupDisplayById.set(groupId, {
      groupId,
      title: groupMeta?.title || buildAutoTaskGroupTitle(childTasks.map((task) => task.taskName)),
      status,
      startedAt: groupMeta?.startedAt ?? (startedAtCandidates.length > 0 ? Math.min(...startedAtCandidates) : undefined),
      endedAt: groupMeta?.endedAt ?? (!hasRunning && endedAtCandidates.length > 0 ? Math.max(...endedAtCandidates) : undefined),
      durationMs: computeLiveDurationMs(
        groupMeta?.startedAt ?? (startedAtCandidates.length > 0 ? Math.min(...startedAtCandidates) : undefined),
        groupMeta?.endedAt ?? (!hasRunning && endedAtCandidates.length > 0 ? Math.max(...endedAtCandidates) : undefined),
        now,
      ),
      childTasks,
      nodes: runNodes.filter((node) => {
        const taskId = String(node.taskId || '').trim();
        return taskId
          && childTasks.some((task) => task.taskId === taskId);
      }),
      renderEntries: buildRunRenderEntries(
        runNodes.filter((node) => {
          const taskId = String(node.taskId || '').trim();
          return taskId
            && childTasks.some((task) => task.taskId === taskId);
        }),
      ),
    });
  }

  const sections: TimelineRunSection[] = [];
  const emittedGroupIds = new Set<string>();
  let pendingMainlineNodes: TimelineNode[] = [];

  const flushMainline = (): void => {
    if (pendingMainlineNodes.length === 0) {
      return;
    }
    const firstNode = pendingMainlineNodes[0];
    sections.push({
      kind: 'mainline',
      key: `mainline_${firstNode.id}`,
      renderEntries: buildRunRenderEntries(pendingMainlineNodes),
    });
    pendingMainlineNodes = [];
  };

  for (const node of runNodes) {
    const taskId = String(node.taskId || '').trim();
    if (taskId && includedTaskIds.has(taskId)) {
      const groupId = taskItemsInRun.get(taskId)?.taskGroupId || String(node.taskGroupId || `task_group_${taskId}`);
      if (groupDisplayById.has(groupId)) {
        if (!emittedGroupIds.has(groupId)) {
          flushMainline();
          sections.push({
            kind: 'task-group',
            key: `task_group_${groupId}`,
            group: groupDisplayById.get(groupId)!,
          });
          emittedGroupIds.add(groupId);
        }
        continue;
      }
    }

    pendingMainlineNodes.push(node);
  }

  flushMainline();

  const trailingGroups = Array.from(groupDisplayById.values())
    .filter((group) => !emittedGroupIds.has(group.groupId))
    .sort((a, b) => {
      const aStarted = Number.isFinite(a.startedAt) ? Number(a.startedAt) : Number.MAX_SAFE_INTEGER;
      const bStarted = Number.isFinite(b.startedAt) ? Number(b.startedAt) : Number.MAX_SAFE_INTEGER;
      if (aStarted !== bStarted) return aStarted - bStarted;
      return a.groupId.localeCompare(b.groupId);
    });

  for (const group of trailingGroups) {
    sections.push({
      kind: 'task-group',
      key: `task_group_${group.groupId}`,
      group,
    });
  }

  return sections;
}

export function buildTimelineDisplayItems(
  nodes: TimelineNode[],
  events: AgentEvent[],
  options: BuildTimelineDisplayOptions = {},
): TimelineDisplayItem[] {
  const items: TimelineDisplayItem[] = [];
  const runTerminals = collectRunTerminals(events);
  let pendingRunNodes: TimelineNode[] = [];
  let activeQueryNode: TimelineNode | null = null;
  let runTerminalCursor = 0;

  const flushRun = (nextQueryNode: TimelineNode | null = null): void => {
    if (!activeQueryNode || pendingRunNodes.length === 0) {
      pendingRunNodes = [];
      return;
    }

    const terminal = runTerminals[runTerminalCursor];
    const lastNode = pendingRunNodes[pendingRunNodes.length - 1];
    const completedAt = terminal
      ? terminal.timestamp || lastNode?.ts || undefined
      : undefined;
    const responseDurationMs =
      typeof completedAt === 'number' && typeof activeQueryNode.ts === 'number'
        ? Math.max(0, completedAt - activeQueryNode.ts)
        : undefined;

    if (terminal) {
      runTerminalCursor += 1;
    }

    items.push({
      kind: 'run',
      key: `run_${activeQueryNode.id}`,
      queryNode: activeQueryNode,
      nodes: pendingRunNodes,
      renderEntries: buildRunRenderEntries(pendingRunNodes),
      sections: buildTaskRunSections(pendingRunNodes, activeQueryNode, nextQueryNode, options),
      completedAt,
      responseDurationMs,
    });
    pendingRunNodes = [];
  };

  for (const node of nodes) {
    const isUserQuery = node.kind === 'message'
      && node.role === 'user'
      && node.messageVariant !== 'steer'
      && node.messageVariant !== 'remember'
      && node.messageVariant !== 'learn';
    if (isUserQuery) {
      flushRun(node);
      activeQueryNode = node;
      items.push({ kind: 'query', key: `query_${node.id}`, node });
      continue;
    }

    if (activeQueryNode) {
      pendingRunNodes.push(node);
      continue;
    }

    items.push({ kind: 'standalone', key: `standalone_${node.id}`, node });
  }

  flushRun();

  return items;
}
