const WEEKDAY_MESSAGE_KEYS: Record<number, string> = {
  0: "automationConsole.cron.weekday.sunday",
  1: "automationConsole.cron.weekday.monday",
  2: "automationConsole.cron.weekday.tuesday",
  3: "automationConsole.cron.weekday.wednesday",
  4: "automationConsole.cron.weekday.thursday",
  5: "automationConsole.cron.weekday.friday",
  6: "automationConsole.cron.weekday.saturday",
};

type CronTranslate = (
  key: string,
  params?: Record<string, unknown>,
) => string;

const WEEKDAY_ALIASES: Record<string, number> = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
};

const MONTH_ALIASES: Record<string, number> = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
};

function parseInteger(
  value: string,
  min: number,
  max: number,
  aliases: Record<string, number> = {},
): number | null {
  const normalized = value.trim().toUpperCase();
  const numeric = aliases[normalized] ?? Number(normalized);
  if (!Number.isInteger(numeric) || numeric < min || numeric > max) return null;
  return numeric;
}

function parseList(
  value: string,
  min: number,
  max: number,
  aliases: Record<string, number> = {},
): number[] | null {
  const parts = value.split(",");
  const values = parts.map((part) => parseInteger(part, min, max, aliases));
  if (values.some((item) => item === null)) return null;
  return Array.from(new Set(values as number[]));
}

function parseStep(value: string): number | null {
  const match = /^\*\/(\d+)$/.exec(value);
  if (!match) return null;
  const step = Number(match[1]);
  return Number.isInteger(step) && step > 0 ? step : null;
}

function parseRange(
  value: string,
  min: number,
  max: number,
  aliases: Record<string, number> = {},
): [number, number] | null {
  const parts = value.split("-");
  if (parts.length !== 2) return null;
  const start = parseInteger(parts[0], min, max, aliases);
  const end = parseInteger(parts[1], min, max, aliases);
  if (start === null || end === null || start > end) return null;
  return [start, end];
}

function normalizeWeekday(value: number): number {
  return value === 7 ? 0 : value;
}

function describeWeekdays(value: string, t: CronTranslate): string | null {
  if (value === "*") return t("automationConsole.cron.daily");
  if (/^(?:1-5|MON-FRI)$/i.test(value)) {
    return t("automationConsole.cron.weekdays");
  }
  if (/^(?:0,6|6,0|6-7|SAT-SUN)$/i.test(value)) {
    return t("automationConsole.cron.weekends");
  }

  const parsed = parseList(value, 0, 7, WEEKDAY_ALIASES);
  if (!parsed) return null;
  const days = parsed.map(normalizeWeekday);
  const uniqueDays = Array.from(new Set(days));
  const separator = t("automationConsole.cron.listSeparator");
  return t("automationConsole.cron.weeklyDays", {
    days: uniqueDays.map((day) => t(WEEKDAY_MESSAGE_KEYS[day])).join(separator),
  });
}

function padTime(value: number): string {
  return String(value).padStart(2, "0");
}

function describeTime(hour: number, minute: number): string {
  return `${padTime(hour)}:${padTime(minute)}`;
}

function describeFixedTimeSchedule(
  minute: number,
  hour: number,
  dayOfMonth: string,
  month: string,
  dayOfWeek: string,
  t: CronTranslate,
): string | null {
  const time = describeTime(hour, minute);

  if (dayOfMonth === "*" && month === "*") {
    const days = describeWeekdays(dayOfWeek, t);
    return days
      ? t("automationConsole.cron.atTime", { days, time })
      : null;
  }

  // Traditional cron treats day-of-month and day-of-week together as OR.
  // Keep the raw expression for that uncommon combination instead of making
  // a deceptively simple natural-language claim.
  if (dayOfWeek !== "*") return null;

  const monthDays = parseList(dayOfMonth, 1, 31);
  if (!monthDays) return null;
  if (month === "*") {
    return t("automationConsole.cron.monthly", {
      days: monthDays.join(t("automationConsole.cron.listSeparator")),
      time,
    });
  }

  const months = parseList(month, 1, 12, MONTH_ALIASES);
  if (!months) return null;
  const separator = t("automationConsole.cron.listSeparator");
  return t("automationConsole.cron.yearly", {
    months: months.join(separator),
    days: monthDays.join(separator),
    time,
  });
}

/**
 * Converts common traditional five-field cron expressions into concise,
 * locale-aware labels. Expressions that cannot be described without losing
 * meaning are returned unchanged.
 */
export function describeCronExpression(
  expression: string,
  t: CronTranslate,
): string {
  const cron = String(expression || "").trim().replace(/\s+/g, " ");
  if (!cron) return "--";
  const fields = cron.split(" ");
  if (fields.length !== 5) return cron;

  const [minuteField, hourField, dayOfMonth, month, dayOfWeek] = fields;
  if (
    minuteField === "*" &&
    hourField === "*" &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    return t("automationConsole.cron.everyMinute");
  }

  const minuteStep = parseStep(minuteField);
  if (
    minuteStep &&
    hourField === "*" &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    return t("automationConsole.cron.everyMinutes", { count: minuteStep });
  }

  const minute = parseInteger(minuteField, 0, 59);
  const hourStep = parseStep(hourField);
  if (
    minute !== null &&
    hourStep &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    if (minute === 0) {
      return t("automationConsole.cron.everyHours", { count: hourStep });
    }
    return t("automationConsole.cron.everyHoursAtMinute", {
      count: hourStep,
      minute,
    });
  }

  if (
    minute !== null &&
    hourField === "*" &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    if (minute === 0) return t("automationConsole.cron.hourly");
    return t("automationConsole.cron.hourlyAtMinute", {
      minute,
      paddedMinute: padTime(minute),
    });
  }

  const hour = parseInteger(hourField, 0, 23);
  if (minute !== null && hour !== null) {
    return (
      describeFixedTimeSchedule(
        minute,
        hour,
        dayOfMonth,
        month,
        dayOfWeek,
        t,
      ) || cron
    );
  }

  const hourRange = parseRange(hourField, 0, 23);
  if (hourRange && minute !== null && dayOfMonth === "*" && month === "*") {
    const days = describeWeekdays(dayOfWeek, t);
    if (days) {
      const range = `${describeTime(hourRange[0], minute)}–${describeTime(hourRange[1], minute)}`;
      return t("automationConsole.cron.hourlyRange", { days, range });
    }
  }

  if (minuteStep && hourRange && dayOfMonth === "*" && month === "*") {
    const days = describeWeekdays(dayOfWeek, t);
    if (days) {
      const range = `${padTime(hourRange[0])}:00–${padTime(hourRange[1])}:59`;
      return t("automationConsole.cron.minutesRange", {
        days,
        range,
        count: minuteStep,
      });
    }
  }

  return cron;
}
