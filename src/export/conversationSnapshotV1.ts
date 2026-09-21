import type {
  TimelineNode,
  TimelineSource,
} from "@/features/timeline/lib/timelineState";
import type { TaskItemMeta } from "@/features/tasks/lib/tasksState";
import type { ConversationPreviewProps } from "@/features/conversation/components/ConversationPreview";

export interface SnapshotAttachmentV1 {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  sha256?: string;
  sourceRef: string;
}

export interface SnapshotNodeV1 {
  id: string;
  kind: TimelineNode["kind"];
  role?: TimelineNode["role"];
  text?: string;
  at: number;
  runId: string;
  taskId?: string;
  reasoningLabel?: string;
  contentId?: string;
  toolId?: string;
  toolName?: string;
  toolLabel?: string;
  description?: string;
  argsText?: string;
  resultText?: string;
  resultIsCode?: boolean;
  status?: string;
  startedAt?: number;
  endedAt?: number;
  durationMs?: number;
  sourcePublishId?: string;
  sourceQuery?: string;
  sourceCount?: number;
  chunkCount?: number;
  sources?: TimelineSource[];
}

export interface ConversationSnapshotV1 {
  version: 1;
  title: string;
  locale: "zh-CN" | "en-US";
  createdAt: number;
  capturedAt: number;
  turns: Array<{
    runId: string;
    queryAt: number;
    startedAt: number;
    endedAt?: number;
    outcome: "running" | "completed" | "failed" | "cancelled";
    assistant?: { name: string; iconName?: string };
    nodes: SnapshotNodeV1[];
    tasks?: Array<{
      id: string;
      name: string;
      subAgentKey?: string;
      subAgentName?: string;
      subAgentIconName?: string;
      status: string;
      durationMs?: number;
      error?: string;
    }>;
  }>;
  attachments: SnapshotAttachmentV1[];
}

const MAX_BYTES = 20 * 1024 * 1024;
// Keep built-in labels aligned with agent-platform/internal/resources/tools/*.yml.
const ZH_TOOL_LABELS: Readonly<Record<string, string>> = {
  agent_delegate: "委派团队成员",
  agent_invoke: "调度智能体",
  artifact_publish: "发布产物",
  ask_user_question: "向用户提问",
  bash: "执行命令",
  bash_sandbox: "执行沙箱命令",
  datetime: "日期时间",
  desktop_action: "桌面端动作",
  desktop_cdp: "桌面端CDP",
  file_edit: "编辑文件",
  file_glob: "查找文件",
  file_grep: "搜索文件",
  file_read: "读取文件",
  file_write: "写入文件",
  finalize_planning: "确认规划",
  image_generate: "图像生成",
  kbase_files: "浏览知识库文件",
  kbase_read: "读取知识库片段",
  kbase_refresh: "刷新知识库",
  kbase_search: "搜索知识库",
  kbase_status: "知识库状态",
  memory_forget: "归档记忆",
  memory_promote: "提升记忆",
  memory_read: "读取记忆",
  memory_search: "搜索记忆",
  memory_timeline: "记忆时间线",
  memory_update: "更新记忆",
  memory_write: "写入记忆",
  plan_add_tasks: "创建任务",
  plan_get_tasks: "读取任务",
  plan_update_task: "更新任务",
  platform_control: "平台控制",
  regex: "正则匹配",
  run_interrupt: "中断独立运行",
  run_query: "发起独立运行",
  run_status: "查询独立运行状态",
  web_fetch: "网页抓取",
};

function previewToolLabel(
  node: SnapshotNodeV1,
  locale: ConversationSnapshotV1["locale"],
): string | undefined {
  const label = typeof node.toolLabel === "string" ? node.toolLabel.trim() : "";
  if (label) return node.toolLabel;
  if (locale !== "zh-CN" || node.kind !== "tool") return undefined;
  const name = typeof node.toolName === "string" ? node.toolName : "";
  return Object.hasOwn(ZH_TOOL_LABELS, name) ? ZH_TOOL_LABELS[name] : undefined;
}

