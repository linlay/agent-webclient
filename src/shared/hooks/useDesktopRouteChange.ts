import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export type DesktopRouteChangedPayload = {
  type?: unknown;
  pathname?: unknown;
  search?: unknown;
  hash?: unknown;
};

type DesktopRouteSubscriber = (target: string) => void;

type DesktopRouteBridge = {
  listeners: Set<DesktopRouteSubscriber>;
  listening: boolean;
  unsubscribeFromMain: (() => void) | null;
};

type DesktopRouteElectronAPI = {
  onFromMain?: (
    channel: string,
    callback: (event: unknown, payload: DesktopRouteChangedPayload) => void,
  ) => unknown;
};

type DesktopRouteWindow = Window & typeof globalThis & {
  electronAPI?: DesktopRouteElectronAPI;
  [DESKTOP_ROUTE_BRIDGE_KEY]?: DesktopRouteBridge;
};

const DESKTOP_ROUTE_CHANGED_MESSAGE_TYPE = "desktopRouteChanged";
const SERVICE_WEBVIEW_BRIDGE_ROUTE_CHANNEL = "zenmind:service-webview:route";
const DESKTOP_ROUTE_BRIDGE_KEY = "__ZENMIND_AGENT_WEBCLIENT_DESKTOP_ROUTE_BRIDGE__";
const ROUTABLE_DESKTOP_PATHS = [
  "/",
  "/agent",
  "/agents",
  "/automations",
  "/copilot",
  "/memory",
  "/registries",
  "/schedules",
];

let fallbackBridge: DesktopRouteBridge | null = null;

function normalizeRoutePart(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRoutableDesktopPathname(pathname: string): boolean {
  return ROUTABLE_DESKTOP_PATHS.some((routePath) =>
    pathname === routePath || pathname.startsWith(`${routePath}/`),
  );
}

export function buildDesktopRouteTarget(
  payload: DesktopRouteChangedPayload,
): string | null {
  const rawPathname = normalizeRoutePart(payload.pathname);
  if (!rawPathname) {
    return null;
  }

  let pathnameWithoutQuery = rawPathname;
  let queryFromPath = "";
  let hashFromPath = "";
  const hashIndex = pathnameWithoutQuery.indexOf("#");
  if (hashIndex >= 0) {
    hashFromPath = pathnameWithoutQuery.slice(hashIndex + 1);
    pathnameWithoutQuery = pathnameWithoutQuery.slice(0, hashIndex);
  }
  const queryIndex = pathnameWithoutQuery.indexOf("?");
  if (queryIndex >= 0) {
    queryFromPath = pathnameWithoutQuery.slice(queryIndex + 1);
    pathnameWithoutQuery = pathnameWithoutQuery.slice(0, queryIndex);
  }

  const pathname = pathnameWithoutQuery.startsWith("/")
    ? pathnameWithoutQuery || "/"
    : `/${pathnameWithoutQuery}`;
  if (!isRoutableDesktopPathname(pathname)) {
    return null;
  }

  const rawSearch = normalizeRoutePart(payload.search) || queryFromPath;
  const rawHash = normalizeRoutePart(payload.hash) || hashFromPath;
  const search = rawSearch
    ? rawSearch.startsWith("?")
      ? rawSearch
      : `?${rawSearch}`
    : "";
  const hash = rawHash
    ? rawHash.startsWith("#")
      ? rawHash
      : `#${rawHash}`
    : "";

  return `${pathname}${search}${hash}`;
}

function createDesktopRouteBridge(): DesktopRouteBridge {
  return {
    listeners: new Set<DesktopRouteSubscriber>(),
    listening: false,
    unsubscribeFromMain: null,
  };
}

function getDesktopRouteWindow(): DesktopRouteWindow | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window as DesktopRouteWindow;
}

function getDesktopRouteBridge(): DesktopRouteBridge {
  const desktopWindow = getDesktopRouteWindow();
  if (!desktopWindow) {
    fallbackBridge ??= createDesktopRouteBridge();
    return fallbackBridge;
  }

  desktopWindow[DESKTOP_ROUTE_BRIDGE_KEY] ??= createDesktopRouteBridge();
  return desktopWindow[DESKTOP_ROUTE_BRIDGE_KEY];
}

function dispatchDesktopRoutePayload(payload: DesktopRouteChangedPayload): void {
  if (payload.type !== DESKTOP_ROUTE_CHANGED_MESSAGE_TYPE) {
    return;
  }
  const target = buildDesktopRouteTarget(payload);
  if (!target) {
    return;
  }

  for (const listener of Array.from(getDesktopRouteBridge().listeners)) {
    listener(target);
  }
}

function ensureDesktopRouteBridgeListening(): void {
  const bridge = getDesktopRouteBridge();
  if (bridge.listening) {
    return;
  }

  const electronAPI = getDesktopRouteWindow()?.electronAPI;
  if (typeof electronAPI?.onFromMain !== "function") {
    return;
  }

  const maybeUnsubscribe = electronAPI.onFromMain(
    SERVICE_WEBVIEW_BRIDGE_ROUTE_CHANNEL,
    (_event, payload) => {
      dispatchDesktopRoutePayload(payload);
    },
  );
  bridge.listening = true;
  bridge.unsubscribeFromMain =
    typeof maybeUnsubscribe === "function"
      ? () => {
          (maybeUnsubscribe as () => void)();
        }
      : null;
}

export function subscribeDesktopRouteChanges(
  listener: DesktopRouteSubscriber,
): () => void {
  const bridge = getDesktopRouteBridge();
  bridge.listeners.add(listener);
  ensureDesktopRouteBridgeListening();

  return () => {
    bridge.listeners.delete(listener);
  };
}

export function resetDesktopRouteChangeBridgeForTests(): void {
  const bridge = getDesktopRouteBridge();
  bridge.listeners.clear();
  bridge.listening = false;
  bridge.unsubscribeFromMain?.();
  bridge.unsubscribeFromMain = null;

  const desktopWindow = getDesktopRouteWindow();
  if (desktopWindow) {
    delete desktopWindow[DESKTOP_ROUTE_BRIDGE_KEY];
  }
  fallbackBridge = null;
}

export const useDesktopRouteChange = () => {
  const navigate = useNavigate();

  useEffect(() => {
    return subscribeDesktopRouteChanges((target) => {
      const cur = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (cur === target) return;
      navigate(target, { replace: true });
    });
  }, [navigate]);
};
