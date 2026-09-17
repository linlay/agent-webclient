/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { AppState } from "@/app/state/AppContext";
import { useDesktopLiveSurfaceRecovery } from "./useDesktopLiveSurfaceRecovery";
import { DESKTOP_LIVE_SURFACE_ACTIVE_EVENT } from "@/shared/data/desktop/desktopSurfaceLifecycle";
import { PlatformRunTransport } from "@/features/transport/lib/platformRunTransport";
import type { AgentEvent } from "@/shared/contracts/agentEvents";

const mockSessionsRef = { current: new Map() };
const mockActiveRequestRef = { current: "" };
const mockStateRef = { current: {} as AppState };
jest.mock("@/app/state/AppContext", () => ({
  useAppContext: () => ({ state: mockStateRef.current, stateRef: mockStateRef, querySessionsRef: mockSessionsRef, activeQuerySessionRequestIdRef: mockActiveRequestRef }),
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
  async function render(chatId: string, phase?: "loading" | "applying" | "restoring" | "ready" | "error") {
    mockStateRef.current = {
      chatId, runId: "run-B",
      chatTransition: phase ? { targetChatId: route, phase } : null,
    } as AppState;
    await act(async () => root.render(React.createElement(Harness)));
  }
  async function activate(active: boolean) {
    await act(async () => { window.dispatchEvent(new CustomEvent(DESKTOP_LIVE_SURFACE_ACTIVE_EVENT, {
      detail: { active, surfaceId: "main-chat" },
    })); });
  }
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    root = createRoot(document.createElement("div"));
    mockSessionsRef.current.clear();
    mockActiveRequestRef.current = "";
    route = "B";
    loadChat = jest.fn().mockResolvedValue(undefined);
  });
  afterEach(() => act(() => root.unmount()));

  it("retains activation before the new Chat commits and recovers once after ready", async () => {
    await render("A", "loading");
    await activate(true);
    expect(loadChat).not.toHaveBeenCalled();
    await render("B", "applying");
    await render("B", "restoring");
    expect(loadChat).not.toHaveBeenCalled();
    await render("B", "ready");
    expect(loadChat).toHaveBeenCalledTimes(1);
    expect(loadChat).toHaveBeenCalledWith("B", { forceReload: true, focusComposerOnComplete: false });
    await render("B", "loading");
    await render("B", "ready");
    expect(loadChat).toHaveBeenCalledTimes(1);
  });

  it("does not merge activation into a pending load even if Chat identity already matches", async () => {
    await render("B", "loading");
    await activate(true);
    await render("B", "applying");
    expect(loadChat).not.toHaveBeenCalled();
    await render("B", "ready");
    expect(loadChat).toHaveBeenCalledTimes(1);
  });

  it("cancels pending recovery on inactive and accepts the next activation", async () => {
    await render("A", "loading");
    await activate(true);
    await activate(false);
    await render("B", "ready");
    expect(loadChat).not.toHaveBeenCalled();
    await activate(true);
    expect(loadChat).toHaveBeenCalledTimes(1);
  });

  it("cancels B recovery when switching to C and never reloads the old Chat", async () => {
    await render("A", "loading");
    await activate(true);
    route = "C";
    await render("B", "loading");
    await render("C", "ready");
    expect(loadChat).not.toHaveBeenCalled();
    await activate(true);
    expect(loadChat).toHaveBeenCalledWith("C", expect.anything());
  });

  it("does not automatically retry a failed transition or restore a blank route", async () => {
    await render("A", "loading");
    await activate(true);
    await render("B", "error");
    await render("B", "ready");
    expect(loadChat).not.toHaveBeenCalled();
    route = "";
    await render("B");
    await activate(true);
    expect(loadChat).not.toHaveBeenCalled();
  });

  it.each(["query", "attach"])("keeps a healthy %s observer after ready", async (observationSource) => {
    await render("A", "loading");
    await activate(true);
    mockActiveRequestRef.current = "live";
    mockSessionsRef.current.set("live", {
      observationSource, chatId: "B", runId: "run-B", streaming: true,
      abortController: new AbortController(),
    });
    await render("B", "ready");
    expect(loadChat).not.toHaveBeenCalled();
  });

  it.each(["aborted", "stopped", "other-chat", "other-run"])("recovers a %s observer", async (status) => {
    const controller = new AbortController();
    if (status === "aborted") controller.abort();
    mockActiveRequestRef.current = "live";
    mockSessionsRef.current.set("live", {
      chatId: status === "other-chat" ? "A" : "B",
      runId: status === "other-run" ? "old-run" : "run-B",
      streaming: status !== "stopped", abortController: controller,
    });
    await render("B", "ready");
    await activate(true);
    expect(loadChat).toHaveBeenCalledTimes(1);
  });

  it("waits for queued inactive completion before trusting a streaming session", async () => {
    await render("B", "ready");
    const session = { chatId: "B", runId: "run-B", streaming: true, abortController: new AbortController() };
    mockActiveRequestRef.current = "live";
    mockSessionsRef.current.set("live", session);
    // Transport settles completion synchronously, but its session cleanup is
    // a Promise callback; activation can flush a React effect before it runs.
    void Promise.resolve().then(() => { session.streaming = false; });
    act(() => { window.dispatchEvent(new CustomEvent(DESKTOP_LIVE_SURFACE_ACTIVE_EVENT, {
      detail: { active: true, surfaceId: "main-chat" },
    })); });
    await act(async () => { await Promise.resolve(); });
    expect(loadChat).toHaveBeenCalledTimes(1);
  });

  it("does not recover without a Desktop activation signal", async () => {
    await render("A", "loading");
    await render("B", "ready");
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
    await render("A", "loading");
    transport.setSurfaceActive(true);
    await activate(true);
    await render("B", "applying");
    expect(stream).not.toHaveBeenCalled();
    await render("B", "ready");
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
