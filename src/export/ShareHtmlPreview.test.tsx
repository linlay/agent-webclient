/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ShareHtmlPreview } from "./ShareHtmlPreview";
import type { SnapshotAttachmentV1 } from "./conversationSnapshotV1";
import { buildShareAttachmentLinks } from "./shareAttachmentLinks";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, TextDecoder: require("util").TextDecoder });
const html: SnapshotAttachmentV1 = { id: "1".repeat(24), sourceRef: "report.html", name: "report.html", mimeType: "text/html", mediaRefs: { "image.png": "2".repeat(24), "missing.png": "4".repeat(24) } };
const image: SnapshotAttachmentV1 = { id: "2".repeat(24), sourceRef: "image.png", name: "image.png", mimeType: "image/png" };
const unrelated = { ...image, id: "3".repeat(24) };
const files = [html, image, unrelated];
const omissions = [{ id: "4".repeat(24), sourceRef: "missing.png", name: "missing.png", reason: "not_found" as const }];
let host: HTMLDivElement, root: Root;
const originalFetch = globalThis.fetch;
const response = (type: string, bytes = new ArrayBuffer(1)) => ({ ok: true, headers: new Headers({ "content-type": type }), arrayBuffer: async () => bytes });
const links = buildShareAttachmentLinks("/share/probe", html.id, window.location.origin);
let fetchMock: jest.Mock;

beforeEach(() => {
  window.history.replaceState({}, "", "/share/probe");
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  fetchMock = jest.fn().mockResolvedValueOnce(response("text/html")).mockResolvedValueOnce(response("image/png"));
  globalThis.fetch = fetchMock;
});
afterEach(() => { act(() => root.unmount()); host.remove(); globalThis.fetch = originalFetch; });
function render() { act(() => root.render(<ShareHtmlPreview attachment={html} attachments={files} omittedResources={omissions} links={links} locale="en-US" />)); return host.querySelector("iframe")!; }
function ready(frame: HTMLIFrameElement, port: { postMessage: jest.Mock; close: jest.Mock }, origin = "null", source: Window | null = frame.contentWindow) {
  window.dispatchEvent(new MessageEvent("message", { origin, source, data: { type: "conversation-html-ready" }, ports: [port as unknown as MessagePort] }));
}

it("requires the current opaque frame and transfers only mapped resources exactly once", async () => {
  const frame = render();
  const port = { postMessage: jest.fn(), close: jest.fn() };
  act(() => frame.dispatchEvent(new Event("load")));
  await act(async () => { ready(frame, port, window.location.origin); ready(frame, port, "null", window); });
  expect(fetchMock).not.toHaveBeenCalled();
  await act(async () => ready(frame, port));
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([`/share/probe/attachments/${html.id}/download`, `/share/probe/attachments/${image.id}/download`]);
  expect(port.postMessage).toHaveBeenCalledTimes(1);
  const payload = port.postMessage.mock.calls[0][0];
  expect(payload.media.map((item: { id: string }) => item.id)).toEqual([image.id]);
  expect(payload.missing).toEqual([["4".repeat(24), "File not found"]]);
  expect(port.close).toHaveBeenCalled();
  await act(async () => ready(frame, port));
  expect(port.postMessage).toHaveBeenCalledTimes(1);
  expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
  expect(frame.src).toContain("?embed=1");
});

it("aborts an in-flight delivery on navigation and does not deliver to the replacement document", async () => {
  let finish!: (value: unknown) => void;
  fetchMock.mockReset().mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const frame = render();
  const port = { postMessage: jest.fn(), close: jest.fn() };
  act(() => frame.dispatchEvent(new Event("load")));
  await act(async () => ready(frame, port));
  const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
  act(() => frame.dispatchEvent(new Event("load")));
  expect(signal.aborted).toBe(true);
  expect(frame.isConnected).toBe(false);
  await act(async () => finish(response("text/html")));
  expect(port.postMessage).not.toHaveBeenCalled();
  expect(host.textContent).toContain("cannot be displayed");
  expect(host.querySelector("a")?.getAttribute("href")).toBe(links.download);
});

it("removes its frame and cancels reads when closed", async () => {
  fetchMock.mockReset().mockImplementation(() => new Promise(() => undefined));
  const frame = render(); const port = { postMessage: jest.fn(), close: jest.fn() };
  act(() => frame.dispatchEvent(new Event("load")));
  await act(async () => ready(frame, port));
  const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
  act(() => root.render(null));
  expect(signal.aborted).toBe(true);
  expect(port.close).toHaveBeenCalled();
  expect(frame.isConnected).toBe(false);
});
