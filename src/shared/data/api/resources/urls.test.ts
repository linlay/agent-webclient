import { buildResourceUrl, classifyResourceUrl, isLegacyResourceUrl } from "@/shared/data/api/resources/urls";
import {
  formatWorkspaceFileAddress,
  isLiteralFileTarget,
  parseLocalAbsolutePath,
  splitFileLocation,
} from "@/shared/utils/fileAddress";
import { getResourceBlob } from "@/shared/data/api/resources";
import { setupRequestHarness } from "@/shared/data/__testUtils__/requestHarness";

describe("resources/urls request contracts", () => {
  const { fetchMock } = setupRequestHarness();

  it("builds resource urls from the new resource endpoint", () => {
    expect(buildResourceUrl("reports/demo image.png")).toBe(
      "/api/resource?file=reports%2Fdemo+image.png",
    );
  });

  it("reads @chat/ paths literally and @workspace/ as a project file", () => {
    for (const alias of ["@chat/artifacts/run_01/夏日 #1%.png", "@CHAT/artifacts/run_01/夏日 #1%.png"]) {
      expect(classifyResourceUrl(alias, "chat_01")).toMatchObject({
        kind: "chat",
        resourceKey: "artifacts/run_01/%E5%A4%8F%E6%97%A5%20%231%25.png",
        fetchUrl: "/api/resource?file=chat_01%2Fartifacts%2Frun_01%2F%25E5%25A4%258F%25E6%2597%25A5%2520%25231%2525.png",
        requiresPlatformAuth: true,
      });
    }
    // Nothing is decoded: this file is really named "a%20b.txt".
    expect(classifyResourceUrl("@chat/artifacts/run_01/a%20b.txt", "chat_01").resourceKey).toBe(
      "artifacts/run_01/a%2520b.txt",
    );
    for (const invalid of ["@chat/", "@chat/../chat_02/a.png", "@chat/a//b.png", "@chat/%2E%2E/a.png"]) {
      expect(classifyResourceUrl(invalid, "chat_01").kind).toBe("invalid");
    }
    expect(classifyResourceUrl("@workspace/docs/a.md:42", "chat_01")).toEqual({
      kind: "workspace",
      source: "@workspace/docs/a.md:42",
      fetchUrl: "",
      requiresPlatformAuth: false,
    });
  });

  it("requires a bound Chat for @chat/ instead of guessing one", () => {
    expect(classifyResourceUrl("@chat/report.md", "")).toMatchObject({
      kind: "invalid",
      invalidReason: "chat_context_required",
    });
  });

  it.each([
    "artifacts/run_01/report.md",
    "references/source.pdf",
    "report.md",
    "src/app.ts",
    "docs/说明.md",
    "./docs/a.md",
    "@runtime/chats/chat_01/a.md",
  ])("names no file for the unscoped path %s", (source) => {
    expect(classifyResourceUrl(source, "chat_01")).toMatchObject({
      kind: "invalid",
      invalidReason: "unscoped",
    });
  });

  it("hides the transport endpoint", () => {
    const legacy = "/api/resource?file=chat_01%2Fold.png";
    expect(buildResourceUrl("chat_01/old.png")).toBe(
      "/api/resource?file=chat_01%2Fold.png",
    );
    expect(isLegacyResourceUrl(legacy)).toBe(true);
    expect(
      isLegacyResourceUrl("https://example.com/api/resource?file=public.png"),
    ).toBe(false);
    expect(classifyResourceUrl(legacy, "chat_01")).toMatchObject({
      kind: "invalid",
      fetchUrl: "",
      requiresPlatformAuth: false,
    });
  });

  it.each([
    ["/Users/alice/image.png", "workspace"],
    ["/Users/alice/夏日 #1%.png", "workspace"],
    ["/tmp/image.png", "workspace"],
    ["C:\\Users\\alice\\image.png", "workspace"],
    ["C:/Users/alice/image.png", "workspace"],
    ["file:///Users/alice/image.png", "workspace"],
    ["file:///C:/Users/alice/image.png", "workspace"],
    ["/tmp/../private/image.png", "invalid"],
    ["/tmp/%2E%2E/private/image.png", "invalid"],
    ["/Users/alice//image.png", "invalid"],
    ["\\\\server\\share\\image.png", "invalid"],
    ["file://server/share/image.png", "invalid"],
    ["ftp://example.com/image.png", "invalid"],
    ["/api/resource?file=chat_01%2Fimage.png", "invalid"],
    ["https://example.com/image.png", "external"],
    ["http://example.com/image.png", "external"],
    ["data:image/png;base64,AAAA", "inline"],
    ["blob:https://example.com/id", "inline"],
  ])("classifies resource boundary %s as %s", (source, expectedKind) => {
    expect(classifyResourceUrl(source, "chat_01").kind).toBe(expectedKind);
  });

  it.each([
    "\\\\server\\share\\image.png",
    "\\server\\share\\image.png",
    "file://server/share/image.png",
  ])("reports the network path %s as not supported yet", (source) => {
    expect(classifyResourceUrl(source, "chat_01").invalidReason).toBe("unsupported_path");
  });

  it("recognizes host paths without decoding them and leaves permission to Platform", () => {
    expect(parseLocalAbsolutePath("/Users/alice/a%20b.md")).toEqual({ kind: "local", path: "/Users/alice/a%20b.md" });
    expect(parseLocalAbsolutePath("C:\\Users\\alice\\src\\app.ts:42")).toEqual({
      kind: "local",
      path: "C:\\Users\\alice\\src\\app.ts:42",
    });
    expect(parseLocalAbsolutePath("file:///C:/Users/alice/%E8%AF%B4%E6%98%8E.md")).toEqual({
      kind: "local",
      path: "C:/Users/alice/说明.md",
    });
    expect(parseLocalAbsolutePath("file://localhost/Users/alice/a.md")).toEqual({ kind: "local", path: "/Users/alice/a.md" });
    expect(parseLocalAbsolutePath("/Users/alice/../a.md")).toEqual({ kind: "invalid" });
    expect(parseLocalAbsolutePath("//example.com/a.md")).toBeNull();
    expect(parseLocalAbsolutePath("src/app.ts")).toBeNull();
  });

  it("keeps the line of a location and ignores its column", () => {
    expect(splitFileLocation("src/app.ts:42")).toEqual({ filePath: "src/app.ts", line: 42 });
    expect(splitFileLocation("src/app.ts:42:3")).toEqual({ filePath: "src/app.ts", line: 42 });
    expect(splitFileLocation("C:\\project\\src\\app.ts:42")).toEqual({ filePath: "C:\\project\\src\\app.ts", line: 42 });
    expect(splitFileLocation("C:\\project\\src\\app.ts")).toEqual({ filePath: "C:\\project\\src\\app.ts" });
    expect(splitFileLocation("src/app.ts:0")).toEqual({ filePath: "src/app.ts" });
    expect(splitFileLocation("src/app.ts")).toEqual({ filePath: "src/app.ts" });
    expect(formatWorkspaceFileAddress("src/app.ts", 42)).toBe("@workspace/src/app.ts:42");
    expect(formatWorkspaceFileAddress("src/app.ts")).toBe("@workspace/src/app.ts");
  });

  it("passes only file targets through Markdown literally", () => {
    for (const target of ["@chat/a b.md", "@workspace/a.md", "/Users/a.md", "C:\\a.md", "\\\\server\\a.md"]) {
      expect(isLiteralFileTarget(target)).toBe(true);
    }
    for (const target of ["https://example.com/a b", "//example.com/a", "file:///a.md", "#top", "src/app.ts"]) {
      expect(isLiteralFileTarget(target)).toBe(false);
    }
  });

  it.each([
    "C:\\Users\\alice\\image.png",
    "\\\\server\\share\\image.png",
    "file:///tmp/image.png",
    "/Users/alice/image.png",
    "/api/resource?file=chat_01%2Fimage.png",
    "chat_01/image.png",
    "artifacts/run_01/image.png",
    "@workspace/images/poster.png",
    "/tmp/../private/image.png",
  ])("never fetches %s through the Chat data plane", async (source) => {
    await expect(
      getResourceBlob(source, { chatId: "chat_01" }),
    ).rejects.toThrow(Error);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
