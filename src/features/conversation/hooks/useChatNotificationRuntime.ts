import { useEffect } from "react";
import type { Dispatch } from "react";
import type { AppAction } from "@/app/state/AppContext";
import type { AppState } from "@/app/state/AppContext";
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
    // A connection attempt that failed before the first connect (for example a
    // retired Desktop Session at startup) already failed its loads, so the first
    // successful connect after it recovers like a reconnect.
    let attempted = previousStatus === "connecting";
    let failedAttempt = false;
    return realtime.subscribeStatus((status) => {
      const nextStatus = status === "disposed" ? "disconnected" : status;
      options.dispatch({ type: "SET_WS_STATUS", status: nextStatus });
      if (nextStatus === "connected") {
        if ((hasConnected || failedAttempt) && previousStatus !== "connected") {
          options.onReconnect(options.stateRef.current);
        }
        hasConnected = true;
        failedAttempt = false;
        options.dispatch({ type: "SET_WS_ERROR_MESSAGE", message: "" });
      } else if (nextStatus === "connecting") {
        attempted = true;
      } else if (attempted && !hasConnected) {
        failedAttempt = true;
      }
      previousStatus = nextStatus;
    });
  }, [options.dispatch, options.onReconnect, options.stateRef, realtime]);
}
