import { buildSurfaceRoute, readChatPreviewLive } from "./surfaceRoutes";

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
