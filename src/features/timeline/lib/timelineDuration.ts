import { t as runtimeT } from "@/shared/i18n";
import type { TranslateParams } from "@/shared/i18n";

export type TranslateFn = (key: string, params?: TranslateParams) => string;

export function formatToolDuration(
  durationMs?: number,
  translate: TranslateFn = runtimeT,
): string {
  if (!Number.isFinite(durationMs) || Number(durationMs) <= 0) {
    return "";
  }

  const value = Number(durationMs);
  if (value < 1000) {
    return translate("timeline.toolPill.duration.milliseconds", {
      count: Math.round(value),
    });
  }
  if (value < 60_000) {
    const rawSeconds = value / 1000;
    const seconds =
      rawSeconds < 10 && !Number.isInteger(rawSeconds)
        ? Number(rawSeconds.toFixed(1))
        : Math.round(rawSeconds);
    return translate("timeline.toolPill.duration.seconds", {
      count: seconds,
    });
  }

  const totalSeconds = Math.round(value / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return translate("timeline.toolPill.duration.minutes", {
      minutes,
      seconds,
    });
  }

  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  return translate("timeline.toolPill.duration.hours", {
    hours,
    minutes: remainMinutes,
    seconds,
  });
}