import type {
  AIUsageSnapshotEvent,
  AIUsageStats,
  ArtifactFile,
  Plan,
  PublishedArtifact,
} from '@/app/state/types';
import { AIUsageEventTypeEnum } from '@/app/state/types';
import { readEpochMillis } from '@/shared/utils/platformTime';

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object';
}

export function normalizeChatPlan(value: unknown): Plan | null | undefined {
  if (value === undefined) return undefined;
  if (value == null) return null;
  if (!isObjectRecord(value)) return undefined;

  const planId = String(value.planId || '').trim();
  if (!planId || !Array.isArray(value.tasks)) {
    return undefined;
  }
  const plan = value.tasks
    .filter((item): item is Record<string, unknown> =>
      isObjectRecord(item) && typeof item.taskId === 'string')
    .map((item) => ({
      ...item,
      taskId: String(item.taskId),
    }));

  return { planId, plan };
}

function normalizeArtifactFile(value: unknown): PublishedArtifact | null {
  if (!isObjectRecord(value)) return null;

  const url = String(value.url || '').trim();
  const artifactId = String(
    value.artifactId || value.sha256 || value.url || value.name || '',
  ).trim();
  if (!url || !artifactId) {
    return null;
  }

  const sizeBytes = Number(value.sizeBytes ?? value.size);
  const timestamp =
    readEpochMillis(value.timestamp) ||
    readEpochMillis(value.createdAt) ||
    readEpochMillis(value.updatedAt);

  return {
    artifactId,
    artifact: {
      type: 'file',
      name: String(value.name || artifactId).trim() || artifactId,
      mimeType:
        String(value.mimeType || 'application/octet-stream').trim() ||
        'application/octet-stream',
      sha256: String(value.sha256 || '').trim(),
      sizeBytes: Number.isFinite(sizeBytes) && sizeBytes >= 0 ? sizeBytes : 0,
      url,
    },
    timestamp,
  };
}

export function normalizeChatArtifactItems(
  value: unknown,
): PublishedArtifact[] | undefined {
  if (value === undefined) return undefined;
  if (value == null) return [];
  if (!isObjectRecord(value)) return undefined;
  if (!Object.prototype.hasOwnProperty.call(value, 'items')) return undefined;
  if (value.items == null) return [];
  if (!Array.isArray(value.items)) return undefined;

  return value.items
    .map((item) => normalizeArtifactFile(item as ArtifactFile))
    .filter((item): item is PublishedArtifact => Boolean(item));
}

function readUsageNumber(value: unknown): number | undefined {
  const next = Number(value);
  return Number.isFinite(next) && next >= 0 ? next : undefined;
}

function normalizeUsageTokenDetails(
  value: unknown,
): AIUsageStats['promptTokensDetails'] | undefined {
  if (!isObjectRecord(value)) {
    return undefined;
  }

  const cacheHitTokens = readUsageNumber(value.cacheHitTokens);
  const cacheMissTokens = readUsageNumber(value.cacheMissTokens);
  const reasoningTokens = readUsageNumber(value.reasoningTokens);
  const details: NonNullable<AIUsageStats['promptTokensDetails']> = {};
  if (cacheHitTokens !== undefined) details.cacheHitTokens = cacheHitTokens;
  if (cacheMissTokens !== undefined) details.cacheMissTokens = cacheMissTokens;
  if (reasoningTokens !== undefined) details.reasoningTokens = reasoningTokens;
  return Object.keys(details).length > 0 ? details : undefined;
}

function normalizeUsageEstimatedCost(
  value: unknown,
): AIUsageStats['estimatedCost'] | undefined {
  if (!isObjectRecord(value)) {
    return undefined;
  }

  const cost: NonNullable<AIUsageStats['estimatedCost']> = {};
  const currency = typeof value.currency === 'string' ? value.currency.trim() : '';
  if (currency) cost.currency = currency;
  for (const key of ['inputCacheHit', 'inputCacheMiss', 'output', 'total'] as const) {
    const next = readUsageNumber(value[key]);
    if (next !== undefined) cost[key] = next;
  }
  return Object.keys(cost).length > 0 ? cost : undefined;
}

function normalizeUsageTiming(
  value: unknown,
): AIUsageStats['timing'] | undefined {
  if (!isObjectRecord(value)) {
    return undefined;
  }

  const timing: NonNullable<AIUsageStats['timing']> = {};
  for (const key of [
    'firstTokenLatencyMs',
    'firstTokenLatencyTotalMs',
    'firstTokenLatencyCount',
    'generationDurationMs',
  ] as const) {
    const next = readUsageNumber(value[key]);
    if (next !== undefined) timing[key] = next;
  }
  return Object.keys(timing).length > 0 ? timing : undefined;
}

