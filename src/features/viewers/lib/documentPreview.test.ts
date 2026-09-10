import { isValidDocumentPreview, resolveDocumentPreviewSource } from "./documentPreview";
import type { ViewerTarget } from "./viewerTarget";

const resource = (url: string): ViewerTarget => ({ type: "resource", name: "报告.docx", url, downloadUrl: url, contentKind: "office" });

test("preview sources preserve owning Chat and decode resource URI segments once", () => {
  expect(resolveDocumentPreviewSource(resource("artifacts/run/%E6%8A%A5%E5%91%8A.docx"), "chat-a"))
    .toEqual({ kind: "chat-resource", chatId: "chat-a", relativePath: "artifacts/run/报告.docx" });
  expect(resolveDocumentPreviewSource({ ...resource("ignored"), source: {
    kind: "reference", chatId: "owner", agentKey: "a", resourceId: "r", relativePath: "100%报告.docx",
  } }, "wrong")).toEqual({ kind: "chat-resource", chatId: "owner", relativePath: "100%报告.docx" });
  for (const url of ["https://other.test/a.docx", "blob:test", "/api/resource?file=x", "../a.docx", "artifacts/%2e%2e/a.docx"]) {
    expect(resolveDocumentPreviewSource(resource(url), "chat-a")).toBeNull();
  }
});

test("preview results reject unsafe URL schemes, credentials, invalid modes and expiry", () => {
  const result = { previewId: "id", sourceRevision: "r", openMode: "iframe" as const, url: "https://docs.test/s/token", expiresAt: Date.now() + 10000 };
  expect(isValidDocumentPreview(result, "https://app.test")).toBe(true);
  for (const url of ["javascript:alert(1)", "https://user:secret@docs.test/s/t", "file:///tmp/a"]) {
    expect(isValidDocumentPreview({ ...result, url }, "https://app.test")).toBe(false);
  }
  expect(isValidDocumentPreview({ ...result, expiresAt: 0 }, "https://app.test")).toBe(false);
  expect(isValidDocumentPreview(result, "https://docs.test")).toBe(false);
  expect(isValidDocumentPreview({ ...result, openMode: "external" }, "https://docs.test")).toBe(true);
});
