import { isDesktopAppMode } from "./routing";

declare const __WEBCLIENT_BUILD__: { version: string; commit: string; builtAt: string; id: string };

type Breadcrumb = { at: string; kind: "interaction" | "event"; name: string; route: string; count: number };
const recent: Breadcrumb[] = [];
const MAX_BREADCRUMBS = 40;

// Never collect input values, visible text, query parameters, or event payloads.
export function recordRenderBreadcrumb(kind: Breadcrumb["kind"], name: string): void {
  const route = typeof window === "undefined" ? "" : window.location.pathname;
  const safeName = name.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 80);
  const previous = recent[recent.length - 1];
  if (previous?.kind === kind && previous.name === safeName && previous.route === route) {
    previous.count += 1;
    previous.at = new Date().toISOString();
    return;
  }
  recent.push({ at: new Date().toISOString(), kind, name: safeName, route, count: 1 });
  if (recent.length > MAX_BREADCRUMBS) recent.shift();
}

export function installRenderDiagnosticInteractions(): () => void {
  const onClick = (event: MouseEvent) => {
    if (!(event.target instanceof Element)) return;
    const target = event.target.closest("button,a,[role=button],input,textarea,select");
    if (target) recordRenderBreadcrumb("interaction", target.tagName.toLowerCase());
  };
  document.addEventListener("click", onClick, true);
  return () => document.removeEventListener("click", onClick, true);
}

export function createRenderDiagnosticReport(message: string, stack: string) {
  return {
    schemaVersion: 1,
    occurredAt: new Date().toISOString(),
    build: typeof __WEBCLIENT_BUILD__ === "undefined"
      ? { version: "unknown", commit: "unknown", builtAt: "unknown", id: "unknown" }
      : __WEBCLIENT_BUILD__,
    route: typeof window === "undefined" ? "" : window.location.pathname,
    mode: isDesktopAppMode() ? "desktop" : "web",
    userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
    message,
    stack,
    breadcrumbs: recent.map((entry) => ({ ...entry })),
  };
}
