import { classifyResourceUrl } from "@/shared/data";
import {
  buildFileViewerTarget,
  buildResourceViewerTargetFromUrl,
  type FileViewerTarget,
  type ResourceViewerTarget,
} from "@/features/viewers/lib/viewerTarget";

export function buildFileViewerTargetFromRoute(input: {
  agentKey: string;
  path: string;
  line?: number;
}): FileViewerTarget | null {
  return buildFileViewerTarget(input);
}

export function buildResourceViewerTargetFromRoute(input: {
  agentKey: string;
  chatId: string;
  file: string;
  sourceKind?: string;
  resourceId?: string;
  relativePath?: string;
}): ResourceViewerTarget | null {
  const agentKey = String(input.agentKey || "").trim();
  const chatId = String(input.chatId || "").trim();
  const file = String(input.file || "").trim();
  const classification = classifyResourceUrl(file, chatId);
  if (!agentKey || !chatId || !file || (classification.kind !== "chat" && classification.kind !== "absolute")) {
    return null;
  }
  const target = buildResourceViewerTargetFromUrl(file);
  const sourceKind = input.sourceKind === "artifact" || input.sourceKind === "reference"
    ? input.sourceKind
    : "";
  return target && sourceKind && input.resourceId && input.relativePath
    ? {
        ...target,
        source: {
          kind: sourceKind,
          agentKey,
          chatId,
          resourceId: input.resourceId,
          relativePath: input.relativePath,
        },
      }
    : target;
}
