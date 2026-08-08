import {
  downloadResource,
  getResourceText,
} from "@/shared/data";

export const TEXT_PREVIEW_MAX_BYTES = 5 * 1024 * 1024;

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

export function readArtifactResourceText(
  source: string,
  chatId: string,
  signal?: AbortSignal,
  teamChat = false,
): Promise<string> {
  return getResourceText(source, { chatId, teamChat, signal });
}
