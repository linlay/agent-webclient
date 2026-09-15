import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useRealtimeTransport } from "@/features/transport/hooks/useRealtimeTransport";
import { DESKTOP_LIVE_SURFACE_ACTIVE_EVENT, type DesktopLiveSurfaceActiveEventDetail } from "@/shared/data/desktop/desktopSurfaceLifecycle";
import { createChatPreviewRuntime, type ChatPreviewState } from "@/features/conversation/lib/chatPreviewRuntime";

export function useChatPreview(chatId: string, live: boolean) {
  const transport = useRealtimeTransport();
  const runtime = useRef<ReturnType<typeof createChatPreviewRuntime> | null>(null);
  const [value, setValue] = useState<{ chatId: string; live: boolean; state: ChatPreviewState } | null>(null);
  useLayoutEffect(() => {
    const current = createChatPreviewRuntime({
      chatId, live, transport,
      active: transport.kind !== "desktop" || (transport.isSurfaceActive?.() ?? document.visibilityState !== "hidden"),
      onChange: state => setValue({ chatId, live, state }),
    });
    runtime.current = current;
    const onActive = (event: Event) => {
      const detail = (event as CustomEvent<DesktopLiveSurfaceActiveEventDetail>).detail;
      current.setActive(detail?.active === true);
    };
    if (transport.kind === "desktop") window.addEventListener(DESKTOP_LIVE_SURFACE_ACTIVE_EVENT, onActive);
    return () => {
      window.removeEventListener(DESKTOP_LIVE_SURFACE_ACTIVE_EVENT, onActive);
      current.dispose();
      runtime.current = null;
    };
  }, [chatId, live, transport]);
  const reload = useCallback(() => runtime.current?.reload(), []);
  // Route changes conceal the previous Chat in the very first render.
  const state = value?.chatId === chatId && value.live === live ? value.state : null;
  return { state, reload };
}
