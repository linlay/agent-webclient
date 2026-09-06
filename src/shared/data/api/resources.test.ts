import * as client from "@/shared/data/api/client";

const resourceOptions = { chatId: "chat-1" };
const resourceRequests: Array<[string, () => Promise<unknown>]> = [
  ["text", () => client.getResourceText("private.txt", resourceOptions)],
  ["document text", () => client.getResourceDocumentText("private.txt", resourceOptions)],
  ["blob", () => client.getResourceBlob("private.txt", resourceOptions)],
  ["raw JSONL", () => client.getChatRawJsonl("chat-1")],
  ["LLM trace", () => client.getChatLLMTraceRaw("trace.json")],
  ["download", () => client.downloadResource("private.txt", resourceOptions)],
  ["chat export", () => client.downloadChatExport("chat-1")],
  ["skill archive", () => client.downloadAdminSkill("skill-1")],
  ["skill file", () => client.downloadAdminSkillFile("skill-1", "SKILL.md")],
  ["skill icon", () => client.fetchAdminSkillIcon("/api/admin/skills/file/download?key=skill-1&path=icon.png")],
  ["skill blob", () => client.fetchAdminSkillFileBlob("skill-1", "SKILL.md")],
];

describe("resource response compatibility", () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    globalThis.fetch = fetchMock;
    fetchMock.mockReset();
    client.setAccessToken("resource-token");
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    client.setAccessToken("");
  });

  it.each(resourceRequests)("preserves status, code, data and diagnostics for %s errors", async (_name, request) => {
    const text = jest.fn(async () => JSON.stringify({
      code: 40301,
      msg: "access denied",
      data: { resourceId: "private" },
    }));
    fetchMock.mockResolvedValue({ ok: false, status: 403, text });

    await expect(request()).rejects.toMatchObject({
      name: "ApiError",
      status: 403,
      code: 40301,
      data: { resourceId: "private" },
      platformError: expect.objectContaining({ status: 403 }),
    });
    expect(text).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("preserves document content, revision, cancellation and auth in a resource read", async () => {
    const controller = new AbortController();
    const text = jest.fn(async () => "document content");
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text,
      headers: new Headers({
        "X-Document-Kind": "document-text",
        "X-Document-Revision": "revision-2",
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Length": "16",
      }),
    });

    await expect(client.getResourceDocumentText("private.txt", {
      ...resourceOptions,
      signal: controller.signal,
    })).resolves.toEqual({
      content: "document content",
      revision: "revision-2",
      mimeType: "text/plain",
      sizeBytes: 16,
      documentKind: "document-text",
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/resource?file=chat-1%2Fprivate.txt", expect.objectContaining({
      method: "GET",
      signal: controller.signal,
      headers: { Authorization: "Bearer resource-token" },
    }));
    expect(text).toHaveBeenCalledTimes(1);
  });
});
