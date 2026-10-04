/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { createInitialState } from "@/app/state/AppContext";
import { getChatSystemPrompt } from "@/shared/data";
import { EventPopover } from "./EventPopover";
import type { AgentEvent } from "@/shared/contracts/agentEvents";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let mockState: ReturnType<typeof createInitialState>;
const mockTranslate = (key: string) => key;
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: mockTranslate }) }));
jest.mock("@/app/state/AppContext", () => ({
  ...jest.requireActual("@/app/state/AppContext"),
  useAppState: () => mockState,
  useAppDispatch: () => jest.fn(),
}));
jest.mock("@/shared/data", () => ({ getChatSystemPrompt: jest.fn() }));
jest.mock("antd", () => ({ Popover: ({ children }: any) => children }));
jest.mock("./SystemPromptModal", () => ({
  SystemPromptModal: ({ open, loadState, onClose }: any) => open ? <section data-testid="prompt" data-status={loadState.status}>
    {loadState.text}<button onClick={onClose}>close-prompt</button>
  </section> : null,
}));

test("streaming debug events do not reload an open run prompt or replace its content", async () => {
  const event = { type: "run.start", chatId: "chat", runId: "run", agentKey: "agent" } as AgentEvent;
  mockState = { ...createInitialState(), eventPopoverIndex: 0, eventPopoverEventRef: event, debugEvents: [event] };
  const request = jest.mocked(getChatSystemPrompt);
  let resolveRequest!: (value: any) => void;
  request.mockImplementation(() => new Promise(resolve => { resolveRequest = resolve; }));
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const render = () => act(async () => root.render(<EventPopover />));
  const open = () => act(async () => (host.querySelector('[aria-label="eventPopover.action.systemPrompt"]') as HTMLButtonElement).click());
  const appendEvent = async () => {
    mockState = { ...mockState, debugEvents: [...mockState.debugEvents, { type: "content.delta", runId: "later-run", data: { text: "next chunk" } } as AgentEvent] };
    await render();
  };
  try {
    await render(); await open();
    expect(request).toHaveBeenCalledTimes(1);
    await appendEvent();
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => resolveRequest({ data: { systemMessage: { content: "Stable system prompt" } } }));
    const content = host.querySelector('[data-testid="prompt"]')!;
    expect(content.getAttribute("data-status")).toBe("ready");
    await appendEvent(); await appendEvent();
    expect(request).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[data-testid="prompt"]')).toBe(content);
    expect(content.textContent).toContain("Stable system prompt");
    expect(content.getAttribute("data-status")).toBe("ready");
    await act(async () => (content.querySelector("button") as HTMLButtonElement).click());
    await open();
    expect(request).toHaveBeenCalledTimes(2);
  } finally { act(() => root.unmount()); host.remove(); }
});

test("event details and collection controls stay frozen until the event is reopened", async () => {
  const event = { type: "content.start", runId: "run", contentId: "content", data: { text: "initial" } } as AgentEvent;
  mockState = { ...createInitialState(), eventPopoverIndex: 0, eventPopoverEventRef: event, debugEvents: [event] };
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const render = () => act(async () => root.render(<EventPopover />));
  const collect = () => host.querySelector('[aria-label="eventPopover.action.collectSnapshot"]');
  try {
    await render();
    const body = host.querySelector("pre")!;
    const initialText = body.textContent;
    expect(collect()).toBeNull();
    mockState = { ...mockState, debugEvents: [event, { ...event, type: "content.end", data: { text: "completed" } } as AgentEvent] };
    await render();
    expect(collect()).toBeNull();
    expect(host.querySelector("pre")).toBe(body);
    expect(body.textContent).toBe(initialText);
    mockState = { ...mockState, eventPopoverIndex: -1, eventPopoverEventRef: null };
    await render();
    mockState = { ...mockState, eventPopoverIndex: 0, eventPopoverEventRef: event };
    await render();
    expect(collect()).not.toBeNull();
  } finally { act(() => root.unmount()); host.remove(); }
});
