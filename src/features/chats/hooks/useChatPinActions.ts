import { useCallback, useRef } from "react";
import { useAppContext } from "@/app/state/AppContext";
import { putChatOrder, type UpdateChatOrderRequest } from "@/shared/data";

export function useChatPinActions() {
  const { state, stateRef, dispatch } = useAppContext();
  const pendingRef = useRef(false);
  const update = useCallback(async (request: UpdateChatOrderRequest) => {
    if (pendingRef.current || stateRef?.current.chatPinningPending) return;
    pendingRef.current = true;
    dispatch({ type: "SET_CHAT_PINNING_PENDING", pending: true });
    try {
      const response = await putChatOrder(request);
      if (!Array.isArray(response.data?.pinnedOrder)) {
        throw new Error("Chat pinning is unavailable");
      }
      dispatch({ type: "SET_CHAT_PINNING", order: response.data.pinnedOrder });
    } finally {
      pendingRef.current = false;
      dispatch({ type: "SET_CHAT_PINNING_PENDING", pending: false });
      // Also reconcile uncertain writes and replenish the owner's preview.
      window.dispatchEvent(new CustomEvent("agent:refresh-worker-data"));
    }
  }, [dispatch, stateRef]);
  return { update, pending: state.chatPinningPending };
}