const NODE_KINDS = new Set<TimelineNode["kind"]>([
  "message",
  "thinking",
  "awaiting-answer",
  "tool",
  "source",
  "content",
  "agent-group",
  "planning",
]);
const OUTCOMES = new Set(["running", "completed", "failed", "cancelled"]);
const epoch = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 1_000_000_000_000;
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export function parseConversationSnapshotV1(
  input: string,
): ConversationSnapshotV1 | null {
  if (!input || new TextEncoder().encode(input).length > MAX_BYTES) return null;
  let value: unknown;
  try {
    value = JSON.parse(input);
  } catch {
    return null;
  }
  if (
    !record(value) ||
    value.version !== 1 ||
    typeof value.title !== "string" ||
    !value.title.trim() ||
    value.title.length > 300 ||
    (value.locale !== "zh-CN" && value.locale !== "en-US") ||
    !epoch(value.createdAt) ||
    !epoch(value.capturedAt) ||
    value.capturedAt < value.createdAt ||
    !Array.isArray(value.turns) ||
    !Array.isArray(value.attachments) ||
    value.turns.length === 0 ||
    value.turns.length > 2_000
  )
    return null;
  const ids = new Set<string>();
  for (const turn of value.turns) {
    if (
      !record(turn) ||
      typeof turn.runId !== "string" ||
      !turn.runId ||
      !epoch(turn.queryAt) ||
      !epoch(turn.startedAt) ||
      !OUTCOMES.has(String(turn.outcome)) ||
      !Array.isArray(turn.nodes) ||
      !turn.nodes.length ||
      turn.nodes.length > 2_000 ||
      (turn.endedAt !== undefined &&
        (!epoch(turn.endedAt) || turn.endedAt < turn.queryAt)) ||
      (turn.tasks !== undefined && !Array.isArray(turn.tasks))
    )
      return null;
    for (const node of turn.nodes) {
      if (
        !record(node) ||
        typeof node.id !== "string" ||
        !node.id ||
        ids.has(node.id) ||
        !NODE_KINDS.has(node.kind as TimelineNode["kind"]) ||
        node.runId !== turn.runId ||
        !epoch(node.at) ||
        (node.text !== undefined && typeof node.text !== "string")
      )
        return null;
      ids.add(node.id);
    }
  }
  for (const attachment of value.attachments) {
    if (
      !record(attachment) ||
      typeof attachment.id !== "string" ||
      !/^[a-f0-9]{24}$/u.test(attachment.id) ||
      typeof attachment.name !== "string" ||
      !attachment.name ||
      typeof attachment.sourceRef !== "string" ||
      !/^artifacts\/[^?#\\]+\.html?$/iu.test(attachment.sourceRef) ||
      attachment.sourceRef
        .split("/")
        .some(
          (segment) => segment === "" || segment === "." || segment === "..",
        )
    )
      return null;
  }
  return value as unknown as ConversationSnapshotV1;
}

export function snapshotV1PreviewData(
  snapshot: ConversationSnapshotV1,
): ConversationPreviewProps["data"] {
  const tasks = new Map<string, TaskItemMeta>();
  const nodes: TimelineNode[] = [];
  const terminals: ConversationPreviewProps["data"]["terminals"][number][] = [];
  for (const turn of snapshot.turns) {
    for (const node of turn.nodes) {
      nodes.push({
        ...node,
        toolLabel: previewToolLabel(node, snapshot.locale),
        ts: node.at,
        result:
          node.resultText === undefined
            ? null
            : { text: node.resultText, isCode: Boolean(node.resultIsCode) },
        sourcePublishId: node.sourcePublishId,
      });
    }
    for (const task of turn.tasks || []) {
      tasks.set(task.id, {
        taskId: task.id,
        taskName: task.name,
        taskGroupId: task.id,
        subAgentKey: task.subAgentKey,
        runId: turn.runId,
        status: task.status,
        durationMs: task.durationMs,
        updatedAt: turn.endedAt || snapshot.capturedAt,
        error: task.error || "",
      });
    }
    if (turn.endedAt !== undefined) {
      terminals.push({
        runId: turn.runId,
        type:
          turn.outcome === "completed"
            ? "run.complete"
            : turn.outcome === "cancelled"
              ? "run.cancel"
              : "run.error",
        timestamp: turn.endedAt,
      });
    }
  }
  return {
    chatId: "",
    nodes,
    tasks,
    terminals,
    capturedAt: snapshot.capturedAt,
  };
}
