import { formatTtsDebugStatus } from "@/features/settings/components/SettingsTtsDebug";
import { buildI18nRuntimeConfig, translateMessage } from "@/shared/i18n";

function translateFor(locale: "en-US" | "zh-CN") {
  const config = buildI18nRuntimeConfig({ locale });
  return (key: string, params?: Record<string, unknown>) =>
    translateMessage(key, params, config);
}

describe("formatTtsDebugStatus", () => {
  it("localizes TTS runtime states and preserves backend error details", () => {
    expect(formatTtsDebugStatus("tts started (4 frames, 8192 bytes)", translateFor("en-US"))).toBe(
      "TTS started (4 frames, 8192 bytes)",
    );
    expect(formatTtsDebugStatus("error: provider unavailable", translateFor("zh-CN"))).toBe(
      "错误：provider unavailable",
    );
  });
});
