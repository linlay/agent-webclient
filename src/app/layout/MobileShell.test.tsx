/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TextDecoder, TextEncoder } from "node:util";
Object.assign(globalThis, { TextEncoder, TextDecoder, IS_REACT_ACT_ENVIRONMENT: true });
if (typeof globalThis.Request === "undefined") {
  class TestRequest {
    readonly url: string;
    readonly method: string;
    readonly signal?: AbortSignal;
    constructor(input: string | URL | { url: string }, init?: RequestInit) {
      this.url = typeof input === "string" || input instanceof URL ? String(input) : input.url;
      this.method = init?.method || "GET";
      this.signal = init?.signal || undefined;
    }
  }
  Object.assign(globalThis, { Request: TestRequest });
}
const { createMemoryRouter, RouterProvider } = require("react-router-dom");
const { MobileShell } = require("./MobileShell");
let mockMounts = 0;
const mockState = { chatId: "" };
jest.mock("@/app/state/AppContext", () => ({ useAppState: () => mockState }));
jest.mock("./AppShell", () => ({
  AppShell: ({ targetChatId }: { targetChatId?: string }) => {
    const React = require("react");
    const { Outlet } = require("react-router-dom");
    React.useEffect(() => { mockMounts++; }, []);
    return React.createElement("div", { "data-target": targetChatId || "" },
      React.createElement("input", { defaultValue: "unfinished draft" }), React.createElement(Outlet));
  },
}));
// Keep the existing validation behavior without importing an unrelated shell runtime.
jest.mock("./AgentChatShell", () => ({
  parseNewChatTimestamp: (value: string) => /^[1-9]\d{12}$/.test(value || "") ? value : "",
  parseComposerPrefillPayload: (params: URLSearchParams) => params.has("composerDraft") ? { draft: params.get("composerDraft") } : null,
}));
let root: Root;
let container: HTMLDivElement;
let router: ReturnType<typeof createMemoryRouter>;
async function render(path = "/mobile?chatId=chat-a") {
  router = createMemoryRouter([{ path: "/mobile", element: React.createElement(MobileShell), children: [
    { path: "agents", element: React.createElement("div", null, "Agent management") },
  ] }], { initialEntries: [path] });
  await act(async () => root.render(React.createElement(RouterProvider, { router })));
}
beforeEach(() => { mockMounts = 0; mockState.chatId = ""; container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => { root.unmount(); router?.dispose(); }); container.remove(); });

it("retains the conversation target, composer node and draft across management navigation and back", async () => {
  await render();
  const input = container.querySelector("input")!;
  input.value = "draft with attachments pending";
  await act(async () => router.navigate("/mobile/agents"));
  expect(container.textContent).toContain("Agent management");
  expect(container.querySelector("[data-target]")?.getAttribute("data-target")).toBe("chat-a");
  await act(async () => router.navigate(-1));
  expect(container.querySelector("input")).toBe(input);
  expect(input.value).toBe("draft with attachments pending");
  expect(mockMounts).toBe(1);
});
it("returns history selection to the mobile conversation and clears stale route parameters", async () => {
  await render("/mobile?chatId=chat-a&lang=en-US");
  await act(async () => router.navigate("/mobile/agents"));
  await act(async () => window.dispatchEvent(new CustomEvent("agent:load-chat", { detail: { chatId: "chat-b", agentKey: "stale-owner" } })));
  expect(router.state.location.pathname).toBe("/mobile");
  expect(router.state.location.search).toBe("?lang=en-US&chatId=chat-b");
  expect(mockMounts).toBe(1);
});
it("removes the old target before Worker selection can activate another conversation", async () => {
  await render();
  await act(async () => window.dispatchEvent(new CustomEvent("agent:select-worker", { detail: { workerKey: "agent:other" } })));
  expect(router.state.location.search).toBe("");
  expect(container.querySelector("[data-target]")?.getAttribute("data-target")).toBe("");
});
it("consumes management conversation prefill once without sending a message", async () => {
  const onNewChat = jest.fn();
  const onSend = jest.fn();
  window.addEventListener("agent:start-new-conversation", onNewChat);
  window.addEventListener("agent:send-message", onSend);
  try {
    await render("/mobile?agentKey=demo&newChat=1794787200000&composerDraft=hello");
    expect(onNewChat).toHaveBeenCalledTimes(1);
    expect(onNewChat.mock.calls[0][0].detail).toMatchObject({ agentKey: "demo", composerDraft: "hello", references: [] });
    expect(router.state.location.search).toBe("");
    expect(onSend).not.toHaveBeenCalled();
  } finally {
    window.removeEventListener("agent:start-new-conversation", onNewChat);
    window.removeEventListener("agent:send-message", onSend);
  }
});
