import { getClientStorage } from "@/shared/utils/clientStorage";
import type { Agent } from "@/features/agents/lib/agentState";
import type { QueryModelOverride } from "@/shared/data";
import type { AgentEvent } from "@/shared/contracts/agentEvents";
import { normalizeRunModel, resolveChatModel } from "@/features/runs/lib/modelSelection";
import { composerAccessKey, type ComposerAccessTarget } from "./composerAccessLevel";

export interface ComposerModelState {
  modelByChatId: Record<string, QueryModelOverride>;
}
const STORAGE_KEY = "agent-webclient.composer-model.v1";

export function readComposerModel(state: ComposerModelState & { currentAgent?: Agent | null }, target: ComposerAccessTarget): QueryModelOverride {
  if (target.chatId) return state.modelByChatId?.[composerAccessKey(target)] || {};
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
  if (initializeOnly && state.modelByChatId?.[key]?.key) return state;
  return { ...state, modelByChatId: { ...state.modelByChatId, [key]: normalizeRunModel(value) } };
}

export function initializeChatModel<S extends ComposerModelState>(state: S, scope: string, chatId: string, events: AgentEvent[]): S {
  const target = { scope, chatId, agentKey: "" };
  if (!chatId || readComposerModel(state, target).key) return state;
  const value = resolveChatModel(events, chatId);
  return value ? updateComposerModel(state, target, value, true) : state;
}
export function restoreComposerModels(): ComposerModelState {
  const normalizeMap = (value: unknown): Record<string, QueryModelOverride> => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).map(([key, model]) => [key, normalizeRunModel(model)]));
  };
  try {
    const value = JSON.parse(getClientStorage("session").getItem(STORAGE_KEY) || "{}");
    return { modelByChatId: normalizeMap(value?.modelByChatId) };
  } catch { return { modelByChatId: {} }; }
}
export function persistComposerModels(state: ComposerModelState): void {
  try { getClientStorage("session").setItem(STORAGE_KEY, JSON.stringify({
    modelByChatId: state.modelByChatId,
  })); } catch { /* Keep in-memory choices if storage is unavailable. */ }
}
