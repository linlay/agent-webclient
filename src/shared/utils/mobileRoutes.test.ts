import { buildClientLayoutHref, isFullClientPath, isMobilePath, toMobileRoute } from "./mobileRoutes";

describe("mobile route handoffs", () => {
  it("preserves the active chat and global settings when switching layout", () => {
    const search = "?lang=en-US&chatId=old&agentKey=stale&newChat=123&composerDraft=old&composerSkill=stale";
    expect(buildClientLayoutHref("/mobile", search, "active", "demo")).toBe("/mobile?lang=en-US&chatId=active");
    expect(buildClientLayoutHref("/", search, "active")).toBe("/?lang=en-US&chatId=active");
  });

  it("opens a blank mobile conversation with the selected Agent", () => {
    expect(buildClientLayoutHref("/mobile", "?chatId=old", "", "agent/demo")).toBe("/mobile?agentKey=agent%2Fdemo");
    expect(buildClientLayoutHref("/mobile", "")).toBe("/mobile");
  });

  it("keeps management detail routes and their filters inside mobile", () => {
    expect(toMobileRoute("/connectors/example?lang=en-US#settings")).toBe("/mobile/connectors/example?lang=en-US#settings");
    expect(toMobileRoute("/mobile/agents/demo")).toBe("/mobile/agents/demo");
  });
  it("loads existing chats by chatId without imposing the URL Agent as owner", () => {
    expect(toMobileRoute("/agent/old-owner?chatId=chat-a&lang=zh-CN")).toBe("/mobile?chatId=chat-a&lang=zh-CN");
  });
  it("retains a new-conversation draft for the intended Agent", () => {
    const target = new URL(toMobileRoute("/agent/demo?newChat=1794787200000&composerDraft=hello"), "https://test.invalid");
    expect(target.pathname).toBe("/mobile");
    expect(Object.fromEntries(target.searchParams)).toEqual({ agentKey: "demo", newChat: "1794787200000", composerDraft: "hello" });
  });
  it.each(["https://example.com/path", "//example.com/path", "#section", "../files"])("preserves non-app navigation: %s", target => {
    expect(toMobileRoute(target)).toBe(target);
  });
  it("does not confuse embed or Copilot with the full client", () => {
    expect(isFullClientPath("/")).toBe(true);
    expect(isFullClientPath("/mobile/project/demo")).toBe(true);
    expect(isMobilePath("/mobile-other")).toBe(false);
    expect(isFullClientPath("/copilot/demo")).toBe(false);
    expect(isFullClientPath("/embed/demo")).toBe(false);
  });
});
