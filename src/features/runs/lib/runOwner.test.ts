import {
  readChatRunOwner,
  resolveRunOwner,
} from "@/features/runs/lib/runOwner";

describe("RunOwner", () => {
  it("normalizes every Team chat to an orchestrated Team owner and drops stale agent keys", () => {
    expect(readChatRunOwner({
      chatId: "chat_team",
    agentKey: "team_1"
})).toEqual({kind: "agent", agentKey: "team_1"});
  });


  it("keeps the saved Team owner when a member event reports agentKey", () => {
    expect(resolveRunOwner({
      chatId: "chat_team",
      chats: [{
        chatId: "chat_team",
            agentKey: "team_1"
      }],
      currentRunOwner: { kind: "agent", agentKey: "run_member" },
    eventIdentity: { agentKey: "event_member" }
})).toEqual({kind: "agent", agentKey: "team_1"});
  });

  it("resolves an Agent owner when no Team route exists", () => {
    expect(resolveRunOwner({
      chatId: "chat_agent",
      chats: [{ chatId: "chat_agent", agentKey: "agent_1" }],
    eventIdentity: { agentKey: "event_member" }
    })).toEqual({ kind: "agent", agentKey: "agent_1" });
  });
});
