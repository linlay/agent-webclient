import { getChat, type ChatDetailResponse } from "@/shared/data";
import type { AgentEvent } from "@/shared/contracts/agentEvents";
import type { PushFrame, RealtimeTransport, RunCompletion, RunIdentity, RunSubscribeInput, StatusListener } from "@/features/transport/contracts/realtimeTransport";
import { RealtimeTransportError } from "@/features/transport/contracts/realtimeTransportErrors";
import { createChatPreviewRuntime, type ChatPreviewState } from "./chatPreviewRuntime";
import { toolOutputText } from "@/features/events/lib/toolOutputState";

jest.mock("@/shared/data", () => ({ ...jest.requireActual("@/shared/data"), getChat: jest.fn() }));
const EPOCH = 1_710_000_000_000;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = async () => { for (let i = 0; i < 12; ++i) await Promise.resolve(); };
const event = (type: string, seq: number, extra = {}): AgentEvent => ({ type, seq, timestamp: EPOCH + seq, chatId: "chat-1", runId: "run-1", ...extra } as AgentEvent);
function chat(active = true): ChatDetailResponse {
  return { chatId: "chat-1", agentKey: "owner", activeRun: active ? { runId: "run-1", agentKey: "owner", lastSeq: 3 } : null,
    events: [event("request.query", 1, { requestId: "request-1", message: "Question" }),
      event("content.start", 2, { contentId: "answer" }), event("content.delta", 3, { contentId: "answer", delta: "Hello" })] };
}
function response(value: ChatDetailResponse) { return { status: 200, code: 0, msg: "", data: value }; }
function setup(live = true, kind: "standalone" | "desktop" = "standalone", active = true) {
  let state!: ChatPreviewState;
  let push: (frame: PushFrame) => void = () => undefined;
  let statusListener: StatusListener = () => undefined;
  let connection: ReturnType<RealtimeTransport["getStatus"]> = "connected";
  const subscriptions: Array<{ input: RunSubscribeInput; identity: ReturnType<typeof deferred<RunIdentity>>; completion: ReturnType<typeof deferred<RunCompletion>>; detach: jest.Mock }> = [];
  const forbidden = jest.fn(() => { throw new Error("Run mutation must not be called"); });
  const unsubscribePush = jest.fn();
  const transport = {
    kind,
    getStatus: () => connection,
    subscribeStatus: jest.fn((listener: StatusListener) => { statusListener = listener; listener(connection); return jest.fn(); }),
    push: { subscribe: jest.fn((_filter, listener) => { push = listener; return unsubscribePush; }) },
    runs: {
      subscribe: jest.fn((input: RunSubscribeInput) => {
        const item = { input, identity: deferred<RunIdentity>(), completion: deferred<RunCompletion>(), detach: jest.fn().mockResolvedValue(undefined) };
        subscriptions.push(item);
        return { identity: item.identity.promise, completion: item.completion.promise, detach: item.detach };
      }),
      startQuery: forbidden, startBtw: forbidden, interrupt: forbidden, steer: forbidden,
      submitAwaiting: forbidden, submitTool: forbidden, updateAccessLevel: forbidden,
    }, terminal: {} as RealtimeTransport["terminal"], dispose: forbidden,
  } satisfies RealtimeTransport;
  const runtime = createChatPreviewRuntime({ chatId: "chat-1", live, transport, active, onChange: next => { state = next; } });
  return { runtime, subscriptions, transport, forbidden, unsubscribePush, get state() { return state; },
    push: (runId: string, extra = {}) => push({ frame: "push", type: "run.started", data: { chatId: "chat-1", runId, startedAt: EPOCH, ...extra } }),
    status: (next: typeof connection) => { connection = next; statusListener(next); },
  };
}
const text = (state: ChatPreviewState) => [...state.snapshot!.projection.state.timelineNodes.values()].map(node => node.text || "").join("|");

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getChat).mockResolvedValue(response(chat()));
});

