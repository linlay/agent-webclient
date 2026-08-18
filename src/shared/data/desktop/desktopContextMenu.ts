import { useCallback, useEffect, useRef } from "react";
import {
  AGENT_WEBCLIENT_WORKPANEL_RESOURCE_DOWNLOAD_ACTION,
  AGENT_WEBCLIENT_WORKPANEL_RESOURCE_DOWNLOAD_VERSION,
} from "@/features/transport/contracts/generated/agentWebclientBridge";

export const SERVICE_WEBVIEW_BRIDGE_ACTION_CHANNEL =
  "desktop:service-webview:action";
export const WEBVIEW_CONTEXT_MENU_SEMANTIC_RESPONSE_CHANNEL =
  "desktop:webview-context-menu:semantic-response";
export const WEBVIEW_CONTEXT_MENU_SEMANTIC_VERSION = 1 as const;

export type DesktopContextMenuTargetKind =
  | "message"
  | "code"
  | "web-link"
  | "workspace-file"
  | "chat-resource";

export type DesktopContextMenuCommand =
  | "copy-content"
  | "copy-code"
  | "preview-link"
  | "preview-workspace"
  | "copy-workspace-path"
  | "preview-resource"
  | "download-resource";

export type DesktopContextMenuTargetDescriptor = {
  targetId: string;
  kind: DesktopContextMenuTargetKind;
  url?: string;
  title?: string;
  name?: string;
  mediaType?: "image" | "audio" | "video" | "file";
  handlers: Partial<Record<DesktopContextMenuCommand, () => void | Promise<void>>>;
};

type DesktopElectronAPI = {
  onFromMain?: (
    channel: string,
    listener: (event: unknown, payload: unknown) => void,
  ) => unknown;
};

type DesktopContextMenuWindow = Window & typeof globalThis & {
  electronAPI?: DesktopElectronAPI;
};

const targets = new WeakMap<Element, DesktopContextMenuTargetDescriptor>();
let currentResourceDownloadHandler: (() => void | Promise<void>) | null = null;

const CAPABILITY_BY_COMMAND: Record<DesktopContextMenuCommand, string> = {
  "copy-content": "content.copy",
  "copy-code": "code.copy",
  "preview-link": "link.preview",
  "preview-workspace": "workspace.preview",
  "copy-workspace-path": "workspace.copy-path",
  "preview-resource": "resource.preview",
  "download-resource": "resource.download",
};

export function registerDesktopContextMenuTarget(
  element: Element,
  descriptor: DesktopContextMenuTargetDescriptor,
) {
  targets.set(element, descriptor);
  return () => {
    if (targets.get(element) === descriptor) targets.delete(element);
  };
}

export function resolveDesktopContextMenuTargetAt(
  x: number,
  y: number,
  targetDocument: Pick<Document, "elementFromPoint"> = document,
) {
  let element = targetDocument.elementFromPoint(x, y);
  while (element) {
    const target = targets.get(element);
    if (target) return target;
    element = element.parentElement;
  }
  return null;
}

export function useDesktopContextMenuTarget<T extends Element = HTMLElement>(
  descriptor: DesktopContextMenuTargetDescriptor | null,
) {
  const elementRef = useRef<Element | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const ref = useCallback((element: T | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    elementRef.current = element;
    if (element && descriptor) {
      cleanupRef.current = registerDesktopContextMenuTarget(element, descriptor);
    }
  }, [descriptor]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || !descriptor) return;
    cleanupRef.current?.();
    cleanupRef.current = registerDesktopContextMenuTarget(element, descriptor);
  }, [descriptor]);

  useEffect(() => () => cleanupRef.current?.(), []);
  return ref;
}

export function useDesktopCurrentResourceDownload(
  handler: (() => void | Promise<void>) | null,
) {
  const handlerRef = useRef(handler);
  const enabled = handler !== null;
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;
    const registeredHandler = () => handlerRef.current?.();
    return registerDesktopCurrentResourceDownload(registeredHandler);
  }, [enabled]);
}

