import React, { useEffect, useRef, useState } from "react";
import type { TimelineNode } from "@/features/timeline/lib/timelineState";
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
  const interaction = useTimelineInteraction();
  const { t } = useI18n();
  const expanded = Boolean(node.expanded);
  const text = node.text || "";
  const isLoading = node.status === "running" && interaction?.capturedAt === undefined;
  const triggerLabel = isLoading
    ? node.reasoningLabel || t("timeline.thinking.inProgress")
    : t("timeline.thinking.title");

  const now = useThinkingDurationTick(isLoading);
  const liveDurationMs = typeof node.startedAt === "number"
    ? Math.floor(Math.max(0, (interaction?.capturedAt ?? now) - node.startedAt) / 1000) * 1000
    : undefined;
  const durationLabel =
    typeof liveDurationMs === "number"
      ? formatToolDuration(liveDurationMs, t)
      : "";

  return (
    <TimelineCollapse
      label={
        <span className="tw:inline-flex tw:items-center tw:gap-1.5 tw:text-[13px]">
          {isLoading ? (
            <>
              <Skeleton active={true} text={triggerLabel} />
              <span className="tw:text-text-sub tw:opacity-60 tw:text-[12px]">
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
      onExpand={() => interaction?.setExpanded?.(node.id, !expanded)}
    >
      <div className={["thinking-detail", SCROLLBAR_THIN_CLASS_NAME].join(" ")}>
        {text}
      </div>
    </TimelineCollapse>
  );
};
