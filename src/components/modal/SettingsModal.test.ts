import { formatWsStatusText } from "./SettingsModal";

describe("formatWsStatusText", () => {
  it("shows the detailed websocket error when available", () => {
    expect(
      formatWsStatusText(
        "error",
        "WebSocket 握手失败，请检查 Access Token 是否有效，并确认后端已启用 /ws。",
      ),
    ).toBe(
      "WebSocket 连接异常：WebSocket 握手失败，请检查 Access Token 是否有效，并确认后端已启用 /ws。",
    );
  });

  it("falls back to generic status text when no error details exist", () => {
    expect(formatWsStatusText("connected")).toBe("WebSocket 已连接");
    expect(formatWsStatusText("connecting")).toBe("WebSocket 连接中...");
    expect(formatWsStatusText("disconnected")).toBe("WebSocket 未连接");
  });
});
