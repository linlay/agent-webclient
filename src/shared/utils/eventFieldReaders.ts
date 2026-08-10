import type { AgentEvent } from "@/app/state/types";
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

export function readMustUseSkills(event: AgentEvent): string[] {
  const raw = (event as Record<string, unknown>).mustUseSkills;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((key) => String(key ?? "").trim())
    .filter(Boolean);
}
