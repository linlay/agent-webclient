/**
 * Platform event detail level. summary shows content plus a one-line
 * progress activity; full adds reasoning, tool calls and model retries.
 * Standalone transports send it to Platform; Desktop always subscribes at
 * full and the timeline applies the level when rendering.
 */
export type EventDetailLevel = "summary" | "full";

const EVENT_DETAIL_LEVEL_STORAGE_KEY = "agent-webclient.eventDetailLevel.v1";

/** Platform routes that accept a detail level. */
export const EVENT_DETAIL_REQUEST_TYPES: ReadonlySet<string> = new Set(["/api/query", "/api/attach", "/api/chat"]);

export function normalizeEventDetailLevel(value: unknown): EventDetailLevel {
  return value === "full" ? "full" : "summary";
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function readEventDetailLevel(): EventDetailLevel {
  try {
    return normalizeEventDetailLevel(storage()?.getItem(EVENT_DETAIL_LEVEL_STORAGE_KEY));
  } catch {
    return "summary";
  }
}

export function persistEventDetailLevel(level: EventDetailLevel): void {
  try {
    storage()?.setItem(EVENT_DETAIL_LEVEL_STORAGE_KEY, level);
  } catch {
    // The level still applies for this page; it just is not remembered.
  }
}
