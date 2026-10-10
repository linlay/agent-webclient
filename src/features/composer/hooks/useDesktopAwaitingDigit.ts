import { useLayoutEffect } from "react";
import { readAwaitingSubmitId } from "@/features/tools/lib/awaitingSubmitTracker";
import { useLocation } from "react-router-dom";
import type { AppState } from "@/app/state/AppContext";
import { areConversationInteractionsBlocked } from "@/features/conversation/lib/chatTransition";
import { isDesktopHostMessageEvent } from "@/shared/data/desktop/desktopHostBridge";

// Private Service WebView delivery, paired with Desktop's service-webview-bridge.
export const DESKTOP_AWAITING_DIGIT_MESSAGE_TYPE = "desktop:agent-webclient:awaiting-digit";

export type AwaitingDigitState = Pick<AppState,
  "chatId" | "activeAwaiting" | "chatTransition" | "chatSurfaceBlocked"
>;

export function dispatchDesktopAwaitingDigit(
  payload: unknown,
  input: {
    state: AwaitingDigitState;
    renderedAwaiting: AppState["activeAwaiting"];
    pathname: string;
    search: string;
    blocked: boolean;
  },
): boolean {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const message = payload as Record<string, unknown>;
  const { state, renderedAwaiting, pathname, search, blocked } = input;
  const awaiting = state.activeAwaiting;
  if (
    message.type !== DESKTOP_AWAITING_DIGIT_MESSAGE_TYPE ||
    typeof message.digit !== "string" || !/^[1-9]$/.test(message.digit) ||
    typeof message.agentKey !== "string" || !message.agentKey ||
    typeof message.chatId !== "string" || !message.chatId ||
    pathname !== `/agent/${encodeURIComponent(message.agentKey)}` ||
    new URLSearchParams(search).get("chatId") !== message.chatId ||
    state.chatId !== message.chatId || blocked ||
    areConversationInteractionsBlocked(state) ||
    !awaiting || !renderedAwaiting ||
    awaiting.awaitingId !== renderedAwaiting.awaitingId ||
    awaiting.runId !== renderedAwaiting.runId ||
    !awaiting.runId || !awaiting.awaitingId ||
    readAwaitingSubmitId(awaiting.runId, awaiting.awaitingId) || awaiting.resolutionReason ||
    (awaiting.mode === "form" && (awaiting.loading || awaiting.loadError)) ||
    document.visibilityState === "hidden" || document.hasFocus()
  ) return false;

  // Host focus stays in the sidebar. Do not use the guest's stale activeElement
  // as the event target (it may still point at a text field from an earlier visit).
  const overlays = document.querySelectorAll(
    'dialog[open], [role="dialog"][aria-modal="true"], [role="alertdialog"], .ant-modal-wrap, .ant-drawer-open',
  );
  if (Array.from(overlays).some((element) => element.getClientRects().length > 0)) return false;
  const event = new KeyboardEvent("keydown", {
    key: message.digit, code: `Digit${message.digit}`, bubbles: true, cancelable: true,
  });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

export function useDesktopAwaitingDigit(input: {
  state: AppState;
  stateRef: { current: AppState };
  blocked: boolean;
}) {
  const { pathname, search } = useLocation();
  const { state, stateRef, blocked } = input;
  useLayoutEffect(() => {
    if (!state.activeAwaiting || blocked) return;
    const handleMessage = (event: MessageEvent) => {
      if (!isDesktopHostMessageEvent(event)) return;
      dispatchDesktopAwaitingDigit(event.data, {
        state: stateRef.current,
        renderedAwaiting: state.activeAwaiting,
        pathname, search, blocked,
      });
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [state.activeAwaiting, stateRef, pathname, search, blocked]);
}
