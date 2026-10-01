import React from "react";
import { useParams } from "react-router-dom";
import { useI18n } from "@/shared/i18n";
import { IndependentSurfaceFrame } from "@/features/surfaces/components/IndependentSurfaceFrame";
import { SkillDetailView } from "@/features/skills/components/SkillDetailView";

export const SkillViewerPage: React.FC = () => {
  const { id: routeId } = useParams<{ id: string }>();
  const { t } = useI18n();
  const key = String(routeId || "").trim();
  const invalid = !key;
  return (
    <IndependentSurfaceFrame
      kind="skill"
      error={invalid ? t("platformError.code.invalid_request") : ""}
    >
      {invalid ? null : <SkillDetailView skillId={key} />}
    </IndependentSurfaceFrame>
  );
};
