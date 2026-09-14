import { ApiError } from "@/shared/data";
import { normalizePlatformError, formatPlatformErrorForDisplay } from "@/shared/data/errors/platformError";
import { buildI18nRuntimeConfig, configureI18nRuntime } from "@/shared/i18n";
import { connectorErrorDetails } from "./connectorError";

it("preserves the actual server reason hidden by the generic API message without dumping response data", () => {
  const platformError = normalizePlatformError({ code: "invalid_connector", status: 400, message: "cli.json: invalid executable; token=secret-value", data: { password: "private-data" } });
  const cause = new ApiError("generic", { platformError });
  expect(connectorErrorDetails(cause)).toContain("cli.json: invalid executable");
  expect(connectorErrorDetails(cause)).toContain("invalid_connector · 400");
  expect(connectorErrorDetails(cause)).not.toMatch(/secret-value|private-data/);
});

it.each(["connector_busy", "connector_reload_failed", "connector_not_found", "connector_in_use", "builtin_connector_readonly", "connector_exists", "invalid_connector"])("explains %s in both languages", code => {
  for (const locale of ["zh-CN", "en-US"]) {
    configureI18nRuntime(buildI18nRuntimeConfig({ locale, fallbackLocale: locale }));
    const message = formatPlatformErrorForDisplay({ code, status: 400 }).message;
    expect(message).not.toMatch(/操作失败，请稍后重试|The operation failed\. Please try again later|platformError\./);
  }
});
