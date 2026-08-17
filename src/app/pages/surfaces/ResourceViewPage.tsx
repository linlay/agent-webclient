import React from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { AttachmentPreviewPanel } from "@/features/artifacts/components/AttachmentPreviewPanel";
import {
  getAttachmentPreviewKind,
  type AttachmentPreviewState,
} from "@/features/artifacts/lib/attachmentPreview";
import { classifyResourceUrl } from "@/shared/data";
import { useI18n } from "@/shared/i18n";
import { IndependentSurfaceFrame } from "./SurfaceFrame";

function resourceName(file: string): string {
  const cleanPath = file.split(/[?#]/u, 1)[0];
  const segment = cleanPath.split("/").filter(Boolean).pop() || cleanPath;
  try {
    return decodeURIComponent(segment) || file;
  } catch {
    return segment || file;
  }
}

export function buildResourceSurfacePreview(input: {
  agentKey: string;
  chatId: string;
  file: string;
}): AttachmentPreviewState | null {
  const agentKey = String(input.agentKey || "").trim();
  const chatId = String(input.chatId || "").trim();
  const file = String(input.file || "").trim();
  const classification = classifyResourceUrl(file, chatId);
  const allowed = classification.kind === "chat" || classification.kind === "absolute";
  if (!agentKey || !chatId || !file || !allowed) return null;
  const name = resourceName(file);
  const detectedKind = getAttachmentPreviewKind({ name });
  return {
    name,
    url: file,
    downloadUrl: file,
    kind: detectedKind === "unsupported" ? "text" : detectedKind,
  };
}

export const ResourceViewPage: React.FC = () => {
  const { agentKey: routeAgentKey } = useParams<{ agentKey: string }>();
  const [searchParams] = useSearchParams();
  const { t } = useI18n();
  const agentKey = String(routeAgentKey || "").trim();
  const chatId = String(searchParams.get("chatId") || "").trim();
  const file = String(searchParams.get("file") || "").trim();
  const name = resourceName(file);
  const preview = buildResourceSurfacePreview({ agentKey, chatId, file });
  return (
    <IndependentSurfaceFrame
      kind="resource"
      title={name || t("attachments.kind.file")}
      identity={file}
      error={preview ? "" : t("platformError.code.invalid_request")}
    >
      {preview ? (
        <AttachmentPreviewPanel
          preview={preview}
          surfaceContext={{ chatId, agentKey, teamChat: false }}
        />
      ) : null}
    </IndependentSurfaceFrame>
  );
};
