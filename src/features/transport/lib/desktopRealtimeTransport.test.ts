import type {
  AgentWebclientBridgeHello,
  AgentWebclientRealtimeBridge,
  AgentWebclientRealtimeMessage,
  AgentWebclientRealtimeSubscription,
} from "@/features/transport/contracts/generated/agentWebclientBridge";
import { AGENT_WEBCLIENT_BRIDGE_VERSION } from "@/features/transport/contracts/generated/agentWebclientBridge";
import { DesktopBridgeSession } from "@/features/transport/lib/desktopBridge";
import { DesktopRealtimeTransport } from "@/features/transport/lib/desktopRealtimeTransport";

const owner = { kind: "agent", agentKey: "agent-1" } as const;

function hello(
  capabilities: AgentWebclientBridgeHello["surface"]["capabilities"] = [
    "run.query",
    "run.attach",
    "run.control",
    "push.subscribe",
    "workpanel.open",
  ],
): AgentWebclientBridgeHello {
  return {
    version: AGENT_WEBCLIENT_BRIDGE_VERSION,
    surface: {
      kind: "agent-chat",
      capabilities,
      ownerChatId: "chat-1",
      route: "/agent/agent-1?chatId=chat-1",
    },
    connection: { phase: "connected", generation: 1 },
  };
}