it("loads a snapshot with no stream, push or connection listener, even for an active Run", async () => {
  const test = setup(false, "desktop");
  await flush();
  expect(text(test.state)).toContain("Hello");
  expect(test.transport.runs.subscribe).not.toHaveBeenCalled();
  expect(test.transport.push.subscribe).not.toHaveBeenCalled();
  expect(test.transport.subscribeStatus).not.toHaveBeenCalled();
  test.runtime.setActive(false); test.runtime.setActive(true);
  await flush();
  expect(getChat).toHaveBeenCalledTimes(1);
  test.runtime.reload(); await flush();
  expect(getChat).toHaveBeenCalledTimes(2);
  test.runtime.dispose();
  expect(test.forbidden).not.toHaveBeenCalled();
});

it("replays before attaching and applies only new events; terminal keeps the entire result", async () => {
  const test = setup();
  expect(test.subscriptions).toHaveLength(0);
  await flush();
  const sub = test.subscriptions[0];
  expect(sub.input).toMatchObject({ chatId: "chat-1", runId: "run-1", owner: { kind: "agent", agentKey: "owner" }, lastSeq: 3 });
  sub.input.onEvent(event("content.delta", 3, { contentId: "answer", delta: "duplicate" }));
  sub.input.onEvent(event("content.delta", 4, { contentId: "answer", delta: "wrong", runId: "other" }));
  const previous = test.state.snapshot;
  sub.input.onEvent(event("content.delta", 4, { contentId: "answer", delta: " world" }));
  expect(text(test.state)).toContain("Question|Hello world");
  expect(previous?.projection.state.events).toHaveLength(3);
  sub.input.onEvent(event("run.complete", 5));
  expect(test.state.snapshot?.chat.activeRun).toBeNull();
  expect(text(test.state)).toContain("Hello world");
  expect(sub.detach).toHaveBeenCalledTimes(1);
  sub.input.onEvent(event("content.delta", 6, { contentId: "answer", delta: "late" }));
  expect(text(test.state)).not.toContain("late");
  expect(getChat).toHaveBeenCalledTimes(1);
  test.runtime.dispose(); expect(test.forbidden).not.toHaveBeenCalled();
});

it("keeps live tool output transient and replaces it with the authoritative result", async () => {
  const test = setup(); await flush();
  const send = test.subscriptions[0].input.onEvent;
  send(event("tool.output", 4, { toolId: "tool", toolName: "bash", chunkIndex: 0, stream: "stdout", delta: "working\n" }));
  let node = [...test.state.snapshot!.projection.state.timelineNodes.values()].find(node => node.toolId === "tool");
  expect(toolOutputText(node?.toolOutput)).toBe("working\n");
  expect(test.state.snapshot!.projection.events.some(event => event.type === "tool.output")).toBe(false);
  send(event("tool.result", 5, { toolId: "tool", toolName: "bash", result: "done" }));
  node = [...test.state.snapshot!.projection.state.timelineNodes.values()].find(node => node.toolId === "tool");
  expect(node?.toolOutput).toBeUndefined();
  test.runtime.dispose();
});

it("recovers a gap once and then leaves a stable error, including identity/completion races", async () => {
  const test = setup(); await flush();
  test.subscriptions[0].input.onEvent(event("content.delta", 6, { contentId: "answer", delta: "missing" }));
  test.subscriptions[0].identity.reject(new RealtimeTransportError("seq_expired", "expired"));
  await flush();
  expect(getChat).toHaveBeenCalledTimes(2);
  expect(test.subscriptions).toHaveLength(2);
  test.subscriptions[1].input.onEvent(event("content.delta", 6, { contentId: "answer", delta: "missing" }));
  await flush();
  expect(test.state.error).toBeTruthy();
  expect(getChat).toHaveBeenCalledTimes(2);
  test.runtime.reload(); await flush();
  expect(test.state.error).toBe("");
  expect(test.subscriptions).toHaveLength(3);
  test.runtime.dispose();
});

