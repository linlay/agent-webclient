import { useEffect, useMemo, useRef } from "react";
import React from "react";
import { useAppState } from "@/app/state/AppContext";
import { useSettingsOverlayState } from "@/features/settings/components/SettingsOverlayProvider";
import { useCommandOverlayOpen } from "@/features/workers/components/CommandOverlayProvider";
import {
  useGlobalSearchActions,
  useGlobalSearchOpen,
} from "@/features/search/components/GlobalSearchOverlayProvider";
import { isEditableKeyboardTarget } from "@/features/tools/components/buildin/confirm-dialog/state";

function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}

function matchModifier(event: KeyboardEvent, isMac: boolean): boolean {
  if (isMac)
    return event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
  return event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
}

function isInsideModalOrDrawer(target: EventTarget | null): boolean {
  if (typeof Element === "undefined" || !(target instanceof Element))
    return false;
  return Boolean(target.closest(".ant-modal-wrap, .ant-drawer, .modal"));
}

function isMessageInput(target: EventTarget | null): boolean {
  if (!target) return false;
  return (target as HTMLElement).id === "message-input";
}

export function useGlobalShortcuts(): void {
  const state = useAppState();
  const { isAnyOverlayOpen } = useSettingsOverlayState();
  const isCommandOverlayOpen = useCommandOverlayOpen();
  const isGlobalSearchOpen = useGlobalSearchOpen();
  const { openGlobalSearch } = useGlobalSearchActions();

  const isMac = useMemo(() => isMacPlatform(), []);

  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      /* Guard: already handled */
      if (event.defaultPrevented || event.repeat) return;

      /* Guard: editable target (allow message input for global search) */
      if (isEditableKeyboardTarget(event.target) && !isMessageInput(event.target)) return;

      /* Guard: inside Ant modal/drawer */
      if (isInsideModalOrDrawer(event.target)) return;

      /* Guard: settings or command overlay already open */
      if (isAnyOverlayOpen || isCommandOverlayOpen || isGlobalSearchOpen)
        return;

      /* Guard: active frontend tool or awaiting */
      const currentState = stateRef.current;
      if (currentState.activeFrontendTool || currentState.activeAwaiting)
        return;

      const code = event.code;

      if (matchModifier(event, isMac) && code === "KeyK") {
        event.preventDefault();
        openGlobalSearch();
        return;
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [
    isMac,
    isAnyOverlayOpen,
    isCommandOverlayOpen,
    isGlobalSearchOpen,
    openGlobalSearch,
  ]);
}

/**
 * Renders inside SettingsOverlayProvider / CommandOverlayProvider so that
 * overlay-context hooks are available.
 */
export const GlobalShortcutLayer: React.FC = () => {
  useGlobalShortcuts();
  return null;
};
