import type { AgentEvent } from "@/shared/contracts/agentEvents";
import { safeText, toText } from "@/shared/utils/eventUtils";

export function readEventTeamId(event: AgentEvent): string {
  return toText((event as Record<string, unknown>)?.teamId);
}

export function readEventChatName(event: AgentEvent): string {
  return toText((event as Record<string, unknown>)?.chatName);
}

export function readEventFirstAgentName(event: AgentEvent): string {
  return toText((event as Record<string, unknown>)?.firstAgentName);
}

export function readRequestQueryText(event: AgentEvent): string {
  const raw = event as Record<string, unknown>;
  return safeText(event.message) || safeText(raw.query);
}

export function readSteerConfirmation(event: AgentEvent): {
  steerId: string;
  chatId?: string;
  runId?: string;
} | null {
  const steerId = toText(event.steerId);
  if (event.type !== "request.steer" || !steerId || !toText(event.message)) return null;
  const chatId = toText(event.chatId);
  const runId = toText(event.runId);
  return { steerId, ...(chatId ? { chatId } : {}), ...(runId ? { runId } : {}) };
}

export function readMustUseSkills(event: AgentEvent): string[] {
  const raw = (event as Record<string, unknown>).mustUseSkills;
  if (!Array.isArray(raw)) return [];
  return raw.map((key) => String(key ?? "").trim()).filter(Boolean);
}

export function readExplicitEditingMode(value: unknown): boolean | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  return Object.prototype.hasOwnProperty.call(record, "editingMode") &&
    typeof record.editingMode === "boolean"
    ? record.editingMode
    : undefined;
}
