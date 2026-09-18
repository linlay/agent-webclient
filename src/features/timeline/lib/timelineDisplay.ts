import type { AgentEvent } from "@/shared/contracts/agentEvents";
import type { TaskItemMeta } from "@/features/tasks/lib/tasksState";
import type { TimelineNode } from "@/features/timeline/lib/timelineState";

export type TimelineRenderEntry =
  | {
      kind: "node";
      key: string;
      node: TimelineNode;
    }
  | {
      kind: "tool-group";
      key: string;
      toolName: string;
      toolLabel: string;
      count: number;
      nodes: TimelineNode[];
    }
  | {
      kind: "task-group";
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

export type RunTerminalType = "run.complete" | "run.error" | "run.cancel";

export type TimelineDisplayItem =
  | {
      kind: "query";
      key: string;
      node: TimelineNode;
    }
  | {
      kind: "run";
      key: string;
      queryNode: TimelineNode | null;
      nodes: TimelineNode[];
      renderEntries: TimelineRenderEntry[];
      runId?: string;
      terminalType?: RunTerminalType;
      completedAt?: number;
      responseDurationMs?: number;
    }
  | {
      kind: "standalone";
      key: string;
      renderEntry: TimelineRenderEntry;
    };

interface RunTerminalInfo {
  type: RunTerminalType;
  runId?: string;
  timestamp?: number;
}

function readRunTerminalType(value: unknown): RunTerminalType | null {
  const type = String(value || "");
  if (
    type === "run.complete" ||
    type === "run.error" ||
    type === "run.cancel"
  ) {
    return type;
  }
  return null;
}

function normalizeToolGroupValue(value: unknown): string {
  return String(value || "").trim();
}

export function buildRunRenderEntries(
  nodes: TimelineNode[],
  taskItemsById: Map<string, TaskItemMeta> = new Map(),
): TimelineRenderEntry[] {
  return buildRenderEntries(nodes, taskItemsById, true);
}

function buildToolRenderEntries(nodes: TimelineNode[]): TimelineRenderEntry[] {
  const entries: TimelineRenderEntry[] = [];
  let pendingToolNodes: TimelineNode[] = [];
  let pendingToolName = "";
  let pendingToolLabel = "";

  const flushPendingTools = (): void => {
    if (pendingToolNodes.length === 0) return;

    if (pendingToolNodes.length === 1) {
      const node = pendingToolNodes[0];
      entries.push({
        kind: "node",
        key: `node_${node.id}`,
        node,
      });
    } else {
      const firstNode = pendingToolNodes[0];
      entries.push({
        kind: "tool-group",
        key: `tool_group_${firstNode.id}`,
        toolName: firstNode.toolName || "",
        toolLabel: firstNode.toolLabel || "",
        count: pendingToolNodes.length,
        nodes: pendingToolNodes,
      });
    }

    pendingToolNodes = [];
    pendingToolName = "";
    pendingToolLabel = "";
  };

  for (const node of nodes) {
    if (node.kind !== "tool") {
      flushPendingTools();
      entries.push({
        kind: "node",
        key: `node_${node.id}`,
        node,
      });
      continue;
    }

    const nextToolName = normalizeToolGroupValue(node.toolName);
    const nextToolLabel = normalizeToolGroupValue(node.toolLabel);
    const shouldMerge =
      pendingToolNodes.length > 0 &&
      pendingToolName === nextToolName &&
      pendingToolLabel === nextToolLabel;

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
  const taskGroupsById = new Map<
    string,
    Extract<TimelineRenderEntry, { kind: "task-group" }>
  >();
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
      existingGroup.renderEntries = buildRenderEntries(
        existingGroup.nodes,
        taskItemsById,
        false,
      );
      return;
    }

    const task = taskItemsById.get(taskId);
    const status = task?.status || "unknown";
    const group: Extract<TimelineRenderEntry, { kind: "task-group" }> = {
      kind: "task-group",
      key: `task_group_${taskId}_${node.id}`,
      taskId,
      taskName: task?.taskName || node.taskName || taskId,
      subAgentKey: task?.subAgentKey || node.subAgentKey || undefined,
      status,
      durationMs: task?.durationMs,
      error: task?.error || "",
      nodes: [node],
      renderEntries: buildRenderEntries(
        [node],
        taskItemsById,
        false,
      ),
    };
    taskGroupsById.set(taskId, group);
    entries.push(group);
  };

  for (const node of nodes) {
    const taskId = String(node.taskId || "").trim();
    if (!taskId) {
      pendingPlainNodes.push(node);
      continue;
    }

    pushTaskNode(taskId, node);
  }

  flushPendingPlain();

  return entries;
}

