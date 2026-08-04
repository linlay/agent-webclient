import {
  downloadResource,
  getResourceText,
} from "@/shared/data";

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
