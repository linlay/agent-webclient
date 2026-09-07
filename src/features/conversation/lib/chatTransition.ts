import type { AppState } from "@/app/state/AppContext";
import type { ChatTransition } from "@/features/conversation/lib/conversationState";

export const CHAT_PREPARATION_TIMEOUT_MS = 15_000;

export function areConversationInteractionsBlocked(
  state: Pick<AppState, "chatTransition"> & Partial<Pick<AppState, "chatSurfaceBlocked">>,
): boolean {
  return Boolean(state.chatSurfaceBlocked) || isChatTransitionBlockingInteractions(state.chatTransition);
}

export function isChatTransitionPending(
  transition: ChatTransition | null | undefined,
): boolean {
  return Boolean(
    transition &&
      (transition.phase === "loading" ||
        transition.phase === "applying" ||
        transition.phase === "restoring"),
  );
}

export function isChatTransitionBlockingInteractions(
  transition: ChatTransition | null | undefined,
): boolean {
  if (!transition) return false;
  if (transition.phase === "error") return true;
  return transition.displayMode !== "background" &&
    isChatTransitionPending(transition);
}

export function isCurrentChatTransition(
  state: Pick<AppState, "chatTransition">,
  seq: number,
  targetChatId: string,
): boolean {
  const transition = state.chatTransition;
  return Boolean(
    transition &&
      transition.seq === seq &&
      transition.targetChatId === String(targetChatId || "").trim(),
  );
}
