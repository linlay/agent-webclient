/** @jest-environment jsdom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useViewPreviewPublisher, useViewPreviewTransfer } from "./useViewPreviewTransfer";
import type { TimelineNode } from "@/features/timeline/lib/timelineState";

class Channel {
  static channels = new Set<Channel>();
  onmessage: ((event: { data: any }) => void) | null = null;
  closed = false;
  constructor(readonly name: string) { Channel.channels.add(this); }
  postMessage(data: unknown) {
    for (const other of Channel.channels) if (other !== this && other.name === this.name)
      queueMicrotask(() => { if (!other.closed) other.onmessage?.({ data }); });
  }
  close() { this.closed = true; Channel.channels.delete(this); }
}
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const original = globalThis.BroadcastChannel;
const address = { chatId: "chat", runId: "run", sourceId: "content-id", viewIndex: "0" };
const view = { source: "connector" as const, connectorId: "crm", key: "orders", hash: "a".repeat(64) };
function nodes(value: number): Map<string, TimelineNode> {
  return new Map([["counter-99", { id: "counter-99", kind: "content", contentId: "content-id", ts: 1, runId: "run",
    segments: [{ kind: "view", index: 0, closed: true, payloadRaw: JSON.stringify({ value }) }], viewBindings: { 0: { index: 0, view } } }]]);
}
function Publisher({ value, chatId = "chat" }: { value: number; chatId?: string }) { useViewPreviewPublisher(chatId, nodes(value)); return null; }
function Viewer() { const content = useViewPreviewTransfer(address); return <output>{content?.payloadRaw}</output>; }

beforeEach(() => { Object.defineProperty(globalThis, "BroadcastChannel", { configurable: true, value: Channel }); });
afterEach(() => { Object.defineProperty(globalThis, "BroadcastChannel", { configurable: true, value: original }); expect(Channel.channels.size).toBe(0); });

test("View data follows its source across updates and publisher remounts, and releases on close", async () => {
  const source = document.createElement("div"), target = document.createElement("div");
  const publisher = createRoot(source), viewer = createRoot(target);
  try {
    await act(async () => publisher.render(<Publisher value={1} />));
    await act(async () => viewer.render(<Viewer />));
    expect(target.textContent).toBe('{"value":1}');
    await act(async () => publisher.render(<Publisher value={2} />));
    expect(target.textContent).toBe('{"value":2}');
    await act(async () => publisher.render(<Publisher value={3} chatId="other" />));
    expect(target.textContent).toBe('{"value":2}');
    await act(async () => publisher.render(<Publisher value={4} />));
    expect(target.textContent).toBe('{"value":4}');
    await act(async () => publisher.render(null));
    await act(async () => publisher.render(<Publisher value={5} />));
    expect(target.textContent).toBe('{"value":5}');
  } finally { await act(async () => { viewer.unmount(); publisher.unmount(); }); }
});
