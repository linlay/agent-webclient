import type { FileChangeSummary } from "@/features/overview/lib/overviewState";
import type { PublishedArtifact } from "@/features/artifacts/lib/artifactsState";
import type { MaterialIconName } from "@/shared/ui/MaterialIcon";

export function getFileIcon(filePath: string): MaterialIconName {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, MaterialIconName> = {
    ts: "code", tsx: "code", js: "javascript", jsx: "javascript",
    mjs: "javascript", cjs: "javascript", css: "css", scss: "css",
    sass: "css", less: "css", html: "html", htm: "html",
    json: "data_object", md: "description", mdx: "description", py: "code",
    java: "code", go: "code", rs: "code", sh: "terminal", bash: "terminal",
    zsh: "terminal", yaml: "description", yml: "description", toml: "settings",
    xml: "code", svg: "image", png: "image", jpg: "image", jpeg: "image",
    gif: "image", webp: "image", ico: "image", txt: "description",
    lock: "lock", env: "settings", properties: "settings",
  };
  return map[ext] ?? "description";
}

export interface OverviewArtifactItem {
  artifactId: string;
  artifact: PublishedArtifact["artifact"];
  timestamp: number;
}

export function buildOverviewArtifactItems(artifacts: PublishedArtifact[]): OverviewArtifactItem[] {
  return [...artifacts]
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .map((item) => ({
      artifactId: item.artifactId,
      artifact: item.artifact,
      timestamp: item.timestamp || 0,
    }));
}

export interface OverviewFileChangeItem {
  runId: string;
  filePath: string;
  addedLines: number;
  deletedLines: number;
  editedLines: number;
  operationCount: number;
  lastUpdatedAt: number;
}

export function buildFileChangeKey(runId: string, filePath: string): string {
  return `${runId}\u0000${filePath}`;
}

export function toggleExpandedFileChangeKey(
  current: ReadonlySet<string>,
  itemKey: string,
): { next: Set<string>; expanding: boolean } {
  const next = new Set(current);
  const expanding = !next.has(itemKey);
  if (expanding) next.add(itemKey);
  else next.delete(itemKey);
  return { next, expanding };
}

export function buildFileHistoryCacheKey(
  chatId: string,
  item: Pick<OverviewFileChangeItem, "runId" | "filePath">,
): string {
  return `${chatId}\u0000${item.runId}\u0000${item.filePath}`;
}

export function buildOverviewFileChangeItems(
  fileChanges: FileChangeSummary[],
): OverviewFileChangeItem[] {
  return [...fileChanges]
    .sort((a, b) => (b.lastUpdatedAt || 0) - (a.lastUpdatedAt || 0))
    .map((item) => ({
      runId: item.runId || "",
      filePath: item.filePath,
      addedLines: item.addedLines || 0,
      deletedLines: item.deletedLines || 0,
      editedLines: item.editedLines || 0,
      operationCount: item.operationCount || 0,
      lastUpdatedAt: item.lastUpdatedAt || 0,
    }));
}

export function buildFileChangeAnimationSignatures(
  fileChanges: OverviewFileChangeItem[],
): Map<string, string> {
  return new Map(fileChanges.map((item) => [
    buildFileChangeKey(item.runId, item.filePath),
    [
      item.runId,
      item.addedLines,
      item.deletedLines,
      item.editedLines,
      item.operationCount,
      item.lastUpdatedAt,
    ].join(":"),
  ]));
}

export function resolveAnimatedFileChangePaths(
  previous: Map<string, string>,
  next: Map<string, string>,
): string[] {
  const changedPaths: string[] = [];
  for (const [filePath, signature] of next.entries()) {
    if (previous.get(filePath) !== signature) changedPaths.push(filePath);
  }
  return changedPaths;
}
