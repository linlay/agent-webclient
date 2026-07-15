import { buildChatCopyInfoGroups } from "@/features/chats/lib/chatCopyInfo";

const t = (key: string) => key;

describe("buildChatCopyInfoGroups", () => {
  it("maps chat metadata into the basic information group", () => {
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
      },
      t,
    });

    const rows = groups.flatMap((group) => group.rows);
    expect(rows.find((row) => row.key === "createdAt")).toMatchObject({
      copyValue: "1713781200000",
      displayValue: "2024-04-22T10:20:00.000Z",
    });
    expect(rows.find((row) => row.key === "agentKey")?.copyValue).toBe("agent-a");
    expect(groups.map((group) => group.key)).toEqual(["basic"]);
  });

  it("shows summary identity and AgentKey before detail is available", () => {
    const groups = buildChatCopyInfoGroups({
      summary: { chatId: "chat-2", chatName: "Summary name", agentKey: "agent-summary" },
      t,
    });
    const rows = groups.flatMap((group) => group.rows);

    expect(rows.map((row) => row.key)).toEqual(["id", "name", "agentKey"]);
    expect(rows.find((row) => row.key === "agentKey")?.copyValue).toBe("agent-summary");
  });
});
