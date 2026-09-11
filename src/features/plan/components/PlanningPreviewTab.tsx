import React from "react";
import {
  PlanningPreviewContent,
  PlanningPreviewTabContent,
} from "@/features/plan/components/PlanningPreview";

export { PlanningPreviewContent } from "@/features/plan/components/PlanningPreview";

export interface PlanningPreviewTabProps {
  planningId?: string;
  nodeId?: string;
}

/** Resolves the active planning node before rendering the pure preview. */
export const PlanningPreviewTab: React.FC<PlanningPreviewTabProps> = (props) => (
  <PlanningPreviewTabContent {...props} />
);
