import { appReducer, createInitialState } from "@/app/state/AppContext";
import { applyLiveEventCommand } from "./liveEventDispatch";
import { createLocalCacheFromState, getCachedNode } from "./liveEventCache";
import { createReplayState, replayEvent } from "./conversationReplay";
import { MODEL_RETRY_NODE_ID } from "@/shared/ui/modelRetry";
import type { TimelineNode } from "@/features/timeline/lib/timelineState";

const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
beforeAll(() => Object.defineProperty(globalThis, "localStorage", {configurable: true, value: {
  getItem: () => null, setItem: () => {}, removeItem: () => {},
}}));
afterAll(() => {
  if (storageDescriptor) Object.defineProperty(globalThis, "localStorage", storageDescriptor);
  else Reflect.deleteProperty(globalThis, "localStorage");
});

it("replaces and removes retry in the actual reducer and live cache despite stale React state", () => {
  let state = createInitialState();
  const cache = createLocalCacheFromState(state);
  const node: TimelineNode = {id: MODEL_RETRY_NODE_ID, kind: "message", text: "first", ts: 1};
  const send = (next?: TimelineNode) => applyLiveEventCommand({
    command: {cmd: "SET_MODEL_RETRY", node: next}, cache, state,
    dispatch: action => {state = appReducer(state, action);},
  });
  send(node);
  send({...node, text: "second"});
  expect(state.timelineOrder).toEqual([MODEL_RETRY_NODE_ID]);
  expect(state.timelineNodes.get(MODEL_RETRY_NODE_ID)?.text).toBe("second");
  const staleState = state;
  send();
  expect(state.timelineOrder).toEqual([]);
  expect(state.timelineNodes.size).toBe(0);
  expect(getCachedNode(cache, staleState, MODEL_RETRY_NODE_ID)).toBeUndefined();
  send({...node, text: "third"});
  expect(state.timelineOrder).toEqual([MODEL_RETRY_NODE_ID]);
});

it("read-only replay replaces retries and leaves only the final error", () => {
  const state = createReplayState();
  for (const attempt of [2, 3, 4]) {
    replayEvent(state, {type: "run.activity", runId: "r", phase: "model_call", status: "retrying",
      retry: {attempt, maxAttempts: 6, delayMs: 2000, error: {code: "provider_rate_limited"}}});
  }
  expect(state.timelineOrder).toEqual([MODEL_RETRY_NODE_ID]);
  replayEvent(state, {type: "run.error", runId: "r", error: {code: "provider_rate_limited"}});
  expect(state.timelineOrder).not.toContain(MODEL_RETRY_NODE_ID);
  expect(state.timelineNodes.has(MODEL_RETRY_NODE_ID)).toBe(false);
  expect(state.timelineOrder).toHaveLength(1);
});
