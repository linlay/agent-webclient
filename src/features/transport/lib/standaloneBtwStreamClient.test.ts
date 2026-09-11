import type { AgentEvent } from "@/shared/contracts/agentEvents";
import type { StartBtwInput } from "@/features/transport/contracts/realtimeTransport";
import { StandaloneRealtimeTransport } from "./standaloneRealtimeTransport";
import { StandaloneBtwStreamClient, STANDALONE_BTW_SSE_BUFFER_LIMIT } from "./standaloneBtwStreamClient";
import { setAccessToken } from "@/shared/data/api/http";
import { initializeGatewaySession, resetGatewaySessionForTests } from "@/shared/data/auth/gatewaySession";
import { resetAuthCoordinatorForTests } from "@/shared/data/auth/authCoordinator";

const mockEnsureWs = jest.fn();
jest.mock("@/features/transport/lib/standaloneWsClient", () => ({
  ensureStandaloneWsClient: () => mockEnsureWs(),
}));

const owner = { kind: "agent" as const, agentKey: "agent-1" };
const timestamp = 1_786_890_000_001;
const runtime = globalThis as typeof globalThis & { __AGENT_WEBCLIENT_RUNTIME_CONFIG__?: Record<string, unknown> };
const encoder = new TextEncoder();

function event(type: string, seq: number, fields: Record<string, unknown> = {}) {
  return { type, seq, timestamp: timestamp + seq, ...fields };
}

function startEvent(runId = "run-1", btwId = "btw-1") {
  return event("run.start", 1, { chatId: "chat-1", runId, btwId, agentKey: "agent-1" });
}

function frame(value: unknown, separator = "\n") {
  return `event: message${separator}data: ${JSON.stringify(value)}${separator}${separator}`;
}

function controlledResponse() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const cancel = jest.fn();
  const body = new ReadableStream<Uint8Array>({ start(value) { controller = value; }, cancel });
  return {
    response: new Response(body, { headers: { "Content-Type": "text/event-stream; charset=utf-8" } }),
    push: (text: string | Uint8Array) => controller.enqueue(typeof text === "string" ? encoder.encode(text) : text),
    end: () => controller.close(),
    cancel,
  };
}

function textResponse(text: string, chunkSize = 65_536) {
  const stream = controlledResponse();
  const bytes = encoder.encode(text);
  for (let offset = 0; offset < bytes.length; offset += chunkSize) stream.push(bytes.subarray(offset, offset + chunkSize));
  stream.end();
  return stream;
}

async function flush() { await new Promise<void>((resolve) => setTimeout(resolve, 0)); }

