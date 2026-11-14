import { getClientStorage } from "@/shared/utils/clientStorage";
import type { Agent } from "@/features/agents/lib/agentState";
import type { QueryModelOverride } from "@/shared/data";
import type { AgentEvent } from "@/shared/contracts/agentEvents";
import { normalizeRunModel, resolveChatModel, resolveChatModelRunId } from "@/features/runs/lib/modelSelection";
import { composerAccessKey, type ComposerAccessTarget } from "./composerAccessLevel";

interface ModelOverride {
  model: QueryModelOverride;
  updatedAt: number;
  runId: string;
}
export interface ComposerModelState {
  /** History and accepted request projections are memory-only. */
  modelByChatId: Record<string, QueryModelOverride>;
  modelRunIdByChatId: Record<string, string>;
  modelOverridesByChatId: Record<string, ModelOverride>;
}
const STORAGE_KEY = "agent-webclient.composer-model.v1";
const MAX_OVERRIDES = 100;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function pruneOverrides(values: Record<string, ModelOverride>, now = Date.now()): Record<string, ModelOverride> {
  const entries = Object.entries(values).reverse().filter(([, value]) => value &&
    Number.isFinite(value.updatedAt) && value.updatedAt <= now && now - value.updatedAt < MAX_AGE_MS && value.model?.key);
  entries.sort((a, b) => b[1].updatedAt - a[1].updatedAt);
  const retained = entries.slice(0, MAX_OVERRIDES);
  if (retained.length === Object.keys(values).length) return values;
  return Object.fromEntries(retained);
}

export function readComposerModel(state: ComposerModelState & { currentAgent?: Agent | null }, target: ComposerAccessTarget): QueryModelOverride {
  if (target.chatId) {
    const key = composerAccessKey(target);
    const override = state.modelOverridesByChatId[key];
    if (override && Date.now() - override.updatedAt < MAX_AGE_MS) return override.model;
    return state.modelByChatId[key] || {};
  }
  const agent = state.currentAgent;
  if (!target.agentKey || agent?.key !== target.agentKey) return {};
  const model = normalizeRunModel({ key: agent.modelKey, reasoningEffort: agent.reasoningEffort, serviceTier: agent.serviceTier });
  if (model.serviceTier === "STANDARD") delete model.serviceTier;
  return model;
}

export function updateComposerModel<S extends ComposerModelState>(state: S, target: ComposerAccessTarget,
  value: QueryModelOverride, initializeOnly = false): S {
  if (!target.chatId) return state;
  const key = composerAccessKey(target);
  const overrides = pruneOverrides(state.modelOverridesByChatId);
  if (initializeOnly) {
    return { ...state, modelOverridesByChatId: overrides, modelByChatId: {
      ...state.modelByChatId, [key]: state.modelByChatId[key] || normalizeRunModel(value),
    } };
  }
  return { ...state, modelOverridesByChatId: pruneOverrides({ ...overrides, [key]: {
    model: normalizeRunModel(value), updatedAt: Date.now(), runId: state.modelRunIdByChatId[key] || "",
  } }) };
}

export function initializeChatModel<S extends ComposerModelState>(state: S, scope: string, chatId: string, events: AgentEvent[]): S {
  if (!chatId) return state;
  const key = composerAccessKey({ scope, chatId, agentKey: "" });
  const runId = resolveChatModelRunId(events, chatId);
  const value = resolveChatModel(events, chatId);
  let overrides = pruneOverrides(state.modelOverridesByChatId);
  if (overrides[key] && runId && overrides[key].runId !== runId) {
    overrides = { ...overrides };
    delete overrides[key];
  }
  const models = { ...state.modelByChatId };
  if (value) models[key] = value;
  else if (runId && state.modelRunIdByChatId[key] !== runId) delete models[key];
  return { ...state, modelByChatId: models, modelOverridesByChatId: overrides,
    modelRunIdByChatId: runId ? { ...state.modelRunIdByChatId, [key]: runId } : state.modelRunIdByChatId };
}

/** Detail usage snapshots supplement the replay without creating a manual preference. */
export function syncChatModel<S extends ComposerModelState>(state: S, target: ComposerAccessTarget, value: QueryModelOverride): S {
  const key = composerAccessKey(target);
  return { ...state, modelByChatId: { ...state.modelByChatId, [key]: normalizeRunModel(value) } };
}

export function removeChatModel<S extends ComposerModelState>(state: S, scope: string, chatId: string): S {
  const key = composerAccessKey({ scope, chatId, agentKey: "" });
  const models = { ...state.modelByChatId };
  const runs = { ...state.modelRunIdByChatId };
  const overrides = { ...pruneOverrides(state.modelOverridesByChatId) };
  delete models[key]; delete runs[key]; delete overrides[key];
  return { ...state, modelByChatId: models, modelRunIdByChatId: runs, modelOverridesByChatId: overrides };
}

export function restoreComposerModels(): ComposerModelState {
  const empty = { modelByChatId: {}, modelRunIdByChatId: {}, modelOverridesByChatId: {} };
  try {
    const value = JSON.parse(getClientStorage("session").getItem(STORAGE_KEY) || "{}");
    const raw = value?.modelOverridesByChatId;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return empty;
    const overrides = Object.fromEntries(Object.entries(raw).map(([key, item]) => {
      const entry = item as ModelOverride | null;
      return [key, { model: normalizeRunModel(entry?.model), updatedAt: entry?.updatedAt,
        runId: typeof entry?.runId === "string" ? entry.runId : "" }];
    }));
    return { ...empty, modelOverridesByChatId: pruneOverrides(overrides as Record<string, ModelOverride>) };
  } catch { return empty; }
}
export function persistComposerModels(state: ComposerModelState): void {
  try { getClientStorage("session").setItem(STORAGE_KEY, JSON.stringify({
    modelOverridesByChatId: pruneOverrides(state.modelOverridesByChatId),
  })); } catch { /* Keep in-memory choices if storage is unavailable. */ }
}
