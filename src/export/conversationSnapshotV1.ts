import { canonicalChatSourceRef, shareMediaKind } from "./shareResources";
import { conversationExportToolLabels } from "@/shared/i18n/conversationExport";
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
  mediaRefs?: Record<string, string>;
}

export type SnapshotOmissionReason = "not_found" | "forbidden" | "unsupported" | "too_large" | "timeout" | "changed" | "invalid" | "read_failed";
export type SnapshotOmittedResource = { id?: string; sourceRef?: string; name: string; reason: SnapshotOmissionReason };

export interface SnapshotNodeV1 {
  attachmentIds?: string[];
  steerId?: string;
  origin?: { type: "user" | "agent" | "automation"; userId?: string; agentKey?: string; chatId?: string; runId?: string; toolId?: string; automationId?: string };
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
    assistant?: { name: string; iconName?: string; mode?: string; iconColor?: string };
    nodes: SnapshotNodeV1[];
    tasks?: Array<{
      id: string;
      name: string;
      subAgentKey?: string;
      taskAgentKey?: string;
      subAgentName?: string;
      subAgentIconName?: string;
      subAgentMode?: string;
      subAgentIconColor?: string;
      status: string;
      durationMs?: number;
      error?: string;
    }>;
  }>;
  attachments: SnapshotAttachmentV1[];
  omittedResources?: SnapshotOmittedResource[];
}


function previewToolLabel(
  node: SnapshotNodeV1,
  locale: ConversationSnapshotV1["locale"],
): string | undefined {
  const label = typeof node.toolLabel === "string" ? node.toolLabel.trim() : "";
  if (label) return node.toolLabel;
  if (locale !== "zh-CN" || node.kind !== "tool") return undefined;
  const name = typeof node.toolName === "string" ? node.toolName : "";
  return Object.hasOwn(conversationExportToolLabels, name) ? conversationExportToolLabels[name] : undefined;
}

