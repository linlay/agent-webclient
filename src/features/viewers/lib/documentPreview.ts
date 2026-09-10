import type { DocumentPreviewResponse, DocumentPreviewSource } from "@/shared/data/api/dto/resources";
import { classifyResourceUrl } from "@/shared/data/api/resources/urls";
import type { ViewerTarget } from "./viewerTarget";

export interface DocumentPreviewTabState {
  key: string;
  target: ViewerTarget;
  chatId: string;
  teamChat?: boolean;
  result: DocumentPreviewResponse;
}

export function getDocumentPreviewTabKey(target: ViewerTarget, chatId: string): string {
  return JSON.stringify(resolveDocumentPreviewSource(target, chatId));
}

export function resolveDocumentPreviewSource(target: ViewerTarget, chatId: string): DocumentPreviewSource | null {
  if (target.type === "file") {
    return target.agentKey && target.path
      ? { kind: "workspace-file", agentKey: target.agentKey, path: target.path } : null;
  }
  const ownerChatId = target.source?.chatId || chatId;
  if (target.source?.relativePath && ownerChatId) {
    return { kind: "chat-resource", chatId: ownerChatId, relativePath: target.source.relativePath };
  }
  const classified = classifyResourceUrl(target.url, ownerChatId);
  if (classified.kind !== "chat" || !classified.resourceKey) return null;
  try {
    return { kind: "chat-resource", chatId: ownerChatId, relativePath: classified.resourceKey.split("/").map(decodeURIComponent).join("/") };
  } catch { return null; }
}

export function isValidDocumentPreview(result: DocumentPreviewResponse, embeddingOrigin: string): boolean {
  try {
    const url = new URL(result.url);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
      && (result.openMode === "iframe" || result.openMode === "external")
      && (result.openMode !== "iframe" || url.origin !== embeddingOrigin)
      && Boolean(result.previewId && result.sourceRevision)
      && Number.isFinite(result.expiresAt) && result.expiresAt > Date.now();
  } catch { return false; }
}
