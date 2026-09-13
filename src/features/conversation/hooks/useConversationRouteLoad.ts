import { useEffect, useLayoutEffect } from "react";
import { useAppContext } from "@/app/state/AppContext";
import type { useConversationActions } from "./useConversationActions";

/** Route acceptance registers a transaction before Agent hydration can stall. */
export function useConversationRouteLoad(
  actions: Pick<ReturnType<typeof useConversationActions>, "prepareChat" | "loadChat" | "syncRouteTarget">,
  targetChatId: string | undefined,
  ready: boolean,
) {
  const { state, stateRef } = useAppContext();
  const { prepareChat, loadChat, syncRouteTarget } = actions;
  useLayoutEffect(() => {
    syncRouteTarget(targetChatId);
    if (targetChatId) prepareChat(targetChatId, { focusComposerOnComplete: true, acceptReady: true, routeDriven: true });
  }, [prepareChat, syncRouteTarget, state.chatId, state.chatTransition, targetChatId]);
  useEffect(() => {
    if (!targetChatId || !ready) return;
    const transition = stateRef.current.chatTransition;
    if (transition?.targetChatId !== targetChatId || transition.phase !== "loading") return;
    void loadChat(targetChatId, { focusComposerOnComplete: true, routeDriven: true }).catch(() => undefined);
  }, [loadChat, ready, state.chatId, state.chatTransition, stateRef, targetChatId]);
}
