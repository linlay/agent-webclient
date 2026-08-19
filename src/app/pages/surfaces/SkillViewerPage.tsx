import React from "react";
import { useParams } from "react-router-dom";
import { useI18n } from "@/shared/i18n";
import { IndependentSurfaceFrame } from "./SurfaceFrame";
import { SkillDetailView } from "@/features/skills/components/SkillDetailView";

export const SkillViewerPage: React.FC = () => {
  const { key: routeKey } = useParams<{ key: string }>();
  const { t } = useI18n();
  const key = String(routeKey || "").trim();
  const invalid = !key;
  return (
    <IndependentSurfaceFrame
      kind="skill"
      title={t("route.title.skills")}
      identity={key}
      error={invalid ? t("platformError.code.invalid_request") : ""}
    >
      {invalid ? null : <SkillDetailView skillKey={key} />}
    </IndependentSurfaceFrame>
  );
};