export function normalizeLoadedChatUsageStats(value: unknown): AIUsageStats | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  const stats: AIUsageStats = {};
  const modelKey = String(value.modelKey || value.model_key || '').trim();
  if (modelKey) stats.modelKey = modelKey;
  for (const key of [
    'promptTokens',
    'completionTokens',
    'totalTokens',
    'llmChatCompletionCount',
    'toolCallCount',
  ] as const) {
    const next = readUsageNumber(value[key]);
    if (next !== undefined) stats[key] = next;
  }

  const promptTokensDetails = normalizeUsageTokenDetails(value.promptTokensDetails);
  if (promptTokensDetails) stats.promptTokensDetails = promptTokensDetails;
  const completionTokensDetails = normalizeUsageTokenDetails(
    value.completionTokensDetails,
  );
  if (completionTokensDetails) {
    stats.completionTokensDetails = completionTokensDetails;
  }
  const estimatedCost = normalizeUsageEstimatedCost(value.estimatedCost);
  if (estimatedCost) stats.estimatedCost = estimatedCost;
  const timing = normalizeUsageTiming(value.timing);
  if (timing) stats.timing = timing;

  const totalTokens = stats.totalTokens ?? 0;
  const llmChatCompletionCount = stats.llmChatCompletionCount ?? 0;
  const toolCallCount = stats.toolCallCount ?? 0;
  return totalTokens > 0 ||
    llmChatCompletionCount > 0 ||
    toolCallCount > 0 ||
    estimatedCost ||
    timing
    ? stats
    : null;
}

function getLatestUsageSnapshotEvent(events: unknown[]): AIUsageSnapshotEvent | null {
  for (const event of events.slice().reverse()) {
    if (!isObjectRecord(event)) continue;
    if (event.type !== AIUsageEventTypeEnum.Snapshot) continue;
    return event as AIUsageSnapshotEvent;
  }
  return null;
}

function normalizeLoadedChatContextWindow(
  value: unknown,
): AIUsageSnapshotEvent['contextWindow'] | undefined {
  if (!isObjectRecord(value)) {
    return undefined;
  }

  const contextWindow: NonNullable<AIUsageSnapshotEvent['contextWindow']> = {};
  const maxSize = readUsageNumber(value.maxSize);
  const currentSize = readUsageNumber(value.currentSize);
  const estimatedNextCallSize = readUsageNumber(value.estimatedNextCallSize);
  if (maxSize !== undefined) contextWindow.maxSize = maxSize;
  if (currentSize !== undefined) contextWindow.currentSize = currentSize;
  if (estimatedNextCallSize !== undefined) {
    contextWindow.estimatedNextCallSize = estimatedNextCallSize;
  }
  const modelKey = String(value.modelKey || '').trim();
  if (modelKey) contextWindow.modelKey = modelKey;
  const reasoningEffort = String(value.reasoningEffort || '').trim();
  if (reasoningEffort) contextWindow.reasoningEffort = reasoningEffort;
  return Object.keys(contextWindow).length > 0 ? contextWindow : undefined;
}

interface LoadedUsageSnapshotResult {
  snapshot: AIUsageSnapshotEvent;
  index: number;
}

function latestLoadedUsageSnapshotFromEvents(
  chatId: string,
  events: unknown,
): LoadedUsageSnapshotResult | null {
  if (!Array.isArray(events)) {
    return null;
  }

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!isObjectRecord(event) || event.type !== AIUsageEventTypeEnum.Snapshot) {
      continue;
    }
    const snapshot = event as unknown as AIUsageSnapshotEvent;
    if (!snapshot.contextWindow && !snapshot.usage) continue;
    return {
      snapshot: {
        ...snapshot,
        type: AIUsageEventTypeEnum.Snapshot,
        chatId: String(snapshot.chatId || chatId),
      },
      index,
    };
  }
  return null;
}

function latestCompactPostTokensAfterSnapshot(
  events: unknown,
  snapshot: LoadedUsageSnapshotResult,
): number | undefined {
  if (!Array.isArray(events)) {
    return undefined;
  }

  const snapshotTimestamp = readUsageNumber(snapshot.snapshot.timestamp);
  let bestRank = -1;
  let bestTokens: number | undefined;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (!isObjectRecord(event) || event.type !== 'context.compact.complete') {
      continue;
    }
    const postTokens = readUsageNumber(event.postCompactEstimatedTokens);
    if (postTokens === undefined) continue;
    const eventTimestamp = readUsageNumber(event.timestamp);
    const isAfterSnapshot =
      snapshotTimestamp !== undefined && eventTimestamp !== undefined
        ? eventTimestamp > snapshotTimestamp
        : index > snapshot.index;
    if (!isAfterSnapshot) continue;
    const rank = eventTimestamp ?? index;
    if (rank >= bestRank) {
      bestRank = rank;
      bestTokens = postTokens;
    }
  }
  return bestTokens;
}

function getRunId(value: unknown): string {
  return isObjectRecord(value) ? String(value.runId || '').trim() : '';
}

function getModelKey(value: unknown): string {
  if (!isObjectRecord(value)) return '';
  const model = value.model;
  if (isObjectRecord(model)) {
    const key = String(model.key || model.modelKey || '').trim();
    if (key) return key;
  }
  if (typeof model === 'string') {
    const key = model.trim();
    if (key) return key;
  }
  if (isObjectRecord(value.contextWindow)) {
    const contextWindowKey = String(value.contextWindow.modelKey || '').trim();
    if (contextWindowKey) return contextWindowKey;
  }
  return String(value.modelKey || '').trim();
}

