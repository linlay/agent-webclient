const mockEnsureStandaloneWsClient = jest.fn();
const mockSubscribeWsPush = jest.fn();

jest.mock("@/features/transport/lib/standaloneWsClient", () => ({
  ensureStandaloneWsClient: () => mockEnsureStandaloneWsClient(),
}));

jest.mock("@/features/transport/lib/wsClientSingleton", () => ({
  subscribeWsPush: (listener: unknown) => mockSubscribeWsPush(listener),
}));

describe("StandalonePushTransport", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("supports independent filtered consumers and immediate unsubscribe", async () => {
    const listeners: Array<(frame: any) => void> = [];
    const unsubscribers = [jest.fn(), jest.fn()];
    mockSubscribeWsPush.mockImplementation((listener) => {
      const index = listeners.push(listener) - 1;
      return unsubscribers[index];
    });
    const connect = jest.fn().mockResolvedValue(undefined);
    mockEnsureStandaloneWsClient.mockResolvedValue({ connect });
    const { StandalonePushTransport } = await import("./standalonePushTransport");
    const transport = new StandalonePushTransport();
    const chatListener = jest.fn();
    const agentListener = jest.fn();

    const unsubscribeChat = transport.subscribe(
      { types: ["run.start"], chatId: "chat-1" },
      chatListener,
    );
    transport.subscribe(
      { types: ["catalog.updated"], agentKey: "agent-2" },
      agentListener,
    );
    unsubscribeChat();
    listeners[0]?.({ frame: "push", type: "run.start", payload: { chatId: "chat-1" } });
    listeners[1]?.({
      frame: "push",
      type: "catalog.updated",
      data: { agentKey: "agent-2" },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(chatListener).not.toHaveBeenCalled();
    expect(agentListener).toHaveBeenCalledTimes(1);
    expect(unsubscribers[0]).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalled();
  });
});
