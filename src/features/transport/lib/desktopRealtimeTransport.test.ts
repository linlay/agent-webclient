import type {
  AgentPlatformRequestFrame,
  AgentPlatformRealtimeFrame,
  DesktopPlatformConnectionState,
  DesktopPlatformFramePort,
  DesktopPlatformSession,
  DesktopPlatformSessionClose,
} from "@/shared/contracts/generated/agentWebclientBridge";
import { DesktopRealtimeTransport } from "@/features/transport/lib/desktopRealtimeTransport";
import { getDesktopPlatformFrameClient } from "@/features/transport/lib/desktopPlatformFrameClientRegistry";
import {
  DESKTOP_LIVE_SURFACE_ACTIVE_EVENT,
  DESKTOP_SURFACE_ACTIVE_CHANGED_MESSAGE_TYPE,
  SERVICE_WEBVIEW_BRIDGE_SURFACE_LIFECYCLE_CHANNEL,
} from "@/shared/data/desktop/desktopSurfaceLifecycle";

class FakeDesktopPlatformSession implements DesktopPlatformSession {
  readonly sent: Array<Record<string, unknown>> = [];
  closeCalls = 0;
  private readonly frameListeners = new Set<(frame: any) => void>();
  private readonly stateListeners = new Set<(state: DesktopPlatformConnectionState) => void>();
  private readonly closeListeners = new Set<(event: DesktopPlatformSessionClose) => void>();

  connected(): void {
    this.state({
      phase: "connected",
      logicalGeneration: 1,
      physicalGeneration: 1,
      reconnectCount: 0,
      retryable: false,
      physicalSessionId: "ws-test",
    });
  }

  state(state: DesktopPlatformConnectionState): void {
    for (const listener of this.stateListeners) listener(state);
  }

  send(frame: AgentPlatformRequestFrame): void {
    this.sent.push(frame);
  }

  close(reason: "surface_inactive" | "disposed" = "disposed"): void {
    this.closeCalls += 1;
    for (const listener of this.closeListeners) listener({ reason });
  }

