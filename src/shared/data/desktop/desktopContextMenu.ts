import { useCallback, useEffect, useRef } from "react";
import {
  AGENT_WEBCLIENT_COMPOSER_DRAFT_ACTION,
  AGENT_WEBCLIENT_COMPOSER_DRAFT_VERSION,
  AGENT_WEBCLIENT_WORKPANEL_PREVIEW_REVIEW_ACTION,
  AGENT_WEBCLIENT_WORKPANEL_PREVIEW_REVIEW_VERSION,
  AGENT_WEBCLIENT_WORKPANEL_RESOURCE_DOWNLOAD_ACTION,
  AGENT_WEBCLIENT_WORKPANEL_RESOURCE_DOWNLOAD_VERSION,
  AGENT_WEBCLIENT_SELECTION_ACTION,
  AGENT_WEBCLIENT_SELECTION_ACTION_RESULT_PAGE_EVENT,
  AGENT_WEBCLIENT_SELECTION_ACTION_VERSION,
  type AgentWebclientSelectionAction,
  type AgentWebclientSelectionActionErrorCode,
  type AgentWebclientSelectionActionId,
  type AgentWebclientWorkPanelPreviewReviewAction,
} from "@/shared/contracts/generated/agentWebclientBridge";
import {
  SELECTED_TEXT_MAX_CHARACTERS,
  createSelectedTextFragment,
  type SelectedTextFragment,
} from "@/shared/contracts/selectedTextReference";

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
let currentPreviewReviewHandler: ((action: AgentWebclientWorkPanelPreviewReviewAction) => void) | null = null;
type DesktopSelectionActionHandlerResult = {
  ok: boolean;
  code?: AgentWebclientSelectionActionErrorCode;
  handoff?: { chatId: string; runId: string };
};
type DesktopSelectionActionHandler = (input: {
  action: AgentWebclientSelectionActionId;
  fragment: SelectedTextFragment;
}) => Promise<DesktopSelectionActionHandlerResult> | DesktopSelectionActionHandlerResult;
let currentSelectionActionHandler: DesktopSelectionActionHandler | null = null;
export const DESKTOP_COMPOSER_REVIEW_DRAFT_EVENT = "agent:insert-workpanel-review-draft";

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

export function useDesktopCurrentPreviewReview(
  handler: ((action: AgentWebclientWorkPanelPreviewReviewAction) => void) | null,
) {
  const handlerRef = useRef(handler);
  const enabled = handler !== null;
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;
    const registeredHandler = (action: AgentWebclientWorkPanelPreviewReviewAction) => {
      handlerRef.current?.(action);
    };
    return registerDesktopCurrentPreviewReview(registeredHandler);
  }, [enabled]);
}

export function registerDesktopCurrentPreviewReview(
  handler: (action: AgentWebclientWorkPanelPreviewReviewAction) => void,
) {
  currentPreviewReviewHandler = handler;
  return () => {
    if (currentPreviewReviewHandler === handler) {
      currentPreviewReviewHandler = null;
    }
  };
}

export function useDesktopSelectionActionHandler(
  handler: DesktopSelectionActionHandler | null,
) {
  const handlerRef = useRef(handler);
  const enabled = handler !== null;
  handlerRef.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const registeredHandler: DesktopSelectionActionHandler = (input) => {
      const current = handlerRef.current;
      return current
        ? current(input)
        : { ok: false, code: "surface_not_ready" };
    };
    return registerDesktopSelectionActionHandler(registeredHandler);
  }, [enabled]);
}

