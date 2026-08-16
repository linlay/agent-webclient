import {
  ConversationShareError,
  getConversationShareDownloadUrl,
  getSafeConversationShareHref,
  getPublicConversationShare,
  parseSharedConversationEventStream,
  readConversationShareId,
} from "@/shared/data/conversationShare";

const EPOCH = 1_700_000_000_000;

const validEventStream = eventStream(
  { seq: 1, type: "chat.start", shareVersion: 1, chatName: "Release plan", timestamp: EPOCH },
  { seq: 2, type: "request.query", message: "Ship it", timestamp: EPOCH },
  { seq: 3, type: "run.start", timestamp: EPOCH + 100 },
  { seq: 4, type: "reasoning.snapshot", text: "Check release state", reasoningLabel: "验证", timestamp: EPOCH + 500 },
  { seq: 5, type: "content.snapshot", text: "Ready", timestamp: EPOCH + 900 },
  { seq: 6, type: "run.complete", timestamp: EPOCH + 1_000 },
);

describe("conversationShare", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("projects the finite SSE event order to the page-local turn model", () => {
    expect(parseSharedConversationEventStream(validEventStream)).toEqual({
      metadata: {
        exportVersion: 1,
        kind: "chat-transcript",
        title: "Release plan",
        createdAt: EPOCH,
        updatedAt: EPOCH + 1_000,
      },
      turns: [{
        startedAt: EPOCH + 100,
        completedAt: EPOCH + 1_000,
        items: [
          { kind: "user-message", content: "Ship it", createdAt: EPOCH },
          { kind: "assistant-reasoning", content: "Check release state", label: "验证", createdAt: EPOCH + 500 },
          { kind: "assistant-message", content: "Ready", createdAt: EPOCH + 900 },
        ],
      }],
    });
  });

  it("uses query time without run.start and permits an incomplete final turn", () => {
    const stream = eventStream(
      { seq: 1, type: "chat.start", shareVersion: 1, chatName: "Draft", timestamp: EPOCH },
      { seq: 2, type: "request.query", message: "Continue", timestamp: EPOCH + 10 },
      { seq: 3, type: "reasoning.snapshot", text: "Working", timestamp: EPOCH + 20 },
    );
    expect(parseSharedConversationEventStream(stream)?.turns).toEqual([{
      startedAt: EPOCH + 10,
      items: [
        { kind: "user-message", content: "Continue", createdAt: EPOCH + 10 },
        { kind: "assistant-reasoning", content: "Working", createdAt: EPOCH + 20 },
      ],
    }]);
  });

  it("rejects malformed frames, sequence gaps, private fields, and missing completion", () => {
    expect(parseSharedConversationEventStream(JSON.stringify({ schemaVersion: 1 }))).toBeNull();
    expect(parseSharedConversationEventStream(validEventStream.replace('"shareVersion":1', '"shareVersion":2'))).toBeNull();
    expect(parseSharedConversationEventStream(validEventStream.replace('"seq":4', '"seq":9'))).toBeNull();
    expect(parseSharedConversationEventStream(validEventStream.replace('"message":"Ship it"', '"message":"Ship it","runId":"secret"'))).toBeNull();
    expect(parseSharedConversationEventStream(validEventStream.replace("event: message\ndata:", "id: 1\nevent: message\ndata:"))).toBeNull();
    expect(parseSharedConversationEventStream(validEventStream.replace("event: message\ndata: [DONE]\n\n", ""))).toBeNull();
    expect(parseSharedConversationEventStream(`${validEventStream}event: message\ndata: [DONE]\n\n`)).toBeNull();
  });

  it("accepts only an explicit share route with an opaque URL-safe id", () => {
    expect(readConversationShareId("/share/share_abc-123")).toBe("share_abc-123");
    expect(readConversationShareId("/share/opaque_abc-123/")).toBe("opaque_abc-123");
    expect(readConversationShareId("/share/a")).toBe("a");
    expect(readConversationShareId("/share/bad.id")).toBeNull();
    expect(readConversationShareId("/agent/share_abc-123")).toBeNull();
  });

  it("allows only absolute HTTP(S) links in public Markdown", () => {
    expect(getSafeConversationShareHref("https://example.com/docs?q=1")).toBe(
      "https://example.com/docs?q=1",
    );
    expect(getSafeConversationShareHref("http://example.com/")).toBe("http://example.com/");
    expect(getSafeConversationShareHref("javascript:alert(1)")).toBeNull();
    expect(getSafeConversationShareHref("file:///tmp/private.txt")).toBeNull();
    expect(getSafeConversationShareHref("/api/resource?file=private.txt")).toBeNull();
  });

  it("reads only a safe runtime-configured download URL", () => {
    globalThis.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      SHARE_APP_DOWNLOAD_URL: "https://download.example.test/",
    };
    expect(getConversationShareDownloadUrl()).toBe("https://download.example.test/");
    globalThis.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      SHARE_APP_DOWNLOAD_URL: "javascript:alert(1)",
    };
    expect(getConversationShareDownloadUrl()).toBeNull();
    delete globalThis.__AGENT_WEBCLIENT_RUNTIME_CONFIG__;
  });

  it("loads the event stream anonymously as bounded bytes", async () => {
    const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(validEventStream, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Content-Length": String(new TextEncoder().encode(validEventStream).byteLength),
        },
      }),
    );

    await expect(getPublicConversationShare("opaque_abc-123")).resolves.toEqual(
      parseSharedConversationEventStream(validEventStream),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/public/shares/opaque_abc-123",
      expect.objectContaining({
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        headers: { Accept: "text/event-stream" },
      }),
    );
  });

  it("rejects invalid UTF-8, oversized bodies, and wrong media types", async () => {
    const fetchMock = jest.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(new Response(new Uint8Array([0x65, 0x76, 0x65, 0x6e, 0x74, 0xff]), {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }));
    await expect(getPublicConversationShare("invalid_utf8")).rejects.toMatchObject({
      code: "unsupported",
    } satisfies Partial<ConversationShareError>);

    fetchMock.mockResolvedValueOnce(new Response(validEventStream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream", "Content-Length": String((2 << 20) + 1) },
    }));
    await expect(getPublicConversationShare("oversized")).rejects.toMatchObject({
      code: "unsupported",
    } satisfies Partial<ConversationShareError>);

    fetchMock.mockResolvedValueOnce(new Response(validEventStream, {
      status: 200,
      headers: { "Content-Type": "application/x-ndjson" },
    }));
    await expect(getPublicConversationShare("wrong_media")).rejects.toMatchObject({
      code: "unsupported",
    } satisfies Partial<ConversationShareError>);
  });

  it("maps missing shares, request failures, and the six-second deadline to stable errors", async () => {
    const fetchMock = jest.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(new Response("", { status: 404 }));
    await expect(getPublicConversationShare("missing")).rejects.toMatchObject({
      code: "unavailable",
    } satisfies Partial<ConversationShareError>);

    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    await expect(getPublicConversationShare("offline")).rejects.toMatchObject({
      code: "network",
    } satisfies Partial<ConversationShareError>);

    jest.useFakeTimers();
    fetchMock.mockImplementationOnce((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), {
        once: true,
      });
    }));
    const pending = getPublicConversationShare("timeout");
    jest.advanceTimersByTime(6_000);
    await expect(pending).rejects.toMatchObject({
      code: "timeout",
    } satisfies Partial<ConversationShareError>);
    jest.useRealTimers();
  });
});

function eventStream(...events: Array<Record<string, unknown>>): string {
  return [
    ...events.map((event) => `event: message\ndata: ${JSON.stringify(event)}`),
    "event: message\ndata: [DONE]",
    "",
  ].join("\n\n");
}
