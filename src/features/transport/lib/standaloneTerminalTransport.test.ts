import type { AgentEvent } from "@/app/state/types";
import { dataEndpoints } from "@/shared/data/api/endpoints";

const mockEnsureStandaloneWsClient = jest.fn();

jest.mock("@/features/transport/lib/standaloneWsClient", () => ({
  ensureStandaloneWsClient: () => mockEnsureStandaloneWsClient(),
}));

const event = (value: Partial<AgentEvent>): AgentEvent => value as AgentEvent;

describe("StandaloneTerminalTransport", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("buffers output until terminal.opened and keeps detach distinct from close", async () => {
    let streamOptions: any;
    const abort = jest.fn();
    const request = jest.fn().mockResolvedValue({ data: {} });
    mockEnsureStandaloneWsClient.mockResolvedValue({
      stream: jest.fn((options) => {
        streamOptions = options;
        return { requestId: "terminal-stream-1", abort };
      }),
      request,
    });
    const { StandaloneTerminalTransport } = await import("./standaloneTerminalTransport");
    const transport = new StandaloneTerminalTransport();
    const onEvent = jest.fn();
    const execution = transport.open({
      agentKey: "agent-1",
      terminalKey: "main",
      cols: 80,
      rows: 24,
      onEvent,
    });
    await Promise.resolve();
    await Promise.resolve();

    streamOptions.onEvent(event({ type: "terminal.output", seq: 1 }));
    expect(onEvent).not.toHaveBeenCalled();
    streamOptions.onEvent(event({
      type: "terminal.opened",
      terminalId: "terminal-1",
      seq: 2,
    } as Partial<AgentEvent>));

    await expect(execution.accepted).resolves.toEqual({
      requestId: "terminal-stream-1",
      terminalId: "terminal-1",
      agentKey: "agent-1",
      terminalKey: "main",
    });
    expect(onEvent.mock.calls.map(([item]) => item.type)).toEqual([
      "terminal.output",
      "terminal.opened",
    ]);

    await execution.write("pwd\n");
    await execution.resize(120, 40);
    await Promise.all([execution.detach(), execution.detach()]);
    await Promise.all([execution.close(), execution.close()]);

    expect(abort).toHaveBeenCalledTimes(1);
    expect(request.mock.calls.map(([call]) => call.type)).toEqual([
      dataEndpoints.terminalInput.path,
      dataEndpoints.terminalResize.path,
      dataEndpoints.terminalDetach.path,
      dataEndpoints.terminalClose.path,
    ]);
    await expect(execution.completion).resolves.toMatchObject({ reason: "detached" });
  });
});
