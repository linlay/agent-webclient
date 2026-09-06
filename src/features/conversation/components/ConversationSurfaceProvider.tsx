import React, { useEffect, useLayoutEffect } from "react";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import { isChatTransitionPending } from "@/features/conversation/lib/chatTransition";
import { ConversationSurfaceContext, useConversationPresentationClock } from "@/shared/ui/ConversationSurfaceContext";

const useBrowserLayoutEffect = typeof document === "undefined" ? useEffect : useLayoutEffect;

export function ConversationSurfaceProvider({ expectedChatId, children }: React.PropsWithChildren<{ expectedChatId?: string }>) {
  const state = useAppState();
  const targetChatId = expectedChatId || state.chatTransition?.targetChatId || state.chatId;
  const transition = state.chatTransition?.targetChatId === targetChatId ? state.chatTransition : null;
  const mismatch = Boolean(targetChatId && targetChatId !== state.chatId);
  const background = !mismatch && transition?.displayMode === "background";
  const presentation = useConversationPresentationClock({
    targetChatId,
    identity: `${targetChatId}:${transition?.seq || "route"}`,
    error: transition?.phase === "error" ? transition.error : "",
    pending: mismatch || (!background && isChatTransitionPending(transition)),
    background,
  });
  const dispatch = useAppDispatch();
  useBrowserLayoutEffect(() => {
    dispatch({ type: "SET_CHAT_SURFACE_BLOCKED", blocked: presentation.blocked });
  }, [dispatch, presentation.blocked]);
  useBrowserLayoutEffect(() => () => dispatch({ type: "SET_CHAT_SURFACE_BLOCKED", blocked: false }), [dispatch]);
  return <ConversationSurfaceContext.Provider value={presentation}>{children}</ConversationSurfaceContext.Provider>;
}
