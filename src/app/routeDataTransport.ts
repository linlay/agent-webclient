import type { TransportMode } from "@/features/transport/lib/transportMode";

export function normalizeRoutePathname(pathname: string): string {
  const trimmed = String(pathname || "").trim();
  const pathOnly = trimmed.split(/[?#]/, 1)[0] || "/";
  const withLeadingSlash = pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`;
  const withoutTrailingSlash =
    withLeadingSlash.length > 1
      ? withLeadingSlash.replace(/\/+$/, "")
      : withLeadingSlash;
  return withoutTrailingSlash || "/";
}

export function isRealtimeRoutePathname(pathname: string): boolean {
  const normalized = normalizeRoutePathname(pathname);
  return (
    normalized === "/" ||
    normalized === "/copilot" ||
    normalized.startsWith("/copilot/") ||
    normalized.startsWith("/agent/")
  );
}

export function resolveRouteDataTransportMode(
  pathname: string,
  currentMode: TransportMode,
): TransportMode {
  return isRealtimeRoutePathname(pathname) ? currentMode : "sse";
}
