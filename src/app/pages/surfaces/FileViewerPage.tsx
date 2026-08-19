import React from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { ContentViewerPanel } from "@/features/viewers/components/ContentViewerPanel";
import {
  buildFileViewerTarget,
  type FileViewerTarget,
} from "@/features/viewers/lib/viewerTarget";
import { useI18n } from "@/shared/i18n";
import { IndependentSurfaceFrame } from "./SurfaceFrame";

export function buildFileViewerTargetFromRoute(input: {
  agentKey: string;
  path: string;
  line?: number;
}): FileViewerTarget | null {
  return buildFileViewerTarget(input);
}

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
