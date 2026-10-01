/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ApiError, getAgent } from "@/shared/data";
import { createInitialState } from "@/app/state/state";
import { appReducer } from "@/app/state/reducer";
import { isAgentExecutionBlocked } from "@/features/agents/lib/agentAvailability";
import { useAgentAvailability } from "./useAgentAvailability";
import { AgentConfigurationLink } from "../components/AgentConfigurationLink";
import { openDesktopAgentConfiguration } from "@/shared/data/desktop/desktopAgentConfiguration";
import { createLiveQuerySession, type LiveQuerySession } from "@/features/conversation/lib/conversationSession";

jest.mock("@/shared/data/desktop/desktopAgentConfiguration", () => ({ openDesktopAgentConfiguration: jest.fn() }));
jest.mock("@/shared/utils/routing", () => ({ ...jest.requireActual("@/shared/utils/routing"), isDesktopAppMode: () => true }));
jest.mock("@/shared/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));

jest.mock("@/shared/data", () => ({ ...jest.requireActual("@/shared/data"), getAgent: jest.fn() }));
jest.mock("@/shared/data/api/routedClient", () => ({ ...jest.requireActual("@/shared/data/api/routedClient"), invalidateAgentDetail: jest.fn() }));
const mockStateRef = { current: createInitialState() };
const mockQuerySessionsRef = { current: new Map<string, LiveQuerySession>() };
const mockActiveQuerySessionRequestIdRef = { current: "" };
const mockDispatch = jest.fn(action => { mockStateRef.current = appReducer(mockStateRef.current, action); });
jest.mock("@/app/state/AppContext", () => ({ useAppContext: () => ({
  dispatch: mockDispatch, stateRef: mockStateRef,
  querySessionsRef: mockQuerySessionsRef,
  activeQuerySessionRequestIdRef: mockActiveQuerySessionRequestIdRef,
}) }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function ConfigurationProbe({ agentKey, chatId = "history" }: { agentKey: string; chatId?: string }) {
  const { status } = useAgentAvailability(agentKey, chatId);
  return status === "unavailable"
    ? React.createElement(AgentConfigurationLink, { agentKey })
    : React.createElement("span", null, status);
}

function Probe({ agentKey, chatId = "history" }: { agentKey: string; chatId?: string }) {
  const { status, retry } = useAgentAvailability(agentKey, chatId);
  return React.createElement("button", { onClick: retry }, status);
}

describe("current Agent availability independent of history", () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.mocked(getAgent).mockReset();
    jest.mocked(openDesktopAgentConfiguration).mockReset().mockResolvedValue();
    mockDispatch.mockClear();
    mockQuerySessionsRef.current.clear();
    mockActiveQuerySessionRequestIdRef.current = "";
    mockStateRef.current = { ...createInitialState(), chatId: "history", chatAgentById: new Map([["history", "old"]]) };
    container = document.createElement("div");
    root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); jest.useRealTimers(); });
  async function render(agentKey = "old") {
    await act(async () => root.render(React.createElement(Probe, { agentKey })));
  }
  async function renderChat(chatId: string, agentKey = "old") {
    await act(async () => root.render(React.createElement(Probe, { agentKey, chatId })));
  }
  function bindQuery(chatId = "created") {
    const session = createLiveQuerySession({ requestId: "local-query", observationSource: "query", chatId, agentKey: "old" });
    mockQuerySessionsRef.current.set(session.requestId, session);
    mockActiveQuerySessionRequestIdRef.current = session.requestId;
    return session;
  }
  it("reuses availability when the local query receives its first Chat ID, but still supports retry", async () => {
    jest.mocked(getAgent).mockResolvedValue({ data: { key: "old", name: "Agent" } } as any);
    await renderChat("");
    bindQuery();
    mockDispatch.mockClear();
    await renderChat("created");
    expect(getAgent).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe("available");
    expect(mockDispatch).not.toHaveBeenCalledWith(expect.objectContaining({ status: "checking" }));
    await act(async () => container.querySelector("button")!.click());
    expect(getAgent).toHaveBeenCalledTimes(2);
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(getAgent).toHaveBeenCalledTimes(3);
  });
  it.each(["no-session", "other-chat", "attach", "history-navigation", "other-agent"])(
    "rechecks an empty-to-nonempty Chat transition for %s", async scenario => {
      jest.mocked(getAgent).mockResolvedValue({ data: { key: "old", name: "Agent" } } as any);
      await renderChat("");
      const session = bindQuery();
      if (scenario === "no-session") mockActiveQuerySessionRequestIdRef.current = "";
      if (scenario === "other-chat") session.chatId = "other";
      if (scenario === "attach") session.observationSource = "attach";
      if (scenario === "history-navigation") mockStateRef.current.chatLoadSeq += 1;
      jest.mocked(getAgent).mockImplementationOnce(() => new Promise(() => {}));
      await renderChat("created", scenario === "other-agent" ? "new" : "old");
      expect(getAgent).toHaveBeenCalledTimes(2);
      expect(container.textContent).toBe("checking");
    },
  );
  it("does not inherit failed availability during query identity promotion", async () => {
    jest.mocked(getAgent).mockRejectedValueOnce(new ApiError("missing", { status: 404 }));
    await renderChat("");
    bindQuery();
    jest.mocked(getAgent).mockImplementationOnce(() => new Promise(() => {}));
    await renderChat("created");
    expect(getAgent).toHaveBeenCalledTimes(2);
    expect(container.textContent).toBe("checking");
  });
  it("does not skip a pending refresh when the query receives its Chat ID", async () => {
    jest.mocked(getAgent).mockResolvedValueOnce({ data: { key: "old", name: "Agent" } } as any);
    await renderChat("");
    let resolveRefresh!: (value: any) => void;
    jest.mocked(getAgent).mockImplementationOnce(() => new Promise(resolve => { resolveRefresh = resolve; }));
    await act(async () => window.dispatchEvent(new Event("focus")));
    bindQuery();
    jest.mocked(getAgent).mockRejectedValueOnce(new ApiError("missing", { status: 404 }));
    await renderChat("created");
    await act(async () => resolveRefresh({ data: { key: "old", name: "Stale" } }));
    expect(getAgent).toHaveBeenCalledTimes(3);
    expect(container.textContent).toBe("unavailable");
  });
  it.each([[404, "unavailable"], [401, "authentication_required"], [403, "forbidden"], [500, "error"]])(
    "classifies %s without creating a fake Agent or changing history", async (status, expected) => {
      jest.mocked(getAgent).mockRejectedValue(new ApiError("failure", { status: Number(status) }));
      await render();
      expect(container.textContent).toBe(expected);
      expect(mockStateRef.current.agents).toEqual([]);
      expect(mockStateRef.current.chatId).toBe("history");
      expect(isAgentExecutionBlocked(mockStateRef.current)).toBe(true);
    },
  );
  it("recovers after configuration repair without replaying or sending a message", async () => {
    jest.mocked(getAgent).mockRejectedValueOnce(new ApiError("missing", { status: 404 }));
    await render();
    jest.mocked(getAgent).mockResolvedValue({ data: { key: "old", name: "Repaired", mode: "REACT" } } as any);
    await act(async () => container.querySelector("button")!.click());
    expect(container.textContent).toBe("available");
    expect(isAgentExecutionBlocked(mockStateRef.current)).toBe(false);
    expect(mockStateRef.current.agents[0].name).toBe("Repaired");
    expect(mockStateRef.current.chatId).toBe("history");
  });
  it("rechecks after returning from configuration and rejects a stale success", async () => {
    let resolveOld!: (value: any) => void;
    jest.mocked(getAgent).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    await render();
    expect(container.textContent).toBe("checking");
    jest.mocked(getAgent).mockRejectedValue(new ApiError("missing", { status: 404 }));
    await act(async () => window.dispatchEvent(new Event("focus")));
    await act(async () => resolveOld({ data: { key: "old", name: "Stale" } }));
    expect(container.textContent).toBe("unavailable");
    expect(mockStateRef.current.agents).toEqual([]);
  });
  it("bounds a hanging check and ignores a late response after switching Agent", async () => {
    let resolveOld!: (value: any) => void;
    jest.mocked(getAgent).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    await render();
    await act(async () => jest.advanceTimersByTime(15_000));
    expect(container.textContent).toBe("error");
    jest.mocked(getAgent).mockResolvedValue({ data: { key: "new", name: "New" } } as any);
    await render("new");
    await act(async () => resolveOld({ data: { key: "old", name: "Stale" } }));
    expect(container.textContent).toBe("available");
    expect(mockStateRef.current.agents.map(agent => agent.key)).toEqual(["new"]);
  });
  it("keeps the configuration button mounted when the first click focuses the guest", async () => {
    jest.mocked(getAgent).mockRejectedValueOnce(new ApiError("missing", { status: 404 }));
    await act(async () => root.render(React.createElement(ConfigurationProbe, { agentKey: "old" })));
    const button = container.querySelector("button")!;
    expect(button).not.toBeNull();
    let rejectRecheck!: (reason: unknown) => void;
    jest.mocked(getAgent).mockImplementationOnce(() => new Promise((_, reject) => { rejectRecheck = reject; }));
    // In Electron, focusing a previously unfocused guest happens before click.
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(getAgent).toHaveBeenCalledTimes(2);
    expect(isAgentExecutionBlocked(mockStateRef.current)).toBe(true);
    expect(container.querySelector("button")).toBe(button);
    await act(async () => button.click());
    expect(openDesktopAgentConfiguration).toHaveBeenCalledTimes(1);
    expect(openDesktopAgentConfiguration).toHaveBeenCalledWith("old");
    await act(async () => rejectRecheck(new ApiError("still missing", { status: 404 })));
    expect(container.querySelector("button")).toBe(button);
    expect(mockStateRef.current.chatId).toBe("history");
  });
  it("applies a repaired definition after the background focus check", async () => {
    jest.mocked(getAgent).mockRejectedValueOnce(new ApiError("missing", { status: 404 }));
    await render();
    let resolveRecheck!: (value: any) => void;
    jest.mocked(getAgent).mockImplementationOnce(() => new Promise(resolve => { resolveRecheck = resolve; }));
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(container.textContent).toBe("unavailable");
    await act(async () => resolveRecheck({ data: { key: "old", name: "Repaired" } }));
    expect(container.textContent).toBe("available");
    expect(isAgentExecutionBlocked(mockStateRef.current)).toBe(false);
  });
  it("does not retain an unavailable configuration entry when switching Chat", async () => {
    jest.mocked(getAgent).mockRejectedValueOnce(new ApiError("missing", { status: 404 }));
    await act(async () => root.render(React.createElement(ConfigurationProbe, { agentKey: "old" })));
    expect(container.querySelector("button")).not.toBeNull();
    jest.mocked(getAgent).mockImplementationOnce(() => new Promise(() => {}));
    await act(async () => root.render(React.createElement(ConfigurationProbe, { agentKey: "old", chatId: "other-history" })));
    expect(container.querySelector("button")).toBeNull();
    expect(container.textContent).toBe("checking");
  });
  it.each([401, 403, 500, "timeout"])("replaces the unavailable entry when a recheck ends in %s", async failure => {
    jest.mocked(getAgent).mockRejectedValueOnce(new ApiError("missing", { status: 404 }));
    await render();
    let rejectRecheck!: (reason: unknown) => void;
    jest.mocked(getAgent).mockImplementationOnce(() => new Promise((_, reject) => { rejectRecheck = reject; }));
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(container.textContent).toBe("unavailable");
    if (failure === "timeout") {
      await act(async () => jest.advanceTimersByTime(15_000));
    } else {
      await act(async () => rejectRecheck(new ApiError("failed", { status: Number(failure) })));
    }
    const expected = failure === 401 ? "authentication_required" : failure === 403 ? "forbidden" : "error";
    expect(container.textContent).toBe(expected);
    expect(isAgentExecutionBlocked(mockStateRef.current)).toBe(true);
  });
  it("keeps an available Composer mounted and executable during a focus recheck", async () => {
    function InputProbe() {
      const { status } = useAgentAvailability("old", "history");
      return status === "available" ? React.createElement("textarea", { defaultValue: "draft" })
        : React.createElement("span", null, status);
    }
    jest.mocked(getAgent).mockResolvedValueOnce({ data: { key: "old", name: "Agent" } } as any);
    await act(async () => root.render(React.createElement(InputProbe)));
    const input = container.querySelector("textarea")!;
    input.value = "unsent draft";
    let resolveRecheck!: (value: any) => void;
    jest.mocked(getAgent).mockImplementationOnce(() => new Promise(resolve => { resolveRecheck = resolve; }));
    mockDispatch.mockClear();
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(getAgent).toHaveBeenCalledTimes(2);
    expect(container.querySelector("textarea")).toBe(input);
    expect(input.value).toBe("unsent draft");
    expect(isAgentExecutionBlocked(mockStateRef.current)).toBe(false);
    expect(mockDispatch).not.toHaveBeenCalledWith(expect.objectContaining({ status: "checking" }));
    await act(async () => resolveRecheck({ data: { key: "old", name: "Updated" } }));
    expect(container.querySelector("textarea")).toBe(input);
  });
  it.each([404, 403, "timeout"])("blocks execution when an available Agent recheck ends in %s", async failure => {
    jest.mocked(getAgent).mockResolvedValueOnce({ data: { key: "old", name: "Agent" } } as any);
    await render();
    let rejectRecheck!: (reason: unknown) => void;
    jest.mocked(getAgent).mockImplementationOnce(() => new Promise((_, reject) => { rejectRecheck = reject; }));
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(container.textContent).toBe("available");
    if (failure === "timeout") await act(async () => jest.advanceTimersByTime(15_000));
    else await act(async () => rejectRecheck(new ApiError("failed", { status: Number(failure) })));
    expect(container.textContent).toBe(failure === 404 ? "unavailable" : failure === 403 ? "forbidden" : "error");
    expect(isAgentExecutionBlocked(mockStateRef.current)).toBe(true);
  });
  it("does not check Team metadata through the Agent endpoint", async () => {
    await render("");
    expect(container.textContent).toBe("available");
    expect(getAgent).not.toHaveBeenCalled();
  });
});
