import { isAgentExecutionBlocked } from "./agentAvailability";

it("uses persisted Chat ownership rather than a healthy selected Agent", () => {
  const state = { chatId: "history", workerSelectionKey: "agent:healthy",
    chatAgentById: new Map([["history", "deleted"]]),
    agentAvailability: { deleted: "unavailable" as const, healthy: "available" as const } };
  expect(isAgentExecutionBlocked(state)).toBe(true);
  expect(isAgentExecutionBlocked(state, "healthy")).toBe(false);
  expect(isAgentExecutionBlocked({ ...state, chats: [{ chatId: "history", agentKey: "team" }] })).toBe(true);
});