function fakeBridge() {
  const listeners = new Set<(message: AgentWebclientRealtimeMessage) => void>();
  const bridge: AgentWebclientRealtimeBridge = {
    hello: jest.fn(async () => hello()),
    request: jest.fn(async (input) => ({
      ok: true,
      operationId: input.operationId,
      ...(input.kind === "run.control" ? {
        response: {
          status: 200,
          code: 0,
          msg: "success",
          data: { accepted: true, operationId: input.operationId },
        },
      } : {}),
    })),
    subscribe: jest.fn(async () => ({ ok: true, subscriptionId: "run-sub" })),
    detach: jest.fn(async () => ({ ok: true })),
    onMessage: jest.fn((listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
  };
  return {
    bridge,
    listeners,
    emit(message: AgentWebclientRealtimeMessage) {
      for (const listener of listeners) listener(message);
    },
  };
}

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("DesktopRealtimeTransport", () => {
  it("retries a transient surface registration race without caching the failure", async () => {
    const fake = fakeBridge();
    (fake.bridge.hello as jest.Mock)
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code: "surface_unavailable",
          message: "sender is not registered yet",
        },
      })
      .mockResolvedValueOnce(hello());
    const session = new DesktopBridgeSession(fake.bridge);
    await expect(session.requireCapability("run.query")).resolves.toMatchObject({
      version: AGENT_WEBCLIENT_BRIDGE_VERSION,
    });
    expect(fake.bridge.hello).toHaveBeenCalledTimes(2);
    session.dispose();
  });

  it("preserves a version mismatch as a fatal bridge error", async () => {
    const fake = fakeBridge();
    (fake.bridge.hello as jest.Mock).mockResolvedValueOnce({
      ...hello(),
      version: 1,
    });
    const session = new DesktopBridgeSession(fake.bridge);
    const fatal = jest.fn();
    session.subscribeFatal(fatal);
    await expect(session.requireCapability("run.attach")).rejects.toMatchObject({
      code: "version_mismatch",
    });
    expect(fatal).toHaveBeenLastCalledWith(expect.objectContaining({
      code: "version_mismatch",
    }));
    session.dispose();
  });

  it("uses one bridge listener and orders query acceptance, buffered events and completion", async () => {
    const fake = fakeBridge();
    const transport = new DesktopRealtimeTransport(new DesktopBridgeSession(fake.bridge));
    const events: string[] = [];
    const execution = transport.runs.startQuery({
      requestId: "operation-1",
      chatId: "chat-1",
      runId: "run-1",
      message: "hello",
      owner,
      onEvent: (event) => events.push(String(event.type)),
    });

    await flush();
    expect(fake.listeners.size).toBe(1);
    fake.emit({
      version: AGENT_WEBCLIENT_BRIDGE_VERSION,
      kind: "run.batch",
      delivery: { kind: "operation", operationId: "operation-1" },
      bindingEpoch: 1,
      chatId: "chat-1",
      runId: "run-1",
      events: [{ type: "content.delta", seq: 1, chatId: "chat-1", runId: "run-1" }],
      lastSeq: 1,
    });
    expect(events).toEqual([]);
    fake.emit({
      version: AGENT_WEBCLIENT_BRIDGE_VERSION,
      kind: "run.accepted",
      operationId: "operation-1",
      chatId: "chat-1",
      runId: "run-1",
      owner: { kind: "agent", agentKey: "agent-1" },
    });
    await expect(execution.accepted).resolves.toMatchObject({
      requestId: "operation-1",
      chatId: "chat-1",
      runId: "run-1",
    });
    expect(events).toEqual(["content.delta"]);
    fake.emit({
      version: AGENT_WEBCLIENT_BRIDGE_VERSION,
      kind: "run.completed",
      delivery: { kind: "operation", operationId: "operation-1" },
      chatId: "chat-1",
      runId: "run-1",
      reason: "complete",
      lastSeq: 1,
    });
    await expect(execution.completion).resolves.toMatchObject({ reason: "complete", lastSeq: 1 });

    transport.dispose();
    expect(fake.listeners.size).toBe(0);
  });

  it("keeps concurrent query operations isolated by operation and subscription identity", async () => {
    const fake = fakeBridge();
    const transport = new DesktopRealtimeTransport(new DesktopBridgeSession(fake.bridge));
    const firstEvents: number[] = [];
    const secondEvents: number[] = [];
    const first = transport.runs.startQuery({
      requestId: "operation-a",
      chatId: "chat-a",
      runId: "run-a",
      message: "first",
      owner,
      onEvent: (event) => firstEvents.push(Number(event.seq)),
    });
    const second = transport.runs.startQuery({
      requestId: "operation-b",
      chatId: "chat-b",
      runId: "run-b",
      message: "second",
      owner,
      onEvent: (event) => secondEvents.push(Number(event.seq)),
    });
    await flush();
    fake.emit({
      version: AGENT_WEBCLIENT_BRIDGE_VERSION,
      kind: "run.batch",
      delivery: { kind: "operation", operationId: "operation-b" },
      bindingEpoch: 1,
      chatId: "chat-b",
      runId: "run-b",
      events: [{ type: "content.delta", seq: 1 }],
      lastSeq: 1,
    });
    fake.emit({
      version: AGENT_WEBCLIENT_BRIDGE_VERSION,
      kind: "run.accepted",
      operationId: "operation-b",
      chatId: "chat-b",
      runId: "run-b",
      owner: { kind: "agent", agentKey: "agent-1" },
    });
    fake.emit({
      version: AGENT_WEBCLIENT_BRIDGE_VERSION,
      kind: "run.accepted",
      operationId: "operation-a",
      chatId: "chat-a",
      runId: "run-a",
      owner: { kind: "agent", agentKey: "agent-1" },
    });
    await Promise.all([first.accepted, second.accepted]);
    expect(firstEvents).toEqual([]);
    expect(secondEvents).toEqual([1]);
    await first.detach();
    await second.detach();
    transport.dispose();
  });

  it("starts a new query without preallocating chatId or runId", async () => {
    const fake = fakeBridge();
    const transport = new DesktopRealtimeTransport(new DesktopBridgeSession(fake.bridge));
    const execution = transport.runs.startQuery({
      requestId: "operation-missing",
      message: "hello",
      owner,
      onEvent: jest.fn(),
    });
    await flush();
    expect(fake.bridge.request).toHaveBeenCalledWith(expect.objectContaining({
      kind: "run.query",
      operationId: "operation-missing",
      owner: { kind: "agent", agentKey: "agent-1" },
    }));
    const request = (fake.bridge.request as jest.Mock).mock.calls[0][0];
    expect(request).not.toHaveProperty("chatId");
    expect(request).not.toHaveProperty("runId");
    expect(request.payload).not.toHaveProperty("runId");
    fake.emit({
      version: AGENT_WEBCLIENT_BRIDGE_VERSION,
      kind: "run.accepted",
      operationId: "operation-missing",
      chatId: "chat-canonical",
      runId: "run-canonical",
      owner: { kind: "agent", agentKey: "agent-1" },
    });
    await expect(execution.accepted).resolves.toMatchObject({
      chatId: "chat-canonical",
      runId: "run-canonical",
    });
    await execution.detach();
    expect(fake.bridge.detach).toHaveBeenCalledWith({
      version: AGENT_WEBCLIENT_BRIDGE_VERSION,
      target: { kind: "operation", operationId: "operation-missing" },
    });
    transport.dispose();
  });

  it("does not request a query when its signal was already aborted", async () => {
    const fake = fakeBridge();
    const transport = new DesktopRealtimeTransport(new DesktopBridgeSession(fake.bridge));
    const controller = new AbortController();
    controller.abort();
    const execution = transport.runs.startQuery({
      requestId: "operation-aborted",
      chatId: "chat-1",
      runId: "run-1",
      message: "hello",
      owner,
      signal: controller.signal,
      onEvent: jest.fn(),
    });
    await expect(execution.accepted).rejects.toMatchObject({ name: "AbortError" });
    await expect(execution.completion).resolves.toMatchObject({ reason: "detached" });
    expect(fake.bridge.request).not.toHaveBeenCalled();
    transport.dispose();
  });

  it("buffers subscription events until the subscribe ACK and rejects a later gap", async () => {
    const fake = fakeBridge();
    let resolveSubscribe!: (value: { ok: true; subscriptionId: string }) => void;
    (fake.bridge.subscribe as jest.Mock).mockImplementation(
      () => new Promise((resolve) => { resolveSubscribe = resolve; }),
    );
    const transport = new DesktopRealtimeTransport(new DesktopBridgeSession(fake.bridge));
    const events: number[] = [];
    const execution = transport.runs.subscribe({
      chatId: "chat-1",
      runId: "run-1",
      owner,
      lastSeq: 0,
      role: "overview",
      onEvent: (event) => events.push(Number(event.seq)),
    });
    await flush();
    const subscription = (fake.bridge.subscribe as jest.Mock).mock.calls[0][0] as AgentWebclientRealtimeSubscription;
    expect(subscription).toMatchObject({ kind: "run", role: "summary" });
    fake.emit({
      version: AGENT_WEBCLIENT_BRIDGE_VERSION,
      kind: "run.batch",
      delivery: { kind: "subscription", subscriptionId: "run-sub" },
      bindingEpoch: 2,
      chatId: "chat-1",
      runId: "run-1",
      events: [{ type: "content.delta", seq: 1 }],
      lastSeq: 1,
    });
    resolveSubscribe({ ok: true, subscriptionId: "run-sub" });
    await execution.accepted;
    expect(events).toEqual([1]);

    fake.emit({
      version: AGENT_WEBCLIENT_BRIDGE_VERSION,
      kind: "run.batch",
      delivery: { kind: "subscription", subscriptionId: "run-sub" },
      bindingEpoch: 1,
      chatId: "chat-1",
      runId: "run-1",
      events: [{ type: "content.delta", seq: 2 }],
      lastSeq: 2,
    });
    fake.emit({
      version: AGENT_WEBCLIENT_BRIDGE_VERSION,
      kind: "run.batch",
      delivery: { kind: "subscription", subscriptionId: "run-sub" },
      bindingEpoch: 2,
      chatId: "chat-1",
      runId: "run-1",
      events: [{ type: "content.delta", seq: 1 }],
      lastSeq: 1,
    });
    fake.emit({
      version: AGENT_WEBCLIENT_BRIDGE_VERSION,
      kind: "run.batch",
      delivery: { kind: "subscription", subscriptionId: "run-sub" },
      bindingEpoch: 2,
      chatId: "chat-1",
      runId: "run-1",
      events: [{ type: "content.delta", seq: 3 }],
      lastSeq: 3,
    });
    expect(events).toEqual([1]);
    await expect(execution.completion).resolves.toMatchObject({
      reason: "error",
      error: expect.objectContaining({ code: "replay_required" }),
    });
    transport.dispose();
  });

  it("supports filtered push consumers and unsubscribe before ACK", async () => {
    const fake = fakeBridge();
    const subscribeResolvers: Array<(value: { ok: true; subscriptionId: string }) => void> = [];
    (fake.bridge.subscribe as jest.Mock).mockImplementation(
      () => new Promise((resolve) => subscribeResolvers.push(resolve)),
    );
    const transport = new DesktopRealtimeTransport(new DesktopBridgeSession(fake.bridge));
    const received: string[] = [];
    const unsubscribe = transport.push.subscribe(
      { types: ["chat.updated"], chatId: "chat-1", runId: "run-1", agentKey: "agent-1" },
      (frame) => received.push(String(frame.type)),
    );
    await flush();
    fake.emit({
      version: AGENT_WEBCLIENT_BRIDGE_VERSION,
      kind: "push",
      subscriptionId: "push-sub",
      type: "chat.updated",
      data: { chatId: "chat-1", runId: "run-1", agentKey: "agent-1" },
    });
    subscribeResolvers[0]({ ok: true, subscriptionId: "push-sub" });
    await flush();
    expect(received).toEqual(["chat.updated"]);

    fake.emit({
      version: AGENT_WEBCLIENT_BRIDGE_VERSION,
      kind: "push",
      subscriptionId: "push-sub",
      type: "chat.updated",
      data: { chatId: "chat-1", runId: "run-1" },
    });
    expect(received).toEqual(["chat.updated"]);
    unsubscribe();

    const cancelEarly = transport.push.subscribe({ types: ["chat.updated"] }, jest.fn());
    await flush();
    cancelEarly();
    subscribeResolvers[1]({ ok: true, subscriptionId: "push-cancelled" });
    await flush();
    expect(fake.bridge.detach).toHaveBeenCalledWith({
      version: AGENT_WEBCLIENT_BRIDGE_VERSION,
      target: { kind: "subscription", subscriptionId: "push-cancelled" },
    });
    transport.dispose();
  });

  it("returns real Platform responses for all Bridge v2 controls", async () => {
    const fake = fakeBridge();
    const transport = new DesktopRealtimeTransport(new DesktopBridgeSession(fake.bridge));
    await expect(transport.runs.interrupt({
      requestId: "interrupt-1",
      chatId: "chat-1",
      runId: "run-1",
      owner,
      message: "stop",
    })).resolves.toMatchObject({ status: 200, data: { accepted: true, operationId: "interrupt-1" } });
    expect(fake.bridge.request).toHaveBeenCalledWith(expect.objectContaining({
      kind: "run.control",
      control: "interrupt",
      chatId: "chat-1",
      runId: "run-1",
    }));
    await expect(transport.runs.submitAwaiting({
      chatId: "chat-1",
      runId: "run-1",
      owner,
      awaitingId: "awaiting-1",
      submitId: "submit-1",
      params: [],
    })).resolves.toMatchObject({ data: { accepted: true, operationId: "submit-1" } });
    await expect(transport.runs.submitTool({
      chatId: "chat-1",
      runId: "run-1",
      owner,
      toolId: "tool-1",
      params: { accepted: true },
    })).resolves.toMatchObject({ data: { accepted: true } });
    expect((fake.bridge.request as jest.Mock).mock.calls.map(([input]) => input.control)).toEqual(
      expect.arrayContaining(["interrupt", "submitAwaiting", "submitTool"]),
    );
    await expect(transport.runs.steer({
      requestId: "steer-1",
      chatId: "chat-1",
      runId: "run-1",
      owner,
      message: "continue",
    })).resolves.toMatchObject({ status: 200 });
    await expect(transport.runs.updateAccessLevel({
      chatId: "chat-1",
      runId: "run-1",
      owner,
      requestId: "access-1",
      accessLevel: "auto_approve",
    })).resolves.toMatchObject({ status: 200 });
    expect((fake.bridge.request as jest.Mock).mock.calls.map(([input]) => input.control)).toEqual(
      expect.arrayContaining(["interrupt", "submitAwaiting", "submitTool", "steer", "updateAccessLevel"]),
    );
    const btw = transport.runs.startBtw({
      requestId: "btw-1",
      chatId: "chat-1",
      runId: "run-1",
      message: "aside",
      owner,
      onEvent: jest.fn(),
    });
    await expect(btw.accepted).rejects.toMatchObject({
      code: "unsupported_in_current_view",
    });
    const terminal = transport.terminal.open({
      agentKey: "agent-1",
      terminalKey: "main",
      cols: 80,
      rows: 24,
      onEvent: jest.fn(),
    });
    await expect(terminal.accepted).rejects.toMatchObject({ code: "terminal_unsupported" });
    transport.dispose();
  });

  it("preserves Platform 409 semantics for Bridge v2 controls", async () => {
    const fake = fakeBridge();
    (fake.bridge.request as jest.Mock).mockResolvedValueOnce({
      ok: true,
      operationId: "interrupt-409",
      response: {
        status: 409,
        code: 409,
        msg: "awaiting state changed",
        data: { awaitingId: "awaiting-2" },
      },
    });
    const transport = new DesktopRealtimeTransport(new DesktopBridgeSession(fake.bridge));
    await expect(transport.runs.interrupt({
      requestId: "interrupt-409",
      chatId: "chat-1",
      runId: "run-1",
      owner,
      message: "stop",
    })).rejects.toMatchObject({
      name: "ApiError",
      status: 409,
      code: 409,
      message: "awaiting state changed",
      data: { awaitingId: "awaiting-2" },
    });
    transport.dispose();
  });
});
