import type { TimelineNode, TimelineSource } from "@/features/timeline/lib/timelineState";

export function findSourceById(
  timelineNodes: Iterable<TimelineNode>,
  sourceId: string,
): TimelineSource | null {
  for (const node of timelineNodes) {
    if (node.kind !== "source") continue;
    const source = node.sources?.find((item) => item.id === sourceId);
    if (source) return source;
  }
  return null;
}
