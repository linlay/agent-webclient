import { hasTimelineAttachmentContent, normalizeTimelineAttachments } from "./timelineAttachments";
import type { AgentEvent } from "@/shared/contracts/agentEvents";
import { safeText, toText } from "@/shared/utils/eventUtils";



export function readEventChatName(event: AgentEvent): string {
  return toText((event as Record<string, unknown>)?.chatName);
}

export function readEventFirstAgentName(event: AgentEvent): string {
  return toText((event as Record<string, unknown>)?.firstAgentName);
}

export function readRequestQueryText(event: AgentEvent): string {
  return safeText(event.message);
}

export function readSteerConfirmation(event: AgentEvent): {
  steerId: string;
  chatId?: string;
  runId?: string;
} | null {
  const steerId = toText(event.steerId);
  if (event.type !== "request.steer" || !steerId || (!toText(event.message) && !hasTimelineAttachmentContent(normalizeTimelineAttachments(event.references)))) return null;
  const chatId = toText(event.chatId);
  const runId = toText(event.runId);
  return { steerId, ...(chatId ? { chatId } : {}), ...(runId ? { runId } : {}) };
}


export function readReferences(event: AgentEvent): unknown[] {
 return Array.isArray(event.references) ? event.references : [];
}
