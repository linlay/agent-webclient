import { resolveChatAgentKey, resolveRunAgentKey } from "@/features/chats/lib/runAgentIdentity";

describe("runAgentIdentity", () => {
  it("prefers chat summary agent over stale chat-agent bindings", () => {
    const chatAgentById = new Map([["chat_1", "stale-agent"]]);
    const chats = [{ chatId: "chat_1", agentKey: "zenmind-env" }];

    expect(
      resolveChatAgentKey({
        chatId: "chat_1",
        chatAgentById,
        chats,
      }),
    ).toBe("zenmind-env");
  });

  it("uses chat summary agent when resolving the current run fallback", () => {
    const chatAgentById = new Map([["chat_1", "stale-agent"]]);
    const chats = [{ chatId: "chat_1", firstAgentKey: "zenmind-env" }];

    expect(
      resolveRunAgentKey({
        chatId: "chat_1",
        chatAgentById,
        chats,
      }),
    ).toBe("zenmind-env");
  });

  it("prefers backend run metadata over composer routing context", () => {
    expect(
      resolveRunAgentKey({
        runId: "run_1",
        runAgentById: new Map([["run_1", "metadata-agent"]]),
        routingAgentKey: "composer-agent",
        currentRunAgentKey: "live-agent",
      }),
    ).toBe("metadata-agent");
  });

  it("prefers current backend event metadata over stored run bindings", () => {
    expect(
      resolveRunAgentKey({
        runId: "run_1",
        metadataAgentKey: "event-agent",
        runAgentById: new Map([["run_1", "stored-agent"]]),
        routingAgentKey: "composer-agent",
      }),
    ).toBe("event-agent");
  });

  it("uses composer routing context before frontend live session fallbacks", () => {
    expect(
      resolveRunAgentKey({
        runId: "run_1",
        routingAgentKey: "composer-agent",
        currentRunAgentKey: "live-agent",
        chatId: "chat_1",
        chatAgentById: new Map([["chat_1", "chat-agent"]]),
      }),
    ).toBe("composer-agent");
  });
});
