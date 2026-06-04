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
});
