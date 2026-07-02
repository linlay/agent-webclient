import type {
  AgentEvent,
  TimelineSource,
  TimelineSourceChunk,
} from "@/app/state/types";
import type {
  EventCommand,
  EventProcessorState,
} from "@/features/timeline/lib/eventProcessorTypes";
import { applyTaskBindingToNode } from "@/features/timeline/lib/eventProcessorShared";
import { toText } from "@/shared/utils/eventUtils";
import { readEpochMillis } from "@/shared/utils/platformTime";

function readRecord(value: unknown): Record<string, unknown> | null {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
    ? (value as Record<string, unknown>)
    : null;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function readPositiveInt(value: unknown): number | undefined {
  const parsed = readNumber(value);
  if (parsed === undefined) {
    return undefined;
  }
  const integer = Math.trunc(parsed);
  return integer > 0 ? integer : undefined;
}

function basename(value: string): string {
  const normalized = value.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] || value;
}

function sanitizeNodeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function normalizeChunk(
  value: unknown,
  fallbackIndex: number,
  sourcePath: string,
): TimelineSourceChunk | null {
  const record = readRecord(value);
  if (!record) {
    return null;
  }

  const path = toText(record.path) || sourcePath;
  const content = toText(record.content) || toText(record.heading);
  const rawChunkId = toText(record.chunkId);
  if (!rawChunkId && !content && !path) {
    return null;
  }

  const chunkId = rawChunkId || `${path || "chunk"}_${fallbackIndex}`;
  const startLine = readPositiveInt(record.startLine);
  const endLine = readPositiveInt(record.endLine);
  const pageStart = readPositiveInt(record.pageStart);
  const pageEnd = readPositiveInt(record.pageEnd);
  const slideStart = readPositiveInt(record.slideStart);
  const slideEnd = readPositiveInt(record.slideEnd);
  const score = readNumber(record.score);
  const timestamp = readEpochMillis(record.timestamp);
  return {
    chunkId,
    index: readPositiveInt(record.index) || fallbackIndex,
    content,
    ...(score !== undefined ? { score } : {}),
    ...(timestamp > 0 ? { timestamp } : {}),
    ...(path ? { path } : {}),
    ...(toText(record.heading) ? { heading: toText(record.heading) } : {}),
    ...(startLine ? { startLine } : {}),
    ...(endLine ? { endLine } : {}),
    ...(pageStart ? { pageStart } : {}),
    ...(pageEnd ? { pageEnd } : {}),
    ...(slideStart ? { slideStart } : {}),
    ...(slideEnd ? { slideEnd } : {}),
    ...(toText(record.sourceType) ? { sourceType: toText(record.sourceType) } : {}),
    ...(toText(record.matchType) ? { matchType: toText(record.matchType) } : {}),
  };
}

function normalizeChunkIndexes(value: unknown, chunks: TimelineSourceChunk[]): number[] {
  if (Array.isArray(value)) {
    const indexes = value
      .map((item) => readPositiveInt(item))
      .filter((item): item is number => item !== undefined);
    if (indexes.length > 0) {
      return indexes;
    }
  }
  return chunks.map((chunk) => chunk.index).filter((index) => index > 0);
}

function normalizeSource(value: unknown, fallbackIndex: number): TimelineSource | null {
  const record = readRecord(value);
  if (!record) {
    return null;
  }

  const rawChunks = Array.isArray(record.chunks) ? record.chunks : [];
  const sourcePath = toText(record.title) || toText(record.name) || toText(record.id);
  const chunks = rawChunks
    .map((chunk, index) => normalizeChunk(chunk, index + 1, sourcePath))
    .filter((chunk): chunk is TimelineSourceChunk => Boolean(chunk));
  if (chunks.length === 0) {
    return null;
  }

  const firstPath = chunks.find((chunk) => chunk.path)?.path || "";
  const title = toText(record.title) || firstPath;
  const name = toText(record.name) || basename(title || firstPath || toText(record.id));
  const id = toText(record.id) || title || name || `source_${fallbackIndex}`;
  const chunkIndexes = normalizeChunkIndexes(record.chunkIndexes, chunks);
  const minIndex = readPositiveInt(record.minIndex) || Math.min(...chunkIndexes);

  return {
    id,
    name,
    ...(title ? { title } : {}),
    ...(toText(record.icon) ? { icon: toText(record.icon) } : {}),
    ...(toText(record.url) ? { url: toText(record.url) } : {}),
    ...(toText(record.link) ? { link: toText(record.link) } : {}),
    ...(toText(record.collectionId) ? { collectionId: toText(record.collectionId) } : {}),
    ...(toText(record.collectionName) ? { collectionName: toText(record.collectionName) } : {}),
    chunkIndexes,
    minIndex: Number.isFinite(minIndex) ? minIndex : 0,
    chunks,
  };
}

function sourceText(query: string, sources: TimelineSource[]): string {
  return [
    query,
    ...sources.flatMap((source) => [
      source.title || source.name,
      ...source.chunks.map((chunk) => chunk.content),
    ]),
  ]
    .filter(Boolean)
    .join("\n");
}

export function processSourceEvent(
  event: AgentEvent,
  state: EventProcessorState,
): EventCommand[] {
  if (toText(event.type) !== "source.publish") {
    return [];
  }

  const rawSources = Array.isArray(event.sources) ? event.sources : [];
  const sources = rawSources
    .map((source, index) => normalizeSource(source, index + 1))
    .filter((source): source is TimelineSource => Boolean(source));
  if (sources.length === 0) {
    return [];
  }

  const publishId = toText(event.publishId);
  const fallbackId = `${toText(event.runId) || state.runId || "run"}_${toText(event.seq) || state.nextCounter()}`;
  const nodeId = `source_${sanitizeNodeId(publishId || fallbackId)}`;
  const existing = state.getTimelineNode(nodeId);
  const commands: EventCommand[] = [];
  if (!existing) {
    commands.push({ cmd: "APPEND_TIMELINE_ORDER", nodeId });
  }

  const query = toText(event.query);
  const chunkCount =
    readPositiveInt(event.chunkCount) ||
    sources.reduce((sum, source) => sum + source.chunks.length, 0);
  commands.push({
    cmd: "SET_TIMELINE_NODE",
    id: nodeId,
    node: {
      id: nodeId,
      kind: "source",
      ...applyTaskBindingToNode(event, state, existing),
      sourcePublishId: publishId,
      sourceKind: toText(event.kind),
      sourceQuery: query,
      sourceCount: readPositiveInt(event.sourceCount) || sources.length,
      chunkCount,
      sources,
      text: sourceText(query, sources),
      status: "completed",
      expanded: existing?.expanded ?? false,
      toolId: toText(event.toolId) || existing?.toolId,
      ts: event.timestamp || existing?.ts || Date.now(),
    },
  });
  return commands;
}
