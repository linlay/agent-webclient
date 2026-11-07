import { mailTargetReasoning } from "./mailTargetReasoning";
import type { ChatDetailResponse } from "@/shared/data/api/dto/chats";
const chat: ChatDetailResponse = { chatId: "target", events: [
  { type: "request.query", runId: "old", model: { reasoningEffort: "LOW" } },
  { type: "run.start", runId: "current" },
  { type: "request.query", runId: "current", model: { reasoningEffort: "HIGH" } },
  { type: "usage.snapshot", runId: "current", contextWindow: { reasoningEffort: "XHIGH" } },
  { type: "usage.snapshot", runId: "current", taskId: "child", contextWindow: { reasoningEffort: "LOW" } },
] };
it("uses actual target run reasoning before requested reasoning and ignores child runs", () => {
  expect(mailTargetReasoning(chat, "current")).toEqual({ effort: "XHIGH", source: "actual" });
});
it("keeps historical delivery run separate from latest run", () => {
  expect(mailTargetReasoning(chat, "old")).toEqual({ effort: "LOW", source: "requested" });
  expect(mailTargetReasoning(chat, "missing")).toBeUndefined();
});
it("uses current/latest run only when delivery run is absent", () => {
  expect(mailTargetReasoning(chat)).toEqual({ effort: "XHIGH", source: "actual" });
  expect(mailTargetReasoning({ ...chat, activeRun: { runId: "new" } })).toBeUndefined();
});
it("does not infer reasoning from Agent defaults or previous runs", () => {
  expect(mailTargetReasoning({ chatId: "target", reasoningEffort: "HIGH", events: [] })).toBeUndefined();
});
