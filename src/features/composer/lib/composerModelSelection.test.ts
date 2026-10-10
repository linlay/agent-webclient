/** @jest-environment jsdom */
import { resolveChatModel } from "@/features/runs/lib/modelSelection";
import { createInitialState } from "@/app/state/state";
import { appReducer } from "@/app/state/reducer";
import type { AgentEvent } from "@/shared/contracts/agentEvents";
import { readComposerModel, updateComposerModel, persistComposerModels, restoreComposerModels } from "./composerModelSelection";
import { resolveComposerAccessScope } from "./composerAccessLevel";
const old = { key: "old-model", reasoningEffort: "LOW" as const, serviceTier: "STANDARD" };
const fresh = { key: "new-model", reasoningEffort: "HIGH" as const };
const target = (chatId = "", scope = resolveComposerAccessScope(""), agentKey = "agent") => ({ chatId, scope, agentKey });
const event = (type: string, value: Record<string, unknown> = {}): AgentEvent => ({ type, chatId: "old", runId: "run-old", ...value } as AgentEvent);
beforeEach(() => sessionStorage.clear());

it("restores old Chat history after changing New Chat, and keeps subsequent choices isolated", () => {
  let state = createInitialState();
  state = appReducer(state, { type: "SET_COMPOSER_MODEL", target: target(), value: fresh });
  state = appReducer(state, { type: "APPLY_CONVERSATION_REPLAY", snapshot: {
    ...createInitialState(), chatId: "old", events: [event("request.query", { query: { model: old } })],
  } });
  expect(readComposerModel(state, target("old"))).toEqual(old);
  state = appReducer(state, { type: "SET_COMPOSER_MODEL", target: target("old"), value: { ...old, reasoningEffort: "MAX" } });
  state = appReducer(state, { type: "RESET_ACTIVE_CONVERSATION" });
  state = appReducer(state, { type: "SET_CHAT_ID", chatId: "" });
  expect(readComposerModel(state, target())).toEqual(fresh);
  state = appReducer(state, { type: "APPLY_CONVERSATION_REPLAY", snapshot: {
    ...createInitialState(), chatId: "old", events: [event("request.query", { query: { model: old } })],
  } });
  expect(readComposerModel(state, target("old"))).toEqual({ ...old, reasoningEffort: "MAX" });
  expect(readComposerModel(state, target("other"))).toEqual({});
  expect(readComposerModel(state, target("old", "another-user"))).toEqual({});
});

it("recovers effective model and reasoning when request omitted overrides, excluding child lanes", () => {
  const events = [event("request.query", { query: {} }), event("usage.snapshot", {
    model: { key: "old-model" }, contextWindow: { reasoningEffort: "low" },
  })];
  for (const extra of [{taskId:"child"}, {subAgentKey:"child"}, {btwId:"btw"}, {lane:"explain"}, {chatId:"other"}]) {
    events.push(event("request.query", { ...extra, runId: "unrelated", query: { model: fresh } }));
  }
  expect(resolveChatModel(events, "old")).toEqual(old);
});

it("does not inherit a previous Run's reasoning or follow its late usage event", () => {
  const events = [event("request.query", { query: { model: old } }),
    event("run.start", { runId: "new-run" }),
    event("usage.snapshot", { model: { key: "old-model" }, contextWindow: { reasoningEffort: "LOW" } }),
    event("usage.snapshot", { runId: "new-run", model: { key: "actual-new" }, contextWindow: { reasoningEffort: "NONE" } })];
  expect(resolveChatModel(events, "old")).toEqual({ key: "actual-new", reasoningEffort: "NONE", serviceTier: "STANDARD" });
});

it("preserves Chat choices through refresh, including explicit standard service tier", () => {
  let state = updateComposerModel(createInitialState(), target(), fresh);
  state = updateComposerModel(state, target("old"), old);
  persistComposerModels(state);
  expect(readComposerModel(restoreComposerModels(), target("old"))).toEqual(old);
  expect(readComposerModel(createInitialState(), target())).toEqual(fresh);
});

it("initializes accepted Chat once and ignores duplicate identity events after a manual change", () => {
  let state = updateComposerModel(createInitialState(), target("accepted"), fresh, true);
  state = updateComposerModel(state, target("accepted"), old);
  state = updateComposerModel(state, target("accepted"), fresh, true);
  expect(readComposerModel(state, target("accepted"))).toEqual(old);
});
