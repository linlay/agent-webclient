import type { AgentEvent } from "@/app/state/types";
import type { WsClient } from "@/features/transport/lib/wsClient";
import { dataEndpoints } from "@/shared/data";
import { createTerminalRemoteSession } from "@/features/terminal/lib/terminalRemoteSession";

type StreamOptions = {
  readonly type: string;
  readonly payload: unknown;
  readonly onEvent: (event: AgentEvent) => void;
};

function createMockClient() {
  const abort = jest.fn();
  let streamOptions: StreamOptions | null = null;
  const client = {
    stream: jest.fn((options: StreamOptions) => {
      streamOptions = options;
      return { requestId: "stream-terminal", abort };
    }),
    request: jest.fn(() => Promise.resolve({ code: 0, data: null })),
  } as unknown as WsClient;
  return {
    client,
    abort,
    getStreamOptions: () => {
      if (!streamOptions) {
        throw new Error("stream options were not captured");
      }
      return streamOptions;
    },
  };
}

describe("createTerminalRemoteSession", () => {
  it("opens with terminalKey and detaches the stream without closing the PTY", async () => {
    const { client, abort, getStreamOptions } = createMockClient();
    const onEvent = jest.fn();
    const session = createTerminalRemoteSession({
      client,
      agentKey: "coder",
      terminalKey: "main",
      cols: 80,
      rows: 24,
      onEvent,
    });

    expect(client.stream).toHaveBeenCalledWith(
      expect.objectContaining({
        type: dataEndpoints.terminalOpen.path,
        payload: {
          agentKey: "coder",
          terminalKey: "main",
          cols: 80,
          rows: 24,
        },
      }),
    );
    getStreamOptions().onEvent({
      type: "terminal.opened",
      terminalId: "term_1",
    } as AgentEvent);

    await session.detach();

    expect(client.request).toHaveBeenCalledWith({
      type: dataEndpoints.terminalDetach.path,
      payload: {
        terminalId: "term_1",
        streamRequestId: "stream-terminal",
      },
    });
    expect(client.request).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: dataEndpoints.terminalClose.path }),
    );
    expect(abort).toHaveBeenCalledTimes(1);
  });

  it("closes the remote terminal only when close is called", async () => {
    const { client, abort, getStreamOptions } = createMockClient();
    const session = createTerminalRemoteSession({
      client,
      agentKey: "coder",
      terminalKey: "main",
      cols: 80,
      rows: 24,
      onEvent: jest.fn(),
    });
    getStreamOptions().onEvent({
      type: "terminal.opened",
      terminalId: "term_2",
    } as AgentEvent);

    await session.close();

    expect(client.request).toHaveBeenCalledWith({
      type: dataEndpoints.terminalClose.path,
      payload: {
        terminalId: "term_2",
        streamRequestId: "stream-terminal",
      },
    });
    expect(client.request).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: dataEndpoints.terminalDetach.path }),
    );
    expect(abort).toHaveBeenCalledTimes(1);
  });

  it("sends input and resize to the opened terminal", async () => {
    const { client, getStreamOptions } = createMockClient();
    const session = createTerminalRemoteSession({
      client,
      agentKey: "coder",
      terminalKey: "main",
      cols: 80,
      rows: 24,
      onEvent: jest.fn(),
    });
    getStreamOptions().onEvent({
      type: "terminal.opened",
      terminalId: "term_3",
    } as AgentEvent);

    await session.sendInput("printf hi\\n");
    await session.resize(120, 30);

    expect(client.request).toHaveBeenCalledWith({
      type: dataEndpoints.terminalInput.path,
      payload: {
        terminalId: "term_3",
        data: "printf hi\\n",
      },
    });
    expect(client.request).toHaveBeenCalledWith({
      type: dataEndpoints.terminalResize.path,
      payload: {
        terminalId: "term_3",
        cols: 120,
        rows: 30,
      },
    });
  });

  it("detaches by stream request id before terminal.opened arrives", async () => {
    const { client, abort } = createMockClient();
    const session = createTerminalRemoteSession({
      client,
      agentKey: "coder",
      terminalKey: "main",
      cols: 80,
      rows: 24,
      onEvent: jest.fn(),
    });

    await session.detach();

    expect(client.request).toHaveBeenCalledWith({
      type: dataEndpoints.terminalDetach.path,
      payload: {
        streamRequestId: "stream-terminal",
      },
    });
    expect(abort).toHaveBeenCalledTimes(1);
  });

  it("closes by stream request id before terminal.opened arrives", async () => {
    const { client, abort } = createMockClient();
    const session = createTerminalRemoteSession({
      client,
      agentKey: "coder",
      terminalKey: "main",
      cols: 80,
      rows: 24,
      onEvent: jest.fn(),
    });

    await session.close();

    expect(client.request).toHaveBeenCalledWith({
      type: dataEndpoints.terminalClose.path,
      payload: {
        streamRequestId: "stream-terminal",
      },
    });
    expect(abort).toHaveBeenCalledTimes(1);
  });
});
