/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ARTIFACT_DRAG_GLOBAL } from "@/shared/contracts/generated/agentWebclientBridge";
import { useDesktopArtifactDrag } from "./useDesktopArtifactDrag";
let root: Root, container: HTMLDivElement;
const prepare = jest.fn(), start = jest.fn(), notify = jest.fn();
function Probe({ chat = "chat", artifact = "artifact" }: { chat?: string; artifact?: string }) {
  const drag = useDesktopArtifactDrag(chat, artifact || undefined, "@chat/artifacts/run/a.txt", true, notify);
  return <div data-state={drag.status} {...drag.props} />;
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  prepare.mockReset(); start.mockReset(); notify.mockReset();
  prepare.mockResolvedValue({ ok: true, token: "lease", expiresAt: Date.now() + 10000 });
  Object.defineProperty(window, ARTIFACT_DRAG_GLOBAL, { configurable: true, value: { version: 1, prepare, start } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  act(() => root.render(<Probe />));
});
afterEach(() => { act(() => root.unmount()); container.remove(); Reflect.deleteProperty(window, ARTIFACT_DRAG_GLOBAL); });
async function hover() { await act(async () => { container.firstChild!.dispatchEvent(new Event("pointerover", { bubbles: true })); }); }
async function drag() { const event = new Event("dragstart", { bubbles: true, cancelable: true }); await act(async () => { container.firstChild!.dispatchEvent(event); }); return event; }
it("prepares an identity before dragstart and starts synchronously with an opaque token", async () => {
  await hover(); expect(prepare).toHaveBeenCalledWith({ chatId: "chat", artifactId: "artifact", runId: "run" });
  expect((await drag()).defaultPrevented).toBe(true); expect(start).toHaveBeenCalledWith("lease");
  expect(container.firstElementChild!.getAttribute("data-state")).toBe("idle");
});
it("never waits for an unfinished network request inside the native drag gesture", async () => {
  let resolve!: (value: unknown) => void;
  prepare.mockReturnValue(new Promise(done => { resolve = done; }));
  await hover(); await drag(); expect(start).not.toHaveBeenCalled(); expect(notify).toHaveBeenCalledWith("preparing");
  await act(async () => resolve({ ok: true, token: "ready", expiresAt: Date.now() + 10000 }));
  await drag(); expect(start).toHaveBeenCalledWith("ready");
});
it("ignores late preparation results after Chat switching", async () => {
  let resolve!: (value: unknown) => void;
  prepare.mockReturnValue(new Promise(done => { resolve = done; })); await hover();
  act(() => root.render(<Probe chat="other" />));
  await act(async () => resolve({ ok: true, token: "stale", expiresAt: Date.now() + 10000 }));
  await drag(); expect(start).not.toHaveBeenCalled();
});
it("keeps browser and non-artifact attachments out of native export", async () => {
  act(() => root.render(<Probe artifact="" />)); await hover(); await drag(); expect(prepare).not.toHaveBeenCalled(); expect(start).not.toHaveBeenCalled();
  Reflect.deleteProperty(window, ARTIFACT_DRAG_GLOBAL);
  act(() => root.render(<Probe />)); expect(container.firstElementChild!.hasAttribute("draggable")).toBe(false);
});
it("reports failed preparation and retries instead of exporting a URL", async () => {
  prepare.mockResolvedValueOnce({ ok: false }); await hover(); await drag();
  expect(notify).toHaveBeenCalledWith("failed"); expect(start).not.toHaveBeenCalled();
  await act(async () => {}); expect(prepare).toHaveBeenCalledTimes(2);
});

it("does not restore a consumed lease when pointer-down preparation finishes after dragstart", async () => {
  await hover();
  let resolve!: (value: unknown) => void;
  prepare.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  await act(async () => { container.firstChild!.dispatchEvent(new Event("pointerdown", { bubbles: true })); });
  await drag(); expect(start).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ ok: true, token: "lease", expiresAt: Date.now() + 10000 }));
  await drag(); expect(start).toHaveBeenCalledTimes(1);
});
