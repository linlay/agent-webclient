import { buildOverviewRunInfo, formatOverviewTime, type OverviewRunInfoInput } from "./overviewRunInfo";
import type { AgentEvent } from "@/shared/contracts/agentEvents";

const START = new Date("2026-09-10T06:32:05Z").getTime();
const event = (type: string, fields: Record<string, unknown> = {}) => ({
  type, chatId: "chat-1", runId: "run-1", timestamp: START, ...fields,
}) as AgentEvent;
const input = (overrides: Partial<OverviewRunInfoInput> = {}): OverviewRunInfoInput => ({
  chatId: "chat-1", runId: "run-1", streaming: false,
  currentChatActiveRun: null, activeAwaiting: null, runAgentById: new Map(),
  events: [], ...overrides,
});

describe("overview run information", () => {
  it.each([
    ["run.complete", "completed"], ["run.cancel", "cancelled"], ["run.error", "error"],
  ])("uses %s as the terminal status and freezes the reported times", (type, status) => {
    const info = buildOverviewRunInfo(input({
      streaming: true,
      events: [event("run.start"), event(type, { timestamp: START + 32000 })],
    }));
    expect(info).toMatchObject({ status, active: false, startedAt: START, finishedAt: START + 32000 });
  });

  it("does not interpret a disconnected or incomplete run as completed", () => {
    expect(buildOverviewRunInfo(input({ events: [event("run.start")] }))).toMatchObject({
      status: "unknown", active: false, finishedAt: undefined,
    });
  });

  it("shows an attached run even when its start event is unavailable", () => {
    expect(buildOverviewRunInfo(input({
      runId: "run-old",
      currentChatActiveRun: { chatId: "chat-1", runId: "run-live", startedAt: START },
      events: [event("run.complete", { runId: "run-old" })],
    }))).toMatchObject({ runId: "run-live", status: "running", startedAt: START, finishedAt: undefined });
  });

  it("uses actual run identity and usage, ignoring another chat and older run", () => {
    const info = buildOverviewRunInfo(input({
      chat: { chatId: "chat-1", agentKey: "old-agent" },
      runAgentById: new Map([["run-1", "agent-1"]]),
      agents: [{ key: "agent-1", name: "Developer" }],
      events: [
        event("run.start"),
        event("usage.snapshot", { model: { key: "actual-model" }, contextWindow: { currentSize: 49000, maxSize: 128000, reasoningEffort: "high" } }),
        event("run.error", { chatId: "other-chat" }),
      ],
      usageSnapshot: { type: "usage.snapshot", chatId: "chat-1", runId: "run-old", model: { key: "old-model" } },
    }));
    expect(info).toMatchObject({
      agent: "Developer", model: "actual-model", reasoning: "high", status: "unknown",
      context: { current: 49000, max: 128000, percent: 38 },
    });
  });

  it("does not carry old usage into a new run before the first snapshot", () => {
    expect(buildOverviewRunInfo(input({
      events: [event("usage.snapshot", { runId: "run-old", contextWindow: { currentSize: 90000, maxSize: 128000 } }), event("run.start")],
      usageSnapshot: { type: "usage.snapshot", chatId: "chat-1", runId: "run-1", timestamp: START - 100, model: { key: "stale-model" } },
    }))).toMatchObject({ model: "", reasoning: "", context: null });
  });

  it("shows starting while a new query waits for its run identity", () => {
    expect(buildOverviewRunInfo(input({
      runId: "", streaming: true, events: [event("run.complete")],
    }))).toMatchObject({ runId: "", status: "starting", startedAt: undefined, finishedAt: undefined });
  });

  it("resolves the latest historical run without an active run", () => {
    expect(buildOverviewRunInfo(input({
      runId: "", events: [event("run.complete", { runId: "run-old" }), event("run.start"), event("run.complete", { timestamp: START + 1000 })],
    }))).toMatchObject({ runId: "run-1", status: "completed" });
  });

  it("keeps empty chats free of the previous chat's metadata", () => {
    expect(buildOverviewRunInfo(input({
      chatId: "", events: [event("run.start")],
      currentChatActiveRun: { chatId: "chat-1", runId: "run-1" },
    }))).toMatchObject({ chatId: "", runId: "", agent: "", model: "", status: "idle" });
  });

  it("shows only authoritative active awaiting and ignores historical asks", () => {
    const base = input({ streaming: true, events: [event("run.start"), event("awaiting.ask", { mode: "approval" })] });
    expect(buildOverviewRunInfo(base).status).toBe("running");
    expect(buildOverviewRunInfo({ ...base, activeAwaiting: {
      key: "a", awaitingId: "a", runId: "run-1", agentKey: "agent-1", mode: "approval", approvals: [], timeout: null,
    } }).status).toBe("approval");
  });

  it("shows team ownership alongside its reported executor", () => {
    expect(buildOverviewRunInfo(input({
      currentChatActiveRun: { chatId: "chat-1", runId: "run-1", owner: { kind: "orchestrated-team", teamId: "team-1" } },
      events: [event("run.start", { agentKey: "agent-1" })],
      agents: [{ key: "agent-1", name: "Coder" }], teams: [{ teamId: "team-1", name: "Engineering" }],
    }))).toMatchObject({ agent: "Coder", team: "Engineering" });
  });

  it("reflects compaction after a usage snapshot and preserves zero context", () => {
    const info = buildOverviewRunInfo(input({ events: [
      event("usage.snapshot", { contextWindow: { currentSize: 90000, maxSize: 128000 } }),
      event("context.compact.complete", { postCompactEstimatedTokens: 0, timestamp: START + 100 }),
    ] }));
    expect(info.context).toEqual({ current: 0, max: 128000, percent: 0 });
  });

  it("hides invalid context instead of turning missing values into zero", () => {
    expect(buildOverviewRunInfo(input({ events: [event("usage.snapshot", { contextWindow: { currentSize: null, maxSize: 128000 } })] })).context).toBeNull();
  });

  it("uses short times today and dates across days", () => {
    const sameDay = formatOverviewTime(START, "en-US", START);
    const differentDay = formatOverviewTime(START, "en-US", START + 86400000);
    expect(sameDay.short).not.toContain("2026");
    expect(differentDay.short).toContain("2026");
    expect(sameDay.full).toContain("2026");
    expect(formatOverviewTime(undefined, "en-US", START).short).toBe("—");
  });
});
