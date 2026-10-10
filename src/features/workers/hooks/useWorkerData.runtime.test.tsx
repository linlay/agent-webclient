/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { createInitialState } from "@/app/state/state";
import { appReducer } from "@/app/state/reducer";
import type { AppAction } from "@/app/state/actions";
import { getAgents, getChatOrder, invalidateChatNavigationCache, setAccessToken } from "@/shared/data";
import { isAppMode } from "@/shared/utils/routing";
import { useWorkerData } from "./useWorkerData";

const mockStateRef = { current: createInitialState() };
const mockDispatch = jest.fn((action: AppAction) => {
  mockStateRef.current = appReducer(mockStateRef.current, action);
});
jest.mock("@/app/state/AppContext", () => ({
  useAppContext: () => ({ state: mockStateRef.current, stateRef: mockStateRef, dispatch: mockDispatch }),
}));
jest.mock("@/shared/data", () => ({
  getAgent: jest.fn(), getAgents: jest.fn(), getChats: jest.fn(), getChatOrder: jest.fn(),
  setAccessToken: jest.fn(), invalidateChatNavigationCache: jest.fn(),
}));
jest.mock("@/shared/utils/routing", () => ({
  ...jest.requireActual("@/shared/utils/routing"), isAppMode: jest.fn(),
}));