const NODE_KINDS = ["message", "thinking", "awaiting-answer", "tool", "source", "content", "agent-group", "planning"] as const;
const OUTCOMES = ["running", "completed", "failed", "cancelled"] as const;
const OMISSION_REASONS = ["not_found", "forbidden", "unsupported", "too_large", "timeout", "changed", "invalid", "read_failed"] as const;
function requireValue(condition: unknown): asserts condition {
  if (!condition) throw new Error("snapshot_invalid");
}
function object(value: unknown): Record<string, unknown> {
  requireValue(value && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}
function array(value: unknown): unknown[] {
  requireValue(Array.isArray(value));
  return value;
}
function string(value: unknown): string {
  requireValue(typeof value === "string");
  return value;
}
function identifier(value: unknown): string {
  const result = string(value);
  requireValue(result.trim());
  return result;
}
function integer(value: unknown, minimum = 0): number {
  requireValue(typeof value === "number" && Number.isSafeInteger(value) && value >= minimum);
  return value;
}
function epoch(value: unknown): number { return integer(value, 1_000_000_000_000); }
function choice<T extends string>(value: unknown, values: readonly T[]): T {
  requireValue(typeof value === "string" && values.includes(value as T));
  return value as T;
}
function optionalStrings<K extends string>(value: Record<string, unknown>, keys: readonly K[]): Partial<Record<K, string>> {
  const result: Partial<Record<K, string>> = {};
  for (const key of keys) if (value[key] !== undefined) result[key] = string(value[key]);
  return result;
}
function optionalNumbers<K extends string>(value: Record<string, unknown>, keys: readonly K[]): Partial<Record<K, number>> {
  const result: Partial<Record<K, number>> = {};
  for (const key of keys) if (value[key] !== undefined) result[key] = integer(value[key]);
  return result;
}
function resourceId(value: unknown): string {
  const id = string(value);
  requireValue(/^[a-f0-9]{24}$/u.test(id));
  return id;
}
function resourceName(value: unknown): string {
  const name = identifier(value);
  requireValue(new TextEncoder().encode(name).length <= 255 && !/[\\/\u0000-\u001f\u007f]/u.test(name));
  return name;
}
function sourceRef(value: unknown): string {
  const ref = string(value);
  requireValue(canonicalChatSourceRef(ref) === ref);
  return ref;
}
function parseSource(raw: unknown): TimelineSource {
  const value = object(raw);
  return { id: identifier(value.id), name: string(value.name), ...optionalStrings(value, ["title"]),
    minIndex: integer(value.minIndex), chunkIndexes: array(value.chunkIndexes).map((index) => integer(index)),
    chunks: array(value.chunks).map((rawChunk) => {
      const chunk = object(rawChunk);
      return { chunkId: identifier(chunk.chunkId), index: integer(chunk.index), content: string(chunk.content),
        ...optionalStrings(chunk, ["path"]) };
    }) };
}
function parseNode(raw: unknown, runId: string): SnapshotNodeV1 {
  const value = object(raw);
  requireValue(value.runId === runId);
  const node: SnapshotNodeV1 = {
    id: identifier(value.id), kind: choice(value.kind, NODE_KINDS), runId, at: epoch(value.at),
    ...optionalStrings(value, ["text", "taskId", "steerId", "reasoningLabel", "contentId", "toolId", "toolName", "toolLabel", "description", "argsText", "resultText", "status", "sourcePublishId", "sourceQuery"]),
    ...optionalNumbers(value, ["durationMs", "sourceCount", "chunkCount"]),
  };
  if (value.role !== undefined) node.role = choice(value.role, ["user", "assistant", "system", ""] as const);
  for (const key of ["startedAt", "endedAt"] as const) if (value[key] !== undefined) node[key] = epoch(value[key]);
  if (value.resultIsCode !== undefined) {
    requireValue(typeof value.resultIsCode === "boolean");
    node.resultIsCode = value.resultIsCode;
  }
  if (value.origin !== undefined) {
    const origin = object(value.origin);
    node.origin = { type: choice(origin.type, ["user", "agent", "automation"]),
      ...optionalStrings(origin, ["userId", "agentKey", "chatId", "runId", "toolId", "automationId"]) };
  }
  if (value.sources !== undefined) node.sources = array(value.sources).map(parseSource);
  if (value.attachmentIds !== undefined) {
    node.attachmentIds = array(value.attachmentIds).map(resourceId);
    requireValue(new Set(node.attachmentIds).size === node.attachmentIds.length);
  }
  return node;
}

export function parseConversationSnapshotV1(input: string): ConversationSnapshotV1 | null {
  try {
    const value = object(JSON.parse(input));
    requireValue(value.version === 1);
    const snapshot: ConversationSnapshotV1 = {
      version: 1, title: identifier(value.title), locale: choice(value.locale, ["zh-CN", "en-US"]),
      createdAt: epoch(value.createdAt), capturedAt: epoch(value.capturedAt), turns: [], attachments: [],
    };
    requireValue(snapshot.title.length <= 300 && snapshot.capturedAt >= snapshot.createdAt);
    const resourceIds = new Set<string>();
    const sourceRefs = new Set<string>();
    const registerResource = (id: string, ref: string) => {
      requireValue(!resourceIds.has(id) && !sourceRefs.has(ref));
      resourceIds.add(id); sourceRefs.add(ref);
    };
    snapshot.attachments = array(value.attachments).map((raw) => {
      const item = object(raw);
      const attachment: SnapshotAttachmentV1 = { id: resourceId(item.id), name: resourceName(item.name),
        sourceRef: sourceRef(item.sourceRef), mimeType: string(item.mimeType).split(";", 1)[0].trim().toLowerCase() };
      requireValue(/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u.test(attachment.mimeType));
      registerResource(attachment.id, attachment.sourceRef);
      if (item.size !== undefined) attachment.size = integer(item.size);
      if (item.sha256 !== undefined) {
        attachment.sha256 = string(item.sha256);
        requireValue(/^[a-f0-9]{64}$/u.test(attachment.sha256));
      }
      if (item.mediaRefs !== undefined) {
        requireValue(attachment.mimeType === "text/html");
        attachment.mediaRefs = Object.fromEntries(Object.entries(object(item.mediaRefs)).map(([url, id]) => {
          requireValue(url.trim() && !/[\u0000-\u001f\u007f]/u.test(url));
          return [url, resourceId(id)];
        }));
      }
      return attachment;
    });
    if (value.omittedResources !== undefined) snapshot.omittedResources = array(value.omittedResources).map((raw) => {
      const item = object(raw);
      const omitted: SnapshotOmittedResource = { name: resourceName(item.name), reason: choice(item.reason, OMISSION_REASONS) };
      if (item.id !== undefined || item.sourceRef !== undefined) {
        omitted.id = resourceId(item.id); omitted.sourceRef = sourceRef(item.sourceRef);
        registerResource(omitted.id, omitted.sourceRef);
      }
      return omitted;
    });
    const resources = new Map(snapshot.attachments.map((item) => [item.id, item]));
    for (const attachment of snapshot.attachments) for (const id of Object.values(attachment.mediaRefs ?? {})) {
      requireValue(resourceIds.has(id));
      const target = resources.get(id);
      requireValue(!target || ["image", "audio", "video"].includes(shareMediaKind(target.mimeType)));
    }
    const nodeIds = new Set<string>();
    const runIds = new Set<string>();
    snapshot.turns = array(value.turns).map((raw) => {
      const turn = object(raw);
      const result: ConversationSnapshotV1["turns"][number] = {
        runId: identifier(turn.runId), queryAt: epoch(turn.queryAt), startedAt: epoch(turn.startedAt),
        outcome: choice(turn.outcome, OUTCOMES), nodes: [],
      };
      requireValue(!runIds.has(result.runId)); runIds.add(result.runId);
      if (turn.endedAt !== undefined) { result.endedAt = epoch(turn.endedAt); requireValue(result.endedAt >= result.queryAt); }
      if (turn.assistant !== undefined) {
        const assistant = object(turn.assistant);
        result.assistant = { name: string(assistant.name), ...optionalStrings(assistant, ["iconName"]) };
      }
      result.nodes = array(turn.nodes).map((rawNode) => {
        const node = parseNode(rawNode, result.runId);
        requireValue(!nodeIds.has(node.id)); nodeIds.add(node.id);
        requireValue((node.attachmentIds ?? []).every((id) => resourceIds.has(id)));
        return node;
      });
      requireValue(result.nodes.length > 0 && result.nodes.length <= 2_000);
      if (turn.tasks !== undefined) {
        const taskIds = new Set<string>();
        result.tasks = array(turn.tasks).map((rawTask) => {
          const task = object(rawTask);
          const id = identifier(task.id);
          requireValue(!taskIds.has(id)); taskIds.add(id);
          return { id, name: string(task.name), status: string(task.status),
            ...optionalStrings(task, ["subAgentKey", "subAgentName", "subAgentIconName", "error"]),
            ...(task.taskAgentKey === undefined ? {} : { subAgentKey: string(task.taskAgentKey) }),
            ...optionalNumbers(task, ["durationMs"]) };
        });
      }
      return result;
    });
    requireValue(snapshot.turns.length > 0 && snapshot.turns.length <= 2_000);
    return snapshot;
  } catch { return null; }
}

export function snapshotV1PreviewData(
  snapshot: ConversationSnapshotV1,
): ConversationPreviewProps["data"] {
  const tasks = new Map<string, TaskItemMeta>();
  const nodes: TimelineNode[] = [];
  const terminals: ConversationPreviewProps["data"]["terminals"][number][] = [];
  const resources = new Map([...snapshot.attachments, ...(snapshot.omittedResources ?? [])]
    .flatMap((item) => item.id && item.sourceRef ? [[item.id, item] as const] : []));
  for (const turn of snapshot.turns) {
    for (const node of turn.nodes) {
      nodes.push({
        ...node,
        messageVariant: node.steerId ? "steer" : undefined,
        attachments: node.attachmentIds?.flatMap((id) => {
          const resource = resources.get(id);
          return resource ? [{ name: resource.name, url: resource.sourceRef,
            ...("mimeType" in resource ? { mimeType: resource.mimeType, size: resource.size } : {}) }] : [];
        }),
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
        subAgentKey: task.subAgentKey || task.taskAgentKey,
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
