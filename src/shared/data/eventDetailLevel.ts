/** Viewer delivery/display level, resolved by Platform from Agent configuration. */
/** Summary progress shows only model announcements and clears. */
export type EventDetailLevel = "summary" | "full";
export interface EventDisplay {
  defaultDetail: EventDetailLevel;
  effectiveDetail: EventDetailLevel;
}
export function normalizeEventDetailLevel(value: unknown): EventDetailLevel {
  return value === "full" ? value : "summary";
}