describe("Standalone BTW HTTP/SSE transport", () => {
  const originalFetch = globalThis.fetch;
  const originalRuntime = runtime.__AGENT_WEBCLIENT_RUNTIME_CONFIG__;
  let fetchMock: jest.Mock;
  let ws: { request: jest.Mock; stream: jest.Mock };
  const transports: StandaloneRealtimeTransport[] = [];

  function transport() {
    const value = new StandaloneRealtimeTransport();
    transports.push(value);
    return value;
  }

  function start(value: StandaloneRealtimeTransport, overrides: Partial<StartBtwInput> = {}) {
    const execution = value.runs.startBtw({
      requestId: "request-1", chatId: "chat-1", message: "side question", owner, onEvent: jest.fn(), ...overrides,
    });
    void execution.identity.catch(() => undefined);
    return execution;
  }

  beforeEach(() => {
    fetchMock = jest.fn();
    globalThis.fetch = fetchMock;
    runtime.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = { BACKEND_MODE: "platform", DESKTOP_APP: false };
    resetGatewaySessionForTests();
    resetAuthCoordinatorForTests();
    setAccessToken("test-only-platform-token");
    ws = {
      request: jest.fn().mockResolvedValue({ code: 0, msg: "ok", data: { accepted: true } }),
      stream: jest.fn(() => ({ requestId: "existing-ws-stream", abort: jest.fn() })),
    };
    mockEnsureWs.mockReset().mockResolvedValue(ws);
  });

  afterEach(async () => {
    transports.splice(0).forEach((value) => value.dispose());
    await flush();
    globalThis.fetch = originalFetch;
    if (originalRuntime) runtime.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = originalRuntime;
    else delete runtime.__AGENT_WEBCLIENT_RUNTIME_CONFIG__;
    resetGatewaySessionForTests();
    resetAuthCoordinatorForTests();
    setAccessToken("");
    jest.restoreAllMocks();
  });

  it("starts exactly one authenticated POST and decodes split UTF-8, CRLF, multi-line data, comments and DONE", async () => {
    const boot = {
      type: "run.start", seq: 1, timestamp,
      payload: { chatId: "chat-1", runId: "run-1", btwId: "btw-1", agentKey: "agent-1" },
    };
    const json = JSON.stringify(boot);
    const split = json.indexOf(',"timestamp"');
    const raw = '\uFEFF: heartbeat\r\n\r\nevent: message\r\nid: ignored\r\nretry: 100\r\n' +
      `data: ${json.slice(0, split + 1)}\r\ndata: ${json.slice(split + 1)}\r\n\r\n` +
      frame(event("content.delta", 2, { contentId: "answer", delta: "春天🌷" }), "\r\n") +
      'data: [DONE]\r\n\r\n';
    fetchMock.mockResolvedValue(textResponse(raw, 1).response);
    const onEvent = jest.fn();
    const execution = start(transport(), { onEvent, references: [{ type: "selection", meta: { text: "source text" } }] });

    await expect(execution.identity).resolves.toMatchObject({ chatId: "chat-1", runId: "run-1", owner });
    await expect(execution.completion).resolves.toMatchObject({ reason: "done", lastSeq: 2 });
    expect(onEvent.mock.calls.map(([value]) => value.type)).toEqual(["run.start", "content.delta"]);
    expect(onEvent.mock.calls[1][0].delta).toBe("春天🌷");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/btw");
    expect(options).toMatchObject({ method: "POST", credentials: "same-origin" });
    expect(options.headers).toMatchObject({ Accept: "text/event-stream", "Content-Type": "application/json", Authorization: "Bearer test-only-platform-token" });
    expect(JSON.parse(String(options.body))).toMatchObject({ requestId: "request-1", chatId: "chat-1", stream: true, references: [{ type: "selection", meta: { text: "source text" } }] });
    expect(mockEnsureWs).not.toHaveBeenCalled();
  });

  it("keeps two interleaved BTW streams independent and detaches one without stopping the other", async () => {
    const first = controlledResponse();
    const second = controlledResponse();
    fetchMock.mockResolvedValueOnce(first.response).mockResolvedValueOnce(second.response);
    const value = transport();
    const firstEvents: AgentEvent[] = [];
    const secondEvents: AgentEvent[] = [];
    const one = start(value, { requestId: "request-a", btwId: "branch-a", onEvent: (item) => firstEvents.push(item) });
    const two = start(value, { requestId: "request-b", btwId: "branch-b", onEvent: (item) => secondEvents.push(item) });
    await flush();
    first.push(frame(startEvent("run-a", "branch-a")));
    second.push(frame(startEvent("run-b", "branch-b")));
    const a = encoder.encode(frame(event("content.delta", 2, { runId: "run-a", contentId: "a", delta: "一🌷" })));
    const b = encoder.encode(frame(event("content.delta", 2, { runId: "run-b", contentId: "b", delta: "二🌊" })));
    const cutA = a.findIndex((byte) => byte >= 0xe0) + 1;
    const cutB = b.findIndex((byte) => byte >= 0xe0) + 1;
    first.push(a.subarray(0, cutA));
    second.push(b.subarray(0, cutB));
    first.push(a.subarray(cutA));
    second.push(b.subarray(cutB));
    await Promise.all([one.identity, two.identity]);
    await flush();
    expect(mockEnsureWs).not.toHaveBeenCalled();
    expect(firstEvents.map((item) => item.delta).filter(Boolean)).toEqual(["一🌷"]);
    expect(secondEvents.map((item) => item.delta).filter(Boolean)).toEqual(["二🌊"]);

    await one.detach();
    expect(first.cancel).toHaveBeenCalledTimes(1);
    expect(second.cancel).not.toHaveBeenCalled();
    expect(ws.request).toHaveBeenCalledWith({ type: "/api/detach", payload: { runId: "run-a", agentKey: "agent-1", reason: "consumer_detach" } });
    second.push(frame(event("content.delta", 3, { contentId: "b", delta: "继续" })));
    second.push(frame(event("run.complete", 4, { runId: "run-b" })) + "data: [DONE]\n\n");
    await expect(one.completion).resolves.toMatchObject({ reason: "detached" });
    await expect(two.completion).resolves.toMatchObject({ reason: "done", lastSeq: 4 });
    expect(secondEvents.map((item) => item.delta).filter(Boolean)).toEqual(["二🌊", "继续"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([, options]) => JSON.parse(options.body).btwId)).toEqual(["branch-a", "branch-b"]);
    expect(ws.stream).not.toHaveBeenCalled();
    expect(ws.request.mock.calls.every(([options]) => options.type !== "/api/interrupt")).toBe(true);
  });

  it("leaves recovery attach and explicit interrupt on the existing WebSocket client", async () => {
    fetchMock.mockResolvedValue(textResponse(frame(startEvent()) + "data: [DONE]\n\n").response);
    const value = transport();
    await start(value).completion;
    expect(mockEnsureWs).not.toHaveBeenCalled();
    const recovered = value.runs.subscribe({ chatId: "chat-1", runId: "run-1", lastSeq: 1, role: "btw", owner, onEvent: jest.fn() });
    await recovered.identity;
    expect(ws.stream).toHaveBeenCalledTimes(1);
    expect(ws.stream).toHaveBeenCalledWith(expect.objectContaining({ type: "/api/attach", payload: { runId: "run-1", agentKey: "agent-1", lastSeq: 1 } }));
    await value.runs.interrupt({ runId: "run-1", owner });
    expect(ws.request).toHaveBeenCalledWith({ type: "/api/interrupt", payload: { runId: "run-1", agentKey: "agent-1" } });
    await recovered.detach();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403])("returns a structured HTTP %s error without repeating the POST", async (status) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ code: status, data: { error: { code: "btw_denied", category: "authorization", scope: "request", status, retryable: false, message: "Denied" } } }), { status, headers: { "Content-Type": "application/json" } }));
    const execution = start(transport());
    await expect(execution.identity).rejects.toMatchObject({ name: "ApiError", status, code: "btw_denied" });
    await expect(execution.completion).resolves.toMatchObject({ reason: "error", error: expect.objectContaining({ code: "btw_denied" }) });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mockEnsureWs).not.toHaveBeenCalled();
  });

  it("uses Gateway cookies and CSRF while excluding the Platform bearer", async () => {
    runtime.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = { BACKEND_MODE: "gateway" };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: { authenticated: true, csrfToken: "test-only-csrf", tenant: { displayName: "Test" }, auth: { mode: "local", loginUrl: "/login" } } }), { headers: { "Content-Type": "application/json" } }));
    await initializeGatewaySession();
    fetchMock.mockClear().mockResolvedValue(textResponse(frame(startEvent()) + "data: [DONE]\n\n").response);
    await start(transport()).completion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "same-origin", headers: { "X-CSRF-Token": "test-only-csrf", Accept: "text/event-stream" } });
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty("Authorization");
  });

  it("emits run.error and rejects completion even when the server has not ended the stream", async () => {
    const stream = controlledResponse();
    fetchMock.mockResolvedValue(stream.response);
    const onEvent = jest.fn();
    const execution = start(transport(), { onEvent });
    stream.push(frame(startEvent()));
    await execution.identity;
    stream.push(frame(event("run.error", 2, { runId: "run-1", error: { code: "provider_unavailable", message: "Provider unavailable", category: "provider", scope: "run", retryable: true } })));
    await expect(execution.completion).resolves.toMatchObject({ reason: "error", error: expect.objectContaining({ code: "provider_unavailable" }) });
    expect(onEvent.mock.calls.at(-1)?.[0].type).toBe("run.error");
    expect(stream.cancel).toHaveBeenCalledTimes(1);
    expect(mockEnsureWs).not.toHaveBeenCalled();
  });

  it.each(["run.complete", "run.cancel"])("accepts EOF only after %s, including a final data line without a separator", async (type) => {
    fetchMock.mockResolvedValue(textResponse(frame(startEvent()) + `data: ${JSON.stringify(event(type, 2, { runId: "run-1" }))}`).response);
    const execution = start(transport());
    await execution.identity;
    await expect(execution.completion).resolves.toMatchObject({ reason: "done", lastSeq: 2 });
  });

  it("reports retryable interruption when EOF arrives before a terminal event", async () => {
    fetchMock.mockResolvedValue(textResponse(frame(startEvent()) + frame(event("content.delta", 2, { contentId: "answer", delta: "partial" }))).response);
    const execution = start(transport());
    await execution.identity;
    await expect(execution.completion).resolves.toMatchObject({ reason: "error", error: expect.objectContaining({ code: "stream_interrupted", retryable: true }) });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["invalid JSON", "data: {broken}\n\n", "invalid_stream_event"],
    ["invalid time", frame({ type: "run.start", chatId: "chat-1", runId: "run-1", timestamp: 0 }), "time_contract_violation"],
    ["oversized unfinished line", `data: ${"x".repeat(STANDALONE_BTW_SSE_BUFFER_LIMIT + 1)}`, "stream_frame_too_large"],
    ["oversized multi-line event", (`data: ${"x".repeat(16_384)}\n`).repeat(65), "stream_frame_too_large"],
  ])("rejects %s without opening a WebSocket", async (_label, raw, code) => {
    fetchMock.mockResolvedValue(textResponse(raw).response);
    const execution = start(transport());
    await expect(execution.identity).rejects.toMatchObject({ code });
    await expect(execution.completion).resolves.toMatchObject({ reason: "error", error: expect.objectContaining({ code }) });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mockEnsureWs).not.toHaveBeenCalled();
  });

  it("ignores and cancels a late HTTP response after explicit abort before identity", async () => {
    let respond!: (response: Response) => void;
    fetchMock.mockReturnValue(new Promise((resolve) => { respond = resolve; }));
    const onEvent = jest.fn();
    const controller = new AbortController();
    const execution = start(transport(), { onEvent, signal: controller.signal });
    await flush();
    controller.abort();
    await expect(execution.identity).rejects.toMatchObject({ name: "AbortError" });
    await expect(execution.completion).resolves.toMatchObject({ reason: "detached" });
    const late = controlledResponse();
    late.push(frame(startEvent()));
    respond(late.response);
    await flush();
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(late.cancel).toHaveBeenCalledTimes(1);
    expect(onEvent).not.toHaveBeenCalled();
    expect(mockEnsureWs).not.toHaveBeenCalled();
  });

  it("disposes concurrent HTTP observers locally without creating WS controls or interrupting Runs", async () => {
    const first = controlledResponse(); const second = controlledResponse();
    fetchMock.mockResolvedValueOnce(first.response).mockResolvedValueOnce(second.response);
    const value = transport();
    const one = start(value); const two = start(value, { requestId: "second" });
    await flush();
    first.push(frame(startEvent("run-a")));
    await one.identity;
    value.dispose();
    await expect(one.completion).resolves.toMatchObject({ reason: "detached" });
    await expect(two.identity).rejects.toMatchObject({ name: "AbortError" });
    await expect(two.completion).resolves.toMatchObject({ reason: "detached" });
    expect(first.cancel).toHaveBeenCalledTimes(1);
    expect(second.cancel).toHaveBeenCalledTimes(1);
    expect(mockEnsureWs).not.toHaveBeenCalled();
    expect(ws.request).not.toHaveBeenCalled();
  });

  it("refuses other stream endpoints instead of creating an HTTP fallback", () => {
    const client = new StandaloneBtwStreamClient(mockEnsureWs);
    const onError = jest.fn();
    client.stream({ type: "/api/query", payload: {}, onEvent: jest.fn(), onError });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: "unsupported_request_type" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockEnsureWs).not.toHaveBeenCalled();
    client.dispose();
  });
});
