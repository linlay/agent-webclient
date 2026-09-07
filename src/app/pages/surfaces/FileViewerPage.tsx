import React from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { ContentViewerPanel } from "@/features/viewers/components/ContentViewerPanel";
import { buildFileViewerTargetFromRoute } from "@/features/surfaces/lib/viewerRouteTargets";
import { useI18n } from "@/shared/i18n";
import { IndependentSurfaceFrame } from "@/features/surfaces/components/IndependentSurfaceFrame";

export const FileViewerPage: React.FC = () => {
  const { agentKey: routeAgentKey } = useParams<{ agentKey: string }>();
  const [searchParams] = useSearchParams();
  const { t } = useI18n();
  const agentKey = String(routeAgentKey || "").trim();
  const path = searchParams.get("path") || "";
  const line = Number(searchParams.get("line") || 0);
  const target = buildFileViewerTargetFromRoute({ agentKey, path, line });
  return (
    <IndependentSurfaceFrame
      kind="file"
      error={target ? "" : t("platformError.code.invalid_request")}
    >
      {target ? (
        <ContentViewerPanel
          target={target}
          showLineNumbers
          surfaceContext={{ chatId: "", teamChat: false }}
        />
      ) : null}
    </IndependentSurfaceFrame>
  );
};
