/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getAgent, getChats, type AgentDetailResponse } from "@/shared/data";
import { useProjectAgent } from "./useProjectAgent";

jest.mock("@/shared/data", () => ({ getAgent: jest.fn(), getChats: jest.fn() }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const agent: AgentDetailResponse = {
  key: "project", name: "Project", mode: "GENERAL", workspaceDir: "/work/project",
  tools: [], skills: [], connectors: [], controls: [], meta: {},
};
const response = <T,>(data: T) => ({ status: 200, code: 0, msg: "success", data });

function Probe({ agentKey }: { agentKey?: string }) {
  const state = useProjectAgent(agentKey);
  return <div data-loading={state.loading}>
    {JSON.stringify({ agent: state.agent?.key, chats: state.chats, error: state.error, chatsError: state.chatsError })}
  </div>;
}

describe("single project loading", () => {
  let root: Root;
  let container: HTMLDivElement;
  const read = () => JSON.parse(container.textContent || "{}");

  beforeEach(() => {
    jest.mocked(getAgent).mockReset().mockResolvedValue(response(agent));
    jest.mocked(getChats).mockReset().mockResolvedValue(response([]));
    container = document.createElement("div");
    root = createRoot(container);
  });
  afterEach(() => act(() => root.unmount()));

  it("reads only the route's Agent and its recent chats without a mode filter", async () => {
    const chats = [{ chatId: "chat-1", agentKey: "project" }];
    jest.mocked(getChats).mockResolvedValue(response(chats));
    await act(async () => root.render(<Probe agentKey="project" />));
    expect(getAgent).toHaveBeenCalledWith("project");
    expect(getChats).toHaveBeenCalledWith({ agentKey: "project", limit: 20 });
    expect(read()).toMatchObject({ agent: "project", chats });
    expect(container.firstElementChild?.getAttribute("data-loading")).toBe("false");
  });

  it("makes no catalog request when project context is missing", async () => {
    await act(async () => root.render(<Probe />));
    expect(getAgent).not.toHaveBeenCalled();
    expect(getChats).not.toHaveBeenCalled();
    expect(container.firstElementChild?.getAttribute("data-loading")).toBe("false");
  });

  it.each(["", " @root "])("rejects an unavailable Workspace %j", async (workspaceDir) => {
    jest.mocked(getAgent).mockResolvedValue(response({ ...agent, workspaceDir }));
    await act(async () => root.render(<Probe agentKey="project" />));
    expect(read().agent).toBeUndefined();
  });

  it("keeps the Workspace available when chats fail to load", async () => {
    jest.mocked(getChats).mockRejectedValue(new Error("chats unavailable"));
    await act(async () => root.render(<Probe agentKey="project" />));
    expect(read()).toMatchObject({ agent: "project", error: "", chatsError: "chats unavailable" });
  });

  it("does not wait for chats before resolving the Workspace", async () => {
    jest.mocked(getChats).mockReturnValue(new Promise(() => {}));
    await act(async () => root.render(<Probe agentKey="project" />));
    expect(read().agent).toBe("project");
    expect(container.firstElementChild?.getAttribute("data-loading")).toBe("false");
  });

  it("surfaces Agent lookup errors without selecting another project", async () => {
    jest.mocked(getAgent).mockRejectedValue(new Error("agent not found"));
    await act(async () => root.render(<Probe agentKey="missing" />));
    expect(read()).toMatchObject({ error: "agent not found" });
    expect(read().agent).toBeUndefined();
  });

  it("ignores late results from a previous route", async () => {
    let resolveAgent!: (value: Awaited<ReturnType<typeof getAgent>>) => void;
    let resolveChats!: (value: Awaited<ReturnType<typeof getChats>>) => void;
    jest.mocked(getAgent).mockReturnValueOnce(new Promise((resolve) => { resolveAgent = resolve; }));
    jest.mocked(getChats).mockReturnValueOnce(new Promise((resolve) => { resolveChats = resolve; }));
    await act(async () => root.render(<Probe agentKey="old" />));
    await act(async () => root.render(<Probe agentKey="project" />));
    await act(async () => {
      resolveAgent(response({ ...agent, key: "old" }));
      resolveChats(response([{ chatId: "old-chat" }]));
    });
    expect(read()).toMatchObject({ agent: "project", chats: [] });
  });
});
