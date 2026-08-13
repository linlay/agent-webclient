import React, { useEffect, useMemo, useRef, useState } from "react";
import type { TimelineNode } from "@/app/state/types";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import { useI18n } from "@/shared/i18n";
import { useTimelineInteraction } from "./TimelineInteractionContext";
import { SCROLLBAR_THIN_CLASS_NAME } from "@/shared/styles/scrollbarClassNames";
import { formatToolDuration } from "@/features/timeline/lib/timelineDuration";
import { Skeleton } from "@/shared/components/skeleton";
import { TimelineCollapse } from "@/shared/ui/TimelineCollapse";

interface ThinkingBlockProps {
  node: TimelineNode;
}

function useThinkingDurationTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  const timer = useRef<number>(0);
  useEffect(() => {
    if (!active) {
      window.clearInterval(timer.current);
      return;
    }
    timer.current = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer.current);
    };
  }, [active]);
  return now;
}

export const ThinkingBlock: React.FC<ThinkingBlockProps> = ({ node }) => {
  const dispatch = useAppDispatch();
  const state = useAppState();
  const interaction = useTimelineInteraction();
  const { t } = useI18n();
  const expanded = Boolean(node.expanded);
  const reasoningKey = useMemo(() => {
    for (const [key, nodeId] of state.reasoningNodeById.entries()) {
      if (nodeId === node.id) return key;
    }
    return "";
  }, [node.id, state.reasoningNodeById]);

  const text = node.text || "";
  const isLoading = useMemo(() => node.status === "running", [node.status]);
  const triggerLabel = isLoading
    ? node.reasoningLabel || t("timeline.thinking.inProgress")
    : t("timeline.thinking.title");

  const now = useThinkingDurationTick(isLoading);
  const liveDurationMs = useMemo(
    () =>
      typeof node.startedAt === "number"
        ? Math.floor(Math.max(0, now - node.startedAt) / 1000) * 1000
        : undefined,
    [node.startedAt, now],
  );
  const durationLabel =
    typeof liveDurationMs === "number"
      ? formatToolDuration(liveDurationMs, t)
      : "";

  return (
    <TimelineCollapse
      label={
        <span className="tw:inline-flex tw:items-center tw:gap-1.5">
          {isLoading ? (
            <>
              <Skeleton active={true} text={triggerLabel} />
              <span className="tw:text-text-sub tw:opacity-60 tw:text-[11px]">
                {durationLabel}
              </span>
            </>
          ) : (
            <span>{triggerLabel}</span>
          )}
        </span>
      }
      expanded={expanded}
      destroyOnHidden
      onExpand={() => {
        if (interaction?.patchNode) {
          interaction.patchNode({
            ...node,
            expanded: !expanded,
          });
          return;
        }
        if (reasoningKey) {
          const timer = state.reasoningCollapseTimers.get(reasoningKey);
          if (timer) {
            clearTimeout(timer);
            dispatch({
              type: "CLEAR_REASONING_COLLAPSE_TIMER",
              reasoningId: reasoningKey,
            });
          }
        }
        dispatch({
          type: "SET_TIMELINE_NODE",
          id: node.id,
          node: {
            ...node,
            expanded: !expanded,
          },
        });
      }}
    >
      <div className={["thinking-detail", SCROLLBAR_THIN_CLASS_NAME].join(" ")}>
        {text}
      </div>
    </TimelineCollapse>
  );
};
