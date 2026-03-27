import type { AgentEvent, TimelineNode } from '../context/types';

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
      completedAt,
      responseDurationMs,
    });
    pendingRunNodes = [];
  };

  for (const node of nodes) {
    const isUserQuery = node.kind === 'message'
      && node.role === 'user'
      && node.messageVariant !== 'steer';
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
