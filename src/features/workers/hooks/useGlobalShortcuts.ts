import { useEffect, useMemo, useRef } from "react";
import React from "react";
import { useAppState } from "@/app/state/AppContext";
import { useSettingsOverlayState } from "@/features/settings/components/SettingsOverlayProvider";
import {
  useCommandOverlayActions,
  useCommandOverlayOpen,
} from "@/features/workers/components/CommandOverlayProvider";
import { resolveCurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import { isEditableKeyboardTarget } from "@/features/tools/components/buildin/confirm-dialog/state";

function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}

function matchModifier(event: KeyboardEvent, isMac: boolean, shift: boolean): boolean {
  if (isMac) {
    if (shift) return event.metaKey && !event.ctrlKey && !event.altKey && event.shiftKey;
    return event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
  }
  if (shift) return event.ctrlKey && !event.metaKey && !event.altKey && event.shiftKey;
  return event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
}

function isInsideModalOrDrawer(target: EventTarget | null): boolean {
  if (typeof Element === "undefined" || !(target instanceof Element)) return false;
  return Boolean(target.closest(".ant-modal-wrap, .ant-drawer, .modal"));
}

function safeDispatchEvent(type: string, detail: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(type, { detail }));
}

export function useGlobalShortcuts(): void {
  const state = useAppState();
  const { isAnyOverlayOpen } = useSettingsOverlayState();
  const isCommandOverlayOpen = useCommandOverlayOpen();
  const { openCommandOverlay } = useCommandOverlayActions();

  const isMac = useMemo(() => isMacPlatform(), []);

  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      /* Guard: already handled */
      if (event.defaultPrevented || event.repeat) return;

      /* Guard: editable target */
      if (isEditableKeyboardTarget(event.target)) return;

      /* Guard: inside Ant modal/drawer */
      if (isInsideModalOrDrawer(event.target)) return;

      /* Guard: settings or command overlay already open */
      if (isAnyOverlayOpen || isCommandOverlayOpen) return;

      /* Guard: active frontend tool or awaiting */
      const currentState = stateRef.current;
      if (currentState.activeFrontendTool || currentState.activeAwaiting) return;

      const code = event.code;
      const mod = matchModifier(event, isMac, false);
      const modShift = matchModifier(event, isMac, true);

      if (mod && code === "KeyK") {
        event.preventDefault();
        openCommandOverlay({ type: "global" });
        return;
      }

      if (mod && code === "KeyN") {
        event.preventDefault();
        const worker = resolveCurrentWorkerSummary(currentState);
        if (worker) {
          safeDispatchEvent("agent:start-new-conversation", {
            ...(worker.type === "agent" && worker.sourceId
              ? { agentKey: worker.sourceId }
              : {}),
            preserveWorkerContext: true,
            focusComposerOnComplete: true,
          });
        } else {
          openCommandOverlay({ type: "switch" });
        }
        return;
      }

      if (modShift && code === "KeyH") {
        event.preventDefault();
        const worker = resolveCurrentWorkerSummary(currentState);
        if (worker) {
          openCommandOverlay({ type: "history" });
        } else {
          openCommandOverlay({ type: "switch" });
        }
        return;
      }

      if (modShift && code === "KeyW") {
        event.preventDefault();
        openCommandOverlay({ type: "switch" });
        return;
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isMac, isAnyOverlayOpen, isCommandOverlayOpen, openCommandOverlay]);
}

/**
 * Renders inside SettingsOverlayProvider / CommandOverlayProvider so that
 * overlay-context hooks are available.
 */
export const GlobalShortcutLayer: React.FC = () => {
  useGlobalShortcuts();
  return null;
};