export type SurfacePresentationContext = {
  lang?: string;
  theme?: string;
};

export const SURFACE_ROUTE_PATHS = {
  overview: "/overview/:chatId",
  debug: "/debug/:chatId",
  btw: "/btw/:chatId",
  source: "/source-viewer/:sourceId",
  planning: "/planning-viewer/:planningId",
  resource: "/resource-viewer/:agentKey",
  file: "/file-viewer/:agentKey",
  web: "/web-viewer",
  skill: "/skill-viewer/:key",
  history: "/history",
  project: "/project/:agentKey",
  terminal: "/terminal/:agentKey",
  agent: "/agent/:agentKey",
} as const;

export type SurfaceRouteIntent =
  | { kind: "overview" | "debug"; chatId: string }
  | { kind: "btw"; chatId: string; btwId?: string }
  | { kind: "source"; sourceId: string; chatId: string; chunkId?: string }
  | { kind: "planning"; planningId: string; chatId: string }
  | { kind: "resource"; agentKey: string; chatId: string; file: string }
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
  | { kind: "web"; url: string; title?: string }
  | { kind: "skill"; key: string };

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
    pathname = "/web-viewer";
    params.set("url", url);
    set(params, "title", intent.title);
  } else if (intent.kind === "overview" || intent.kind === "debug") {
    const chatId = pathSegment(intent.chatId);
    if (!chatId) return "";
    pathname = `/${intent.kind}/${chatId}`;
  } else if (intent.kind === "btw") {
    const chatId = pathSegment(intent.chatId);
    if (!chatId) return "";
    pathname = `/btw/${chatId}`;
    set(params, "btwId", intent.btwId);
  } else if (intent.kind === "source") {
    const sourceId = pathSegment(intent.sourceId);
    if (!sourceId || !clean(intent.chatId)) return "";
    pathname = `/source-viewer/${sourceId}`;
    params.set("chatId", clean(intent.chatId));
    set(params, "chunkId", intent.chunkId);
  } else if (intent.kind === "planning") {
    const planningId = pathSegment(intent.planningId);
    if (!planningId || !clean(intent.chatId)) return "";
    pathname = `/planning-viewer/${planningId}`;
    params.set("chatId", clean(intent.chatId));
  } else if (intent.kind === "skill") {
    const key = pathSegment(intent.key);
    if (!key) return "";
    pathname = `/skill-viewer/${key}`;
  } else {
    if (!("agentKey" in intent)) return "";
    const agentKey = pathSegment(intent.agentKey);
    if (!agentKey) return "";
    switch (intent.kind) {
      case "resource":
        if (!clean(intent.chatId) || !clean(intent.file)) return "";
        pathname = `/resource-viewer/${agentKey}`;
        params.set("chatId", clean(intent.chatId));
        params.set("file", clean(intent.file));
        break;
      case "file":
        if (!clean(intent.path)) return "";
        pathname = `/file-viewer/${agentKey}`;
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
    if (segments[0] === "web-viewer") {
      const url = validWebUrl(value("url"));
      return url ? { kind: "web", url, ...(value("title") ? { title: value("title") } : {}) } : null;
    }
    return null;
  }
  if (segments.length !== 2) return null;
  const identity = decodedPathSegment(segments[1]);
  if (!identity) return null;
  const chatId = value("chatId");
  switch (segments[0]) {
    case "overview":
    case "debug":
      return chatId ? null : { kind: segments[0], chatId: identity };
    case "btw":
      return chatId ? null : {
        kind: "btw",
        chatId: identity,
        ...(value("btwId") ? { btwId: value("btwId") } : {}),
      };
    case "source-viewer":
      return chatId ? {
        kind: "source",
        sourceId: identity,
        chatId,
        ...(value("chunkId") ? { chunkId: value("chunkId") } : {}),
      } : null;
    case "planning-viewer":
      return chatId ? { kind: "planning", planningId: identity, chatId } : null;
    case "skill-viewer":
      return { kind: "skill", key: identity };
    case "resource-viewer":
      return chatId && value("file")
        ? { kind: "resource", agentKey: identity, chatId, file: value("file") }
        : null;
    case "file-viewer": {
      const line = Number(value("line"));
      return value("path") ? {
        kind: "file", agentKey: identity, path: value("path"),
        ...(Number.isFinite(line) && line > 0 ? { line: Math.floor(line) } : {}),
      } : null;
    }
    case "project": {
      const view = value("view") === "diff" ? "diff" : "content";
      const intent: SurfaceRouteIntent = {
        kind: "project", agentKey: identity,
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
      return { kind: "terminal", agentKey: identity, terminalKey: value("terminalKey") || "main" };
    case "agent":
      return { kind: "agent", agentKey: identity, ...(chatId ? { chatId } : {}) };
    default:
      return null;
  }
}

export function isAllowedWebSurfaceUrl(value: unknown): boolean {
  return Boolean(validWebUrl(value));
}
