/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { useChatPreview } from "./useChatPreview";
import { createChatPreviewRuntime, type ChatPreviewState } from "@/features/conversation/lib/chatPreviewRuntime";
import { DESKTOP_LIVE_SURFACE_ACTIVE_EVENT } from "@/shared/data/desktop/desktopSurfaceLifecycle";
const transport = { kind: "desktop", isSurfaceActive: () => true };
jest.mock("@/features/transport/hooks/useRealtimeTransport", () => ({ useRealtimeTransport: () => transport }));
jest.mock("@/features/conversation/lib/chatPreviewRuntime", () => ({ createChatPreviewRuntime: jest.fn() }));
it("conceals the previous Chat on route changes and releases each runtime on cleanup", () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const runtimes: Array<{ dispose: jest.Mock; reload: jest.Mock; setActive: jest.Mock }> = [];
  const renders: Array<string> = [];
  jest.mocked(createChatPreviewRuntime).mockImplementation(input => {
    const runtime = { dispose: jest.fn(), reload: jest.fn(), setActive: jest.fn() };
    runtimes.push(runtime);
    input.onChange({ loading: false, error: "", active: true, connection: "connected", snapshot: { chat: { chatId: input.chatId } } } as ChatPreviewState);
    return runtime;
  });
  function Harness({ chatId, live = true }: { chatId: string; live?: boolean }) {
    const { state } = useChatPreview(chatId, live);
    renders.push(`${chatId}:${state?.snapshot?.chat.chatId || "empty"}`);
    return React.createElement("div", null, state?.snapshot?.chat.chatId);
  }
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => root.render(React.createElement(Harness, { chatId: "A" })));
  act(() => root.render(React.createElement(Harness, { chatId: "B" })));
  expect(renders).toContain("B:empty");
  expect(renders).not.toContain("B:A");
  expect(runtimes[0].dispose).toHaveBeenCalledTimes(1);
  act(() => window.dispatchEvent(new CustomEvent(DESKTOP_LIVE_SURFACE_ACTIVE_EVENT, { detail: { active: false } })));
  expect(runtimes[1].setActive).toHaveBeenCalledWith(false);
  act(() => root.render(React.createElement(Harness, { chatId: "B", live: false })));
  expect(runtimes[1].dispose).toHaveBeenCalledTimes(1);
  act(() => root.unmount());
  expect(runtimes[2].dispose).toHaveBeenCalledTimes(1);
});
