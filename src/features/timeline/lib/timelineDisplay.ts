import type {
  AgentEvent,
  TaskItemMeta,
  TimelineNode,
} from '@/app/state/types';

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
  }
  | {
    kind: 'task-group';
    key: string;
    taskId: string;
    taskName: string;
    subAgentKey?: string;
    status: string;
    durationMs?: number;
    error: string;
    nodes: TimelineNode[];
    renderEntries: TimelineRenderEntry[];
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
    queryNode: TimelineNode | null;
    nodes: TimelineNode[];
    renderEntries: TimelineRenderEntry[];
    runId?: string;
    completedAt?: number;
    responseDurationMs?: number;
  }
  | {
    kind: 'standalone';
    key: string;
    renderEntry: TimelineRenderEntry;
  };

interface RunTerminalInfo {
  runId?: string;
  timestamp?: number;
}

function normalizeToolGroupValue(value: unknown): string {
  return String(value || '').trim();
}

export function buildRunRenderEntries(nodes: TimelineNode[]): TimelineRenderEntry[] {
  return buildRenderEntries(nodes, new Map(), true);
}

function buildToolRenderEntries(nodes: TimelineNode[]): TimelineRenderEntry[] {
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

function buildRenderEntries(
  nodes: TimelineNode[],
  taskItemsById: Map<string, TaskItemMeta>,
  groupTasks: boolean,
): TimelineRenderEntry[] {
  if (!groupTasks) {
    return buildToolRenderEntries(nodes);
  }

  const entries: TimelineRenderEntry[] = [];
  const taskGroupsById = new Map<string, Extract<TimelineRenderEntry, { kind: 'task-group' }>>();
  let pendingPlainNodes: TimelineNode[] = [];

  const flushPendingPlain = (): void => {
    if (pendingPlainNodes.length === 0) return;
    entries.push(...buildToolRenderEntries(pendingPlainNodes));
    pendingPlainNodes = [];
  };

  const pushTaskNode = (taskId: string, node: TimelineNode): void => {
    flushPendingPlain();
    const existingGroup = taskGroupsById.get(taskId);
    if (existingGroup) {
      existingGroup.nodes.push(node);
      existingGroup.renderEntries = buildRenderEntries(existingGroup.nodes, taskItemsById, false);
      return;
    }

    const task = taskItemsById.get(taskId);
    const group: Extract<TimelineRenderEntry, { kind: 'task-group' }> = {
      kind: 'task-group',
      key: `task_group_${taskId}_${node.id}`,
      taskId,
      taskName: task?.taskName || node.taskName || taskId,
      subAgentKey: task?.subAgentKey || node.subAgentKey || undefined,
      status: task?.status || 'running',
      durationMs: task?.durationMs,
      error: task?.error || '',
      nodes: [node],
      renderEntries: buildRenderEntries([node], taskItemsById, false),
    };
    taskGroupsById.set(taskId, group);
    entries.push(group);
  };

  for (const node of nodes) {
    const taskId = String(node.taskId || '').trim();
    if (!taskId) {
      pendingPlainNodes.push(node);
      continue;
    }

    pushTaskNode(taskId, node);
  }

  flushPendingPlain();

  return entries;
}

function collectRunTerminals(events: AgentEvent[]): RunTerminalInfo[] {
  return events
    .filter((event) => {
      const type = String(event.type || '');
      return type === 'run.complete' || type === 'run.error' || type === 'run.cancel';
    })
    .map((event) => ({
      runId: typeof event.runId === 'string' ? event.runId : undefined,
      timestamp: typeof event.timestamp === 'number' ? event.timestamp : undefined,
    }));
}

export function buildTimelineDisplayItems(
  nodes: TimelineNode[],
  events: AgentEvent[],
  taskItemsById: Map<string, TaskItemMeta> = new Map(),
): TimelineDisplayItem[] {
  const items: TimelineDisplayItem[] = [];
  const runTerminals = collectRunTerminals(events);
  let pendingRunNodes: TimelineNode[] = [];
  let pendingStandaloneNodes: TimelineNode[] = [];
  let activeQueryNode: TimelineNode | null = null;
  let runTerminalCursor = 0;

  const flushStandalone = (): void => {
    if (pendingStandaloneNodes.length === 0) return;
    for (const renderEntry of buildRenderEntries(pendingStandaloneNodes, taskItemsById, true)) {
      items.push({ kind: 'standalone', key: `standalone_${renderEntry.key}`, renderEntry });
    }
    pendingStandaloneNodes = [];
  };

  const flushRun = (): void => {
    if (pendingRunNodes.length === 0) {
      pendingRunNodes = [];
      activeQueryNode = null;
      return;
    }

    const queryNode = activeQueryNode;
    const terminal = runTerminals[runTerminalCursor];
    const lastNode = pendingRunNodes[pendingRunNodes.length - 1];
    const completedAt = terminal
      ? (typeof terminal.timestamp === 'number' ? terminal.timestamp : lastNode?.ts)
      : undefined;
    const responseDurationMs =
      typeof completedAt === 'number' && typeof queryNode?.ts === 'number'
        ? Math.max(0, completedAt - queryNode.ts)
        : undefined;

    if (terminal) {
      runTerminalCursor += 1;
    }

    const runKeySource = queryNode?.id || pendingRunNodes[0]?.id || String(runTerminalCursor);
    items.push({
      kind: 'run',
      key: `run_${runKeySource}`,
      queryNode,
      nodes: pendingRunNodes,
      renderEntries: buildRenderEntries(pendingRunNodes, taskItemsById, true),
      runId: terminal?.runId,
      completedAt,
      responseDurationMs,
    });
    pendingRunNodes = [];
    activeQueryNode = null;
  };

  for (const node of nodes) {
    const isUserQuery = node.kind === 'message'
      && node.role === 'user'
      && !node.taskId
      && node.messageVariant !== 'steer'
      && node.messageVariant !== 'remember'
      && node.messageVariant !== 'learn';
    const nextTerminal = runTerminals[runTerminalCursor];
    if (
      pendingRunNodes.length > 0
      && typeof nextTerminal?.timestamp === 'number'
      && node.ts > nextTerminal.timestamp
    ) {
      flushRun();
    }

    if (isUserQuery) {
      flushStandalone();
      flushRun();
      activeQueryNode = node;
      items.push({ kind: 'query', key: `query_${node.id}`, node });
      continue;
    }

    if (activeQueryNode) {
      flushStandalone();
      pendingRunNodes.push(node);
      continue;
    }

    if (runTerminalCursor < runTerminals.length) {
      flushStandalone();
      pendingRunNodes.push(node);
      continue;
    }

    pendingStandaloneNodes.push(node);
  }

  flushStandalone();
  flushRun();

  return items;
}
