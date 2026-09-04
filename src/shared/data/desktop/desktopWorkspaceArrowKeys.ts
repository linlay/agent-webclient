import { postDesktopHostMessage } from "@/shared/data/desktop/desktopHostBridge";

export const AGENT_WEBCLIENT_WORKSPACE_ARROW_KEY_MESSAGE_TYPE =
  "desktop:agent-webclient:workspace-arrow-key";

export type DesktopWorkspaceArrowKeyDirection = "left" | "right";

const BLOCKED_TARGET_SELECTOR = [
  "input",
  "textarea",
  "select",
  "button",
  "a",
  "summary",
  "label",
  "iframe",
  "object",
  "embed",
  "audio",
  "video",
  "pre",
  "code",
  "[contenteditable]:not([contenteditable='false'])",
  // Virtuoso makes the vertical Main Chat scroller focusable. Keep generic
  // tabindex protection unless a non-interactive workspace surface opts in.
  "[tabindex]:not([tabindex='-1']):not([data-desktop-workspace-arrow-keys='allow'])",
  "[draggable='true']",
  "[data-desktop-workspace-arrow-keys='ignore']",
  "[role='button']",
  "[role='link']",
  "[role='menu']",
  "[role='menuitem']",
  "[role='menuitemcheckbox']",
  "[role='menuitemradio']",
  "[role='option']",
  "[role='radio']",
  "[role='checkbox']",
  "[role='switch']",
  "[role='tab']",
  "[role='slider']",
  "[role='spinbutton']",
  "[role='textbox']",
  "[role='combobox']",
  "[role='listbox']",
  "[role='grid']",
  "[role='tree']",
  "[role='dialog']",
  "[role='alertdialog']",
  ".monaco-editor",
  ".cm-editor",
  ".xterm",
  ".awaiting-panel",
  ".hitl-dialog-surface",
].join(",");

const ACTIVE_AWAITING_SELECTOR =
  "#awaiting-html-panel, .hitl-dialog-surface";
const BLOCKING_OVERLAY_SELECTOR = [
  "dialog[open]",
  "[role='dialog'][aria-modal='true']",
  "[role='alertdialog']",
  ".ant-modal-wrap",
  ".ant-drawer-open",
].join(",");

let requestSequence = 0;

function isPotentiallyVisible(element: Element): boolean {
  if (
    element.hasAttribute("hidden") ||
    element.getAttribute("aria-hidden") === "true"
  ) {
    return false;
  }
  if (element instanceof HTMLElement) {
    if (element.style.display === "none" || element.style.visibility === "hidden") {
      return false;
    }
  }
  return true;
}

function hasBlockingSurface(documentRef: Document): boolean {
  return Array.from(
    documentRef.querySelectorAll(
      `${ACTIVE_AWAITING_SELECTOR}, ${BLOCKING_OVERLAY_SELECTOR}`,
    ),
  ).some(isPotentiallyVisible);
}

function isBlockedTarget(event: KeyboardEvent, documentRef: Document): boolean {
  const path = typeof event.composedPath === "function"
    ? event.composedPath()
    : [event.target];
  const candidates = [...path, documentRef.activeElement];
  return candidates.some((candidate) =>
    candidate instanceof Element &&
    Boolean(candidate.closest(BLOCKED_TARGET_SELECTOR)),
  );
}

export function resolveDesktopWorkspaceArrowKey(
  event: KeyboardEvent,
  options: {
    documentRef?: Document;
    gestureActive?: boolean;
  } = {},
): DesktopWorkspaceArrowKeyDirection | null {
  const documentRef = options.documentRef ?? (
    typeof document === "undefined" ? null : document
  );
  if (
    !documentRef ||
    options.gestureActive ||
    event.defaultPrevented ||
    event.isComposing ||
    event.repeat ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    (event.key !== "ArrowLeft" && event.key !== "ArrowRight") ||
    hasBlockingSurface(documentRef) ||
    isBlockedTarget(event, documentRef)
  ) {
    return null;
  }

  const selection = documentRef.getSelection?.();
  if (selection && !selection.isCollapsed) {
    return null;
  }

  return event.key === "ArrowLeft" ? "left" : "right";
}

export function publishDesktopWorkspaceArrowKey(
  direction: DesktopWorkspaceArrowKeyDirection,
): boolean {
  requestSequence += 1;
  return postDesktopHostMessage({
    type: AGENT_WEBCLIENT_WORKSPACE_ARROW_KEY_MESSAGE_TYPE,
    requestId: `desktop-workspace-arrow-${Date.now()}-${requestSequence}`,
    direction,
  });
}

export function initializeDesktopWorkspaceArrowKeys(
  publish: (
    direction: DesktopWorkspaceArrowKeyDirection,
  ) => boolean = publishDesktopWorkspaceArrowKey,
): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => undefined;
  }

  let pointerGestureActive = false;
  let dragGestureActive = false;
  const resetPointerGesture = () => {
    pointerGestureActive = false;
  };
  const startPointerGesture = () => {
    pointerGestureActive = true;
  };
  const resetDragGesture = () => {
    dragGestureActive = false;
  };
  const startDragGesture = () => {
    dragGestureActive = true;
  };
  const handleKeyDown = (event: KeyboardEvent) => {
    const direction = resolveDesktopWorkspaceArrowKey(event, {
      gestureActive: pointerGestureActive || dragGestureActive,
    });
    if (!direction || !publish(direction)) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  window.addEventListener("keydown", handleKeyDown, true);
  window.addEventListener("pointerdown", startPointerGesture, true);
  window.addEventListener("pointerup", resetPointerGesture, true);
  window.addEventListener("pointercancel", resetPointerGesture, true);
  window.addEventListener("blur", resetPointerGesture);
  window.addEventListener("dragstart", startDragGesture, true);
  window.addEventListener("dragend", resetDragGesture, true);
  window.addEventListener("drop", resetDragGesture, true);

  return () => {
    window.removeEventListener("keydown", handleKeyDown, true);
    window.removeEventListener("pointerdown", startPointerGesture, true);
    window.removeEventListener("pointerup", resetPointerGesture, true);
    window.removeEventListener("pointercancel", resetPointerGesture, true);
    window.removeEventListener("blur", resetPointerGesture);
    window.removeEventListener("dragstart", startDragGesture, true);
    window.removeEventListener("dragend", resetDragGesture, true);
    window.removeEventListener("drop", resetDragGesture, true);
  };
}
