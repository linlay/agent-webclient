import { downloadResource, getAgentFile, getResourceText } from "@/shared/data";
import type { ViewerTarget } from "@/features/viewers/lib/viewerTarget";
import { t } from "@/shared/i18n";

export const VIEWER_TEXT_MAX_BYTES = 5 * 1024 * 1024;
const activeViewerDownloads = new Map<string, Promise<void>>();

export interface LimitedViewerText {
  content: string;
  truncated: boolean;
}

export function limitViewerText(
  content: string,
  maxBytes = VIEWER_TEXT_MAX_BYTES,
): LimitedViewerText {
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

export function downloadViewerTarget(
  target: ViewerTarget,
  options: {
    chatId: string;
    teamChat?: boolean;
    signal?: AbortSignal;
  },
): Promise<void> {
  const downloadKey = target.type === "file"
    ? `file:${target.agentKey}:${target.path}`
    : `resource:${options.chatId}:${target.downloadUrl || target.url}`;
  const activeDownload = activeViewerDownloads.get(downloadKey);
  if (activeDownload) return activeDownload;

  const download = (async () => {
    let source = target.type === "resource" ? target.downloadUrl : "";
    if (target.type === "file") {
      const response = await getAgentFile({
        agentKey: target.agentKey,
        path: target.path,
      });
      source = String(response.data.contentUrl || "").trim();
    }
    if (!source) {
      throw new Error(t("contentViewer.error.download"));
    }
    await downloadResource(source, {
      filename: target.name,
      chatId: options.chatId,
      teamChat: options.teamChat ?? false,
      signal: options.signal,
    });
  })().finally(() => {
    activeViewerDownloads.delete(downloadKey);
  });
  activeViewerDownloads.set(downloadKey, download);
  return download;
}

export function readViewerResourceText(
  source: string,
  chatId: string,
  signal?: AbortSignal,
  teamChat = false,
): Promise<string> {
  return getResourceText(source, { chatId, teamChat, signal });
}
