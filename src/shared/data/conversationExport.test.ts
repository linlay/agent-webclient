import { resolveConversationExportAssetOrigin } from "./conversationExport";

describe("resolveConversationExportAssetOrigin", () => {
  afterEach(() => {
    delete globalThis.__AGENT_WEBCLIENT_RUNTIME_CONFIG__;
  });

  it.each([
    ["https://share.example.test", "https://share.example.test"],
    ["http://localhost:18181", "http://localhost:18181"],
    ["http://127.0.0.1:18181", "http://127.0.0.1:18181"],
    ["http://[::1]:18181", "http://[::1]:18181"]
  ])("accepts asset origin %s", (configured, expected) => {
    globalThis.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      CONVERSATION_EXPORT_ASSET_ORIGIN: configured
    };

    expect(resolveConversationExportAssetOrigin()).toBe(expected);
  });

  it.each([
    "http://share.example.test",
    "https://127.0.0.2:18181",
    "https://demo.localhost:18181",
    "https://0.0.0.0:18181",
    "https://user@share.example.test",
    "https://share.example.test/path",
    "https://share.example.test?token=bad",
    "https://share.example.test#fragment"
  ])("rejects invalid asset origin %s", (configured) => {
    globalThis.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {
      CONVERSATION_EXPORT_ASSET_ORIGIN: configured
    };

    expect(() => resolveConversationExportAssetOrigin()).toThrow(
      "conversation_export_asset_origin_invalid"
    );
  });
});
