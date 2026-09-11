import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type {
  AgentWebclientSelectionActionErrorCode,
  AgentWebclientSelectionActionId,
} from "@/shared/contracts/generated/agentWebclientBridge";
import type { SelectedTextFragment } from "@/shared/contracts/selectedTextReference";
import {
  isSameBrowserTextSelection,
  readBrowserTextSelection,
  resolveBrowserSelectedTextFragment,
  type BrowserTextSelection,
} from "@/shared/data/desktop/desktopContextMenu";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { isDesktopAppMode } from "@/shared/utils/routing";
import styles from "./BrowserSelectionToolbar.module.css";

export type BrowserSelectionToolbarProps = {
  enabled: boolean;
  scopeElement?: Element | null;
  onAction: (input: {
    action: AgentWebclientSelectionActionId;
    fragment: SelectedTextFragment;
  }) => { ok: boolean; code?: AgentWebclientSelectionActionErrorCode } |
    Promise<{ ok: boolean; code?: AgentWebclientSelectionActionErrorCode }>;
};

const ACTIONS = [
  { id: "add-to-chat", label: "selection.toolbar.addToChat", icon: "add" },
  { id: "more-details", label: "selection.toolbar.moreDetails", icon: "info" },
  { id: "ask-in-side-chat", label: "selection.toolbar.askInSideChat", icon: "question_answer" },
] as const;
const VIEWPORT_MARGIN = 8;
const SELECTION_GAP = 8;

