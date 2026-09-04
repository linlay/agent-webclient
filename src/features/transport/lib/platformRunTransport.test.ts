import type { AgentEvent } from "@/app/state/types";
import { dataEndpoints } from "@/shared/data/api/endpoints";

const mockEnsureStandaloneWsClient = jest.fn();

jest.mock("@/features/transport/lib/standaloneWsClient", () => ({
  ensureStandaloneWsClient: () => mockEnsureStandaloneWsClient(),
}));

const event = (value: Partial<AgentEvent>): AgentEvent => value as AgentEvent;

describe("PlatformRunTransport", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("buffers pre-identity events and flushes them after canonical Run identity is known", async () => {
    let streamOptions: any;
    const abort = jest.fn();
    const client = {
      stream: jest.fn((options) => {
        streamOptions = options;
        return { requestId: "stream-1", abort };
      }),
      request: jest.fn().mockResolvedValue({ data: {} }),
    };
    mockEnsureStandaloneWsClient.mockResolvedValue(client);
    const { PlatformRunTransport } = await import("./platformRunTransport");
    const onEvent = jest.fn();
    const transport = new PlatformRunTransport();

    const execution = transport.startQuery({
      requestId: "request-1",
      chatId: "chat-1",
      owner: { kind: "agent", agentKey: "agent-1" },
      onEvent,
    } as any);
    await Promise.resolve();
    await Promise.resolve();

    let accepted = false;
    void execution.identity.then(() => {
      accepted = true;
    });
    streamOptions.onEvent(event({ type: "thinking", chatId: "chat-1", seq: 1 }));
    await Promise.resolve();
    expect(accepted).toBe(false);
    expect(onEvent).not.toHaveBeenCalled();

    streamOptions.onEvent(event({
      type: "run.start",
      chatId: "chat-1",
      runId: "run-1",
      agentKey: "agent-1",
      seq: 2,
    }));

    await expect(execution.identity).resolves.toMatchObject({
      requestId: "request-1",
      chatId: "chat-1",
      runId: "run-1",
      owner: { kind: "agent", agentKey: "agent-1" },
      lastSeq: 2,
    });
    expect(onEvent.mock.calls.map(([item]) => item.seq)).toEqual([1, 2]);
  });

  it("starts BTW through the Platform stream endpoint", async () => {
    let streamOptions: any;
    const client = {
      stream: jest.fn((options) => {
        streamOptions = options;
        return { requestId: "btw-stream-1", abort: jest.fn() };
      }),
      request: jest.fn().mockResolvedValue({ data: {} }),
    };
    const { PlatformRunTransport } = await import("./platformRunTransport");
    const transport = new PlatformRunTransport(async () => client as any);
    const execution = transport.startBtw({
      requestId: "request-btw-1",
      runId: "run-btw-1",
      chatId: "chat-1",
      message: "side question",
      owner: { kind: "orchestrated-team", teamId: "team-1" },
      onEvent: jest.fn(),
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(streamOptions).toMatchObject({
      type: dataEndpoints.btw.path,
      payload: {
        requestId: "request-btw-1",
        runId: "run-btw-1",
        chatId: "chat-1",
        message: "side question",
      },
    });
    expect(streamOptions.payload).not.toHaveProperty("agentKey");
    expect(streamOptions.payload).not.toHaveProperty("teamId");

    streamOptions.onEvent(event({
      type: "run.start",
      chatId: "chat-1",
      runId: "run-btw-1",
      teamId: "team-1",
      seq: 1,
    }));
    await execution.identity;
    await execution.detach();
  });

  it("routes Run controls through Platform requests and returns acknowledgements", async () => {
    const acknowledgement = {
      status: 200,
      code: 0,
      msg: "ok",
      data: {
        accepted: true,
        status: "accepted",
        runId: "run-team-1",
        detail: "interrupt accepted",
      },
    };
    const request = jest.fn().mockResolvedValue(acknowledgement);
    const { PlatformRunTransport } = await import("./platformRunTransport");
    const transport = new PlatformRunTransport(async () => ({ request }) as any);
    const owner = { kind: "orchestrated-team" as const, teamId: "team-1" };

    await expect(transport.interrupt({
      requestId: "req-interrupt",
      chatId: "chat-1",
      runId: "run-team-1",
      owner,
      message: "",
    })).resolves.toBe(acknowledgement);
    await transport.steer({
      requestId: "req-steer",
      chatId: "chat-1",
      runId: "run-team-1",
      steerId: "steer-1",
      owner,
      message: "continue",
    });
    await transport.submitTool({
      runId: "run-team-1",
      owner,
      toolId: "tool-1",
      params: { city: "beijing" },
    });
    await transport.submitAwaiting({
      chatId: "chat-1",
      runId: "run-team-1",
      owner,
      awaitingId: "await-1",
      submitId: "submit-1",
      params: [],
    });
    await transport.updateAccessLevel({
      requestId: "req-access",
      runId: "run-team-1",
      owner,
      accessLevel: "auto_approve",
    });

    expect(request.mock.calls).toEqual([
      [{
        type: dataEndpoints.interrupt.path,
        payload: {
          requestId: "req-interrupt",
          chatId: "chat-1",
          runId: "run-team-1",
          teamId: "team-1",
        },
      }],
      [{
        type: dataEndpoints.steer.path,
        payload: {
          requestId: "req-steer",
          chatId: "chat-1",
          runId: "run-team-1",
          steerId: "steer-1",
          teamId: "team-1",
          message: "continue",
        },
      }],
      [{
        type: dataEndpoints.submit.path,
        payload: {
          runId: "run-team-1",
          teamId: "team-1",
          toolId: "tool-1",
          params: { city: "beijing" },
        },
      }],
      [{
        type: dataEndpoints.submit.path,
        payload: {
          chatId: "chat-1",
          runId: "run-team-1",
          teamId: "team-1",
          awaitingId: "await-1",
          submitId: "submit-1",
          params: [],
        },
      }],
      [{
        type: dataEndpoints.accessLevelUpdate.path,
        payload: {
          requestId: "req-access",
          runId: "run-team-1",
          teamId: "team-1",
          accessLevel: "auto_approve",
        },
      }],
    ]);
  });

  it("detaches locally and remotely exactly once", async () => {
    let streamOptions: any;
    const abort = jest.fn();
    const request = jest.fn().mockResolvedValue({ data: {} });
    mockEnsureStandaloneWsClient.mockResolvedValue({
      stream: jest.fn((options) => {
        streamOptions = options;
        return { requestId: "stream-2", abort };
      }),
      request,
    });
    const { PlatformRunTransport } = await import("./platformRunTransport");
    const transport = new PlatformRunTransport();
    const execution = transport.subscribe({
      chatId: "chat-1",
      runId: "run-1",
      owner: { kind: "agent", agentKey: "agent-1" },
      onEvent: jest.fn(),
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(streamOptions.type).toBe(dataEndpoints.attach.path);
    await execution.identity;

    await Promise.all([execution.detach(), execution.detach()]);

    expect(abort).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith({
      type: dataEndpoints.detach.path,
      payload: {
        runId: "run-1",
        agentKey: "agent-1",
        reason: "consumer_detach",
      },
    });
    await expect(execution.completion).resolves.toMatchObject({ reason: "detached" });
  });

  it("does not send a remote detach after the observed stream already completed", async () => {
    let streamOptions: any;
    const abort = jest.fn();
    const request = jest.fn().mockResolvedValue({ data: {} });
    mockEnsureStandaloneWsClient.mockResolvedValue({
      stream: jest.fn((options) => {
        streamOptions = options;
        return { requestId: "stream-complete", abort };
      }),
      request,
    });
    const { PlatformRunTransport } = await import("./platformRunTransport");
    const transport = new PlatformRunTransport();
    const execution = transport.subscribe({
      chatId: "chat-1",
      runId: "run-1",
      owner: { kind: "agent", agentKey: "agent-1" },
      onEvent: jest.fn(),
    });
    await Promise.resolve();
    await Promise.resolve();
    await execution.identity;

    streamOptions.onDone("done", 8);
    await expect(execution.completion).resolves.toMatchObject({
      reason: "done",
      lastSeq: 8,
    });
    await execution.detach();

    expect(abort).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it("releases the old observer while inactive and requires a fresh recovery attach", async () => {
    const streamOptions: any[] = [];
    const aborts: jest.Mock[] = [];
    const request = jest.fn().mockResolvedValue({ data: {} });
    const client = {
      stream: jest.fn((options) => {
        streamOptions.push(options);
        const abort = jest.fn();
        aborts.push(abort);
        return { requestId: `stream-${streamOptions.length}`, abort };
      }),
      request,
    };
    const { PlatformRunTransport } = await import("./platformRunTransport");
    const transport = new PlatformRunTransport(async () => client as any);
    const execution = transport.subscribe({
      chatId: "chat-1",
      runId: "run-1",
      owner: { kind: "agent", agentKey: "agent-1" },
      lastSeq: 7,
      onEvent: jest.fn(),
    });
    await Promise.resolve();
    await Promise.resolve();
    await execution.identity;

    transport.setSurfaceActive(false);
    transport.setSurfaceActive(false);
    await Promise.resolve();
    expect(aborts[0]).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith({
      type: dataEndpoints.detach.path,
      payload: {
        runId: "run-1",
        agentKey: "agent-1",
        reason: "surface_inactive",
      },
    });
    await expect(execution.completion).resolves.toMatchObject({
      reason: "detached",
      lastSeq: 7,
    });

    transport.setSurfaceActive(true);
    transport.setSurfaceActive(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(client.stream).toHaveBeenCalledTimes(1);

    const recoveredExecution = transport.subscribe({
      chatId: "chat-1",
      runId: "run-1",
      owner: { kind: "agent", agentKey: "agent-1" },
      lastSeq: 9,
      onEvent: jest.fn(),
    });
    await Promise.resolve();
    await Promise.resolve();
    await recoveredExecution.identity;
    expect(client.stream).toHaveBeenCalledTimes(2);
    expect(streamOptions[1]).toMatchObject({
      type: dataEndpoints.attach.path,
      payload: { runId: "run-1", agentKey: "agent-1", lastSeq: 9 },
    });
    await recoveredExecution.detach();
  });

  it("stops UI delivery before identity and detaches as soon as bootstrap identifies the Run", async () => {
    let streamOptions: any;
    const abort = jest.fn();
    const request = jest.fn().mockResolvedValue({ data: {} });
    const client = {
      stream: jest.fn((options) => {
        streamOptions = options;
        return { requestId: "stream-pending-identity", abort };
      }),
      request,
    };
    const { PlatformRunTransport } = await import("./platformRunTransport");
    const transport = new PlatformRunTransport(async () => client as any);
    const onEvent = jest.fn();
    const execution = transport.startQuery({
      requestId: "request-pending-identity",
      message: "hello",
      owner: { kind: "agent", agentKey: "agent-1" },
      onEvent,
    });
    await Promise.resolve();
    await Promise.resolve();

    transport.setSurfaceActive(false);
    streamOptions.onEvent(event({
      seq: 1,
      type: "chat.start",
      chatId: "chat-pending",
    }));
    expect(onEvent).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();

    streamOptions.onEvent(event({
      seq: 2,
      type: "request.query",
      chatId: "chat-pending",
      runId: "run-pending",
      agentKey: "agent-1",
    }));

    await expect(execution.identity).resolves.toMatchObject({
      chatId: "chat-pending",
      runId: "run-pending",
      lastSeq: 2,
    });
    await expect(execution.completion).resolves.toMatchObject({
      reason: "detached",
      lastSeq: 2,
    });
    expect(abort).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith({
      type: dataEndpoints.detach.path,
      payload: {
        runId: "run-pending",
        agentKey: "agent-1",
        reason: "surface_inactive",
      },
    });
    expect(onEvent).not.toHaveBeenCalled();
  });
});
