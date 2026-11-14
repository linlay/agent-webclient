import { createInitialAgentsState, reduceAgentsState, selectCurrentAgent } from "./agentState";
import { resolveCurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import { createInitialState } from "@/app/state/state";
import { appReducer } from "@/app/state/reducer";

const detail = { key: "a", name: "Current", mode: "GENERAL", connectors: ["one", "two", "three"],
  modelKey: "new-model", interactionConfig: { connectors: true, defaultDetail: "detailed" } };
const list = [{ key: "a", name: "Stale", mode: "BOT", connectors: [], modelKey: "old-model", interactionConfig: { connectors: false } }];

it.each([true, false])("keeps current details authoritative regardless of list arrival order: %s", listFirst => {
  let state = createInitialAgentsState();
  if (listFirst) state = reduceAgentsState(state, { type: "SET_AGENTS", agents: list });
  state = reduceAgentsState(state, { type: "SET_CURRENT_AGENT", agent: detail });
  if (!listFirst) state = reduceAgentsState(state, { type: "SET_AGENTS", agents: list });
  expect(state.currentAgent).toBe(detail);
  expect(selectCurrentAgent(state, "a")).toBe(detail);
  expect(selectCurrentAgent(state, "b")).toBeNull();
  state = reduceAgentsState(state, { type: "SET_AGENTS", agents: [] });
  expect(state.currentAgent).toBe(detail);
  state = reduceAgentsState(state, { type: "PATCH_CURRENT_AGENT", agentKey: "b", patch: { connectors: [] } });
  expect(state.currentAgent).toBe(detail);
  state = reduceAgentsState(state, { type: "PATCH_CURRENT_AGENT", agentKey: "a", patch: { connectors: [] } });
  expect(state.currentAgent?.connectors).toEqual([]);
});

it("never uses a navigation record as the current execution definition", () => {
  const state = { ...createInitialState(), workerSelectionKey: "agent:a", agents: list };
  expect(resolveCurrentWorkerSummary(state)?.raw).toBeNull();
  const loaded = appReducer(state, { type: "SET_CURRENT_AGENT", agent: detail });
  expect(resolveCurrentWorkerSummary(loaded)).toMatchObject({ displayName: "Current", raw: detail });
  expect(appReducer(loaded, { type: "RESET_ACTIVE_CONVERSATION" }).currentAgent).toBe(detail);
  expect(appReducer(loaded, { type: "CLEAR_GATEWAY_IDENTITY_STATE" }).currentAgent).toBeNull();
});

it("resolves Workspace only from the current detail contract", () => {
  let state = { ...createInitialState(), workerSelectionKey: "agent:a", agents: [{ key: "a", name: "Stale", workspaceDir: "/stale" }] };
  state = appReducer(state, { type: "SET_CURRENT_AGENT", agent: { ...detail, meta: { workspace: { root: "/authoritative/project" } } } });
  expect(state.currentAgent?.workspaceDir).toBe("/authoritative/project");
  expect(resolveCurrentWorkerSummary(state)?.raw?.workspaceDir).toBe("/authoritative/project");
  state = appReducer(state, { type: "SET_CURRENT_AGENT", agent: detail });
  expect(state.currentAgent?.workspaceDir).toBeUndefined();
  expect(resolveCurrentWorkerSummary(state)?.raw?.workspaceDir).toBeUndefined();
});
