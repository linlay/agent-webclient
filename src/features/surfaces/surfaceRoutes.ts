export type SurfacePresentationContext = {
  lang?: string;
  theme?: string;
};

export const SURFACE_ROUTE_PATHS = {
  overview: "/overview/:agentKey",
  debug: "/debug/:agentKey",
  btw: "/btw/:agentKey",
  source: "/source-view/:agentKey",
  planning: "/planning-view/:agentKey",
  artifact: "/artifact-view/:agentKey",
  reference: "/reference-view/:agentKey",
  file: "/file-view/:agentKey",
  web: "/web-view",
  history: "/history",
  project: "/project/:agentKey",
  terminal: "/terminal/:agentKey",
  agent: "/agent/:agentKey",
} as const;

export type SurfaceRouteIntent =
  | { kind: "overview" | "debug"; agentKey: string; chatId: string }
  | { kind: "btw"; agentKey: string; chatId: string; btwId?: string }
  | {
      kind: "source";
      agentKey: string;
      chatId: string;
      publishId: string;
      sourceId: string;
      btwId?: string;
    }
  | {
      kind: "planning";
      agentKey: string;
      chatId: string;
      planningId: string;
    }
  | { kind: "artifact"; agentKey: string; chatId: string; artifactId: string }
  | { kind: "reference"; agentKey: string; chatId: string; referenceId: string }
  | { kind: "file"; agentKey: string; path: string; line?: number }
  | {
      kind: "project";
      agentKey: string;
      chatId?: string;
      runId?: string;
      path?: string;
      openFiles?: string[];
      view?: "content" | "diff";
    }
  | { kind: "terminal"; agentKey: string; terminalKey?: string }
  | { kind: "history" }
  | { kind: "agent"; agentKey: string; chatId?: string }
  | { kind: "web"; url: string; title?: string };

function clean(value: unknown): string {
  return String(value || "").trim();
}

function pathSegment(value: unknown): string {
  const normalized = clean(value);
  return normalized ? encodeURIComponent(normalized) : "";
}

export function readSurfacePresentationContext(
  search: string,
): SurfacePresentationContext {
  const params = new URLSearchParams(search || "");
  return {
    lang: clean(params.get("lang")) || undefined,
    theme: clean(params.get("theme")) || undefined,
  };
}

function presentationParams(
  context: SurfacePresentationContext = {},
): URLSearchParams {
  const params = new URLSearchParams();
  if (clean(context.lang)) params.set("lang", clean(context.lang));
  if (clean(context.theme)) params.set("theme", clean(context.theme));
  return params;
}

function set(params: URLSearchParams, key: string, value: unknown): void {
  const normalized = clean(value);
  if (normalized) params.set(key, normalized);
}

function validWebUrl(value: unknown): string {
  try {
    const url = new URL(clean(value));
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password
    ) {
      return "";
    }
    return url.toString();
  } catch {
    return "";
  }
}

function decodedPathSegment(value: string): string {
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return "";
  }
}

