import { getClientStorage } from "@/shared/utils/clientStorage";
import type { QueryAccessLevel } from "@/shared/data";

export interface ComposerAccessState {
  accessLevelByChatId: Record<string, QueryAccessLevel>;
  newChatAccessLevelByAgentKey: Record<string, QueryAccessLevel>;
  runtimeAccessLevelByChatId?: Record<string, QueryAccessLevel>;
}

export interface ComposerAccessTarget {
  scope: string;
  chatId: string;
  agentKey: string;
}

const STORAGE_KEY = "agent-webclient.composer-access.v3";

export { resolveStorageIdentity as resolveComposerAccessScope } from "@/shared/data/auth/storageIdentity";

export function composerAccessKey(target: ComposerAccessTarget): string {
  return JSON.stringify([target.scope, target.chatId || target.agentKey]);
}

export function readComposerAccessOverride(state: ComposerAccessState, target: ComposerAccessTarget): QueryAccessLevel | undefined {
  const values = target.chatId ? state.accessLevelByChatId : state.newChatAccessLevelByAgentKey;
  return values?.[composerAccessKey(target)];
}

export function readComposerAccessLevel(state: ComposerAccessState, target: ComposerAccessTarget, defaultLevel: QueryAccessLevel = "ask_for_approval"): QueryAccessLevel {
  return readComposerAccessOverride(state, target) ?? defaultLevel;
}

export function updateComposerAccessLevel(
  state: ComposerAccessState,
  target: ComposerAccessTarget,
  value: QueryAccessLevel | undefined,
  initializeOnly = false,
): ComposerAccessState {
  if (!target.chatId && !target.agentKey) return state;
  const field = target.chatId ? "accessLevelByChatId" : "newChatAccessLevelByAgentKey";
  const key = composerAccessKey(target);
  if (initializeOnly && state[field]?.[key] !== undefined) return state;
  const values = { ...state[field] };
  if (value === undefined) delete values[key];
  else values[key] = value;
  return { ...state, [field]: values };
}

function normalizeValues(value: unknown, legacy = false): Record<string, QueryAccessLevel> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, level]) => [key, legacy && level === "default" ? "ask_for_approval" : level]).filter(([, level]) =>
    level === "ask_for_approval" || level === "auto_approve" || level === "full_access",
  ));
}

export function restoreComposerAccessLevels(): ComposerAccessState {
  try {
    const stored = getClientStorage("session").getItem(STORAGE_KEY);
    const value = JSON.parse(stored ?? getClientStorage("session").getItem("agent-webclient.composer-access.v2") ?? "{}");
    const legacy = stored === null;
    return {
      accessLevelByChatId: normalizeValues(value?.accessLevelByChatId, legacy),
      newChatAccessLevelByAgentKey: normalizeValues(value?.newChatAccessLevelByAgentKey, legacy),
    };
  } catch {
    return { accessLevelByChatId: {}, newChatAccessLevelByAgentKey: {} };
  }
}

export function persistComposerAccessLevels(state: ComposerAccessState): void {
  try {
    getClientStorage("session").setItem(STORAGE_KEY, JSON.stringify({
      accessLevelByChatId: state.accessLevelByChatId,
      newChatAccessLevelByAgentKey: state.newChatAccessLevelByAgentKey,
    }));
  } catch {
    // Keep in-memory preferences when storage is unavailable.
  }
}
