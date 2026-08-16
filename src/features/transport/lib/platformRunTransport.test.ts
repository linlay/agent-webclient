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

  it("detaches once while inactive and reattaches from lastSeq when active again", async () => {
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

    transport.setSurfaceActive(true);
    transport.setSurfaceActive(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(client.stream).toHaveBeenCalledTimes(2);
    expect(streamOptions[1]).toMatchObject({
      type: dataEndpoints.attach.path,
      payload: { runId: "run-1", agentKey: "agent-1", lastSeq: 7 },
    });
    await execution.detach();
  });
});
