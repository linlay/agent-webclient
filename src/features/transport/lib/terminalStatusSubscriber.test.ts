import type { AgentEvent } from "@/shared/contracts/agentEvents";
import { dataEndpoints } from "@/shared/data/api/endpoints";
import { StandaloneTerminalStatusSubscriber } from "./terminalStatusSubscriber";

const mockEnsureStandaloneWsClient = jest.fn();

jest.mock("@/features/transport/lib/standaloneWsClient", () => ({
  ensureStandaloneWsClient: () => mockEnsureStandaloneWsClient(),
}));

describe("StandaloneTerminalStatusSubscriber", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("subscribes to /api/terminal/status, shares stream across listeners, and detaches on final unsubscribe", async () => {
    let streamOptions: {
      type: string;
      payload: unknown;
      onEvent: (event: AgentEvent) => void;
      onDone: () => void;
      onError: (error: Error) => void;
    } | null = null;
    const abort = jest.fn();
    const request = jest.fn().mockResolvedValue({ data: {} });
    const stream = jest.fn((options) => {
      streamOptions = options;
      return { requestId: "status-req-1", abort };
    });
    mockEnsureStandaloneWsClient.mockResolvedValue({ stream, request });

    const subscriber = new StandaloneTerminalStatusSubscriber();
    const listenerA = jest.fn();
    const listenerB = jest.fn();

    const unsubA = subscriber.subscribe(listenerA);
    const unsubB = subscriber.subscribe(listenerB);
    await Promise.resolve();
    await Promise.resolve();

    expect(stream).toHaveBeenCalledTimes(1);
    expect(streamOptions?.type).toBe(dataEndpoints.terminalStatus.path);

    const statusEvent = { type: "terminal.status.snapshot", sessions: [] } as unknown as AgentEvent;
    streamOptions?.onEvent(statusEvent);
    expect(listenerA).toHaveBeenCalledWith(statusEvent);
    expect(listenerB).toHaveBeenCalledWith(statusEvent);

    // Unsubscribing one listener keeps the stream alive.
    unsubA();
    await Promise.resolve();
    expect(abort).not.toHaveBeenCalled();

    // Unsubscribing final listener sends detach and aborts.
    unsubB();
    await Promise.resolve();
    await Promise.resolve();
    expect(request).toHaveBeenCalledWith({
      type: dataEndpoints.terminalStatusDetach.path,
      payload: { streamRequestId: "status-req-1" },
    });
    expect(abort).toHaveBeenCalledTimes(1);
  });

  it("reconnects after 2s when status stream ends abnormally and cleans up timers on dispose", async () => {
    let streamOptions: {
      onEvent: (event: AgentEvent) => void;
      onDone: () => void;
      onError: (error: Error) => void;
    } | null = null;
    const abort = jest.fn();
    const request = jest.fn().mockResolvedValue({ data: {} });
    const stream = jest.fn((options) => {
      streamOptions = options;
      return { requestId: "status-req-2", abort };
    });
    mockEnsureStandaloneWsClient.mockResolvedValue({ stream, request });

    const subscriber = new StandaloneTerminalStatusSubscriber();
    subscriber.subscribe(jest.fn());
    await Promise.resolve();
    await Promise.resolve();
    expect(stream).toHaveBeenCalledTimes(1);

    streamOptions?.onError(new Error("socket dropped"));
    jest.advanceTimersByTime(1999);
    expect(stream).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(stream).toHaveBeenCalledTimes(2);

    // Dispose while second stream is active aborts it and stops future reconnects.
    subscriber.dispose();
    await Promise.resolve();
    await Promise.resolve();
    expect(abort).toHaveBeenCalledTimes(1);

    // Even if onDone fires or time advances afterwards, no further reconnect occurs.
    streamOptions?.onDone();
    jest.advanceTimersByTime(5000);
    await Promise.resolve();
    expect(stream).toHaveBeenCalledTimes(2);
  });
});
