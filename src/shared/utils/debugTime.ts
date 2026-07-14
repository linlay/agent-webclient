import { getI18nRuntimeConfig } from "@/shared/i18n";
import { isEpochMillis } from "@/shared/utils/platformTime";

function createTimeOnlyFormatter(): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(getI18nRuntimeConfig().locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
}

function createMonthDayTimeFormatter(): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(getI18nRuntimeConfig().locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

function createYearMonthFormatter(): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(getI18nRuntimeConfig().locale, {
    year: "numeric",
    month: "2-digit",
  });
}

function isToday(date: Date, now: Date): boolean {
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function isThisYear(date: Date, now: Date): boolean {
  return date.getFullYear() === now.getFullYear();
}

export function formatDebugTimestamp(timestamp?: number): string {
  if (!isEpochMillis(timestamp)) return "--";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "--";
  const now = new Date();
  if (isToday(date, now)) return createTimeOnlyFormatter().format(date);
  if (isThisYear(date, now)) return createMonthDayTimeFormatter().format(date);
  return createYearMonthFormatter().format(date);
}
