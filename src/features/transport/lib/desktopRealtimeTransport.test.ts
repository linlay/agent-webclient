import type {
  DesktopPlatformSocket,
  DesktopPlatformSocketEventType,
  DesktopPlatformWsBridge,
} from "@/features/transport/contracts/generated/agentWebclientBridge";
import { DesktopRealtimeTransport } from "@/features/transport/lib/desktopRealtimeTransport";
import {
  DESKTOP_LIVE_SURFACE_ACTIVE_EVENT,
  DESKTOP_SURFACE_ACTIVE_CHANGED_MESSAGE_TYPE,
  SERVICE_WEBVIEW_BRIDGE_SURFACE_LIFECYCLE_CHANNEL,
} from "@/features/transport/lib/desktopSurfaceLifecycle";

class FakeDesktopPlatformSocket implements DesktopPlatformSocket {
  readyState: 0 | 1 | 2 | 3 = 0;
  readonly sent: Array<Record<string, unknown>> = [];
  private readonly listeners = new Map<DesktopPlatformSocketEventType, Set<(event: any) => void>>();

  open(): void {
    this.readyState = 1;
    this.emit("open", new Event("open"));
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }

  close(code = 1000, reason = ""): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.emit("close", { code, reason });
  }

  addEventListener(type: DesktopPlatformSocketEventType, listener: (event: any) => void): void {
    const listeners = this.listeners.get(type) || new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: DesktopPlatformSocketEventType, listener: (event: any) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  frame(frame: Record<string, unknown>): void {
    this.emit("message", { data: JSON.stringify(frame) });
  }

  private emit(type: DesktopPlatformSocketEventType, event: any): void {
    for (const listener of this.listeners.get(type) || []) listener(event);
  }
}

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("DesktopRealtimeTransport", () => {
  it("uses the shared Platform parser and preserves one message per stream frame", async () => {
    const socket = new FakeDesktopPlatformSocket();
    const bridge: DesktopPlatformWsBridge = {
      transportVersion: 1,
      createSocket: () => {
        queueMicrotask(() => socket.open());
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
    const socket = new FakeDesktopPlatformSocket();
    const transport = new DesktopRealtimeTransport({
      transportVersion: 1,
      createSocket: () => {
        queueMicrotask(() => socket.open());
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
      const socket = new FakeDesktopPlatformSocket();
      const transport = new DesktopRealtimeTransport({
        transportVersion: 1,
        createSocket: () => {
          queueMicrotask(() => socket.open());
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
