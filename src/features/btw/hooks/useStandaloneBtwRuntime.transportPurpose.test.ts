/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { RunCompletion, RunExecution, RunIdentity } from "@/features/transport/contracts/realtimeTransport";
import { useStandaloneBtwRuntime } from "./useStandaloneBtwRuntime";

const mockRuns = { subscribe: jest.fn(), startBtw: jest.fn(), interrupt: jest.fn() };
jest.mock("@/features/transport/hooks/useRealtimeTransport", () => ({ useRunTransport: () => mockRuns }));

const owner = { kind: "agent" as const, agentKey: "agent-a" };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => { resolve = accept; });
  return { promise, resolve };
}
function execution() {
  const identity = deferred<RunIdentity>();
  const completion = deferred<RunCompletion>();
  const value: RunExecution = { identity: identity.promise, completion: completion.promise, detach: jest.fn(async () => undefined) };
  return { identity, completion, value };
}
const identity = (runId: string): RunIdentity => ({ requestId: runId, chatId: "chat-a", runId, owner });
let root: Root;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

beforeEach(() => {
  jest.clearAllMocks();
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
});

it("keeps attach, follow-up start and interrupt on the explanation purpose without starting on mount", async () => {
  const initial = execution();
  const followUp = execution();
  mockRuns.subscribe.mockReturnValue(initial.value);
  mockRuns.startBtw.mockReturnValue(followUp.value);
  mockRuns.interrupt.mockResolvedValue({ code: 0, data: { accepted: true, runId: "run-next" } });
  let current!: ReturnType<typeof useStandaloneBtwRuntime>;
  const Harness = () => { current = useStandaloneBtwRuntime({ chatId: "chat-a", initialRunId: "run-initial", owner, transportPurpose: "selection-explain" }); return null; };
  act(() => root.render(React.createElement(Harness)));
  expect(mockRuns.startBtw).not.toHaveBeenCalled();
  expect(mockRuns.subscribe).toHaveBeenCalledTimes(1);
  expect(mockRuns.subscribe).toHaveBeenCalledWith(expect.objectContaining({ runId: "run-initial", transportPurpose: "selection-explain" }));
  await act(async () => {
    initial.identity.resolve(identity("run-initial"));
    await Promise.resolve();
    const input = mockRuns.subscribe.mock.calls[0][0];
    input.onEvent({ type: "run.start", runId: "run-initial", btwId: "branch-initial" });
    input.onEvent({ type: "run.complete", runId: "run-initial" });
    initial.completion.resolve({ reason: "done", lastSeq: 2 });
    await Promise.resolve();
  });
  act(() => current.setDraft("follow up"));
  act(() => current.send());
  expect(mockRuns.startBtw).toHaveBeenCalledTimes(1);
  expect(mockRuns.startBtw).toHaveBeenCalledWith(expect.objectContaining({ btwId: "branch-initial", message: "follow up", transportPurpose: "selection-explain" }));
  await act(async () => { followUp.identity.resolve(identity("run-next")); await Promise.resolve(); });
  await act(async () => { current.interrupt(); await Promise.resolve(); });
  expect(mockRuns.interrupt).toHaveBeenCalledWith(expect.objectContaining({ runId: "run-next", transportPurpose: "selection-explain" }));
  expect(followUp.value.detach).toHaveBeenCalledTimes(1);
});

it("unmounting an explanation detaches only that runtime while the ordinary BTW continues", async () => {
  const explanation = execution();
  const ordinary = execution();
  mockRuns.subscribe.mockImplementation((input) => input.transportPurpose ? explanation.value : ordinary.value);
  let normalRuntime!: ReturnType<typeof useStandaloneBtwRuntime>;
  const Ordinary = () => { normalRuntime = useStandaloneBtwRuntime({ chatId: "chat-a", initialRunId: "run-side", owner }); return null; };
  const Explain = () => { useStandaloneBtwRuntime({ chatId: "chat-a", initialRunId: "run-explain", owner, transportPurpose: "selection-explain" }); return null; };
  const render = (show: boolean) => act(() => root.render(React.createElement(React.Fragment, null,
    React.createElement(Ordinary), show ? React.createElement(Explain) : null)));
  render(true);
  await act(async () => {
    ordinary.identity.resolve(identity("run-side"));
    explanation.identity.resolve(identity("run-explain"));
    await Promise.resolve();
  });
  render(false);
  expect(explanation.value.detach).toHaveBeenCalledTimes(1);
  expect(ordinary.value.detach).not.toHaveBeenCalled();
  expect(mockRuns.interrupt).not.toHaveBeenCalled();
  const ordinaryInput = mockRuns.subscribe.mock.calls.find(([input]) => input.runId === "run-side")![0];
  expect(ordinaryInput).not.toHaveProperty("transportPurpose");
  act(() => ordinaryInput.onEvent({ type: "content.delta", contentId: "side-answer", delta: "still running" }));
  expect([...normalRuntime.session.projection.timelineNodes.values()]).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: "content", text: "still running" }),
  ]));
});
