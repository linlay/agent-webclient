import { getI18nRuntimeConfig } from "@/shared/i18n";

function createDebugDateTimeFormatter(): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(getI18nRuntimeConfig().locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hour12: false,
  });
}

export function formatDebugTimestamp(timestamp?: number): string {
  if (!timestamp) return "--";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "--";
  return createDebugDateTimeFormatter().format(date);
}