const requestAgents = jest.mocked(getAgents);
const requestPins = jest.mocked(getChatOrder);
const loadChat = jest.fn(async () => undefined);
const selectWorkerConversation = jest.fn(async () => undefined);
let runtime: ReturnType<typeof useWorkerData>;
function Harness({ enabled = true }: { enabled?: boolean }) {
  runtime = useWorkerData({ loadChat, selectWorkerConversation, initialRefreshEnabled: enabled });
  return null;
}
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("worker data initialization and refresh", () => {
  let root: ReturnType<typeof createRoot>;
  beforeEach(() => {
    jest.clearAllMocks();
    mockStateRef.current = createInitialState();
    window.history.replaceState(null, "", "/");
    jest.mocked(isAppMode).mockReturnValue(false);
    root = createRoot(document.createElement("div"));
    requestPins.mockResolvedValue({ code: 0, msg: "", data: { pinnedChats: [
      { chatId: "pinned", agentKey: "zenmi", chatName: "Pinned", pinned: true },
    ] } });
    requestAgents.mockImplementation(async options => ({ code: 0, msg: "", data: options?.hasWorkspace
      ? [{ key: "project", name: "Project", workspaceDir: "/work/project", chats: [{ chatId: "project-chat", chatName: "Project chat" }] }]
      : [{ key: "zenmi", name: "Zenmi", chats: [{ chatId: "general-chat", chatName: "General chat" }] }],
    }));
  });
  afterEach(async () => { await act(async () => root.unmount()); });

  it("requests pins and both Agent catalogs on a fresh mount and populates the navigation", async () => {
    await act(async () => root.render(<Harness />));
    expect(requestPins).toHaveBeenCalledTimes(1);
    expect(requestAgents.mock.calls.map(([options]) => options)).toEqual([
      { scope: "nav", includeChats: 5, chatsPinned: false, hasWorkspace: false },
      { scope: undefined, includeChats: 5, chatsPinned: false, hasWorkspace: true },
    ]);
    expect(mockStateRef.current.agents.map(agent => agent.key)).toEqual(["zenmi", "project"]);
    expect(mockStateRef.current.workerRows.map(row => row.key)).toEqual(["agent:zenmi", "agent:project"]);
    expect(mockStateRef.current.chats).toEqual(expect.arrayContaining([
      expect.objectContaining({ chatId: "general-chat", agentKey: "zenmi" }),
      expect.objectContaining({ chatId: "project-chat", agentKey: "project" }),
      expect.objectContaining({ chatId: "pinned", pinned: true }),
    ]));
    expect(mockStateRef.current.chatPinnedOrder).toEqual(["pinned"]);
    expect(mockStateRef.current.sidebarPendingRequestCount).toBe(0);
    await act(async () => root.render(<Harness />));
    expect(requestPins).toHaveBeenCalledTimes(1);
  });

  it("waits for the app token and enabled initialization before requesting", async () => {
    jest.mocked(isAppMode).mockReturnValue(true);
    await act(async () => root.render(<Harness enabled={false} />));
    expect(requestPins).not.toHaveBeenCalled();
    await act(async () => root.render(<Harness />));
    expect(requestPins).not.toHaveBeenCalled();
    mockStateRef.current.accessToken = "ready-token";
    await act(async () => root.render(<Harness />));
    expect(setAccessToken).toHaveBeenLastCalledWith("ready-token");
    expect(requestPins).toHaveBeenCalledTimes(1);
    expect(requestAgents).toHaveBeenCalledTimes(2);
  });

  it("reloads the Agent catalog through the management refresh event", async () => {
    await act(async () => root.render(<Harness enabled={false} />));
    await act(async () => window.dispatchEvent(new CustomEvent("agent:refresh-agents")));
    expect(requestAgents).toHaveBeenCalledTimes(2);
    expect(requestPins).not.toHaveBeenCalled();
    expect(mockStateRef.current.workerRows).toHaveLength(2);
    expect(mockStateRef.current.sidebarPendingRequestCount).toBe(0);
  });

  it("queues another refresh while loading, retaining a live chat added during the request", async () => {
    let complete: (value: any) => void = () => undefined;
    requestAgents.mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
    await act(async () => root.render(<Harness />));
    expect(requestAgents).toHaveBeenCalledTimes(2);
    expect(mockStateRef.current.sidebarPendingRequestCount).toBe(1);
    mockStateRef.current.chats.push({ chatId: "live-chat", agentKey: "zenmi", chatName: "Live chat", hasActiveRun: true });
    await act(async () => window.dispatchEvent(new CustomEvent("agent:refresh-worker-data")));
    expect(invalidateChatNavigationCache).toHaveBeenCalledTimes(1);
    expect(requestAgents).toHaveBeenCalledTimes(2);
    await act(async () => complete({ code: 0, msg: "", data: [{ key: "zenmi", name: "Zenmi" }] }));
    expect(requestPins).toHaveBeenCalledTimes(2);
    expect(requestAgents).toHaveBeenCalledTimes(4);
    expect(mockStateRef.current.chats.find(chat => chat.chatId === "live-chat")?.hasActiveRun).toBe(true);
    expect(mockStateRef.current.chatPinnedOrder).toEqual(["pinned"]);
    expect(mockStateRef.current.sidebarPendingRequestCount).toBe(0);
  });

  it("still loads the catalogs if pin loading fails and supports an explicit retry", async () => {
    requestPins.mockRejectedValueOnce(new Error("pins offline"));
    requestAgents.mockRejectedValueOnce(new Error("agents offline"));
    await act(async () => root.render(<Harness />));
    expect(requestAgents).toHaveBeenCalledTimes(2);
    expect(mockStateRef.current.sidebarPendingRequestCount).toBe(0);
    expect(mockDispatch.mock.calls).toEqual(expect.arrayContaining([
      [expect.objectContaining({ type: "APPEND_DEBUG", line: expect.stringContaining("pins offline") })],
      [expect.objectContaining({ type: "APPEND_DEBUG", line: expect.stringContaining("agents offline") })],
    ]));
    await act(async () => runtime.refreshWorkerData());
    expect(mockStateRef.current.agents).toHaveLength(2);
    expect(mockStateRef.current.chatPinnedOrder).toEqual(["pinned"]);
  });

  it("keeps a TEAM Agent in the Copilot catalog without falling back to normal navigation", async () => {
    window.history.replaceState(null, "", "/copilot");
    requestAgents.mockResolvedValue({ code: 0, msg: "", data: [{ key: "team", mode: "TEAM", name: "Team" }] });
    await act(async () => root.render(<Harness />));
    expect(requestAgents).toHaveBeenCalledTimes(1);
    expect(requestAgents).toHaveBeenCalledWith({ scope: "copilot", includeChats: undefined, chatsPinned: false });
    expect(mockStateRef.current.workerRows[0].key).toBe("agent:team");
  });
});
