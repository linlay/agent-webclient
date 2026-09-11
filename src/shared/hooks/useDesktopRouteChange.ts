import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export type DesktopRouteChangedPayload = {
  type?: unknown;
  pathname?: unknown;
  search?: unknown;
  hash?: unknown;
  routeRevision?: unknown;
};

type DesktopRouteCommand = {
  target: string;
  routeRevision: number;
};

export type DesktopRouteStatus =
  | {
      type: "desktopRouteReady";
      routerLocation: string;
    }
  | {
      type: "desktopRouteApplied";
      routeRevision: number;
      routerLocation: string;
    };

type DesktopRouteSubscriber = (
  target: string,
  command: DesktopRouteCommand,
) => void;

type DesktopRouteBridge = {
  listeners: Set<DesktopRouteSubscriber>;
  listening: boolean;
  unsubscribeFromMain: (() => void) | null;
  lastCommand?: DesktopRouteCommand;
};

type DesktopRouteElectronAPI = {
  onFromMain?: (
    channel: string,
    callback: (event: unknown, payload: unknown) => void,
  ) => unknown;
};

type DesktopRouteWindow = Window & typeof globalThis & {
  electronAPI?: DesktopRouteElectronAPI;
  [DESKTOP_ROUTE_BRIDGE_KEY]?: DesktopRouteBridge;
};

const DESKTOP_ROUTE_CHANGED_MESSAGE_TYPE = "desktopRouteChanged";
const DESKTOP_ROUTE_READY_MESSAGE_TYPE = "desktopRouteReady";
const DESKTOP_ROUTE_APPLIED_MESSAGE_TYPE = "desktopRouteApplied";
export const SERVICE_WEBVIEW_BRIDGE_ROUTE_CHANNEL =
  "desktop:service-webview:route";
export const PAGE_TO_PRELOAD_ROUTE_STATUS_EVENT =
  "__desktopServiceWebviewRouteStatus";
const DESKTOP_ROUTE_BRIDGE_KEY = "__AGENT_WEBCLIENT_DESKTOP_ROUTE_BRIDGE__";
const MAX_DESKTOP_ROUTE_LENGTH = 8_192;

let fallbackBridge: DesktopRouteBridge | null = null;

function normalizeRoutePart(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readRouteRevision(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) > 0
    ? Number(value)
    : null;
}

function reportDesktopRouteDiagnostic(
  stage: string,
  details: Record<string, unknown>,
): void {
  console.info("[desktop-route]", stage, details);
}

function sendDesktopRouteStatus(status: DesktopRouteStatus): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent(PAGE_TO_PRELOAD_ROUTE_STATUS_EVENT, {
    detail: status,
  }));
}

function reportRouterReady(routerLocation: string): void {
  sendDesktopRouteStatus({
    type: DESKTOP_ROUTE_READY_MESSAGE_TYPE,
    routerLocation,
  });
  reportDesktopRouteDiagnostic("router-ready", {
    routerLocation,
    physicalLocation: `${window.location.pathname}${window.location.search}${window.location.hash}`,
  });
}

function acknowledgeDesktopRoute(command: DesktopRouteCommand): void {
  sendDesktopRouteStatus({
    type: DESKTOP_ROUTE_APPLIED_MESSAGE_TYPE,
    routeRevision: command.routeRevision,
    routerLocation: command.target,
  });
  reportDesktopRouteDiagnostic("router-applied", {
    routeRevision: command.routeRevision,
    routerLocation: command.target,
    physicalLocation: `${window.location.pathname}${window.location.search}${window.location.hash}`,
  });
}

export function buildDesktopRouteTarget(
  payload: DesktopRouteChangedPayload,
): string | null {
  const rawPathname = normalizeRoutePart(payload.pathname);
  if (
    !rawPathname ||
    rawPathname.length > MAX_DESKTOP_ROUTE_LENGTH ||
    /[\u0000-\u001f\u007f]/u.test(rawPathname)
  ) {
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
  if (pathname.startsWith("//") || pathname.includes("\\")) {
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

  const target = `${pathname}${search}${hash}`;
  return target.length <= MAX_DESKTOP_ROUTE_LENGTH &&
      !/[\u0000-\u001f\u007f]/u.test(target) &&
      !target.includes("\\")
    ? target
    : null;
}

export function buildRouterLocationTarget(location: {
  pathname?: unknown;
  search?: unknown;
  hash?: unknown;
}): string {
  const pathname = normalizeRoutePart(location.pathname) || "/";
  const search = normalizeRoutePart(location.search);
  const hash = normalizeRoutePart(location.hash);
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

function dispatchDesktopRoutePayload(payload: unknown): void {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return;
  }
  const commandPayload = payload as DesktopRouteChangedPayload;
  if (commandPayload.type !== DESKTOP_ROUTE_CHANGED_MESSAGE_TYPE) {
    return;
  }
  const target = buildDesktopRouteTarget(commandPayload);
  if (!target) {
    return;
  }
  const routeRevision = readRouteRevision(commandPayload.routeRevision);
  if (routeRevision === null) {
    return;
  }

  const command: DesktopRouteCommand = {
    target,
    routeRevision,
  };
  const bridge = getDesktopRouteBridge();
  if (bridge.lastCommand && (routeRevision < bridge.lastCommand.routeRevision ||
    (routeRevision === bridge.lastCommand.routeRevision && target !== bridge.lastCommand.target))) {
    reportDesktopRouteDiagnostic("stale-command-rejected", { routeRevision, target });
    return;
  }
  bridge.lastCommand = command;
  reportDesktopRouteDiagnostic("bridge-received", {
    routeRevision: command.routeRevision,
    target,
    physicalLocation: typeof window === "undefined"
      ? ""
      : `${window.location.pathname}${window.location.search}${window.location.hash}`,
  });

  for (const listener of Array.from(bridge.listeners)) {
    listener(target, command);
  }
}

/** Diagnostic correlation only; never a source of conversation readiness. */
export function readDesktopChatRouteRevision(chatId: string): number | undefined {
  const command = getDesktopRouteBridge().lastCommand;
  if (!command) return undefined;
  const target = new URL(command.target, "http://desktop.invalid");
  return target.searchParams.get("chatId") === chatId ? command.routeRevision : undefined;
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
  const location = useLocation();
  const routerTargetRef = useRef(buildRouterLocationTarget(location));
  const pendingCommandRef = useRef<DesktopRouteCommand | null>(null);
  routerTargetRef.current = buildRouterLocationTarget(location);

  useEffect(() => {
    const unsubscribe = subscribeDesktopRouteChanges((target, command) => {
      // Desktop may already have updated the physical guest URL while React
      // Router still owns the previous route. Only Router location is a valid
      // dedupe signal for this bridge.
      pendingCommandRef.current = command;
      if (routerTargetRef.current === target) {
        acknowledgeDesktopRoute(command);
        pendingCommandRef.current = null;
        return;
      }
      reportDesktopRouteDiagnostic("router-navigate", {
        routeRevision: command.routeRevision,
        from: routerTargetRef.current,
        target,
        physicalLocation: `${window.location.pathname}${window.location.search}${window.location.hash}`,
      });
      navigate(target, { replace: true, flushSync: true });
    });
    reportRouterReady(routerTargetRef.current);
    return unsubscribe;
  }, [navigate]);

  useLayoutEffect(() => {
    const pending = pendingCommandRef.current;
    if (!pending || routerTargetRef.current !== pending.target) {
      return;
    }
    acknowledgeDesktopRoute(pending);
    pendingCommandRef.current = null;
  }, [location.hash, location.pathname, location.search]);
};
