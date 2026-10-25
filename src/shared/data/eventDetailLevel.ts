/** Viewer delivery/display level, resolved by Platform from Agent configuration. */
/** none is summary whose progress line shows only what the model announces;
 * Platform filters the events, so both render the same way here. */
export type EventDetailLevel = "summary" | "full" | "none";
export interface EventDisplay {
  defaultDetail: EventDetailLevel;
  effectiveDetail: EventDetailLevel;
}
export function normalizeEventDetailLevel(value: unknown): EventDetailLevel {
  return value === "full" || value === "none" ? value : "summary";
}
