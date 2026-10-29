import { buildSurfaceRoute, readChatPreviewLive, readSurfacePresentationContext } from "@/features/surfaces/lib/surfaceRoutes";

it("preserves Desktop header bootstrap only across Agent Chat routes", () => {
  const context = readSurfacePresentationContext("?lang=zh-CN&desktopSidebarCollapsed=1&desktopHeaderLeftInset=128");
  const chat = new URL(buildSurfaceRoute({ kind: "agent", agentKey: "a", chatId: "c" }, context), "http://localhost");
  expect(chat.searchParams.get("desktopHeaderLeftInset")).toBe("128");
  const overview = new URL(buildSurfaceRoute({ kind: "overview", chatId: "c" }, context), "http://localhost");
  expect(overview.searchParams.has("desktopHeaderLeftInset")).toBe(false);
});

describe("Chat preview routes", () => {
  it("builds a Chat-level live or explicit snapshot URL", () => {
    expect(buildSurfaceRoute({ kind: "chat-preview", chatId: "chat / 1" })).toBe("/chat-preview/chat%20%2F%201");
    expect(buildSurfaceRoute({ kind: "chat-preview", chatId: "chat-1", live: false })).toBe("/chat-preview/chat-1?live=false");
    expect(buildSurfaceRoute({ kind: "chat-preview", chatId: " " })).toBe("");
  });
});

it("parses explicit snapshot mode without accepting agent or run filtering parameters", () => {
  expect(readChatPreviewLive("")).toBe(true);
  expect(readChatPreviewLive("?live=false")).toBe(false);
  expect(readChatPreviewLive("?live=true&runId=other&agentKey=other")).toBe(true);
});
