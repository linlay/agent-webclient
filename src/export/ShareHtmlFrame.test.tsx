/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ShareHtmlFrame } from "./ShareHtmlFrame";
import type { ShareHtmlDelivery } from "./shareHtmlDocument";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let container: HTMLDivElement, root: Root;
const payload: ShareHtmlDelivery = { kind: "inline", html: "<p>safe</p>", viewportHeight: 360 };
const port = () => ({ onmessage: null as ((event: MessageEvent) => void) | null, postMessage: jest.fn(), close: jest.fn(), start: jest.fn() });
function ready(frame: HTMLIFrameElement, channel: ReturnType<typeof port>) {
  window.dispatchEvent(new MessageEvent("message", { origin: "null", source: frame.contentWindow, data: { type: "conversation-html-ready" }, ports: [channel as unknown as MessagePort] }));
}
beforeEach(() => { container = document.createElement("div"); document.body.append(container); root = createRoot(container); jest.useFakeTimers(); });
afterEach(() => { act(() => root.unmount()); container.remove(); jest.useRealTimers(); });
it("waits for rendered, validates sizes, and closes the document on navigation", async () => {
  const status = jest.fn(), size = jest.fn(), load = jest.fn().mockResolvedValue(payload), channel = port();
  act(() => root.render(<ShareHtmlFrame url="/preview" title="HTML" loadPayload={load} onStatus={status} onHeight={size} />));
  const frame = container.querySelector("iframe")!;
  act(() => frame.dispatchEvent(new Event("load")));
  expect(status).not.toHaveBeenCalledWith("ready");
  await act(async () => ready(frame, channel));
  expect(channel.postMessage).toHaveBeenCalledWith(payload, []);
  act(() => { channel.onmessage!({ data: { type: "size", height: Infinity } } as MessageEvent); channel.onmessage!({ data: { type: "size", height: 58 } } as MessageEvent); });
  expect(size.mock.calls).toEqual([[58]]);
  act(() => channel.onmessage!({ data: { type: "rendered" } } as MessageEvent));
  act(() => jest.advanceTimersByTime(15000));
  expect(status).toHaveBeenLastCalledWith("ready");
  act(() => frame.dispatchEvent(new Event("load")));
  expect(status).toHaveBeenLastCalledWith("error");
  expect(channel.close).toHaveBeenCalled();
  expect(load.mock.calls[0][0].aborted).toBe(true);
  expect(container.querySelector("iframe")).toBeNull();
});
it("times out after delivery if the bootstrap never reports rendered", async () => {
  const status = jest.fn(), channel = port();
  act(() => root.render(<ShareHtmlFrame url="/preview" title="HTML" loadPayload={async () => payload} onStatus={status} />));
  const frame = container.querySelector("iframe")!;
  act(() => frame.dispatchEvent(new Event("load")));
  await act(async () => ready(frame, channel));
  act(() => jest.advanceTimersByTime(15000));
  expect(status).toHaveBeenLastCalledWith("error");
  expect(channel.close).toHaveBeenCalled();
});
