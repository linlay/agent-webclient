import type { QueryModelOverride } from "@/shared/data";
import type { AgentEvent } from "@/shared/contracts/agentEvents";
import { normalizeRunModel, resolveChatModel } from "@/features/runs/lib/modelSelection";
import { composerAccessKey, type ComposerAccessTarget } from "./composerAccessLevel";

export interface ComposerModelState {
  modelByChatId: Record<string, QueryModelOverride>;
  newChatModelByAgentKey: Record<string, QueryModelOverride>;
}
const STORAGE_KEY = "agent-webclient.composer-model.v1";

export function readComposerModel(state: ComposerModelState, target: ComposerAccessTarget): QueryModelOverride {
  const values = target.chatId ? state.modelByChatId : state.newChatModelByAgentKey;
  return values?.[composerAccessKey(target)] || {};
}
export function updateComposerModel<S extends ComposerModelState>(state: S, target: ComposerAccessTarget,
  value: QueryModelOverride, initializeOnly = false): S {
  if (!target.chatId && !target.agentKey) return state;
  const field = target.chatId ? "modelByChatId" : "newChatModelByAgentKey";
  const key = composerAccessKey(target);
  if (initializeOnly && state[field]?.[key]?.key) return state;
  return { ...state, [field]: { ...state[field], [key]: normalizeRunModel(value) } };
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
    const value = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || "{}");
    return { modelByChatId: normalizeMap(value?.modelByChatId), newChatModelByAgentKey: normalizeMap(value?.newChatModelByAgentKey) };
  } catch { return { modelByChatId: {}, newChatModelByAgentKey: {} }; }
}
export function persistComposerModels(state: ComposerModelState): void {
  try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
    modelByChatId: state.modelByChatId, newChatModelByAgentKey: state.newChatModelByAgentKey,
  })); } catch { /* Keep in-memory choices if storage is unavailable. */ }
}
