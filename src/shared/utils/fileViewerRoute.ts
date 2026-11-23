export interface FileViewerRouteInput {
  readonly agentKey: string;
  readonly path: string;
  readonly line?: number;
  readonly col?: number;
}

export function buildFileViewerRoute(input: FileViewerRouteInput): string {
  const agentKey = String(input.agentKey || "").trim();
  const targetPath = String(input.path || "").trim();
  if (
    !agentKey ||
    !targetPath ||
    agentKey === "." ||
    agentKey === ".." ||
    agentKey.includes("/") ||
    agentKey.includes("\\")
  ) {
    return "";
  }
  const params = new URLSearchParams();
  params.set("path", targetPath);
  if (Number.isFinite(input.line) && Number(input.line) > 0) {
    params.set("line", String(Math.floor(Number(input.line))));
  }
  if (Number.isFinite(input.col) && Number(input.col) > 0) {
    params.set("col", String(Math.floor(Number(input.col))));
  }
  const search = params.toString();
  return search
    ? `/file-viewer/${encodeURIComponent(agentKey)}?${search}`
    : `/file-viewer/${encodeURIComponent(agentKey)}`;
}
