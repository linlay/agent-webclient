import { getI18nRuntimeConfig } from "@/shared/i18n";

function createDebugTimeFormatter(): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(getI18nRuntimeConfig().locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
}

export function formatDebugTimestamp(timestamp?: number): string {
  if (!timestamp) return "--";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "--";
  return createDebugTimeFormatter().format(date);
}
