import type {
  DesktopPlatformSocket,
  DesktopPlatformSocketEventType,
  DesktopPlatformWsBridge,
} from "@/features/transport/contracts/generated/agentWebclientBridge";
import { DesktopRealtimeTransport } from "@/features/transport/lib/desktopRealtimeTransport";

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

  it("sends controls as Platform request frames and keeps Desktop BTW unsupported", async () => {
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
    await expect(btw.identity).rejects.toMatchObject({ code: "unsupported_in_current_view" });
    transport.dispose();
  });
});
