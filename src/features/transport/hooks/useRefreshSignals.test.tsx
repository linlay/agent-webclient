/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { usePushSignal, useReconnectSignal } from "./useRefreshSignals";
import type { PushFrame, StatusListener } from "../contracts/realtimeTransport";
let mockStatus: StatusListener;
let mockPush: (frame: PushFrame) => void;
const mockStop = jest.fn();
const mockTransport = { getStatus: () => "disconnected", subscribeStatus: jest.fn(listener => { mockStatus = listener; listener("disconnected"); return mockStop; }), push: { subscribe: jest.fn((_, listener) => { mockPush = listener; return mockStop; }) } };
jest.mock("./useRealtimeTransport", () => ({ useOptionalRealtimeTransport: () => mockTransport }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it("shares subscriptions, ignores initial connection and cleans up the last consumer", async () => {
  const reconnect = jest.fn(); const push = jest.fn();
  function Probe() { usePushSignal("catalog.updated", push); useReconnectSignal(reconnect); return null; }
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(<><Probe /><Probe /></>));
  expect(mockTransport.subscribeStatus).toHaveBeenCalledTimes(1);
  expect(mockTransport.push.subscribe).toHaveBeenCalledTimes(1);
  act(() => mockStatus("connected")); expect(reconnect).not.toHaveBeenCalled();
  act(() => { mockStatus("reconnecting"); mockStatus("connected"); mockStatus("connected"); });
  expect(reconnect).toHaveBeenCalledTimes(2);
  act(() => mockPush({ type: "catalog.updated", data: { reason: "skills" } })); expect(push).toHaveBeenCalledTimes(2);
  await act(async () => root.unmount()); expect(mockStop).toHaveBeenCalledTimes(2);
});
