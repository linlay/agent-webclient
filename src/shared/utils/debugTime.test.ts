import { formatDebugTimestamp } from "@/shared/utils/debugTime";
import {
  configureI18nRuntime,
  DEFAULT_LOCALES,
  getDefaultTermsForLocale,
} from "@/shared/i18n";

describe("formatDebugTimestamp", () => {
  beforeEach(() => {
    configureI18nRuntime({
      locale: "zh-CN",
      fallbackLocale: "zh-CN",
      locales: DEFAULT_LOCALES,
      terms: getDefaultTermsForLocale("zh-CN"),
    });
  });

  it("formats debug timestamps as local HH:mm:ss without date or milliseconds", () => {
    const formatted = formatDebugTimestamp(1776518171300);

    expect(formatted).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(formatted).not.toMatch(/\d{4}[/-]\d{2}[/-]\d{2}/);
    expect(formatted).not.toContain(",");
    expect(formatted).not.toContain(".");
  });

  it("falls back for missing or invalid timestamps", () => {
    expect(formatDebugTimestamp(undefined)).toBe("--");
    expect(formatDebugTimestamp(Number.NaN)).toBe("--");
  });
});
