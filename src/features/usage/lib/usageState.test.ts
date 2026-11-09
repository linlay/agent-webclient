import { reduceUsageState } from "./usageState";
import type { AIUsageSnapshotEvent } from "@/shared/contracts/agentEvents";

const voice = { tasks: 2, unknownTasks: 1, pendingTasks: 0, unpricedTasks: 0, characters: 10, billedAudioSeconds: 0, estimatedCost: { currency: "CNY", total: 2 } };
const snapshot = (total: number, withVoice = false): AIUsageSnapshotEvent => ({ type: "usage.snapshot", chatId: "chat", runId: "run", usage: { chat: { totalTokens: 100, estimatedCost: { currency: "CNY", total }, ...(withVoice ? { voice } : {}) } } });

it("retains projected voice cost once when later Runtime base snapshots arrive", () => {
  let state = { usageSnapshot: snapshot(12, true), usagePopoverOpen: false };
  for (const cost of [10, 10, 20]) {
    state = reduceUsageState(state, { type: "SET_USAGE_SNAPSHOT", snapshot: snapshot(cost) });
    expect(state.usageSnapshot.usage?.chat?.estimatedCost?.total).toBe(cost + 2);
    expect(state.usageSnapshot.usage?.chat?.voice?.unknownTasks).toBe(1);
  }
  expect(state.usageSnapshot.usage?.chat?.totalTokens).toBe(100);
});

it("refreshes only usage without reverting live Run identity or context", () => {
  const state = { usageSnapshot: { ...snapshot(20), runId: "new-run", contextWindow: { currentSize: 55 } }, usagePopoverOpen: true };
  const result = reduceUsageState(state, { type: "SET_USAGE_PROJECTION", snapshot: snapshot(22, true) });
  expect(result.usageSnapshot.runId).toBe("new-run");
  expect(result.usageSnapshot.contextWindow).toEqual({ currentSize: 55 });
  expect(result.usageSnapshot.usage?.chat?.estimatedCost?.total).toBe(22);
  expect(result.usagePopoverOpen).toBe(true);
});

it("reports currency mismatch and clears failure on conversation reset", () => {
  const base = snapshot(10); base.usage!.chat!.estimatedCost!.currency = "USD";
  const result = reduceUsageState({ usageSnapshot: snapshot(12, true), usagePopoverOpen: false }, { type: "SET_USAGE_SNAPSHOT", snapshot: base });
  expect(result.usageRefreshFailed).toBe(true);
  expect(reduceUsageState(result, { type: "SET_USAGE_SNAPSHOT", snapshot: null }).usageRefreshFailed).toBe(false);
});