  onFrame(listener: (frame: Exclude<AgentPlatformRealtimeFrame, AgentPlatformRequestFrame>) => void): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  onState(listener: (state: DesktopPlatformConnectionState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onClose(listener: (event: DesktopPlatformSessionClose) => void): () => void {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  frame(frame: Record<string, unknown>): void {
    for (const listener of this.frameListeners) listener(frame);
  }
}

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("DesktopRealtimeTransport", () => {
  it("registers the Frame Port client for ordinary Platform requests", async () => {
    const session = new FakeDesktopPlatformSession();
    const transport = new DesktopRealtimeTransport({
      transportVersion: 2,
      createSession: () => session,
    });
    const client = getDesktopPlatformFrameClient();
    expect(client).not.toBeNull();
    const request = client!.request<{ key: string }>({
      type: "/api/agent",
      payload: { agentKey: "agent-1" },
    });
    session.connected();
    await flush();
    const frame = session.sent.find((item) => item.type === "/api/agent");
    session.frame({
      frame: "response",
      id: frame?.id,
      code: 0,
      status: 200,
      msg: "ok",
      data: { key: "agent-1" },
    });
    await expect(request).resolves.toMatchObject({ data: { key: "agent-1" } });
    transport.dispose();
    expect(getDesktopPlatformFrameClient()).toBeNull();
  });

  it("keeps one logical Frame Port session healthy across 120 seconds of business silence", async () => {
    jest.useFakeTimers();
    const session = new FakeDesktopPlatformSession();
    const transport = new DesktopRealtimeTransport({
      transportVersion: 2,
      createSession: () => session,
    });
    const statuses: string[] = [];
    const unsubscribe = transport.subscribeStatus((status) => statuses.push(status));
    session.connected();
    jest.advanceTimersByTime(120_000);
    expect(session.closeCalls).toBe(0);
    expect(transport.getStatus()).toBe("connected");
    expect(statuses).toContain("connected");
    unsubscribe();
    transport.dispose();
    jest.useRealTimers();
  });

  it("treats host reconnecting as nonfatal and keeps the original stream", async () => {
    const session = new FakeDesktopPlatformSession();
    const transport = new DesktopRealtimeTransport({
      transportVersion: 2,
      createSession: () => session,
    });
    const statuses: string[] = [];
    transport.subscribeStatus((status) => statuses.push(status));
    const events: string[] = [];
    const execution = transport.runs.startQuery({
      requestId: "req-reconnect",
      message: "keep going",
      owner: { kind: "agent", agentKey: "agent-1" },
      onEvent: (event) => events.push(event.type),
    });
    session.connected();
    await flush();
    const query = session.sent.find((frame) => frame.type === "/api/query");
    const id = String(query?.id || "");
    session.frame({
      frame: "stream",
      id,
      event: {
        type: "run.start",
        seq: 1,
        chatId: "chat-reconnect",
        runId: "run-reconnect",
        agentKey: "agent-1",
        timestamp: 1_786_890_000_001,
      },
    });
    await execution.identity;
    session.state({
      phase: "reconnecting",
      logicalGeneration: 1,
      physicalGeneration: 1,
      reconnectCount: 1,
      retryable: true,
      error: { code: "PLATFORM_CONNECTION_UNAVAILABLE", message: "network lost" },
    });
    expect(transport.getStatus()).toBe("reconnecting");
    session.state({
      phase: "connected",
      logicalGeneration: 1,
      physicalGeneration: 2,
      reconnectCount: 1,
      retryable: false,
      physicalSessionId: "ws-test-2",
    });
    session.frame({
      frame: "stream",
      id,
      event: {
        type: "content.delta",
        seq: 2,
        chatId: "chat-reconnect",
        runId: "run-reconnect",
        timestamp: 1_786_890_000_002,
      },
    });
    session.frame({ frame: "stream", id, reason: "complete", lastSeq: 2 });
    await expect(execution.completion).resolves.toMatchObject({ reason: "complete", lastSeq: 2 });
    expect(session.sent.filter((frame) => frame.type === "/api/query")).toHaveLength(1);
    expect(events).toEqual(["run.start", "content.delta"]);
    expect(statuses).toEqual(expect.arrayContaining(["reconnecting", "connected"]));
    transport.dispose();
  });

  it("uses the shared Platform parser and preserves one message per stream frame", async () => {
    const socket = new FakeDesktopPlatformSession();
    const bridge: DesktopPlatformFramePort = {
      transportVersion: 2,
      createSession: () => {
        queueMicrotask(() => socket.connected());
        return socket;
      },
    };
    const transport = new DesktopRealtimeTransport(bridge);
    const events: string[] = [];
    const execution = transport.runs.startQuery({
      requestId: "req-1",
      message: "hello",
      owner: { kind: "agent", agentKey: "agent-1" },
      onEvent: (event) => events.push(`${event.seq}:${event.type}`),
    });

    await flush();
    const query = socket.sent.find((frame) => frame.type === "/api/query");
    expect(query).toMatchObject({ frame: "request", type: "/api/query" });
    const id = String(query?.id || "");
    const base = { chatId: "chat-1", runId: "run-1", agentKey: "agent-1" };
    socket.frame({
      frame: "stream",
      id,
      streamId: "s-1",
      event: { ...base, seq: 1, type: "run.start", timestamp: 1_786_890_000_001 },
    });
    socket.frame({
      frame: "stream",
      id,
      streamId: "s-1",
      event: { ...base, seq: 2, type: "content.delta", delta: "你", timestamp: 1_786_890_000_002 },
    });
    socket.frame({
      frame: "stream",
      id,
      streamId: "s-1",
      event: { ...base, seq: 3, type: "content.delta", delta: "好", timestamp: 1_786_890_000_003 },
    });

    await expect(execution.identity).resolves.toMatchObject({
      requestId: "req-1",
      chatId: "chat-1",
      runId: "run-1",
    });
    expect(events).toEqual(["1:run.start", "2:content.delta", "3:content.delta"]);

    socket.frame({ frame: "stream", id, streamId: "s-1", reason: "complete", lastSeq: 3 });
    await expect(execution.completion).resolves.toMatchObject({ reason: "complete", lastSeq: 3 });
    transport.dispose();
  });

  it("sends controls and BTW as Platform request frames", async () => {
    const socket = new FakeDesktopPlatformSession();
    const transport = new DesktopRealtimeTransport({
      transportVersion: 2,
      createSession: () => {
        queueMicrotask(() => socket.connected());
        return socket;
      },
    });
    const interrupt = transport.runs.interrupt({
      requestId: "interrupt-1",
      runId: "run-1",
      owner: { kind: "agent", agentKey: "agent-1" },
    });
    await flush();
    const frame = socket.sent.find((item) => item.type === "/api/interrupt");
    expect(frame).toMatchObject({ frame: "request", type: "/api/interrupt" });
    socket.frame({ frame: "response", id: frame?.id, code: 0, status: 200, msg: "ok", data: { accepted: true } });
    await expect(interrupt).resolves.toMatchObject({ status: 200, data: { accepted: true } });

    const btw = transport.runs.startBtw({
      requestId: "btw-1",
      chatId: "chat-1",
      message: "side question",
      owner: { kind: "agent", agentKey: "agent-1" },
      onEvent: () => undefined,
    });
    await flush();
    const btwFrame = socket.sent.find((item) => item.type === "/api/btw");
    expect(btwFrame).toMatchObject({ frame: "request", type: "/api/btw" });
    socket.frame({
      frame: "stream",
      id: btwFrame?.id,
      streamId: "btw-stream-1",
      event: {
        type: "run.start",
        requestId: "btw-1",
        chatId: "chat-1",
        btwId: "btw-branch-1",
        runId: "btw-run-1",
        agentKey: "agent-1",
        seq: 1,
        timestamp: 1_786_890_000_001,
      },
    });
    await expect(btw.identity).resolves.toMatchObject({
      requestId: "btw-1",
      chatId: "chat-1",
      runId: "btw-run-1",
    });
    socket.frame({ frame: "stream", id: btwFrame?.id, streamId: "btw-stream-1", reason: "complete", lastSeq: 1 });
    await expect(btw.completion).resolves.toMatchObject({ reason: "complete" });
    transport.dispose();
  });

  it("marks explanation start, attach, interrupt and detach while ordinary query and BTW stay independent", async () => {
    const socket = new FakeDesktopPlatformSession();
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected Desktop HTTP request"));
    const transport = new DesktopRealtimeTransport({
      transportVersion: 2,
      createSession: () => { queueMicrotask(() => socket.connected()); return socket; },
    });
    const owner = { kind: "agent" as const, agentKey: "agent-a" };
    const onMain = jest.fn();
    const onSide = jest.fn();
    const onExplanation = jest.fn();
    try {
      const main = transport.runs.startQuery({ requestId: "main", chatId: "chat-a", message: "main", owner, onEvent: onMain });
      const side = transport.runs.startBtw({ requestId: "side", chatId: "chat-a", message: "side", owner, onEvent: onSide });
      const explanation = transport.runs.startBtw({ requestId: "explanation", chatId: "chat-a", message: "explain", owner,
        transportPurpose: "selection-explain", onEvent: jest.fn() });
      await flush();
      const starts = socket.sent.filter((item) => item.type === "/api/query" || item.type === "/api/btw");
      expect(starts).toHaveLength(3);
      const mainFrame = starts.find((item) => (item.payload as Record<string, unknown>).requestId === "main")!;
      const sideFrame = starts.find((item) => (item.payload as Record<string, unknown>).requestId === "side")!;
      const explanationFrame = starts.find((item) => (item.payload as Record<string, unknown>).requestId === "explanation")!;
      expect(mainFrame.payload).not.toHaveProperty("_desktopTransportPurpose");
      expect(sideFrame.payload).not.toHaveProperty("_desktopTransportPurpose");
      expect(explanationFrame.payload).toMatchObject({ _desktopTransportPurpose: "selection-explain" });
      for (const item of starts) {
        const payload = item.payload as Record<string, unknown>;
        expect(payload).not.toHaveProperty("transportPurpose");
        socket.frame({ frame: "stream", id: item.id, event: {
          type: "run.start", chatId: "chat-a", runId: `run-${payload.requestId}`, agentKey: "agent-a", seq: 1,
          timestamp: 1_786_890_000_001,
        } });
      }
      await Promise.all([main.identity, side.identity, explanation.identity]);
      const viewer = transport.runs.subscribe({ chatId: "chat-a", runId: "run-explanation", owner, lastSeq: 0,
        role: "btw", transportPurpose: "selection-explain", onEvent: onExplanation });
      await viewer.identity;
      await flush();
      const attachFrame = socket.sent.find((item) => item.type === "/api/attach")!;
      expect(attachFrame.payload).toMatchObject({ runId: "run-explanation", _desktopTransportPurpose: "selection-explain" });
      expect(socket.sent.filter((item) => item.type === "/api/btw" && (item.payload as Record<string, unknown>)._desktopTransportPurpose)).toHaveLength(1);

      const stopping = transport.runs.interrupt({ runId: "run-explanation", owner, transportPurpose: "selection-explain" });
      await flush();
      const interruptFrame = socket.sent.find((item) => item.type === "/api/interrupt")!;
      expect(interruptFrame.payload).toMatchObject({ runId: "run-explanation", _desktopTransportPurpose: "selection-explain" });
      socket.frame({ frame: "response", id: interruptFrame.id, code: 0, data: { accepted: true } });
      await stopping;
      const detaching = viewer.detach();
      await flush();
      const detachFrame = socket.sent.find((item) => item.type === "/api/detach")!;
      expect(detachFrame.payload).toMatchObject({ runId: "run-explanation", _desktopTransportPurpose: "selection-explain" });
      socket.frame({ frame: "response", id: detachFrame.id, code: 0, data: { accepted: true } });
      await detaching;
      await expect(viewer.completion).resolves.toMatchObject({ reason: "detached" });
      for (const item of [mainFrame, sideFrame, attachFrame]) {
        socket.frame({ frame: "stream", id: item.id, event: {
          type: "content.delta", contentId: "answer", delta: "still active", seq: 2, timestamp: 1_786_890_000_002,
        } });
      }
      expect(onMain).toHaveBeenLastCalledWith(expect.objectContaining({ delta: "still active" }));
      expect(onSide).toHaveBeenLastCalledWith(expect.objectContaining({ delta: "still active" }));
      expect(onExplanation).not.toHaveBeenCalled();
      for (const item of starts) socket.frame({ frame: "stream", id: item.id, reason: "complete", lastSeq: 2 });
      await Promise.all([main.completion, side.completion, explanation.completion]);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      transport.dispose();
      fetchSpy.mockRestore();
    }
  });

  it("releases on host inactive and emits recovery lifecycle without reviving the old observer", async () => {
    const originalWindow = (globalThis as { window?: unknown }).window;
    const originalDocument = (globalThis as { document?: unknown }).document;
    const originalCustomEvent = (globalThis as { CustomEvent?: unknown }).CustomEvent;
    let lifecycleListener: ((event: unknown, payload: Record<string, unknown>) => void) | null = null;
    const dispatchedEvents: Event[] = [];
    const removeLifecycleListener = jest.fn();
    class TestCustomEvent<T = unknown> extends Event {
      detail: T;
      constructor(type: string, init: { detail: T }) {
        super(type);
        this.detail = init.detail;
      }
    }
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        visibilityState: "visible",
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        electronAPI: {
          onFromMain: (channel: string, listener: typeof lifecycleListener) => {
            expect(channel).toBe(SERVICE_WEBVIEW_BRIDGE_SURFACE_LIFECYCLE_CHANNEL);
            lifecycleListener = listener;
            return removeLifecycleListener;
          },
        },
        dispatchEvent: (event: Event) => dispatchedEvents.push(event),
      },
    });
    Object.defineProperty(globalThis, "CustomEvent", {
      configurable: true,
      value: TestCustomEvent,
    });

    try {
      const socket = new FakeDesktopPlatformSession();
      const transport = new DesktopRealtimeTransport({
        transportVersion: 2,
        createSession: () => {
          queueMicrotask(() => socket.connected());
          return socket;
        },
      });
      const execution = transport.runs.subscribe({
        chatId: "chat-1",
        runId: "run-1",
        owner: { kind: "agent", agentKey: "agent-1" },
        lastSeq: 12,
        onEvent: jest.fn(),
      });
      await flush();
      await execution.identity;

      lifecycleListener?.({}, {
        type: DESKTOP_SURFACE_ACTIVE_CHANGED_MESSAGE_TYPE,
        active: false,
        surfaceId: "agent-webclient-chat",
      });
      await flush();
      const detach = socket.sent.find((frame) => frame.type === "/api/detach");
      expect(detach).toMatchObject({
        frame: "request",
        type: "/api/detach",
        payload: {
          runId: "run-1",
          agentKey: "agent-1",
          reason: "surface_inactive",
        },
      });
      await expect(execution.completion).resolves.toMatchObject({ reason: "detached" });

      lifecycleListener?.({}, {
        type: DESKTOP_SURFACE_ACTIVE_CHANGED_MESSAGE_TYPE,
        active: true,
        surfaceId: "agent-webclient-chat",
      });
      await flush();
      expect(socket.sent.filter((frame) => frame.type === "/api/attach")).toHaveLength(1);
      socket.frame({
        frame: "response",
        id: detach?.id,
        code: 0,
        status: 200,
        msg: "ok",
        data: { accepted: true },
      });
      expect(dispatchedEvents.map((event) => event.type)).toEqual([
        DESKTOP_LIVE_SURFACE_ACTIVE_EVENT,
        DESKTOP_LIVE_SURFACE_ACTIVE_EVENT,
      ]);
      expect((dispatchedEvents[0] as TestCustomEvent<{ active: boolean }>).detail.active).toBe(false);
      expect((dispatchedEvents[1] as TestCustomEvent<{ active: boolean }>).detail.active).toBe(true);
      transport.dispose();
      expect(removeLifecycleListener).toHaveBeenCalledTimes(1);
    } finally {
      for (const [key, value] of [
        ["window", originalWindow],
        ["document", originalDocument],
        ["CustomEvent", originalCustomEvent],
      ] as const) {
        if (value === undefined) {
          delete (globalThis as Record<string, unknown>)[key];
        } else {
          Object.defineProperty(globalThis, key, { configurable: true, value });
        }
      }
    }
  });
});
