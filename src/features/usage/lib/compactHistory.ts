import type { AgentEvent, AIContextCompactEvent } from "@/shared/contracts/agentEvents";

export function isChatCompactEvent(event: AgentEvent, chatId: string): event is AIContextCompactEvent {
  return Boolean(chatId) && (!event.chatId || event.chatId === chatId)
    && (event.type === "compact.start" || event.type === "compact.complete" || event.type === "compact.failed");
}

export function collectCompactHistory(events: readonly AgentEvent[], chatId: string) {
  const stages = new Map<string, AIContextCompactEvent>();
  for (const [index, event] of events.entries()) {
    if (!isChatCompactEvent(event, chatId)) continue;
    const key = event.compactId || (event.requestId
      ? JSON.stringify([event.runId, event.requestId, event.level])
      : `event-${index}`);
    const previous = stages.get(key);
    if (previous && previous.type !== "compact.start" && event.type !== previous.type) continue;
    stages.set(key, {
      ...event,
      timestamp: event.timestamp ?? previous?.timestamp,
      trigger: event.trigger ?? previous?.trigger,
      level: event.level ?? previous?.level,
      scope: event.scope ?? previous?.scope,
      estimatedTokens: event.estimatedTokens ?? previous?.estimatedTokens,
      currentTokens: event.currentTokens ?? previous?.currentTokens,
      error: event.error ?? previous?.error,
      detail: event.detail ?? previous?.detail,
    });
  }
  return Array.from(stages, ([key, event]) => ({ key, event })).reverse()
    .sort((a, b) => (b.event.timestamp ?? 0) - (a.event.timestamp ?? 0));
}
