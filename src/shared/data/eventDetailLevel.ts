/** Viewer delivery/display level, resolved by Platform from Agent configuration. */
export type EventDetailLevel = "summary" | "full";
export interface EventDisplay {
  defaultDetail: EventDetailLevel;
  effectiveDetail: EventDetailLevel;
}
export function normalizeEventDetailLevel(value: unknown): EventDetailLevel {
  return value === "full" ? "full" : "summary";
}
