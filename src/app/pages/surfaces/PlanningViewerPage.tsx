import React from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { PlanningViewerSurface } from "@/features/plan/components/PlanningViewerSurface";

export const PlanningViewerPage: React.FC = () => {
  const { planningId = "" } = useParams<{ planningId: string }>();
  const [searchParams] = useSearchParams();
  return (
    <PlanningViewerSurface
      planningId={planningId.trim()}
      chatId={String(searchParams.get("chatId") || "").trim()}
    />
  );
};