interface RunTerminalIndex {
  ordered: RunTerminalInfo[];
  byRunId: Map<string, RunTerminalInfo>;
}

function collectRunTerminals(events: AgentEvent[]): RunTerminalIndex {
  const ordered: RunTerminalInfo[] = [];
  const byRunId = new Map<string, RunTerminalInfo>();
  for (const event of events) {
    const type = readRunTerminalType(event.type);
    if (!type) continue;
    const runId = typeof event.runId === "string" ? event.runId : undefined;
    const info: RunTerminalInfo = {
      type,
      runId,
      timestamp:
        typeof event.timestamp === "number" ? event.timestamp : undefined,
    };
    ordered.push(info);
    if (runId && !byRunId.has(runId)) {
      byRunId.set(runId, info);
    }
  }
  return { ordered, byRunId };
}

export interface BuildTimelineDisplayItemsOptions {
  /**
   * 存在正在观察的活跃 run（如 attach 续接，无本地 query 头、
   * state.events 中也没有未消费的 run 终结事件）时，
   * 后续节点归入 run 分组而非 standalone。
   */
  hasActiveRun?: boolean;
}

export function buildTimelineDisplayItems(
  nodes: TimelineNode[],
  events: AgentEvent[],
  taskItemsById: Map<string, TaskItemMeta> = new Map(),
  options: BuildTimelineDisplayItemsOptions = {},
): TimelineDisplayItem[] {
  const items: TimelineDisplayItem[] = [];
  const runTerminals = collectRunTerminals(events);
  let pendingRunNodes: TimelineNode[] = [];
  let pendingStandaloneNodes: TimelineNode[] = [];
  let activeQueryNode: TimelineNode | null = null;
  let runTerminalCursor = 0;

  const flushStandalone = (): void => {
    if (pendingStandaloneNodes.length === 0) return;
    for (const renderEntry of buildRenderEntries(
      pendingStandaloneNodes,
      taskItemsById,
      true,
    )) {
      items.push({
        kind: "standalone",
        key: `standalone_${renderEntry.key}`,
        renderEntry,
      });
    }
    pendingStandaloneNodes = [];
  };

  const currentRunId = (): string => {
    for (const node of pendingRunNodes) {
      if (node.runId) return node.runId;
    }
    return activeQueryNode?.runId || "";
  };

  const consumeTerminal = (runId: string): RunTerminalInfo | undefined => {
    if (runId && runTerminals.byRunId.has(runId)) {
      return runTerminals.byRunId.get(runId);
    }
    // 节点带 runId 但终态已被裁剪时，不消费位置游标，避免错位到其它 run 的终态。
    if (runId) return undefined;
    // 旧数据（节点无 runId）回退位置游标，保持原有行为。
    const terminal = runTerminals.ordered[runTerminalCursor];
    if (terminal) runTerminalCursor += 1;
    return terminal;
  };

  const flushRun = (isLastRun: boolean): void => {
    // 空 run：有 query 但没有任何 timeline 节点（例如 run.start → run.complete 中间无内容）
    if (pendingRunNodes.length === 0 && activeQueryNode) {
      const terminal = consumeTerminal(currentRunId());
      if (terminal) {
        const completedAt =
          typeof terminal.timestamp === "number" ? terminal.timestamp : undefined;
        const responseDurationMs =
          typeof completedAt === "number" &&
          typeof activeQueryNode.ts === "number"
            ? Math.max(0, completedAt - activeQueryNode.ts)
            : undefined;

        items.push({
          kind: "run",
          key: `run_${activeQueryNode.id}`,
          queryNode: activeQueryNode,
          nodes: [],
          renderEntries: [],
          runId: terminal.runId,
          terminalType: terminal.type,
          completedAt,
          responseDurationMs,
        });
      }
      pendingRunNodes = [];
      activeQueryNode = null;
      return;
    }

    if (pendingRunNodes.length === 0) {
      pendingRunNodes = [];
      activeQueryNode = null;
      return;
    }

    const resolvedRunId = currentRunId();
    const terminal = consumeTerminal(resolvedRunId);
    const queryNode = activeQueryNode;
    const lastNode = pendingRunNodes[pendingRunNodes.length - 1];

    let completedAt: number | undefined;
    let terminalType: RunTerminalType | undefined;
    if (terminal) {
      completedAt =
        typeof terminal.timestamp === "number" ? terminal.timestamp : lastNode?.ts;
      terminalType = terminal.type;
    } else if (!isLastRun || !options.hasActiveRun) {
      // 已结束的 run 缺失终态事件（终态可能被事件上限裁剪），用最后节点时间兜底，
      // 并按节点内容推断终态类型，让 timeline-run-meta 的耗时图标也能正常显示。
      // 活跃 run（isLastRun && hasActiveRun）保持未完成。
      completedAt = lastNode?.ts;
      terminalType = pendingRunNodes.some(
        (node) => node.systemMessageLevel === "error",
      )
        ? "run.error"
        : "run.complete";
    } else {
      completedAt = undefined;
      terminalType = undefined;
    }

    const responseDurationMs =
      typeof completedAt === "number" && typeof queryNode?.ts === "number"
        ? Math.max(0, completedAt - queryNode.ts)
        : undefined;

    const runKeySource =
      queryNode?.id || pendingRunNodes[0]?.id || String(runTerminalCursor);
    items.push({
      kind: "run",
      key: `run_${runKeySource}`,
      queryNode,
      nodes: pendingRunNodes,
      renderEntries: buildRenderEntries(
        pendingRunNodes,
        taskItemsById,
        true,
      ),
      runId: terminal?.runId || resolvedRunId || undefined,
      terminalType,
      completedAt,
      responseDurationMs,
    });
    pendingRunNodes = [];
    activeQueryNode = null;
  };

  for (const node of nodes) {
    const isUserQuery =
      node.kind === "message" &&
      node.role === "user" &&
      !node.taskId &&
      node.messageVariant !== "steer" &&
      node.messageVariant !== "remember" &&
      node.messageVariant !== "learn";

    // 早期 flush：节点 runId 变化说明进入了新的 run，不依赖会被裁剪的终态时间戳。
    const nodeRunId = node.runId || "";
    const activeRunId = currentRunId();
    if (
      pendingRunNodes.length > 0 &&
      nodeRunId &&
      activeRunId &&
      nodeRunId !== activeRunId
    ) {
      flushRun(false);
    }

    if (isUserQuery) {
      flushStandalone();
      flushRun(false);
      activeQueryNode = node;
      items.push({ kind: "query", key: `query_${node.id}`, node });
      continue;
    }

    if (activeQueryNode) {
      flushStandalone();
      pendingRunNodes.push(node);
      continue;
    }

    if (runTerminalCursor < runTerminals.ordered.length || options.hasActiveRun) {
      flushStandalone();
      pendingRunNodes.push(node);
      continue;
    }

    pendingStandaloneNodes.push(node);
  }

  flushStandalone();
  flushRun(true);

  return items;
}
