import type { AgentEvent, TimelineNode } from '../context/types';

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
    completedAt?: number;
    responseDurationMs?: number;
  }
  | {
    kind: 'standalone';
    key: string;
    node: TimelineNode;
  };

interface RunTerminalInfo {
  timestamp?: number;
}

function normalizeToolGroupValue(value: unknown): string {
  return String(value || '').trim();
}

function buildRunRenderEntries(nodes: TimelineNode[]): TimelineRenderEntry[] {
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
      return type === 'run.end' || type === 'run.complete' || type === 'run.error' || type === 'run.cancel';
    })
    .map((event) => ({
      timestamp: typeof event.timestamp === 'number' ? event.timestamp : undefined,
    }));
}

export function buildTimelineDisplayItems(
  nodes: TimelineNode[],
  events: AgentEvent[],
): TimelineDisplayItem[] {
  const items: TimelineDisplayItem[] = [];
  const runTerminals = collectRunTerminals(events);
  let pendingRunNodes: TimelineNode[] = [];
  let activeQueryNode: TimelineNode | null = null;
  let runTerminalCursor = 0;

  const flushRun = (): void => {
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
      flushRun();
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
