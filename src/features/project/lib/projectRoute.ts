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

export function readProjectRouteState(search: string): ProjectRouteState {
  const params = new URLSearchParams(search);
  const view = params.get("view") === "diff" ? "diff" : "content";
  const openFiles = Array.from(new Set(
    params.getAll("open").map(normalized).filter(Boolean),
  ));
  return {
    agentKey: normalized(params.get("agentKey")) || undefined,
    chatId: normalized(params.get("chatId")) || undefined,
    runId: normalized(params.get("runId")) || undefined,
    path: normalized(params.get("path")) || undefined,
    openFiles: openFiles.length ? openFiles : undefined,
    view,
  };
}

export function buildProjectRoute(state: ProjectRouteState): string {
  const params = new URLSearchParams();
  if (normalized(state.agentKey)) params.set("agentKey", normalized(state.agentKey));
  if (normalized(state.chatId)) params.set("chatId", normalized(state.chatId));
  if (normalized(state.runId)) params.set("runId", normalized(state.runId));
  if (normalized(state.path)) params.set("path", normalized(state.path));
  Array.from(new Set((state.openFiles || []).map(normalized).filter(Boolean)))
    .forEach((path) => params.append("open", path));
  if (state.view) params.set("view", state.view);
  const search = params.toString();
  return `/project${search ? `?${search}` : ""}`;
}
