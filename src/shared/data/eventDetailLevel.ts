/** Viewer delivery/display level, resolved by Platform from Agent configuration. */
/** Simple progress shows only model announcements and clears. */
export type EventDetailLevel = "simple" | "detailed";
export interface EventDisplay {
  defaultDetail: EventDetailLevel;
  effectiveDetail: EventDetailLevel;
}
export function normalizeEventDetailLevel(value: unknown): EventDetailLevel {
  return value === "detailed" ? value : "simple";
}
