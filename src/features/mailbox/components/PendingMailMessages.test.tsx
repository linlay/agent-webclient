/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { resolveStorageIdentity } from "@/shared/data/auth/storageIdentity";
import { PendingMailMessages } from "./PendingMailMessages";
import { putUserOutbox, readUserOutbox, removeUserOutbox } from "../lib/userOutbox";

const mockDispatch = jest.fn();
const mockT = (key: string) => key;
let mockBackendMode = "platform";
let mockState: Record<string, unknown> = {};

jest.mock("@/app/state/AppContext", () => ({
  useAppState: () => mockState,
  useAppDispatch: () => mockDispatch,
}));
jest.mock("@/shared/config/backendMode", () => ({ getBackendMode: () => mockBackendMode }));
// Keep `t` referentially stable: the recovery effect depends on it and would
// otherwise re-run on every published outbox patch.
jest.mock("@/shared/i18n", () => ({
  useI18n: () => ({ t: mockT }),
}));
jest.mock("@/shared/data/api/requests/mailbox", () => ({
  getMails: jest.fn(async () => ({ data: { mails: [], total: 0 } })),
  getMailDetail: jest.fn(async () => { throw new Error("unexpected detail read"); }),
}));

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  window.localStorage.clear();
  mockDispatch.mockClear();
  mockBackendMode = "platform";
  mockState = {
    accessToken: "token",
    chatId: "chat-1",
    wsStatus: "connected",
    timelineNodes: new Map(),
    workerIndexByKey: new Map(),
    workerSelectionKey: "",
    pendingNewChatAgentKey: "",
  };
});

describe("PendingMailMessages", () => {
  const scope = () => resolveStorageIdentity("token");

  afterEach(() => {
    for (const entry of readUserOutbox(scope())) {
      removeUserOutbox(scope(), entry.request.requestId);
    }
  });

  it("renders an undelivered entry with its status, error and recovery actions", async () => {
    putUserOutbox({
      scope: scope(),
      createdAt: 1,
      undelivered: true,
      error: "请求无效",
      request: { requestId: "req-1", chatId: "chat-1", agentKey: "agent", message: "你好" },
    });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => { root.render(<PendingMailMessages />); });

    expect(host.textContent).toContain("你好");
    expect(host.textContent).toContain("mailbox.outbox.undelivered");
    expect(host.textContent).toContain("请求无效");
    expect(host.querySelectorAll("button")).toHaveLength(2);
    expect(host.querySelector('[role="alert"]')).not.toBeNull();

    const sent: CustomEvent[] = [];
    const listener = (event: Event) => sent.push(event as CustomEvent);
    window.addEventListener("agent:send-message", listener);
    await act(async () => { host.querySelector("button")?.click(); });
    window.removeEventListener("agent:send-message", listener);

    expect(sent).toHaveLength(1);
    expect(sent[0].detail).toEqual(expect.objectContaining({ requestId: "req-1", message: "你好" }));
    expect(sent[0].detail.submissionRequestId).not.toBe("req-1");
    expect(readUserOutbox(scope())).toHaveLength(0);

    await act(async () => root.unmount());
    host.remove();
  });

  it("offers no actions for an entry whose delivery is still unconfirmed", async () => {
    putUserOutbox({
      scope: scope(),
      createdAt: 1,
      uncertain: true,
      request: { requestId: "req-2", chatId: "chat-1", agentKey: "agent", message: "在吗" },
    });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => { root.render(<PendingMailMessages />); });

    expect(host.textContent).toContain("mailbox.outbox.uncertain");
    expect(host.querySelectorAll("button")).toHaveLength(0);

    await act(async () => root.unmount());
    host.remove();
  });

  it("stays hidden for Gateway, which has no /api/send delivery path", async () => {
    mockBackendMode = "gateway";
    putUserOutbox({
      scope: scope(),
      createdAt: 1,
      undelivered: true,
      request: { requestId: "req-3", chatId: "chat-1", agentKey: "agent", message: "你好" },
    });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => { root.render(<PendingMailMessages />); });

    expect(host.innerHTML).toBe("");

    await act(async () => root.unmount());
    host.remove();
  });
});