function resolveLoadedChatUsagePayload(
  chatData: Record<string, unknown>,
  latestUsageEvent: AIUsageSnapshotEvent | null,
): AIUsageSnapshotEvent['usage'] | null {
  const usage = isObjectRecord(chatData.usage) ? chatData.usage : null;
  const flatChatUsage = normalizeLoadedChatUsageStats(usage);
  const nestedCurrentUsage = normalizeLoadedChatUsageStats(usage?.current);
  const nestedRunUsage =
    normalizeLoadedChatUsageStats(usage?.run) ||
    normalizeLoadedChatUsageStats(usage?.lastRun);
  const nestedChatUsage = normalizeLoadedChatUsageStats(usage?.chat);
  const eventCurrentUsage = normalizeLoadedChatUsageStats(
    latestUsageEvent?.usage?.current,
  );
  const run = nestedRunUsage || undefined;
  const chat = nestedChatUsage || flatChatUsage || undefined;
  const current =
    nestedCurrentUsage || eventCurrentUsage || (run || chat ? {} : undefined);
  if (!current && !run && !chat) return null;
  return {
    ...(current ? { current } : {}),
    ...(run ? { run } : {}),
    ...(chat ? { chat } : {}),
  };
}

export function buildLoadedChatUsageSnapshot(
  chatId: string,
  chatData: Record<string, unknown>,
): AIUsageSnapshotEvent | null {
  const events = Array.isArray(chatData.events) ? chatData.events : [];
  const eventSnapshot = latestLoadedUsageSnapshotFromEvents(chatId, events);
  const latestUsageEvent =
    eventSnapshot?.snapshot ?? getLatestUsageSnapshotEvent(events);
  const usage = resolveLoadedChatUsagePayload(chatData, latestUsageEvent);
  const runs = Array.isArray(chatData.runs) ? chatData.runs.filter(isObjectRecord) : [];
  const activeRun = isObjectRecord(chatData.activeRun) ? chatData.activeRun : null;
  const latestRun = runs.slice().reverse().find((run) => getRunId(run));
  const runWithUsage =
    (activeRun && normalizeLoadedChatUsageStats(activeRun.usage)
      ? activeRun
      : null) ||
    runs.slice().reverse().find((run) =>
      Boolean(normalizeLoadedChatUsageStats(run.usage))) ||
    null;
  const runUsage = runWithUsage
    ? normalizeLoadedChatUsageStats(runWithUsage.usage)
    : null;
  const runId =
    getRunId(activeRun) ||
    getRunId(runWithUsage) ||
    getRunId(latestRun) ||
    String(latestUsageEvent?.runId || '').trim();
  const modelKey =
    getModelKey(activeRun) ||
    getModelKey(runWithUsage) ||
    getModelKey(latestRun) ||
    getModelKey(latestUsageEvent || undefined);

  if (eventSnapshot) {
    const compactPostTokens = latestCompactPostTokensAfterSnapshot(
      events,
      eventSnapshot,
    );
    const contextWindow =
      compactPostTokens === undefined
        ? eventSnapshot.snapshot.contextWindow
        : {
            ...(eventSnapshot.snapshot.contextWindow || {}),
            currentSize: compactPostTokens,
            estimatedNextCallSize: compactPostTokens,
          };
    return {
      ...eventSnapshot.snapshot,
      ...(runId ? { runId } : {}),
      ...(modelKey ? { model: { key: modelKey } } : {}),
      ...(contextWindow
        ? { contextWindow: { ...contextWindow, ...(modelKey ? { modelKey } : {}) } }
        : {}),
      usage: {
        ...(eventSnapshot.snapshot.usage || {}),
        ...(usage || {}),
        ...(runUsage && !eventSnapshot.snapshot.usage?.run && !usage?.run
          ? { run: runUsage }
          : {}),
      },
    };
  }

  if (!usage) {
    const contextWindow = normalizeLoadedChatContextWindow(chatData.contextWindow);
    if (!contextWindow) return null;
    return {
      type: AIUsageEventTypeEnum.Snapshot,
      chatId,
      ...(runId ? { runId } : {}),
      ...(modelKey ? { model: { key: modelKey } } : {}),
      contextWindow: {
        ...contextWindow,
        ...(modelKey ? { modelKey } : {}),
      },
      usage: {},
    };
  }

  const contextWindow =
    normalizeLoadedChatContextWindow(chatData.contextWindow) ||
    normalizeLoadedChatContextWindow(latestUsageEvent?.contextWindow);
  return {
    type: AIUsageEventTypeEnum.Snapshot,
    chatId,
    runId,
    ...(modelKey ? { model: { key: modelKey } } : {}),
    ...(contextWindow
      ? { contextWindow: { ...contextWindow, ...(modelKey ? { modelKey } : {}) } }
      : {}),
    usage: {
      ...usage,
      ...(runUsage && !usage.run ? { run: runUsage } : {}),
    },
  };
}
