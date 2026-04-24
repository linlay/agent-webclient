import type { AgentEvent } from "@/app/state/types";
import { toText } from "@/shared/utils/eventUtils";

export function readEventTeamId(event: AgentEvent): string {
  return toText((event as Record<string, unknown>)?.teamId);
}

export function readEventChatName(event: AgentEvent): string {
  return toText((event as Record<string, unknown>)?.chatName);
}

export function readEventFirstAgentName(event: AgentEvent): string {
  return toText((event as Record<string, unknown>)?.firstAgentName);
}
