import React from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { AttachmentPreviewPanel } from "@/features/artifacts/components/AttachmentPreviewPanel";
import {
  getAttachmentPreviewKind,
  type AttachmentPreviewState,
} from "@/features/artifacts/lib/attachmentPreview";
import { useI18n } from "@/shared/i18n";
import { IndependentSurfaceFrame } from "./SurfaceFrame";

export function buildFileSurfacePreview(input: {
  agentKey: string;
  path: string;
  line?: number;
}): AttachmentPreviewState | null {
  const agentKey = String(input.agentKey || "").trim();
  const path = String(input.path || "").trim();
  if (!agentKey || !path) return null;
  const name = path.replace(/\\/g, "/").split("/").filter(Boolean).pop() || path;
  const detectedKind = getAttachmentPreviewKind({ name });
  const line = Number(input.line || 0);
  return {
    name,
    url: `workspace-file:${encodeURIComponent(agentKey)}:${encodeURIComponent(path)}`,
    downloadUrl: "",
    kind: detectedKind === "unsupported" ? "text" : detectedKind,
    sourcePath: path,
    line: Number.isFinite(line) && line > 0 ? Math.floor(line) : undefined,
    workspaceFile: { agentKey, path },
  };
}

export const FileViewPage: React.FC = () => {
  const { agentKey: routeAgentKey } = useParams<{ agentKey: string }>();
  const [searchParams] = useSearchParams();
  const { t } = useI18n();
  const agentKey = String(routeAgentKey || "").trim();
  const path = String(searchParams.get("path") || "").trim();
  const line = Number(searchParams.get("line") || 0);
  const name = path.replace(/\\/g, "/").split("/").filter(Boolean).pop() || path;
  const preview = buildFileSurfacePreview({ agentKey, path, line });
  return (
    <IndependentSurfaceFrame
      kind="file"
      title={name || t("attachments.kind.file")}
      identity={path}
      error={preview ? "" : t("platformError.code.invalid_request")}
    >
      {preview ? (
        <AttachmentPreviewPanel
          preview={preview}
          showLineNumbers
          surfaceContext={{ chatId: "", agentKey, teamChat: false }}
        />
      ) : null}
    </IndependentSurfaceFrame>
  );
};