it("releases inactive Desktop observers, ignores old callbacks, and replays on activation", async () => {
  const test = setup(true, "desktop"); await flush();
  test.runtime.setActive(false);
  test.subscriptions[0].input.onEvent(event("content.delta", 4, { contentId: "answer", delta: "stale" }));
  expect(text(test.state)).not.toContain("stale");
  expect(test.unsubscribePush).toHaveBeenCalled();
  expect(test.subscriptions[0].detach).toHaveBeenCalled();
  test.runtime.setActive(true); await flush();
  expect(getChat).toHaveBeenCalledTimes(2);
  expect(test.subscriptions).toHaveLength(2);
  test.runtime.dispose(); expect(test.forbidden).not.toHaveBeenCalled();
});

it("does not load or subscribe while the initial host surface is inactive", async () => {
  const test = setup(true, "desktop", false); await flush();
  expect(getChat).not.toHaveBeenCalled();
  expect(test.transport.push.subscribe).not.toHaveBeenCalled();
  test.runtime.setActive(true); await flush();
  expect(test.subscriptions).toHaveLength(1);
  test.runtime.dispose();
});

it("leaves Desktop physical reconnect to the Broker and keeps the accepted stream", async () => {
  const test = setup(true, "desktop"); await flush();
  test.status("reconnecting"); test.status("connected"); await flush();
  expect(getChat).toHaveBeenCalledTimes(1);
  expect(test.subscriptions).toHaveLength(1);
  expect(test.subscriptions[0].detach).not.toHaveBeenCalled();
  test.runtime.dispose();
});

it("recovers Standalone disconnect through replay on the existing transport", async () => {
  const test = setup(); await flush();
  test.status("reconnecting");
  test.subscriptions[0].completion.resolve({ reason: "error", lastSeq: 3, error: new RealtimeTransportError("WS_DISCONNECTED", "disconnected") });
  await flush();
  expect(test.state.error).toBe("");
  test.status("connected"); await flush();
  expect(getChat).toHaveBeenCalledTimes(2);
  expect(test.subscriptions).toHaveLength(2);
  test.runtime.dispose();
});

it("observes a new Run in the same Chat through push, never filters previous history", async () => {
  const test = setup(); await flush();
  test.subscriptions[0].input.onEvent(event("run.complete", 4));
  jest.mocked(getChat).mockResolvedValue(response({ ...chat(), activeRun: { runId: "run-2", agentKey: "owner", lastSeq: 1 }, events: [...chat().events!, event("run.complete", 4), event("run.start", 1, { runId: "run-2" })] }));
  test.push("run-2"); test.push("run-2"); await flush();
  expect(getChat).toHaveBeenCalledTimes(2);
  expect(test.subscriptions[1].input.runId).toBe("run-2");
  expect(text(test.state)).toContain("Question|Hello");
  test.runtime.dispose();
});

it("ignores a late Chat response after disposal and refuses mismatched Chat identities", async () => {
  const pending = deferred<Awaited<ReturnType<typeof getChat>>>();
  jest.mocked(getChat).mockReturnValueOnce(pending.promise);
  const old = setup(); old.runtime.dispose();
  pending.resolve(response(chat())); await flush();
  expect(old.subscriptions).toHaveLength(0);
  jest.mocked(getChat).mockResolvedValueOnce(response({ ...chat(), chatId: "other" }));
  const current = setup(); await flush();
  expect(current.state.error).toBeTruthy();
  expect(current.state.snapshot).toBeNull();
  expect(current.subscriptions).toHaveLength(0);
  current.runtime.dispose();
});

it("does not bypass host denial or manufacture an owner", async () => {
  const test = setup(true, "desktop"); await flush();
  test.subscriptions[0].identity.reject(new RealtimeTransportError("capability_denied", "denied"));
  await flush();
  expect(test.state.error).toBe("denied");
  expect(getChat).toHaveBeenCalledTimes(1);
  test.runtime.dispose();
  jest.mocked(getChat).mockResolvedValueOnce(response({ chatId: "chat-1", activeRun: { runId: "run-1" }, events: [] }));
  const missing = setup(); await flush();
  expect(missing.state.error).toBeTruthy();
  expect(missing.subscriptions).toHaveLength(0);
  missing.runtime.dispose();
});