export function registerDesktopSelectionActionHandler(
  handler: DesktopSelectionActionHandler,
) {
  currentSelectionActionHandler = handler;
  return () => {
    if (currentSelectionActionHandler === handler) {
      currentSelectionActionHandler = null;
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  const keys = new Set(allowed);
  return Object.keys(value).every((key) => keys.has(key));
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

function resolveTargetFromNode(node: Node | null) {
  let element = node instanceof Element ? node : node?.parentElement || null;
  while (element) {
    const target = targets.get(element);
    if (target) return target;
    element = element.parentElement;
  }
  return null;
}

function readSelectionAction(payload: Record<string, unknown>) {
  if (
    !hasOnlyKeys(payload, [
      "action",
      "version",
      "requestId",
      "selectionId",
      "operation",
      "targetId",
      "targetKind",
      "start",
      "end",
    ]) ||
    payload.action !== AGENT_WEBCLIENT_SELECTION_ACTION ||
    payload.version !== AGENT_WEBCLIENT_SELECTION_ACTION_VERSION ||
    typeof payload.requestId !== "string" ||
    !payload.requestId ||
    typeof payload.selectionId !== "string" ||
    !payload.selectionId ||
    !["add-to-chat", "more-details", "ask-in-side-chat"].includes(
      String(payload.operation || ""),
    ) ||
    typeof payload.targetId !== "string" ||
    !["message", "code"].includes(String(payload.targetKind || ""))
  ) {
    return null;
  }
  const start = isRecord(payload.start) ? payload.start : null;
  const end = isRecord(payload.end) ? payload.end : null;
  if (
    !start ||
    !end ||
    !hasOnlyKeys(start, ["x", "y"]) ||
    !hasOnlyKeys(end, ["x", "y"])
  ) return null;
  const startTarget = readTarget({ x: start.x, y: start.y });
  const endTarget = readTarget({ x: end.x, y: end.y });
  if (
    !startTarget ||
    !endTarget ||
    startTarget.targetId !== payload.targetId ||
    endTarget.targetId !== payload.targetId ||
    startTarget.kind !== payload.targetKind ||
    endTarget.kind !== payload.targetKind
  ) {
    return null;
  }
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return null;
  const anchorTarget = resolveTargetFromNode(selection.anchorNode);
  const focusTarget = resolveTargetFromNode(selection.focusNode);
  if (
    !anchorTarget ||
    !focusTarget ||
    anchorTarget.targetId !== payload.targetId ||
    focusTarget.targetId !== payload.targetId ||
    anchorTarget.kind !== payload.targetKind ||
    focusTarget.kind !== payload.targetKind
  ) {
    return null;
  }
  const text = selection.toString().trim();
  if (!text) return null;
  if (text.length > SELECTED_TEXT_MAX_CHARACTERS) {
    return { error: "selection_too_large" as const };
  }
  const fragment = createSelectedTextFragment({
    text,
    targetId: payload.targetId,
    sourceKind: payload.targetKind as "message" | "code",
  });
  if (!fragment) return null;
  return {
    action: payload as unknown as AgentWebclientSelectionAction,
    fragment,
  };
}

function emitSelectionActionResult(
  requestId: string,
  result: DesktopSelectionActionHandlerResult,
) {
  window.dispatchEvent(new CustomEvent(AGENT_WEBCLIENT_SELECTION_ACTION_RESULT_PAGE_EVENT, {
    detail: {
      version: AGENT_WEBCLIENT_SELECTION_ACTION_VERSION,
      requestId,
      ok: result.ok,
      ...(result.code ? { code: result.code } : {}),
      ...(result.handoff ? { handoff: result.handoff } : {}),
    },
  }));
}

async function handleSelectionAction(payload: Record<string, unknown>) {
  const requestId = typeof payload.requestId === "string" ? payload.requestId : "";
  if (!requestId) return;
  const selectionAction = readSelectionAction(payload);
  if (!selectionAction) {
    emitSelectionActionResult(requestId, { ok: false, code: "stale_selection" });
    return;
  }
  if ("error" in selectionAction) {
    emitSelectionActionResult(requestId, { ok: false, code: selectionAction.error });
    return;
  }
  if (!currentSelectionActionHandler) {
    emitSelectionActionResult(requestId, { ok: false, code: "surface_not_ready" });
    return;
  }
  try {
    const result = await currentSelectionActionHandler({
      action: selectionAction.action.operation,
      fragment: selectionAction.fragment,
    });
    emitSelectionActionResult(requestId, result);
  } catch {
    emitSelectionActionResult(requestId, { ok: false, code: "run_start_failed" });
  }
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
      if (value.action === AGENT_WEBCLIENT_SELECTION_ACTION) {
        void handleSelectionAction(value);
      }
      if (
        value.action === AGENT_WEBCLIENT_WORKPANEL_RESOURCE_DOWNLOAD_ACTION &&
        value.version === AGENT_WEBCLIENT_WORKPANEL_RESOURCE_DOWNLOAD_VERSION &&
        currentResourceDownloadHandler
      ) {
        void Promise.resolve(currentResourceDownloadHandler()).catch(() => undefined);
      }
      if (
        value.action === AGENT_WEBCLIENT_WORKPANEL_PREVIEW_REVIEW_ACTION &&
        value.version === AGENT_WEBCLIENT_WORKPANEL_PREVIEW_REVIEW_VERSION &&
        currentPreviewReviewHandler
      ) {
        currentPreviewReviewHandler(value as AgentWebclientWorkPanelPreviewReviewAction);
      }
      if (
        value.action === AGENT_WEBCLIENT_COMPOSER_DRAFT_ACTION &&
        value.version === AGENT_WEBCLIENT_COMPOSER_DRAFT_VERSION &&
        typeof value.requestId === "string" &&
        typeof value.ownerChatId === "string" &&
        typeof value.text === "string" &&
        typeof window.dispatchEvent === "function"
      ) {
        window.dispatchEvent(new CustomEvent(DESKTOP_COMPOSER_REVIEW_DRAFT_EVENT, {
          detail: value,
        }));
      }
    },
  );
  return typeof maybeUnsubscribe === "function"
    ? maybeUnsubscribe as () => void
    : () => undefined;
}
