import React from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { ContentViewerPanel } from "@/features/viewers/components/ContentViewerPanel";
import {
  buildResourceViewerTargetFromUrl,
  type ResourceViewerTarget,
} from "@/features/viewers/lib/viewerTarget";
import { classifyResourceUrl } from "@/shared/data";
import { useI18n } from "@/shared/i18n";
import { IndependentSurfaceFrame } from "./SurfaceFrame";

export function buildResourceViewerTargetFromRoute(input: {
  agentKey: string;
  chatId: string;
  file: string;
}): ResourceViewerTarget | null {
  const agentKey = String(input.agentKey || "").trim();
  const chatId = String(input.chatId || "").trim();
  const file = String(input.file || "").trim();
  const classification = classifyResourceUrl(file, chatId);
  const allowed = classification.kind === "chat" || classification.kind === "absolute";
  if (!agentKey || !chatId || !file || !allowed) return null;
  return buildResourceViewerTargetFromUrl(file);
}

export const ResourceViewerPage: React.FC = () => {
  const { agentKey: routeAgentKey } = useParams<{ agentKey: string }>();
  const [searchParams] = useSearchParams();
  const { t } = useI18n();
  const agentKey = String(routeAgentKey || "").trim();
  const chatId = String(searchParams.get("chatId") || "").trim();
  const file = String(searchParams.get("file") || "").trim();
  const target = buildResourceViewerTargetFromRoute({ agentKey, chatId, file });
  return (
    <IndependentSurfaceFrame
      kind="resource"
      title={target?.name || t("attachments.kind.file")}
      identity={file}
      error={target ? "" : t("platformError.code.invalid_request")}
    >
      {target ? (
        <ContentViewerPanel
          target={target}
          surfaceContext={{ chatId, teamChat: false }}
        />
      ) : null}
    </IndependentSurfaceFrame>
  );
};