export function registerDesktopCurrentResourceDownload(
  handler: () => void | Promise<void>,
) {
  currentResourceDownloadHandler = handler;
  return () => {
    if (currentResourceDownloadHandler === handler) {
      currentResourceDownloadHandler = null;
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readCoordinate(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 100_000
    ? value
    : null;
}

function readTarget(payload: Record<string, unknown>) {
  const x = readCoordinate(payload.x);
  const y = readCoordinate(payload.y);
  if (x === null || y === null) return null;
  return resolveDesktopContextMenuTargetAt(x, y);
}

function safeWebUrl(value: string | undefined) {
  if (!value || value.length > 2_048) return undefined;
  try {
    const parsed = new URL(value, window.location.href);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

function buildSemanticTarget(descriptor: DesktopContextMenuTargetDescriptor) {
  if (!descriptor.targetId || descriptor.targetId.length > 128) return null;
  const url = descriptor.kind === "web-link" ? safeWebUrl(descriptor.url) : undefined;
  if (descriptor.kind === "web-link" && !url) return null;
  return {
    version: WEBVIEW_CONTEXT_MENU_SEMANTIC_VERSION,
    targetId: descriptor.targetId,
    kind: descriptor.kind,
    capabilities: (Object.keys(descriptor.handlers) as DesktopContextMenuCommand[])
      .filter((command) => typeof descriptor.handlers[command] === "function")
      .map((command) => CAPABILITY_BY_COMMAND[command]),
    ...(url ? { url } : {}),
    ...(descriptor.title ? { title: descriptor.title.slice(0, 256) } : {}),
    ...(descriptor.name ? { name: descriptor.name.slice(0, 256) } : {}),
    ...(descriptor.mediaType ? { mediaType: descriptor.mediaType } : {}),
  };
}

function handleResolve(payload: Record<string, unknown>) {
  const requestId = typeof payload.requestId === "string" ? payload.requestId : "";
  if (
    payload.version !== WEBVIEW_CONTEXT_MENU_SEMANTIC_VERSION ||
    !requestId ||
    requestId.length > 128
  ) {
    return;
  }
  const descriptor = readTarget(payload);
  window.postMessage({
    type: WEBVIEW_CONTEXT_MENU_SEMANTIC_RESPONSE_CHANNEL,
    version: WEBVIEW_CONTEXT_MENU_SEMANTIC_VERSION,
    requestId,
    target: descriptor ? buildSemanticTarget(descriptor) : null,
  }, "*");
}

function handleExecute(payload: Record<string, unknown>) {
  if (payload.version !== WEBVIEW_CONTEXT_MENU_SEMANTIC_VERSION) return;
  const descriptor = readTarget(payload);
  const command = typeof payload.command === "string"
    ? payload.command as DesktopContextMenuCommand
    : null;
  if (
    !descriptor ||
    !command ||
    payload.targetId !== descriptor.targetId ||
    payload.targetKind !== descriptor.kind
  ) {
    return;
  }
  const handler = descriptor.handlers[command];
  if (typeof handler === "function") void Promise.resolve(handler()).catch(() => undefined);
}

export function initializeDesktopContextMenuBridge() {
  if (typeof window === "undefined") return () => undefined;
  const electronAPI = (window as DesktopContextMenuWindow).electronAPI;
  if (typeof electronAPI?.onFromMain !== "function") return () => undefined;
  const maybeUnsubscribe = electronAPI.onFromMain(
    SERVICE_WEBVIEW_BRIDGE_ACTION_CHANNEL,
    (_event, value) => {
      if (!isRecord(value)) return;
      if (value.action === "contextMenu.resolve") handleResolve(value);
      if (value.action === "contextMenu.execute") handleExecute(value);
      if (
        value.action === AGENT_WEBCLIENT_WORKPANEL_RESOURCE_DOWNLOAD_ACTION &&
        value.version === AGENT_WEBCLIENT_WORKPANEL_RESOURCE_DOWNLOAD_VERSION &&
        currentResourceDownloadHandler
      ) {
        void Promise.resolve(currentResourceDownloadHandler()).catch(() => undefined);
      }
    },
  );
  return typeof maybeUnsubscribe === "function"
    ? maybeUnsubscribe as () => void
    : () => undefined;
}