export function buildSurfaceRoute(
  intent: SurfaceRouteIntent,
  context: SurfacePresentationContext = {},
): string {
  const params = presentationParams(context);
  let pathname = "";

  if (intent.kind === "history") {
    pathname = "/history";
  } else if (intent.kind === "web") {
    const url = validWebUrl(intent.url);
    if (!url) return "";
    pathname = "/web-view";
    params.set("url", url);
    set(params, "title", intent.title);
  } else {
    const agentKey = pathSegment(intent.agentKey);
    if (!agentKey) return "";
    switch (intent.kind) {
      case "overview":
      case "debug":
        if (!clean(intent.chatId)) return "";
        pathname = `/${intent.kind}/${agentKey}`;
        params.set("chatId", clean(intent.chatId));
        break;
      case "btw":
        if (!clean(intent.chatId)) return "";
        pathname = `/btw/${agentKey}`;
        params.set("chatId", clean(intent.chatId));
        set(params, "btwId", intent.btwId);
        break;
      case "source":
        if (!clean(intent.chatId) || !clean(intent.publishId) || !clean(intent.sourceId)) return "";
        pathname = `/source-view/${agentKey}`;
        params.set("chatId", clean(intent.chatId));
        set(params, "btwId", intent.btwId);
        params.set("publishId", clean(intent.publishId));
        params.set("sourceId", clean(intent.sourceId));
        break;
      case "planning":
        if (!clean(intent.chatId) || !clean(intent.planningId)) return "";
        pathname = `/planning-view/${agentKey}`;
        params.set("chatId", clean(intent.chatId));
        params.set("planningId", clean(intent.planningId));
        break;
      case "artifact":
        if (!clean(intent.chatId) || !clean(intent.artifactId)) return "";
        pathname = `/artifact-view/${agentKey}`;
        params.set("chatId", clean(intent.chatId));
        params.set("artifactId", clean(intent.artifactId));
        break;
      case "reference":
        if (!clean(intent.chatId) || !clean(intent.referenceId)) return "";
        pathname = `/reference-view/${agentKey}`;
        params.set("chatId", clean(intent.chatId));
        params.set("referenceId", clean(intent.referenceId));
        break;
      case "file":
        if (!clean(intent.path)) return "";
        pathname = `/file-view/${agentKey}`;
        params.set("path", clean(intent.path));
        if (Number.isFinite(intent.line) && Number(intent.line) > 0) {
          params.set("line", String(Math.floor(Number(intent.line))));
        }
        break;
      case "project":
        if (clean(intent.runId) && !clean(intent.chatId)) return "";
        pathname = `/project/${agentKey}`;
        set(params, "chatId", intent.chatId);
        set(params, "runId", intent.runId);
        set(params, "path", intent.path);
        Array.from(new Set((intent.openFiles || []).map(clean).filter(Boolean)))
          .forEach((path) => params.append("open", path));
        if (intent.view === "diff") {
          if (!clean(intent.chatId) || !clean(intent.runId) || !clean(intent.path)) return "";
          params.set("view", "diff");
        }
        break;
      case "terminal":
        pathname = `/terminal/${agentKey}`;
        params.set("terminalKey", clean(intent.terminalKey) || "main");
        break;
      case "agent":
        pathname = `/agent/${agentKey}`;
        set(params, "chatId", intent.chatId);
        break;
    }
  }

  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}`;
}

export function parseSurfaceRoute(pathname: string, search = ""): SurfaceRouteIntent | null {
  const segments = String(pathname || "").split("/").filter(Boolean);
  const params = new URLSearchParams(search || "");
  const value = (key: string) => clean(params.get(key));
  if (segments.length === 1) {
    if (segments[0] === "history") return { kind: "history" };
    if (segments[0] === "web-view") {
      const url = validWebUrl(value("url"));
      return url ? { kind: "web", url, ...(value("title") ? { title: value("title") } : {}) } : null;
    }
    return null;
  }
  if (segments.length !== 2) return null;
  const agentKey = decodedPathSegment(segments[1]);
  if (!agentKey) return null;
  const chatId = value("chatId");
  switch (segments[0]) {
    case "overview":
    case "debug":
      return chatId ? { kind: segments[0], agentKey, chatId } : null;
    case "btw":
      return chatId ? { kind: "btw", agentKey, chatId, ...(value("btwId") ? { btwId: value("btwId") } : {}) } : null;
    case "source-view":
      return chatId && value("publishId") && value("sourceId") ? {
        kind: "source", agentKey, chatId,
        publishId: value("publishId"), sourceId: value("sourceId"),
        ...(value("btwId") ? { btwId: value("btwId") } : {}),
      } : null;
    case "planning-view":
      return chatId && value("planningId")
        ? { kind: "planning", agentKey, chatId, planningId: value("planningId") }
        : null;
    case "artifact-view":
      return chatId && value("artifactId")
        ? { kind: "artifact", agentKey, chatId, artifactId: value("artifactId") }
        : null;
    case "reference-view":
      return chatId && value("referenceId")
        ? { kind: "reference", agentKey, chatId, referenceId: value("referenceId") }
        : null;
    case "file-view": {
      const line = Number(value("line"));
      return value("path") ? {
        kind: "file", agentKey, path: value("path"),
        ...(Number.isFinite(line) && line > 0 ? { line: Math.floor(line) } : {}),
      } : null;
    }
    case "project": {
      const view = value("view") === "diff" ? "diff" : "content";
      const intent: SurfaceRouteIntent = {
        kind: "project", agentKey,
        ...(chatId ? { chatId } : {}),
        ...(value("runId") ? { runId: value("runId") } : {}),
        ...(value("path") ? { path: value("path") } : {}),
        ...(params.getAll("open").map(clean).filter(Boolean).length
          ? { openFiles: Array.from(new Set(params.getAll("open").map(clean).filter(Boolean))) }
          : {}),
        view,
      };
      if (intent.runId && !intent.chatId) return null;
      return view === "diff" && (!intent.chatId || !intent.runId || !intent.path) ? null : intent;
    }
    case "terminal":
      return { kind: "terminal", agentKey, terminalKey: value("terminalKey") || "main" };
    case "agent":
      return { kind: "agent", agentKey, ...(chatId ? { chatId } : {}) };
    default:
      return null;
  }
}

export function isAllowedWebSurfaceUrl(value: unknown): boolean {
  return Boolean(validWebUrl(value));
}
