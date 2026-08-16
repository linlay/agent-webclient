import { useEffect } from "react";
import type { Dispatch } from "react";
import type { AppAction } from "@/app/state/AppContext";
import type { AppState } from "@/app/state/types";
import type { WsPushFrame } from "@/features/transport/lib/wsClient";
import {
  usePushTransport,
  useRealtimeTransport,
} from "@/features/transport/hooks/useRealtimeTransport";

export function useChatNotificationRuntime(options: {
  dispatch: Dispatch<AppAction>;
  stateRef: { current: AppState };
  onPush: (frame: WsPushFrame) => void;
  onReconnect: (state: AppState) => void;
}): void {
  const push = usePushTransport();
  const realtime = useRealtimeTransport();

  useEffect(
    () => push.subscribe({ types: [] }, (frame) => options.onPush(frame as WsPushFrame)),
    [options.onPush, push],
  );

  useEffect(() => {
    let hasConnected = false;
    let previousStatus = realtime.getStatus();
    return realtime.subscribeStatus((status) => {
      const nextStatus = status === "disposed" ? "disconnected" : status;
      options.dispatch({ type: "SET_WS_STATUS", status: nextStatus });
      if (nextStatus === "connected") {
        if (hasConnected && previousStatus !== "connected") {
          options.onReconnect(options.stateRef.current);
        }
        hasConnected = true;
        options.dispatch({ type: "SET_WS_ERROR_MESSAGE", message: "" });
      }
      previousStatus = nextStatus;
    });
  }, [options.dispatch, options.onReconnect, options.stateRef, realtime]);
}
