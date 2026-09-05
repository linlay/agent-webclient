import React from "react";
import { useChatSurfaceReplay } from "@/features/conversation/hooks/useChatSurfaceReplay";
import { PlanningPreviewContent } from "@/features/plan/components/PlanningPreview";
import { IndependentSurfaceFrame } from "@/features/surfaces/components/IndependentSurfaceFrame";
import { useI18n } from "@/shared/i18n";

export const PlanningViewerSurface: React.FC<{ chatId: string; planningId: string }> = ({
  chatId,
  planningId,
}) => {
  const { t } = useI18n();
  const runtime = useChatSurfaceReplay({ chatId });
  const node = React.useMemo(
    () => runtime.snapshot
      ? Array.from(runtime.snapshot.projection.timelineNodes.values()).find(
          (candidate) => candidate.kind === "planning" && candidate.planningId === planningId,
        )
      : undefined,
    [planningId, runtime.snapshot],
  );
  const invalid = !planningId || !chatId;
  return (
    <IndependentSurfaceFrame
      kind="planning"
      loading={!invalid && runtime.status === "loading"}
      error={invalid ? t("platformError.code.invalid_request") : runtime.error}
      notFound={runtime.status === "ready" && !node ? t("surface.notFound") : ""}
    >
      <PlanningPreviewContent
        node={node}
        chatId={chatId}
        teamChat={runtime.snapshot?.owner?.kind === "orchestrated-team"}
      />
    </IndependentSurfaceFrame>
  );
};