export const BrowserSelectionToolbar: React.FC<BrowserSelectionToolbarProps> = ({
  enabled,
  scopeElement,
  onAction,
}) => {
  const { t, locale } = useI18n();
  const active = enabled && scopeElement !== null && !isDesktopAppMode();
  const [selection, setSelection] = useState<BrowserTextSelection | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number; maxWidth: number } | null>(null);
  const [busyAction, setBusyAction] = useState<AgentWebclientSelectionActionId | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef(selection);
  const onActionRef = useRef(onAction);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const awaitingGestureRef = useRef(false);
  const cancelReadRef = useRef<() => void>(() => undefined);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  selectionRef.current = selection;
  onActionRef.current = onAction;

  const dismiss = useCallback(() => {
    cancelReadRef.current();
    awaitingGestureRef.current = true;
    selectionRef.current = null;
    setSelection(null);
    setPosition(null);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!active || typeof document === "undefined") {
      dismiss();
      return;
    }
    const targetDocument = scopeElement?.ownerDocument || document;
    const targetWindow = targetDocument.defaultView;
    if (!targetWindow) return;
    let frame: number | null = null;
    let pointerDown = false;
    let windowActive = true;
    awaitingGestureRef.current = false;
    const cancelRead = () => {
      if (frame !== null) targetWindow.cancelAnimationFrame(frame);
      frame = null;
    };
    cancelReadRef.current = cancelRead;
    const readCurrent = () => readBrowserTextSelection({
      scopeElement, targetDocument, ignoreElement: toolbarRef.current,
    });
    const scheduleRead = (userGesture = false) => {
      if (userGesture) awaitingGestureRef.current = false;
      if (!windowActive || pointerDown || busyRef.current || awaitingGestureRef.current) return;
      cancelRead();
      frame = targetWindow.requestAnimationFrame(() => {
        frame = null;
        const next = readCurrent();
        if (isSameBrowserTextSelection(selectionRef.current, next)) return;
        selectionRef.current = next;
        setSelection(next);
        setPosition(null);
        setFocusedIndex(0);
      });
    };
    const isToolbarTarget = (target: EventTarget | null) =>
      target instanceof targetWindow.Node && toolbarRef.current?.contains(target);
    const handleSelectionChange = () => scheduleRead();
    const handlePointerDown = (event: PointerEvent) => {
      if (isToolbarTarget(event.target)) return;
      pointerDown = event.button === 0;
      dismiss();
    };
    const handlePointerUp = (event: PointerEvent) => {
      pointerDown = false;
      if (event.button === 0 && !isToolbarTarget(event.target)) scheduleRead(true);
    };
    const handlePointerCancel = () => { pointerDown = false; dismiss(); };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (isToolbarTarget(event.target)) return;
      const selectsText = event.key.startsWith("Arrow") ||
        ["Home", "End", "PageUp", "PageDown", "Shift"].includes(event.key) ||
        ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a");
      if (selectsText) scheduleRead(true);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!selectionRef.current || isToolbarTarget(event.target)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        dismiss();
      } else if (event.key === "Tab" && !event.ctrlKey && !event.metaKey && !event.altKey && !busyRef.current) {
        if (!isSameBrowserTextSelection(selectionRef.current, readCurrent())) {
          dismiss();
          return;
        }
        const buttons = toolbarRef.current?.querySelectorAll<HTMLButtonElement>("button");
        const index = event.shiftKey ? ACTIONS.length - 1 : 0;
        const button = buttons?.[index];
        if (!button) return;
        event.preventDefault();
        previousFocusRef.current = targetDocument.activeElement as HTMLElement | null;
        setFocusedIndex(index);
        button.focus({ preventScroll: true });
      }
    };
    const handleFocusIn = (event: FocusEvent) => {
      if (isToolbarTarget(event.target)) return;
      if (selectionRef.current) dismiss();
    };
    const handleBlur = () => { windowActive = false; pointerDown = false; dismiss(); };
    const handleFocus = () => { windowActive = true; };
    const handleVisibility = () => {
      if (targetDocument.visibilityState === "hidden") handleBlur();
      else handleFocus();
    };
    targetDocument.addEventListener("selectionchange", handleSelectionChange);
    targetDocument.addEventListener("pointerdown", handlePointerDown, true);
    targetDocument.addEventListener("pointerup", handlePointerUp, true);
    targetDocument.addEventListener("pointercancel", handlePointerCancel, true);
    targetDocument.addEventListener("keyup", handleKeyUp);
    targetDocument.addEventListener("keydown", handleKeyDown, true);
    targetDocument.addEventListener("focusin", handleFocusIn);
    targetDocument.addEventListener("scroll", dismiss, true);
    targetDocument.addEventListener("visibilitychange", handleVisibility);
    targetWindow.addEventListener("scroll", dismiss, true);
    targetWindow.addEventListener("resize", dismiss);
    targetWindow.addEventListener("blur", handleBlur);
    targetWindow.addEventListener("focus", handleFocus);
    targetWindow.visualViewport?.addEventListener("scroll", dismiss);
    targetWindow.visualViewport?.addEventListener("resize", dismiss);
    return () => {
      cancelRead();
      targetDocument.removeEventListener("selectionchange", handleSelectionChange);
      targetDocument.removeEventListener("pointerdown", handlePointerDown, true);
      targetDocument.removeEventListener("pointerup", handlePointerUp, true);
      targetDocument.removeEventListener("pointercancel", handlePointerCancel, true);
      targetDocument.removeEventListener("keyup", handleKeyUp);
      targetDocument.removeEventListener("keydown", handleKeyDown, true);
      targetDocument.removeEventListener("focusin", handleFocusIn);
      targetDocument.removeEventListener("scroll", dismiss, true);
      targetDocument.removeEventListener("visibilitychange", handleVisibility);
      targetWindow.removeEventListener("scroll", dismiss, true);
      targetWindow.removeEventListener("resize", dismiss);
      targetWindow.removeEventListener("blur", handleBlur);
      targetWindow.removeEventListener("focus", handleFocus);
      targetWindow.visualViewport?.removeEventListener("scroll", dismiss);
      targetWindow.visualViewport?.removeEventListener("resize", dismiss);
      dismiss();
    };
  }, [active, dismiss, scopeElement]);

  useEffect(() => {
    if (!active || !selection) return;
    const targetWindow = selection.targetElement.ownerDocument.defaultView;
    if (!targetWindow) return;
    let frame: number | null = null;
    const observer = new MutationObserver(() => {
      if (frame !== null || !selectionRef.current) return;
      frame = targetWindow.requestAnimationFrame(() => {
        frame = null;
        const current = selectionRef.current;
        if (!current) return;
        const next = readBrowserTextSelection({ scopeElement, ignoreElement: toolbarRef.current });
        if (!isSameBrowserTextSelection(current, next)) dismiss();
      });
    });
    observer.observe(scopeElement || selection.targetElement.ownerDocument.body, {
      childList: true, characterData: true, subtree: true,
    });
    return () => {
      observer.disconnect();
      if (frame !== null) targetWindow.cancelAnimationFrame(frame);
    };
  }, [active, dismiss, scopeElement, selection]);

  useLayoutEffect(() => {
    const toolbar = toolbarRef.current;
    if (!active || !selection || !toolbar) return;
    const targetWindow = toolbar.ownerDocument.defaultView;
    if (!targetWindow) return;
    const viewport = targetWindow.visualViewport;
    const width = viewport?.width || targetWindow.innerWidth;
    const height = viewport?.height || targetWindow.innerHeight;
    const minLeft = (viewport?.offsetLeft || 0) + VIEWPORT_MARGIN;
    const minTop = (viewport?.offsetTop || 0) + VIEWPORT_MARGIN;
    const maxWidth = Math.max(0, width - VIEWPORT_MARGIN * 2);
    const measured = toolbar.getBoundingClientRect();
    const toolbarWidth = Math.min(measured.width || 320, maxWidth);
    const toolbarHeight = measured.height || 40;
    const maxLeft = Math.max(minLeft, minLeft + maxWidth - toolbarWidth);
    const maxTop = Math.max(minTop, minTop + height - VIEWPORT_MARGIN * 2 - toolbarHeight);
    const preferredTop = selection.rect.top - toolbarHeight - SELECTION_GAP;
    const top = preferredTop >= minTop ? preferredTop : selection.rect.bottom + SELECTION_GAP;
    setPosition({
      left: Math.max(minLeft, Math.min(maxLeft, selection.rect.left + (selection.rect.width - toolbarWidth) / 2)),
      top: Math.max(minTop, Math.min(maxTop, top)),
      maxWidth,
    });
  }, [active, selection, locale]);

  const execute = async (action: AgentWebclientSelectionActionId) => {
    const current = selectionRef.current;
    if (!active || busyRef.current || !current) return;
    const fragment = resolveBrowserSelectedTextFragment(current, {
      scopeElement, ignoreElement: toolbarRef.current,
    });
    if (!fragment) { dismiss(); return; }
    busyRef.current = true;
    setBusyAction(action);
    try {
      await onActionRef.current({ action, fragment });
    } finally {
      busyRef.current = false;
      if (mountedRef.current) { setBusyAction(null); dismiss(); }
    }
  };

  if (!active || !selection) return null;
  return createPortal(
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label={t("selection.toolbar.label")}
      aria-busy={Boolean(busyAction)}
      className={styles.toolbar}
      style={{ ...position, visibility: position ? "visible" : "hidden" }}
      onPointerDown={(event) => { if (event.button === 0) event.preventDefault(); }}
      onMouseDown={(event) => { if (event.button === 0) event.preventDefault(); }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault(); event.stopPropagation();
          const previous = previousFocusRef.current;
          dismiss();
          if (previous?.isConnected) previous.focus({ preventScroll: true });
          return;
        }
        const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        if (!delta && event.key !== "Home" && event.key !== "End") return;
        event.preventDefault(); event.stopPropagation();
        const index = event.key === "Home" ? 0 : event.key === "End" ? ACTIONS.length - 1 :
          (focusedIndex + delta + ACTIONS.length) % ACTIONS.length;
        setFocusedIndex(index);
        toolbarRef.current?.querySelectorAll<HTMLButtonElement>("button")[index]?.focus({ preventScroll: true });
      }}
    >
      {ACTIONS.map((action, index) => (
        <UiButton
          key={action.id}
          variant="ghost"
          size="sm"
          className={styles.action}
          disabled={Boolean(busyAction)}
          loading={busyAction === action.id}
          aria-label={t(action.label)}
          tabIndex={focusedIndex === index ? 0 : -1}
          onFocus={() => setFocusedIndex(index)}
          onClick={(event) => {
            event.preventDefault(); event.stopPropagation();
            void execute(action.id).catch(() => undefined);
          }}
        >
          <MaterialIcon name={busyAction === action.id ? "progress_activity" : action.icon} />
          <span>{t(action.label)}</span>
        </UiButton>
      ))}
    </div>,
    selection.targetElement.ownerDocument.body,
  );
};
