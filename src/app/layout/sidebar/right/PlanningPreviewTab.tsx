import React from "react";
import { useAppState } from "@/app/state/AppContext";
import { MarkdownContent } from "@/shared/ui/MarkdownContent";
import { t } from "@/shared/i18n";

interface PlanningPreviewTabProps {
  nodeId: string;
}

const PLANNING_PREVIEW_CLASS_NAME =
  "right-sidebar-planning-preview tw:flex tw:h-full tw:min-h-0 tw:flex-col tw:overflow-hidden";

const PLANNING_PREVIEW_BODY_CLASS_NAME =
  "right-sidebar-planning-preview-body tw:min-h-0 tw:flex-1 tw:overflow-y-auto tw:p-3";

const PLANNING_PREVIEW_EMPTY_CLASS_NAME =
  "right-sidebar-empty tw:rounded-lg tw:border tw:border-dashed tw:border-line-soft tw:px-3 tw:py-3.5 tw:text-center tw:text-xs tw:text-ink-muted";

export const PlanningPreviewTab: React.FC<PlanningPreviewTabProps> = ({
  nodeId,
}) => {
  const state = useAppState();
  const node = nodeId ? state.timelineNodes.get(nodeId) : undefined;

  if (!node) {
    return (
      <div className={PLANNING_PREVIEW_CLASS_NAME}>
        <div className={PLANNING_PREVIEW_EMPTY_CLASS_NAME}>
          {t("rightSidebar.planningPreview.empty")}
        </div>
      </div>
    );
  }

  return (
    <div className={PLANNING_PREVIEW_CLASS_NAME}>
      <div className={PLANNING_PREVIEW_BODY_CLASS_NAME}>
        <MarkdownContent content={node.text || ""} />
      </div>
    </div>
  );
};
