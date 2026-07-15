import { buildChatCopyInfoGroups } from "@/features/chats/lib/chatCopyInfo";

const t = (key: string) => key;

describe("buildChatCopyInfoGroups", () => {
  it("maps chat metadata, aggregate usage, and advanced JSON fields", () => {
    const groups = buildChatCopyInfoGroups({
      summary: { chatId: "chat-1", chatName: "Fallback" },
      detail: {
        chatId: "chat-1",
        chatName: "Planning",
        agentKey: "agent-a",
        firstAgentKey: "agent-a",
        firstAgentName: "Agent A",
        teamId: "team-a",
        source: "sidebar",
        createdAt: 1713781200000,
        updatedAt: 1713784800000,
        lastRunId: "run-9",
        lastRunContent: "Done",
        activeRun: {
          runId: "run-10",
          agentKey: "agent-a",
          status: "running",
        },
        usage: {
          totalTokens: 1,
          chat: {
            modelKey: "gpt-5",
            promptTokens: 120,
            completionTokens: 30,
            totalTokens: 150,
            toolCallCount: 4,
            llmChatCompletionCount: 2,
            estimatedCost: { currency: "USD", total: 0.01 },
          },
        },
        plan: { planId: "plan-1" },
        runs: [{ runId: "run-9" }],
      },
      t,
    });

    const rows = groups.flatMap((group) => group.rows);
    expect(rows.find((row) => row.key === "createdAt")).toMatchObject({
      copyValue: "1713781200000",
      displayValue: "2024-04-22T10:20:00.000Z",
    });
    expect(rows.find((row) => row.key === "activeRunId")?.copyValue).toBe("run-10");
    expect(rows.find((row) => row.key === "totalTokens")?.copyValue).toBe("150");
    expect(rows.find((row) => row.key === "plan")?.code).toBe(true);
    expect(groups.find((group) => group.key === "advanced")?.collapsed).toBe(true);
  });

  it("shows summary identity before detail is available", () => {
    const groups = buildChatCopyInfoGroups({
      summary: { chatId: "chat-2", chatName: "Summary name" },
      t,
    });
    const rows = groups.flatMap((group) => group.rows);

    expect(rows.map((row) => row.key)).toEqual(["id", "name"]);
  });
});
