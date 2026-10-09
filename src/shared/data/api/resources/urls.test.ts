import { buildResourceUrl, classifyResourceUrl, isLegacyResourceUrl, isChatScopeResourceRef, markdownChatAliasToLiteral } from "@/shared/data/api/resources/urls";
import { getResourceBlob } from "@/shared/data/api/resources";
import { setupRequestHarness } from "@/shared/data/__testUtils__/requestHarness";

describe("resources/urls request contracts", () => {
  const { fetchMock } = setupRequestHarness();

  it("builds resource urls from the new resource endpoint", () => {
    expect(buildResourceUrl("reports/demo image.png")).toBe(
      "/api/resource?file=reports%2Fdemo+image.png",
    );
  });

  it("treats @chat/ as the bare chat reference and @workspace/ as a project file", () => {
    const bare = classifyResourceUrl("artifacts/run_01/%E5%A4%8F%E6%97%A5%20%231%25.png", "chat_01");
    // The published url is literal; the Markdown layer decodes what a renderer encoded.
    for (const alias of [
      "@chat/artifacts/run_01/夏日 #1%.png",
      markdownChatAliasToLiteral("@chat/artifacts/run_01/%E5%A4%8F%E6%97%A5%20%231%25.png")!,
      "@CHAT/artifacts/run_01/夏日 #1%.png",
    ]) {
      expect(classifyResourceUrl(alias, "chat_01")).toMatchObject({
        kind: "chat",
        resourceKey: bare.resourceKey,
        fetchUrl: bare.fetchUrl,
        requiresPlatformAuth: true,
      });
    }
    // A stored url is never decoded: this file is really named "a%20b.txt".
    expect(classifyResourceUrl("@chat/artifacts/run_01/a%20b.txt", "chat_01").fetchUrl).toBe(
      classifyResourceUrl("artifacts/run_01/a%2520b.txt", "chat_01").fetchUrl,
    );
    expect(markdownChatAliasToLiteral("artifacts/a%20b.txt")).toBe("artifacts/a%20b.txt");
    expect(markdownChatAliasToLiteral("@chat/50%off.png")).toBe("@chat/50%off.png");
    for (const invalid of ["@chat/", "@chat/../chat_02/a.png", "@chat/a//b.png", "@chat/%2E%2E/a.png", "@chat/chat_01/a.png"]) {
      expect(classifyResourceUrl(invalid, "chat_01").kind).toBe("invalid");
    }
    expect(classifyResourceUrl("@workspace/docs/a.md:42", "chat_01")).toEqual({
      kind: "workspace",
      source: "@workspace/docs/a.md:42",
      fetchUrl: "",
      requiresPlatformAuth: false,
    });
    expect(classifyResourceUrl("@runtime/chats/chat_01/a.md", "chat_01").kind).toBe("chat");
  });

  it("classifies Markdown resources and hides the transport endpoint", () => {
    const legacy = "/api/resource?file=chat_01%2Fold.png";
    expect(buildResourceUrl("chat_01/old.png")).toBe(
      "/api/resource?file=chat_01%2Fold.png",
    );
    expect(buildResourceUrl("/Users/alice/demo.png", "chat_01")).toBe(
      "/api/resource?file=%2FUsers%2Falice%2Fdemo.png&chatId=chat_01",
    );
    expect(isLegacyResourceUrl(legacy)).toBe(true);
    expect(
      isLegacyResourceUrl("https://example.com/api/resource?file=public.png"),
    ).toBe(false);
    expect(
      isChatScopeResourceRef(
        "artifacts/run_01/%E5%A4%8F%E6%97%A5.png",
        "chat_01",
      ),
    ).toBe(true);
    expect(isChatScopeResourceRef("chat_01/image.png", "chat_01")).toBe(false);
    expect(isChatScopeResourceRef("/Users/alice/image.png", "chat_01")).toBe(
      false,
    );
    expect(
      isChatScopeResourceRef("https://example.com/image.png", "chat_01"),
    ).toBe(false);
    expect(
      isChatScopeResourceRef("artifacts/%2E%2E/private.png", "chat_01"),
    ).toBe(false);
    expect(classifyResourceUrl("image.png", "chat_01")).toMatchObject({
      kind: "chat",
      resourceKey: "image.png",
      fetchUrl: "/api/resource?file=chat_01%2Fimage.png",
      requiresPlatformAuth: true,
    });
    expect(classifyResourceUrl(legacy, "chat_01")).toMatchObject({
      kind: "invalid",
      fetchUrl: "",
      requiresPlatformAuth: false,
    });
    expect(
      classifyResourceUrl("%E5%A4%8F%E6%97%A5%20%231%25.png", "chat_01")
        .fetchUrl,
    ).toBe(
      "/api/resource?file=chat_01%2F%25E5%25A4%258F%25E6%2597%25A5%2520%25231%2525.png",
    );
  });

  it.each([
    ["/Users/alice/image.png", "absolute"],
    ["/tmp/image.png", "absolute"],
    ["/tmp/../private/image.png", "invalid"],
    ["/tmp/%2E%2E/private/image.png", "invalid"],
    ["/Users/alice//image.png", "invalid"],
    ["C:\\Users\\alice\\image.png", "invalid"],
    ["\\\\server\\share\\image.png", "invalid"],
    ["file:///tmp/image.png", "invalid"],
    ["ftp://example.com/image.png", "invalid"],
    ["/api/resource?file=chat_01%2Fimage.png", "invalid"],
    ["chat_01/image.png", "invalid"],
    ["artifacts//image.png", "invalid"],
    ["artifacts/./image.png", "invalid"],
    ["artifacts/../image.png", "invalid"],
    ["image.png?download=1", "invalid"],
    ["image.png#preview", "invalid"],
    ["https://example.com/image.png", "external"],
    ["http://example.com/image.png", "external"],
    ["data:image/png;base64,AAAA", "inline"],
    ["blob:https://example.com/id", "inline"],
  ])("classifies resource boundary %s as %s", (source, expectedKind) => {
    expect(classifyResourceUrl(source, "chat_01").kind).toBe(expectedKind);
  });

  it("constructs absolute fetches with chat context and delegates Team access to Platform", () => {
    expect(
      classifyResourceUrl(
        "/Users/alice/%E5%A4%8F%E6%97%A5%20%231%25.png",
        "chat_01",
      ),
    ).toMatchObject({
      kind: "absolute",
      resourceKey: "/Users/alice/夏日 #1%.png",
      fetchUrl:
        "/api/resource?file=%2FUsers%2Falice%2F%E5%A4%8F%E6%97%A5+%231%25.png&chatId=chat_01",
      requiresPlatformAuth: true,
    });
    expect(
      classifyResourceUrl("/tmp/image.png", "chat_01", { teamChat: true }).kind,
    ).toBe("absolute");
    expect(
      classifyResourceUrl("/Users/alice/image.png", "chat_01", {
        teamChat: true,
      }).kind,
    ).toBe("absolute");
  });

  it.each([
    "C:\\Users\\alice\\image.png",
    "\\\\server\\share\\image.png",
    "file:///tmp/image.png",
    "/api/resource?file=chat_01%2Fimage.png",
    "chat_01/image.png",
    "artifacts/../image.png",
    "/tmp/../private/image.png",
    "/tmp/%2E%2E/private/image.png",
  ])("never fetches rejected resource source %s", async (source) => {
    await expect(
      getResourceBlob(source, { chatId: "chat_01" }),
    ).rejects.toThrow(Error);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
