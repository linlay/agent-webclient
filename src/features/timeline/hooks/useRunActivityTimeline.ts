import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import type { AgentEvent } from "@/shared/contracts/agentEvents";
import type { EventDetailLevel } from "@/shared/data/eventDetailLevel";
import { RUN_ACTIVITY_NODE_ID } from "@/shared/ui/modelRetry";
import type { TimelineNode } from "../lib/timelineState";

const MIN_ACTIVITY_DWELL_MS = 1000;
const useBrowserLayoutEffect = typeof document === "undefined" ? useEffect : useLayoutEffect;

interface ActivityDisplay {
  scopeKey: string;
  node: TimelineNode | null;
  shownAt: number;
}

/** Presentation only: keep a readable sentence, coalesce updates to the latest,
 * and leave the protocol timeline untouched. A stable sentence never expires. */
export function useRunActivityTimeline(nodes: TimelineNode[], options: {
  scopeKey: string;
  runId: string;
  active: boolean;
  detailLevel: EventDetailLevel;
  events: AgentEvent[];
}): TimelineNode[] {
  const { scopeKey, runId, detailLevel, events } = options;
  const ended = events.some(event => !event.taskId && event.runId === runId &&
    (event.type === "run.complete" || event.type === "run.cancel" || event.type === "run.error"));
  const active = options.active && detailLevel === "summary" && !ended;
  const activityIndex = nodes.findIndex(node => node.id === RUN_ACTIVITY_NODE_ID);
  const activity = activityIndex >= 0 ? nodes[activityIndex] : null;
  // Content starts rendering immediately. Only the progress line's removal waits.
  const hasOutput = activity && nodes.slice(activityIndex + 1).some(node =>
    node.kind === "content" && (!node.runId || node.runId === activity.runId) &&
    (node.taskId || "") === (activity.taskId || ""));
  const next = active && activity?.text?.trim() && !hasOutput &&
    (!runId || !activity.runId || activity.runId === runId) ? activity : null;
  const [display, setDisplay] = useState<ActivityDisplay>(() => ({ scopeKey, node: next, shownAt: Date.now() }));

  useBrowserLayoutEffect(() => {
    if (!active || display.scopeKey !== scopeKey || !display.node) {
      if (display.scopeKey !== scopeKey || display.node !== next) {
        setDisplay({ scopeKey, node: next, shownAt: Date.now() });
      }
      return;
    }
    if (display.node.text === next?.text) {
      // New timestamps/metadata for the same sentence do not restart its dwell.
      if (display.node !== next) setDisplay({ ...display, node: next });
      return;
    }
    const remaining = MIN_ACTIVITY_DWELL_MS - (Date.now() - display.shownAt);
    const applyLatest = () => setDisplay({ scopeKey, node: next, shownAt: Date.now() });
    if (remaining <= 0) {
      applyLatest();
      return;
    }
    // Each new desired value replaces the pending callback, preserving the
    // original deadline. Cleanup also handles unmount, run end and scope changes.
    const timer = setTimeout(applyLatest, remaining);
    return () => clearTimeout(timer);
  }, [active, scopeKey, next, display]);

  const visible = active ? (display.scopeKey === scopeKey ? display.node : next) : null;
  return useMemo(() => {
    const result = nodes.filter(node => node.id !== RUN_ACTIVITY_NODE_ID);
    if (visible) result.push(visible);
    return result;
  }, [nodes, visible]);
}
