/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { AppState } from "@/app/state/AppContext";
import { useDesktopLiveSurfaceRecovery } from "./useDesktopLiveSurfaceRecovery";
import { DESKTOP_LIVE_SURFACE_ACTIVE_EVENT } from "@/shared/data/desktop/desktopSurfaceLifecycle";
import { PlatformRunTransport } from "@/features/transport/lib/platformRunTransport";
import type { AgentEvent } from "@/shared/contracts/agentEvents";

const mockStateRef = { current: {} as AppState };
jest.mock("@/app/state/AppContext", () => ({
  useAppContext: () => ({ state: mockStateRef.current, stateRef: mockStateRef }),
}));
jest.mock("@/features/transport/lib/standaloneWsClient", () => ({}));

describe("Desktop activation during Chat transitions", () => {
  let root: Root;
  let loadChat: jest.Mock;
  let route: string;
  function Harness() {
    useDesktopLiveSurfaceRecovery(loadChat, route);
    return null;
  }
  function render(chatId: string, phase?: "loading" | "applying" | "restoring" | "ready" | "error") {
    mockStateRef.current = {
      chatId,
      chatTransition: phase ? { targetChatId: route, phase } : null,
    } as AppState;
    act(() => root.render(React.createElement(Harness)));
  }
  function activate(active: boolean) {
    act(() => window.dispatchEvent(new CustomEvent(DESKTOP_LIVE_SURFACE_ACTIVE_EVENT, {
      detail: { active, surfaceId: "main-chat" },
    })));
  }
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    root = createRoot(document.createElement("div"));
    route = "B";
    loadChat = jest.fn().mockResolvedValue(undefined);
  });
  afterEach(() => act(() => root.unmount()));

  it("retains activation before the new Chat commits and recovers once after ready", () => {
    render("A", "loading");
    activate(true);
    expect(loadChat).not.toHaveBeenCalled();
    render("B", "applying");
    render("B", "restoring");
    expect(loadChat).not.toHaveBeenCalled();
    render("B", "ready");
    expect(loadChat).toHaveBeenCalledTimes(1);
    expect(loadChat).toHaveBeenCalledWith("B", { forceReload: true, focusComposerOnComplete: false });
    render("B", "loading");
    render("B", "ready");
    expect(loadChat).toHaveBeenCalledTimes(1);
  });

  it("does not merge activation into a pending load even if Chat identity already matches", () => {
    render("B", "loading");
    activate(true);
    render("B", "applying");
    expect(loadChat).not.toHaveBeenCalled();
    render("B", "ready");
    expect(loadChat).toHaveBeenCalledTimes(1);
  });

  it("cancels pending recovery on inactive and accepts the next activation", () => {
    render("A", "loading");
    activate(true);
    activate(false);
    render("B", "ready");
    expect(loadChat).not.toHaveBeenCalled();
    activate(true);
    expect(loadChat).toHaveBeenCalledTimes(1);
  });

  it("cancels B recovery when switching to C and never reloads the old Chat", () => {
    render("A", "loading");
    activate(true);
    route = "C";
    render("B", "loading");
    render("C", "ready");
    expect(loadChat).not.toHaveBeenCalled();
    activate(true);
    expect(loadChat).toHaveBeenCalledWith("C", expect.anything());
  });

  it("does not automatically retry a failed transition or restore a blank route", () => {
    render("A", "loading");
    activate(true);
    render("B", "error");
    render("B", "ready");
    expect(loadChat).not.toHaveBeenCalled();
    route = "";
    render("B");
    activate(true);
    expect(loadChat).not.toHaveBeenCalled();
  });

  it("does not recover without a Desktop activation signal", () => {
    render("A", "loading");
    render("B", "ready");
    expect(loadChat).not.toHaveBeenCalled();
  });

  it("replaces an inactive zero-event attach and receives reasoning from the snapshot cursor", async () => {
    const observed: AgentEvent[] = [];
    const stream = jest.fn((_options: any) => ({ requestId: "stream", abort: jest.fn() }));
    const request = jest.fn().mockResolvedValue({});
    const transport = new PlatformRunTransport(async () => ({ stream, request }) as any);
    const input = {
      chatId: "B", runId: "run-B", owner: { kind: "agent" as const, agentKey: "zenmi" },
      lastSeq: 2, onEvent: (event: AgentEvent) => observed.push(event),
    };
    transport.setSurfaceActive(false);
    const stale = transport.subscribe(input);
    await expect(stale.completion).resolves.toMatchObject({ reason: "detached" });
    expect(stream).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ type: "/api/detach" }));

    // loadChat normally fetches /api/chat, replays it, then subscribes from its
    // activeRun.lastSeq. The snapshot lacks the unfinished reasoning block.
    loadChat.mockImplementation(async () => {
      await transport.subscribe(input).identity;
    });
    render("A", "loading");
    transport.setSurfaceActive(true);
    activate(true);
    render("B", "applying");
    expect(stream).not.toHaveBeenCalled();
    await act(async () => render("B", "ready"));
    expect(stream).toHaveBeenCalledTimes(1);
    const options = stream.mock.calls[0][0] as any;
    expect(options).toMatchObject({ type: "/api/attach", payload: { runId: "run-B", lastSeq: 2 } });
    for (const [offset, type] of ["reasoning.start", "reasoning.delta", "reasoning.end"].entries()) {
      options.onEvent({ type, seq: offset + 3, runId: "run-B", chatId: "B", timestamp: 1789611000000 + offset });
    }
    expect(observed.map(event => event.type)).toEqual(["reasoning.start", "reasoning.delta", "reasoning.end"]);
    expect(loadChat).toHaveBeenCalledTimes(1);
  });
});
