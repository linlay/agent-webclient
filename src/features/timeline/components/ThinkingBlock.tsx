import React, { useMemo } from "react";
import type { TimelineNode } from "@/app/state/types";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import { useI18n } from "@/shared/i18n";
import { TimelineCollapse } from "./collapse";

interface ThinkingBlockProps {
  node: TimelineNode;
}

export const ThinkingBlock: React.FC<ThinkingBlockProps> = ({ node }) => {
  const dispatch = useAppDispatch();
  const state = useAppState();
  const { t } = useI18n();
  const expanded = Boolean(node.expanded);
  const reasoningKey = useMemo(() => {
    for (const [key, nodeId] of state.reasoningNodeById.entries()) {
      if (nodeId === node.id) return key;
    }
    return "";
  }, [node.id, state.reasoningNodeById]);

  const text = node.text || "";
  const isLoading = node.status === "running" || node.status === "streaming";
  const triggerLabel = isLoading
    ? node.reasoningLabel || t("timeline.thinking.inProgress")
    : t("timeline.thinking.title");

  return (
    <TimelineCollapse
      label={triggerLabel}
      expanded={expanded}
      onExpand={() => {
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
      <div className={`thinking-detail ${expanded ? "is-open" : ""}`}>
        {text}
      </div>
    </TimelineCollapse>
  );
};
