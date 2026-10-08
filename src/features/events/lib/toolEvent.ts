import type { AgentEvent } from "@/shared/contracts/agentEvents";

export function resolveViewKey(event: Pick<AgentEvent, 'view'>): string {
  return String(event.view?.key || '').trim();
}

export function pickToolName(...candidates: Array<unknown>): string {
  for (const candidate of candidates) {
    const text = String(candidate || '').trim();
    if (text) return text;
  }
  return '';
}
