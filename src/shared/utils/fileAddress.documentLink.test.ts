import { resolveDocumentRelativeLink, type DocumentLinkBase } from "@/shared/utils/fileAddress";

const workspace: DocumentLinkBase = { scope: "workspace", path: "docs/README.md" };
const chat: DocumentLinkBase = { scope: "chat", path: "artifacts/run_01/report.md" };

describe("resolveDocumentRelativeLink", () => {
  it.each([
    ["Agent配置合并.md", "@workspace/docs/Agent配置合并.md"],
    ["./Agent配置合并.md", "@workspace/docs/Agent配置合并.md"],
    ["../README.md", "@workspace/README.md"],
    ["sub/dir/a.md", "@workspace/docs/sub/dir/a.md"],
    ["Agent配置合并.md#标题", "@workspace/docs/Agent配置合并.md"],
    ["a%20b.md", "@workspace/docs/a b.md"],
    ["a b.md", "@workspace/docs/a b.md"],
    ["sub\\a.md", "@workspace/docs/sub/a.md"],
  ])("resolves %s against a Workspace document", (href, expected) => {
    expect(resolveDocumentRelativeLink(href, workspace)).toBe(expected);
  });

  it("resolves against a Chat document", () => {
    expect(resolveDocumentRelativeLink("data.csv", chat)).toBe("@chat/artifacts/run_01/data.csv");
    expect(resolveDocumentRelativeLink("../run_02/a.md", chat)).toBe("@chat/artifacts/run_02/a.md");
  });

  it("keeps a host absolute document path absolute", () => {
    const base: DocumentLinkBase = { scope: "workspace", path: "/Users/demo/project/docs/README.md" };
    expect(resolveDocumentRelativeLink("a.md", base)).toBe("/Users/demo/project/docs/a.md");
    expect(resolveDocumentRelativeLink("../../../../../x.md", base)).toBeNull();
    const win: DocumentLinkBase = { scope: "workspace", path: "C:\\proj\\docs\\README.md" };
    expect(resolveDocumentRelativeLink("a.md", win)).toBe("C:/proj/docs/a.md");
  });

  it("refuses to climb out of the document root", () => {
    expect(resolveDocumentRelativeLink("../../x.md", workspace)).toBeNull();
    expect(resolveDocumentRelativeLink("../../x.md", chat)).toBeNull();
    expect(resolveDocumentRelativeLink("%2e%2e/%2e%2e/x.md", workspace)).toBeNull();
  });

  it.each([
    "", "#top", "?q=1", "/abs/a.md", "\\\\server\\share", "@workspace/a.md", "@chat/a.md",
    "https://example.com", "mailto:a@b.c", "docs/", "a%2Fb.md",
  ])("leaves %p to the existing rules", (href) => {
    expect(resolveDocumentRelativeLink(href, workspace)).toBeNull();
  });

  it("names no file without a trusted document base", () => {
    expect(resolveDocumentRelativeLink("a.md", undefined)).toBeNull();
    expect(resolveDocumentRelativeLink("a.md", { scope: "workspace", path: "" })).toBeNull();
    expect(resolveDocumentRelativeLink("a.md", { scope: "chat", path: "/abs/a.md" })).toBeNull();
  });
});
