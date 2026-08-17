import {
  downloadResource,
  getAgentFile,
  getResourceText,
} from "@/shared/data";
import type { AgentFileRequest } from "@/shared/data";
import type { AttachmentPreviewState } from "@/features/artifacts/lib/attachmentPreview";
import { t } from "@/shared/i18n";

export const TEXT_PREVIEW_MAX_BYTES = 5 * 1024 * 1024;
const activePreviewDownloads = new Map<string, Promise<void>>();

export interface LimitedTextPreview {
  content: string;
  truncated: boolean;
}

export function limitTextPreview(
  content: string,
  maxBytes = TEXT_PREVIEW_MAX_BYTES,
): LimitedTextPreview {
  const encoded = new TextEncoder().encode(content);
  const normalizedMaxBytes = Math.max(0, Math.floor(maxBytes));
  if (encoded.byteLength <= normalizedMaxBytes) {
    return { content, truncated: false };
  }

  return {
    content: new TextDecoder().decode(
      encoded.subarray(0, normalizedMaxBytes),
      { stream: true },
    ),
    truncated: true,
  };
}

export function downloadArtifactResource(
  source: string,
  filename: string,
  chatId: string,
  signal?: AbortSignal,
  teamChat = false,
): Promise<void> {
  return downloadResource(source, { filename, chatId, teamChat, signal });
}

export function downloadAttachmentPreview(
  preview: AttachmentPreviewState,
  options: {
    chatId: string;
    teamChat?: boolean;
    signal?: AbortSignal;
    workspaceFile?: AgentFileRequest;
  },
): Promise<void> {
  const workspaceFile = options.workspaceFile || preview.workspaceFile;
  const downloadKey = workspaceFile
    ? `workspace:${workspaceFile.agentKey}:${workspaceFile.path}`
    : `resource:${options.chatId}:${preview.downloadUrl || preview.url}`;
  const activeDownload = activePreviewDownloads.get(downloadKey);
  if (activeDownload) {
    return activeDownload;
  }

  const download = (async () => {
    let source = preview.downloadUrl;
    if (workspaceFile) {
      const response = await getAgentFile(workspaceFile);
      source = String(response.data.contentUrl || "").trim();
    }
    if (!source) {
      throw new Error(t("rightSidebar.preview.error.download"));
    }
    await downloadArtifactResource(
      source,
      preview.name,
      options.chatId,
      options.signal,
      options.teamChat,
    );
  })().finally(() => {
    activePreviewDownloads.delete(downloadKey);
  });
  activePreviewDownloads.set(downloadKey, download);
  return download;
}

export function readArtifactResourceText(
  source: string,
  chatId: string,
  signal?: AbortSignal,
  teamChat = false,
): Promise<string> {
  return getResourceText(source, { chatId, teamChat, signal });
}
