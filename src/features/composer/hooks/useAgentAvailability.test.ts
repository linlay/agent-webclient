/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ApiError, getAgent } from "@/shared/data";
import { createInitialState } from "@/app/state/state";
import { appReducer } from "@/app/state/reducer";
import { isAgentExecutionBlocked } from "@/features/agents/lib/agentAvailability";
import { useAgentAvailability } from "./useAgentAvailability";

jest.mock("@/shared/data", () => ({ ...jest.requireActual("@/shared/data"), getAgent: jest.fn() }));
jest.mock("@/shared/data/api/routedClient", () => ({ ...jest.requireActual("@/shared/data/api/routedClient"), invalidateAgentDetail: jest.fn() }));
const mockStateRef = { current: createInitialState() };
const mockDispatch = jest.fn(action => { mockStateRef.current = appReducer(mockStateRef.current, action); });
jest.mock("@/app/state/AppContext", () => ({ useAppContext: () => ({ dispatch: mockDispatch, stateRef: mockStateRef }) }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function Probe({ agentKey }: { agentKey: string }) {
  const { status, retry } = useAgentAvailability(agentKey, "history");
  return React.createElement("button", { onClick: retry }, status);
}

describe("current Agent availability independent of history", () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.mocked(getAgent).mockReset();
    mockDispatch.mockClear();
    mockStateRef.current = { ...createInitialState(), chatId: "history", chatAgentById: new Map([["history", "old"]]) };
    container = document.createElement("div");
    root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); jest.useRealTimers(); });
  async function render(agentKey = "old") {
    await act(async () => root.render(React.createElement(Probe, { agentKey })));
  }
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
  it("does not check Team metadata through the Agent endpoint", async () => {
    await render("");
    expect(container.textContent).toBe("available");
    expect(getAgent).not.toHaveBeenCalled();
  });
});
