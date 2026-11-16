import { downloadResource } from "@/shared/data";

export function downloadArtifactResource(
  source: string,
  filename: string,
  chatId: string,
  signal?: AbortSignal,
  teamChat = false,
) {
  return downloadResource(source, { filename, chatId, teamChat, signal });
}
