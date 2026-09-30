import type { QueryAccessLevel } from "@/shared/data";
import { getBackendMode } from "@/shared/config/backendMode";
import { getGatewaySession } from "@/shared/data/auth/gatewaySession";

export interface ComposerAccessState {
  accessLevelByChatId: Record<string, QueryAccessLevel>;
  newChatAccessLevelByAgentKey: Record<string, QueryAccessLevel>;
}

export interface ComposerAccessTarget {
  scope: string;
  chatId: string;
  agentKey: string;
}

const STORAGE_KEY = "agent-webclient.composer-access.v1";

// An opaque credential identifies standalone sessions without persisting the credential.
function credentialFingerprint(value: string): string {
  let a = 2166136261;
  let b = 5381;
  for (let i = 0; i < value.length; i += 1) {
    a = Math.imul(a ^ value.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ value.charCodeAt(i);
  }
  return `${a >>> 0}:${b >>> 0}`;
}

export function resolveComposerAccessScope(accessToken: string): string {
  const mode = getBackendMode();
  const context = typeof window === "undefined" ? "" : window.__AGENT_APP_AUTH_CONTEXT || "";
  const identity = mode === "gateway"
    ? `user:${getGatewaySession()?.user?.subject || "anonymous"}`
    : context ? `desktop:${context}` : `credential:${credentialFingerprint(accessToken || "")}`;
  return JSON.stringify([mode, identity]);
}

export function composerAccessKey(target: ComposerAccessTarget): string {
  return JSON.stringify([target.scope, target.chatId || target.agentKey]);
}

export function readComposerAccessLevel(state: ComposerAccessState, target: ComposerAccessTarget): QueryAccessLevel {
  if (!target.chatId && !target.agentKey) return "default";
  const values = target.chatId ? state.accessLevelByChatId : state.newChatAccessLevelByAgentKey;
  return values?.[composerAccessKey(target)] ?? "default";
}

export function updateComposerAccessLevel(
  state: ComposerAccessState,
  target: ComposerAccessTarget,
  value: QueryAccessLevel,
  initializeOnly = false,
): ComposerAccessState {
  if (!target.chatId && !target.agentKey) return state;
  const field = target.chatId ? "accessLevelByChatId" : "newChatAccessLevelByAgentKey";
  const key = composerAccessKey(target);
  if (initializeOnly && state[field]?.[key] !== undefined) return state;
  return { ...state, [field]: { ...state[field], [key]: value } };
}

function normalizeValues(value: unknown): Record<string, QueryAccessLevel> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, level]) =>
    level === "default" || level === "auto_approve" || level === "full_access",
  ));
}

export function restoreComposerAccessLevels(): ComposerAccessState {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || "{}");
    return {
      accessLevelByChatId: normalizeValues(value?.accessLevelByChatId),
      newChatAccessLevelByAgentKey: normalizeValues(value?.newChatAccessLevelByAgentKey),
    };
  } catch {
    return { accessLevelByChatId: {}, newChatAccessLevelByAgentKey: {} };
  }
}

export function persistComposerAccessLevels(state: ComposerAccessState): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      accessLevelByChatId: state.accessLevelByChatId,
      newChatAccessLevelByAgentKey: state.newChatAccessLevelByAgentKey,
    }));
  } catch {
    // Keep in-memory preferences when storage is unavailable.
  }
}
