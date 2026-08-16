import type { AgentEvent } from "@/app/state/types";
import { dataEndpoints } from "@/shared/data/api/endpoints";

const mockEnsureStandaloneWsClient = jest.fn();

jest.mock("@/features/transport/lib/standaloneWsClient", () => ({
  ensureStandaloneWsClient: () => mockEnsureStandaloneWsClient(),
}));

const event = (value: Partial<AgentEvent>): AgentEvent => value as AgentEvent;

describe("StandaloneRunTransport", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("buffers pre-acceptance events and flushes them after Run identity is known", async () => {
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
    const { StandaloneRunTransport } = await import("./standaloneRunTransport");
    const onEvent = jest.fn();
    const transport = new StandaloneRunTransport();

    const execution = transport.startQuery({
      requestId: "request-1",
      chatId: "chat-1",
      owner: { kind: "agent", agentKey: "agent-1" },
      onEvent,
    } as any);
    await Promise.resolve();
    await Promise.resolve();

    let accepted = false;
    void execution.accepted.then(() => {
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

    await expect(execution.accepted).resolves.toMatchObject({
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
    const { StandaloneRunTransport } = await import("./standaloneRunTransport");
    const transport = new StandaloneRunTransport();
    const execution = transport.subscribe({
      chatId: "chat-1",
      runId: "run-1",
      owner: { kind: "agent", agentKey: "agent-1" },
      onEvent: jest.fn(),
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(streamOptions.type).toBe(dataEndpoints.attach.path);
    await execution.accepted;

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
});
