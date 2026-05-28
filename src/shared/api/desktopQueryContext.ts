import { isAppMode } from "@/shared/utils/routing";
import {
  hasDesktopHostBridge,
  isDesktopHostMessageEvent,
} from "@/shared/api/desktopHostBridge";

type DesktopPageKind = "native" | "webview" | "iframe";
type DesktopPermissionMode = "default" | "page_control" | "full_access";

type DesktopQuerySnapshot = {
  route: string;
  pageKey?: string;
  pageKind?: DesktopPageKind;
  permissionMode?: DesktopPermissionMode;
  surfaceId?: string;
  webContentsId?: number;
  frameMatchUrl?: string;
  snapshotVersion?: number;
  snapshotAt?: string;
  pageContext?: Record<string, unknown> | null;
};

type DesktopContextChangedMessage = {
  type?: string;
  desktop?: unknown;
};

const DESKTOP_CONTEXT_CHANGED_MESSAGE_TYPE = "desktopContextChanged";

let latestDesktopSnapshot: DesktopQuerySnapshot | null = null;
let desktopContextListenerInstalled = false;
let desktopContextMessageListener: ((event: MessageEvent) => void) | null = null;

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readBrowserPathname(): string {
  if (typeof window === "undefined") {
    return "";
  }
  return String(window.location?.pathname || "").trim();
}

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : undefined;
}

function normalizeOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function normalizeOptionalPermissionMode(value: unknown): DesktopPermissionMode | undefined {
  return value === "default" || value === "page_control" || value === "full_access"
    ? value
    : undefined;
}

function normalizeDesktopSnapshot(value: unknown): DesktopQuerySnapshot | null {
  if (!isObjectRecord(value)) {
    return null;
  }
  const route = normalizeOptionalString(value.route);
  if (!route) {
    return null;
  }
  const pageContext = isObjectRecord(value.pageContext)
    ? value.pageContext
    : value.pageContext === null
      ? null
      : undefined;
  return {
    route,
    ...(normalizeOptionalString(value.pageKey) ? { pageKey: normalizeOptionalString(value.pageKey) } : {}),
    ...(value.pageKind === "native" || value.pageKind === "webview" || value.pageKind === "iframe"
      ? { pageKind: value.pageKind }
      : {}),
    ...(normalizeOptionalPermissionMode(value.permissionMode)
      ? { permissionMode: normalizeOptionalPermissionMode(value.permissionMode) }
      : {}),
    ...(normalizeOptionalString(value.surfaceId) ? { surfaceId: normalizeOptionalString(value.surfaceId) } : {}),
    ...(normalizeOptionalNumber(value.webContentsId) !== undefined
      ? { webContentsId: normalizeOptionalNumber(value.webContentsId) }
      : {}),
    ...(normalizeOptionalString(value.frameMatchUrl) ? { frameMatchUrl: normalizeOptionalString(value.frameMatchUrl) } : {}),
    ...(normalizeOptionalNumber(value.snapshotVersion) !== undefined
      ? { snapshotVersion: normalizeOptionalNumber(value.snapshotVersion) }
      : {}),
    ...(normalizeOptionalString(value.snapshotAt) ? { snapshotAt: normalizeOptionalString(value.snapshotAt) } : {}),
    ...(pageContext !== undefined ? { pageContext } : {})
  };
}

export function initializeDesktopQueryContextBridge(): void {
  if (
    desktopContextListenerInstalled ||
    typeof window === "undefined" ||
    !isAppMode() ||
    !hasDesktopHostBridge()
  ) {
    return;
  }

  desktopContextMessageListener = (event: MessageEvent) => {
    if (!isDesktopHostMessageEvent(event)) {
      return;
    }
    const payload = event.data as DesktopContextChangedMessage | null;
    if (!payload || payload.type !== DESKTOP_CONTEXT_CHANGED_MESSAGE_TYPE) {
      return;
    }
    latestDesktopSnapshot = normalizeDesktopSnapshot(payload.desktop);
  };

  window.addEventListener("message", desktopContextMessageListener as EventListener);
  desktopContextListenerInstalled = true;
}

export function buildDesktopQueryContext(
  params: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!isAppMode()) {
    return params;
  }

  initializeDesktopQueryContextBridge();

  const next = isObjectRecord(params) ? { ...params } : {};
  const existingDesktop = isObjectRecord(next.desktop) ? next.desktop : {};
  const {
    action: _ignoredAction,
    source: _ignoredSource,
    route: _ignoredRoute,
    pageKey: _ignoredPageKey,
    pageKind: _ignoredPageKind,
    permissionMode: _ignoredPermissionMode,
    surfaceId: _ignoredSurfaceId,
    webContentsId: _ignoredWebContentsId,
    frameMatchUrl: _ignoredFrameMatchUrl,
    snapshotVersion: _ignoredSnapshotVersion,
    snapshotAt: _ignoredSnapshotAt,
    pageContext: _ignoredPageContext,
    ...restDesktop
  } = existingDesktop;
  const pathname = readBrowserPathname();
  const source = pathname === "/copilot" || pathname.startsWith("/copilot/")
    ? "copilot"
    : "agent-webclient";
  const snapshot = latestDesktopSnapshot;

  next.desktop = {
    ...restDesktop,
    source,
    route: snapshot?.route || pathname,
    ...(snapshot?.pageKey ? { pageKey: snapshot.pageKey } : {}),
    ...(snapshot?.pageKind ? { pageKind: snapshot.pageKind } : {}),
    ...(snapshot?.permissionMode ? { permissionMode: snapshot.permissionMode } : {}),
    ...(snapshot?.surfaceId ? { surfaceId: snapshot.surfaceId } : {}),
    ...(typeof snapshot?.webContentsId === "number" ? { webContentsId: snapshot.webContentsId } : {}),
    ...(snapshot?.frameMatchUrl ? { frameMatchUrl: snapshot.frameMatchUrl } : {}),
    ...(typeof snapshot?.snapshotVersion === "number" ? { snapshotVersion: snapshot.snapshotVersion } : {}),
    ...(snapshot?.snapshotAt ? { snapshotAt: snapshot.snapshotAt } : {}),
    ...(snapshot && "pageContext" in snapshot ? { pageContext: snapshot.pageContext ?? null } : {})
  };

  return next;
}

export function resetDesktopQueryContextBridgeForTests(): void {
  latestDesktopSnapshot = null;
  if (
    desktopContextListenerInstalled &&
    desktopContextMessageListener &&
    typeof window !== "undefined"
  ) {
    window.removeEventListener("message", desktopContextMessageListener as EventListener);
  }
  desktopContextMessageListener = null;
  desktopContextListenerInstalled = false;
}
