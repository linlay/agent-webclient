import { useEffect, useRef, useState } from "react";
import { useAppContext } from "@/app/state/AppContext";
import {
  DESKTOP_LIVE_SURFACE_ACTIVE_EVENT,
  type DesktopLiveSurfaceActiveEventDetail,
} from "@/shared/data/desktop/desktopSurfaceLifecycle";

type LoadChatForSurfaceRecovery = (
  chatId: string,
  options: { forceReload: true; focusComposerOnComplete: false },
) => Promise<void>;

export async function recoverDesktopLiveSurface(input: {
  active: boolean;
  chatId: string;
  routeChatId: string;
  loadChat: LoadChatForSurfaceRecovery;
}): Promise<boolean> {
  const chatId = String(input.chatId || "").trim();
  const routeChatId = String(input.routeChatId || "").trim();
  if (!input.active || !chatId || routeChatId !== chatId) return false;
  await input.loadChat(chatId, {
    forceReload: true,
    focusComposerOnComplete: false,
  });
  return true;
}

export function useDesktopLiveSurfaceRecovery(
  loadChat: LoadChatForSurfaceRecovery,
  routeChatId?: string,
): void {
  const { state, stateRef } = useAppContext();
  const pendingChatRef = useRef<string | null>(null);
  const [activationRevision, setActivationRevision] = useState(0);

  useEffect(() => {
    const handleSurfaceActive = (event: Event) => {
      const detail = (event as CustomEvent<DesktopLiveSurfaceActiveEventDetail>).detail;
      pendingChatRef.current = detail?.active === true
        ? routeChatId?.trim() || null
        : null;
      setActivationRevision((revision) => revision + 1);
    };
    window.addEventListener(DESKTOP_LIVE_SURFACE_ACTIVE_EVENT, handleSurfaceActive);
    return () => {
      pendingChatRef.current = null;
      window.removeEventListener(DESKTOP_LIVE_SURFACE_ACTIVE_EVENT, handleSurfaceActive);
    };
  }, [routeChatId]);

  useEffect(() => {
    const pendingChatId = pendingChatRef.current;
    if (!pendingChatId) return;
    if (pendingChatId !== routeChatId?.trim()) {
      pendingChatRef.current = null;
      return;
    }
    const current = stateRef.current;
    const transition = current.chatTransition;
    if (transition && (transition.targetChatId !== pendingChatId || transition.phase === "error")) {
      pendingChatRef.current = null;
      return;
    }
    // An inactive attach may already have completed as detached. Do not lose
    // this activation while React commits the new Chat, or merge recovery into
    // that still-pending load: it would never create a fresh observer.
    if (current.chatId?.trim() !== pendingChatId ||
        (transition && transition.phase !== "ready")) return;
    pendingChatRef.current = null;
    void recoverDesktopLiveSurface({
      active: true,
      chatId: pendingChatId,
      routeChatId: routeChatId || "",
      loadChat,
    }).catch(() => undefined);
  }, [activationRevision, loadChat, routeChatId, state.chatId, state.chatTransition, stateRef]);
}
