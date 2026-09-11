/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import type { AppState } from "@/app/state/AppContext";
import type { PushFrame, RealtimeConnectionStatus } from "@/features/transport/contracts/realtimeTransport";
import { useChatNotificationRuntime } from "./useChatNotificationRuntime";
import { refreshCurrentChatAfterWsReconnect } from "./useConversationWsRuntime";

const mockUnsubscribePush = jest.fn();
const mockUnsubscribeStatus = jest.fn();
let mockOnPush: (frame: PushFrame) => void;
let mockOnStatus: (status: RealtimeConnectionStatus) => void;
const mockPush = {
  subscribe: jest.fn((_filter, listener) => {
    mockOnPush = listener;
    return mockUnsubscribePush;
  }),
};
const mockRealtime = {
  getStatus: () => "disconnected",
  subscribeStatus: jest.fn((listener) => {
    mockOnStatus = listener;
    return mockUnsubscribeStatus;
  }),
};
jest.mock("@/features/transport/hooks/useRealtimeTransport", () => ({
  usePushTransport: () => mockPush,
  useRealtimeTransport: () => mockRealtime,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("delivers pushes once and refreshes the latest observed chat only after reconnect, then unsubscribes", () => {
  const dispatch = jest.fn();
  const onPush = jest.fn();
  const stateRef = { current: { chatId: "chat_old", runId: "run_old" } as AppState };
  const reload = jest.fn();
  window.addEventListener("agent:load-chat", reload);
  const root = createRoot(document.createElement("div"));
  function Runtime() {
    useChatNotificationRuntime({ dispatch, stateRef, onPush, onReconnect: refreshCurrentChatAfterWsReconnect });
    return null;
  }
  try {
    act(() => root.render(React.createElement(Runtime)));
    const frame: PushFrame = { frame: "push", type: "chat.renamed", chatId: "chat_old", chatName: "Renamed" };
    mockOnPush(frame);
    expect(onPush).toHaveBeenCalledTimes(1);
    expect(onPush).toHaveBeenCalledWith(frame);
    mockOnStatus("connected");
    expect(reload).not.toHaveBeenCalled();
    stateRef.current = { chatId: "chat_latest", runId: "run_latest" } as AppState;
    mockOnStatus("reconnecting");
    mockOnStatus("connected");
    mockOnStatus("connected");
    expect(reload).toHaveBeenCalledTimes(1);
    expect(reload.mock.calls[0][0].detail).toEqual({ chatId: "chat_latest" });
    expect(dispatch).toHaveBeenCalledWith({ type: "SET_WS_ERROR_MESSAGE", message: "" });
    stateRef.current = { chatId: "chat_idle" } as AppState;
    mockOnStatus("disconnected");
    mockOnStatus("connected");
    expect(reload).toHaveBeenCalledTimes(1);
    mockOnStatus("disposed");
    expect(dispatch).toHaveBeenLastCalledWith({ type: "SET_WS_STATUS", status: "disconnected" });
  } finally {
    act(() => root.unmount());
    window.removeEventListener("agent:load-chat", reload);
  }
  expect(mockUnsubscribePush).toHaveBeenCalledTimes(1);
  expect(mockUnsubscribeStatus).toHaveBeenCalledTimes(1);
});
