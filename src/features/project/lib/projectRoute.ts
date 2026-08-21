import { buildSurfaceRoute } from "@/features/surfaces/surfaceRoutes";

export type ProjectView = "content" | "diff";

export interface ProjectRouteState {
  agentKey?: string;
  chatId?: string;
  runId?: string;
  path?: string;
  openFiles?: string[];
  view?: ProjectView;
}

function normalized(value: unknown): string {
  return String(value || "").trim();
}

export function readProjectRouteState(search: string, agentKey = ""): ProjectRouteState {
  const params = new URLSearchParams(search);
  const view = params.get("view") === "diff" ? "diff" : "content";
  const openFiles = Array.from(new Set(
    params.getAll("open").map(normalized).filter(Boolean),
  ));
  return {
    agentKey: normalized(agentKey) || undefined,
    chatId: normalized(params.get("chatId")) || undefined,
    runId: normalized(params.get("runId")) || undefined,
    path: normalized(params.get("path")) || undefined,
    openFiles: openFiles.length ? openFiles : undefined,
    view,
  };
}

export function buildProjectRoute(state: ProjectRouteState): string {
  const agentKey = normalized(state.agentKey);
  if (!agentKey) return "";
  return buildSurfaceRoute({
    kind: "project",
    agentKey,
    chatId: normalized(state.chatId) || undefined,
    runId: normalized(state.runId) || undefined,
    path: normalized(state.path) || undefined,
    openFiles: state.openFiles,
    view: state.view,
  });
}
