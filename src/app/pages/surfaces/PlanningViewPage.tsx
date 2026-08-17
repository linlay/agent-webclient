import React from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { PlanningPreviewContent } from "@/app/layout/sidebar/right/PlanningPreviewTab";
import { useChatSurfaceReplay } from "@/features/surfaces/useChatSurfaceReplay";
import { useI18n } from "@/shared/i18n";
import { IndependentSurfaceFrame } from "./SurfaceFrame";

export const PlanningViewPage: React.FC = () => {
  const { planningId: routePlanningId } = useParams<{ planningId: string }>();
  const [searchParams] = useSearchParams();
  const planningId = String(routePlanningId || "").trim();
  const chatId = String(searchParams.get("chatId") || "").trim();
  const { t } = useI18n();
  const runtime = useChatSurfaceReplay({ chatId });
  const node = React.useMemo(
    () => runtime.snapshot
      ? Array.from(runtime.snapshot.projection.timelineNodes.values()).find(
          (candidate) =>
            candidate.kind === "planning" &&
            candidate.planningId === planningId,
        )
      : undefined,
    [planningId, runtime.snapshot],
  );
  const invalid = !planningId || !chatId;
  const missing = runtime.status === "ready" && !node;
  const error = invalid
    ? t("platformError.code.invalid_request")
    : runtime.error;
  return (
    <IndependentSurfaceFrame
      kind="planning"
      title={t("rightSidebar.overview.planning.title")}
      identity={planningId}
      loading={!invalid && runtime.status === "loading"}
      error={error}
      notFound={missing ? t("surface.notFound") : ""}
    >
      <PlanningPreviewContent
        node={node}
        chatId={chatId}
        teamChat={runtime.snapshot?.owner?.kind === "orchestrated-team"}
      />
    </IndependentSurfaceFrame>
  );
};
