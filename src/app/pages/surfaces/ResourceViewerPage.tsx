import React from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { ContentViewerPanel } from "@/features/viewers/components/ContentViewerPanel";
import { buildResourceViewerTargetFromRoute } from "@/features/surfaces/lib/viewerRouteTargets";
import { useI18n } from "@/shared/i18n";
import { IndependentSurfaceFrame } from "@/features/surfaces/components/IndependentSurfaceFrame";
import { useOpenTarget } from "@/features/surfaces/hooks/useOpenTarget";

export const ResourceViewerPage: React.FC = () => {
  const { agentKey: routeAgentKey } = useParams<{ agentKey: string }>();
  const [searchParams] = useSearchParams();
  const { t } = useI18n();
  const openTarget = useOpenTarget();
  const agentKey = String(routeAgentKey || "").trim();
  const chatId = String(searchParams.get("chatId") || "").trim();
  const file = String(searchParams.get("file") || "").trim();
  const sourceKind = String(searchParams.get("sourceKind") || "").trim();
  const resourceId = String(searchParams.get("resourceId") || "").trim();
  const relativePath = String(searchParams.get("relativePath") || "").trim();
  const target = buildResourceViewerTargetFromRoute({
    agentKey, chatId, file, sourceKind, resourceId, relativePath,
  });
  return (
    <IndependentSurfaceFrame
      kind="resource"
      error={target ? "" : t("platformError.code.invalid_request")}
      flushContent={target?.contentKind === "html"}
    >
      {target ? (
        <ContentViewerPanel
          target={target}
          enableDesktopCurrentResourceDownload
          enableDesktopLocalResourceActions
          enableDesktopPreviewReview
          onOpenTarget={openTarget}
          surfaceContext={{ chatId, agentKey, teamChat: false }}
        />
      ) : null}
    </IndependentSurfaceFrame>
  );
};
