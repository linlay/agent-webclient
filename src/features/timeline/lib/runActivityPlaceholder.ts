import type { TimelineDisplayItem } from "./timelineDisplay";

/**
 * Query rows are conversation context, not assistant output: they never
 * satisfy the transition condition. A run entry only counts once it carries at
 * least one real node (for example the live activity line).
 */
export function hasDisplayableTimelineItem(
  items: readonly TimelineDisplayItem[],
): boolean {
  return items.some(
    (item) =>
      item.kind !== "query" &&
      (item.kind !== "run" || item.nodes.length > 0),
  );
}
