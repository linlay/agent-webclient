/** Viewer delivery/display level, resolved by Platform from Agent configuration. */
/** Simple progress shows only model announcements and clears. */
export type EventDetailLevel = "simple" | "detailed" | "summary";
export interface EventDisplay {
  defaultDetail: EventDetailLevel;
  effectiveDetail: EventDetailLevel;
}
export function isEventDetailLevel(value: unknown): value is EventDetailLevel {
  return value === "simple" || value === "detailed" || value === "summary";
}
export function normalizeEventDetailLevel(value: unknown): EventDetailLevel {
  return isEventDetailLevel(value) ? value : "simple";
}
