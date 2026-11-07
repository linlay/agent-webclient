import { mailChatStatus } from "./mailChatStatus";
it("uses authoritative waiting before running", () => {
  expect(mailChatStatus({ chatId: "c", activeRun: { runId: "r" }, awaiting: { status: "awaiting", mode: "approval" } })).toBe("approval");
  expect(mailChatStatus({ chatId: "c", hasPendingAwaiting: true })).toBe("waiting");
});
it("does not confuse resolved or historical waiting with current approval", () => {
  expect(mailChatStatus({ chatId: "c", activeRun: null, awaiting: { status: "answered", mode: "approval" }, events: [{ type: "awaiting.ask", mode: "approval" }] })).toBe("idle");
});
it("distinguishes running, idle, missing and failed snapshots", () => {
  expect(mailChatStatus({ chatId: "c", activeRun: { runId: "r" } })).toBe("running");
  expect(mailChatStatus({ chatId: "c", hasActiveRun: false })).toBe("idle");
  expect(mailChatStatus({ chatId: "c" })).toBe("unknown");
  expect(mailChatStatus(null)).toBe("unknown");
});
