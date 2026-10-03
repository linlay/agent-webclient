import {
  downloadAdminSkill,
  downloadAdminSkillFile,
  downloadChatExport,
  downloadResource,
  fetchAdminSkillFileBlob,
  fetchAdminSkillIcon,
  getChatLLMTraceRaw,
  getChatRawJsonl,
  getResourceBlob,
  getResourceDocumentText,
  getResourceText,
} from "@/shared/data/api/resources";
import { setAccessToken } from "@/shared/data/api/http";
import { configureI18nRuntime, getI18nRuntimeConfig } from "@/shared/i18n/runtime";


const originalI18n = getI18nRuntimeConfig();
beforeEach(() => { configureI18nRuntime({ locale: "en-US" }); });
afterEach(() => { configureI18nRuntime(originalI18n); });

const resourceOptions = { chatId: "chat-1" };
const resourceRequests: Array<[string, () => Promise<unknown>]> = [
  ["text", () => getResourceText("private.txt", resourceOptions)],
  ["document text", () => getResourceDocumentText("private.txt", resourceOptions)],
  ["blob", () => getResourceBlob("private.txt", resourceOptions)],
  ["raw JSONL", () => getChatRawJsonl("chat-1")],
  ["LLM trace", () => getChatLLMTraceRaw("trace.json")],
  ["download", () => downloadResource("private.txt", resourceOptions)],
  ["chat export", () => downloadChatExport("chat-1")],
  ["skill archive", () => downloadAdminSkill("skill-1")],
  ["skill file", () => downloadAdminSkillFile("skill-1", "SKILL.md")],
  ["skill icon", () => fetchAdminSkillIcon("/api/admin/skills/file/download?id=skill-1&path=icon.png")],
  ["skill blob", () => fetchAdminSkillFileBlob("skill-1", "SKILL.md")],
];

describe("resource response compatibility", () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    globalThis.fetch = fetchMock;
    fetchMock.mockReset();
    setAccessToken("resource-token");
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    setAccessToken("");
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

    await expect(getResourceDocumentText("private.txt", {
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
      headers: { Authorization: "Bearer resource-token", "X-Locale": "en-US" },
    }));
    expect(text).toHaveBeenCalledTimes(1);
  });
});
