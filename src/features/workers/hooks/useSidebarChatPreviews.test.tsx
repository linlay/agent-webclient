/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { createInitialState } from "@/app/state/state";
import { getChats } from "@/shared/data";
import { useSidebarChatPreviews } from "./useSidebarChatPreviews";

const mockStateRef = { current: createInitialState() };
const mockDispatch = jest.fn((action) => { if (action.type === "SET_CHATS") mockStateRef.current.chats = action.chats; });
jest.mock("@/app/state/AppContext", () => ({ useAppContext: () => ({ stateRef: mockStateRef, dispatch: mockDispatch }) }));
jest.mock("@/shared/data", () => ({ getChats: jest.fn() }));
const request = jest.mocked(getChats);
let latest: ReturnType<typeof useSidebarChatPreviews>;
function Harness({ catalog = "one" }: { catalog?: string }) { latest = useSidebarChatPreviews(true, catalog); return null; }
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("sidebar preview pagination", () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  beforeEach(() => {
    jest.clearAllMocks(); mockStateRef.current = createInitialState(); mockStateRef.current.chatPinnedOrder = [];
    host = document.createElement("div"); root = createRoot(host);
    request.mockImplementation(async options => ({ code: 0, msg: "", data: Array.from({ length: options?.limit || 0 }, (_, i) => ({ chatId: `chat-${i}`, agentKey: options?.agentKey || "general", updatedAt: 100 + i })) }));
  });
  afterEach(async () => { await act(async () => root.unmount()); });

  it("expands general previews by eight and project previews by five with bounded limits", async () => {
    await act(async () => root.render(<Harness />));
    expect(request).toHaveBeenLastCalledWith({ hasWorkspace: false, pinned: false, limit: 9 });
    expect(latest.moreAvailable.general).toBe(true);
    await act(async () => latest.showMore("general"));
    expect(latest.limits.general).toBe(16);
    await act(async () => latest.showMore("general"));
    expect(latest.limits.general).toBe(24);
    await act(async () => latest.showMore("agent:project"));
    expect(request).toHaveBeenLastCalledWith({ agentKey: "project", pinned: false, limit: 11 });
    await act(async () => latest.showMore("agent:project"));
    await act(async () => latest.showMore("agent:project"));
    expect(latest.limits["agent:project"]).toBe(20);
  });

  it("ignores old catalog responses and keeps a pin applied during a request", async () => {
    let complete: (value: any) => void = () => undefined;
    request.mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
    await act(async () => root.render(<Harness catalog="old" />));
    await act(async () => root.render(<Harness catalog="new" />));
    mockDispatch.mockClear();
    await act(async () => complete({ data: [{ chatId: "stale" }] }));
    expect(mockDispatch).not.toHaveBeenCalled();
    request.mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
    await act(async () => latest.showMore("general"));
    mockStateRef.current.chatPinnedOrder = ["new-pin"];
    await act(async () => complete({ data: [{ chatId: "new-pin", pinned: false }] }));
    expect(mockStateRef.current.chats.find(chat => chat.chatId === "new-pin")?.pinned).toBe(true);
  });

  it("leaves the previous preview usable on failure and retries the failed expansion", async () => {
    await act(async () => root.render(<Harness />));
    request.mockRejectedValueOnce(new Error("offline"));
    await act(async () => latest.showMore("general"));
    expect(latest.limits.general).toBe(8);
    expect(latest.errors.general).toBe("offline");
    expect(mockStateRef.current.chats).toHaveLength(9);
    await act(async () => latest.retry("general"));
    expect(request).toHaveBeenLastCalledWith({ hasWorkspace: false, pinned: false, limit: 17 });
    expect(latest.limits.general).toBe(16);
    expect(latest.errors.general).toBe("");
  });

  it("keeps a project named general distinct from the general chat section", async () => {
    await act(async () => root.render(<Harness />));
    await act(async () => latest.showMore("agent:general"));
    expect(request).toHaveBeenLastCalledWith({ agentKey: "general", pinned: false, limit: 11 });
    expect(latest.limits.general).toBe(8);
    expect(latest.limits["agent:general"]).toBe(10);
  });
});
