import {
  buildConversationSharePath,
  ConversationShareError,
  getConversationShareDownloadUrl,
  getSafeConversationShareHref,
  getPublicConversationShare,
  parseSharedConversationSnapshot,
  readConversationShareId,
} from "@/shared/data/conversationShare";

const validSnapshot = {
  schemaVersion: 1,
  title: "Release plan",
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_001_000,
  entries: [
    { type: "message", role: "user", content: "Ship it", createdAt: 1_700_000_000_000 },
    { type: "reasoning", content: "Check release state", label: "验证", durationMs: 2_000, createdAt: 1_700_000_000_500 },
    { type: "message", role: "assistant", content: "Ready" },
  ],
};

describe("conversationShare", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("parses only the versioned public snapshot contract", () => {
    expect(parseSharedConversationSnapshot(validSnapshot)).toEqual(validSnapshot);
    expect(parseSharedConversationSnapshot({ ...validSnapshot, schemaVersion: 2 })).toBeNull();
    expect(parseSharedConversationSnapshot({ ...validSnapshot, messages: [] })).toBeNull();
    expect(parseSharedConversationSnapshot({
      ...validSnapshot,
      entries: [{ type: "message", role: "system", content: "secret" }],
    })).toBeNull();
    expect(parseSharedConversationSnapshot({
      ...validSnapshot,
      entries: [{ type: "reasoning", role: "assistant", content: "secret" }],
    })).toBeNull();
    expect(parseSharedConversationSnapshot({
      ...validSnapshot,
      entries: [{ type: "reasoning", content: "invalid", durationMs: -1 }],
    })).toBeNull();
  });

  it("accepts only an explicit share route", () => {
    expect(readConversationShareId("/share/share_abc-123")).toBe("share_abc-123");
    expect(readConversationShareId("/share/share_abc-123/")).toBe("share_abc-123");
    expect(readConversationShareId("/share/abc")).toBeNull();
    expect(readConversationShareId("/agent/share_abc-123")).toBeNull();
  });

  it("builds only canonical public share paths", () => {
    expect(buildConversationSharePath("share_abc-123")).toBe("/share/share_abc-123");
    expect(buildConversationSharePath(" chat_123 ")).toBe("");
    expect(buildConversationSharePath(undefined)).toBe("");
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

  it("loads the snapshot anonymously from the same-origin public API", async () => {
    const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(validSnapshot), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(getPublicConversationShare("share_abc-123")).resolves.toEqual(validSnapshot);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/public/shares/share_abc-123",
      expect.objectContaining({
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      }),
    );
  });

  it("maps missing and malformed snapshots to stable errors", async () => {
    const fetchMock = jest.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(new Response("", { status: 404 }));
    await expect(getPublicConversationShare("share_missing")).rejects.toMatchObject({
      code: "unavailable",
    } satisfies Partial<ConversationShareError>);

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ schemaVersion: 2 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    await expect(getPublicConversationShare("share_unsupported")).rejects.toMatchObject({
      code: "unsupported",
    } satisfies Partial<ConversationShareError>);
  });
});
