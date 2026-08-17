import { useEffect } from "react";
import { useAppContext } from "@/app/state/AppContext";
import {
  DESKTOP_LIVE_SURFACE_ACTIVE_EVENT,
  type DesktopLiveSurfaceActiveEventDetail,
} from "@/features/transport/lib/desktopSurfaceLifecycle";

type LoadChatForSurfaceRecovery = (
  chatId: string,
  options: { forceReload: true; focusComposerOnComplete: false },
) => Promise<void>;

export async function recoverDesktopLiveSurface(input: {
  active: boolean;
  chatId: string;
  loadChat: LoadChatForSurfaceRecovery;
}): Promise<boolean> {
  const chatId = String(input.chatId || "").trim();
  if (!input.active || !chatId) return false;
  await input.loadChat(chatId, {
    forceReload: true,
    focusComposerOnComplete: false,
  });
  return true;
}

export function useDesktopLiveSurfaceRecovery(
  loadChat: LoadChatForSurfaceRecovery,
): void {
  const { stateRef } = useAppContext();

  useEffect(() => {
    const handleSurfaceActive = (event: Event) => {
      const detail = (event as CustomEvent<DesktopLiveSurfaceActiveEventDetail>).detail;
      void recoverDesktopLiveSurface({
        active: detail?.active === true,
        chatId: String(stateRef.current.chatId || "").trim(),
        loadChat,
      }).catch(() => undefined);
    };
    window.addEventListener(DESKTOP_LIVE_SURFACE_ACTIVE_EVENT, handleSurfaceActive);
    return () => {
      window.removeEventListener(DESKTOP_LIVE_SURFACE_ACTIVE_EVENT, handleSurfaceActive);
    };
  }, [loadChat, stateRef]);
}
