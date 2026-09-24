import React, { useEffect, useRef, useState } from "react";
import type { TimelineNode } from "@/features/timeline/lib/timelineState";
import { useI18n } from "@/shared/i18n";
import { useTimelineInteraction } from "./TimelineInteractionContext";
import { SCROLLBAR_THIN_CLASS_NAME } from "@/shared/styles/scrollbarClassNames";
import { formatToolDuration } from "@/features/timeline/lib/timelineDuration";
import { buildReasoningPreviewText } from "@/features/timeline/lib/reasoningPreview";
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
  // 运行中且折叠时，标题旁单行跟随最新思考内容；溢出从行首裁剪，保证露出尾部。
  const showLivePreview = isLoading && !expanded && text.trim().length > 0;
  const previewText = showLivePreview ? buildReasoningPreviewText(text) : "";

  return (
    <TimelineCollapse
      label={
        <span className="tw:inline-flex tw:items-center tw:gap-1.5 tw:text-[13px] tw:min-w-0 tw:max-w-full tw:whitespace-nowrap">
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
          {previewText && (
            <span
              className="thinking-preview tw:min-w-0 tw:overflow-hidden tw:whitespace-nowrap tw:text-text-sub tw:text-[12px] tw:opacity-60"
              title={previewText}
            >
              {previewText}
            </span>
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
