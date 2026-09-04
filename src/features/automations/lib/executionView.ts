import type { AutomationExecutionResponse } from "@/shared/data";

export interface AutomationExecutionGroup {
  key: string;
  label: string;
  items: AutomationExecutionResponse[];
}

function localDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function executionDateKey(item: AutomationExecutionResponse): string {
  const readable = String(item.startedTime || "").trim();
  const matched = readable.match(/^(\d{4}-\d{2}-\d{2})/);
  if (matched) return matched[1];
  const date = new Date(item.startedAt);
  return Number.isNaN(date.getTime()) ? "unknown" : localDateKey(date);
}

export function automationExecutionTimeLabel(
  item: AutomationExecutionResponse,
  locale: string,
): string {
  const readable = String(item.startedTime || "").trim();
  const matched = readable.match(/\b(\d{2}:\d{2})(?::\d{2})?$/);
  if (matched) return matched[1];
  const date = new Date(item.startedAt);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function automationExecutionDateTimeLabel(
  item: AutomationExecutionResponse,
  locale: string,
): string {
  const readable = String(item.startedTime || "").trim();
  if (readable) return readable;
  const date = new Date(item.startedAt);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function automationExecutionDurationLabel(value?: number): string {
  if (value === undefined || value === null || value < 0) return "--";
  if (value < 1000) return `${value}ms`;
  return `${(value / 1000).toFixed(1)}s`;
}

export function automationExecutionPreview(
  item: AutomationExecutionResponse,
  fallback: { running: string; empty: string },
): string {
  const result = String(item.resultPreview || "").trim();
  if (result) return result;
  const error = String(item.error || "").trim();
  if (error) return error;
  return item.status === "running" ? fallback.running : fallback.empty;
}

export function mergeAutomationExecutionPages(
  current: AutomationExecutionResponse[],
  incoming: AutomationExecutionResponse[],
  replace: boolean,
): AutomationExecutionResponse[] {
  const next = new Map<string, AutomationExecutionResponse>();
  if (!replace) {
    current.forEach((item) => next.set(item.id, item));
  }
  incoming.forEach((item) => next.set(item.id, item));
  return Array.from(next.values()).sort(
    (left, right) => right.startedAt - left.startedAt || right.id.localeCompare(left.id),
  );
}

export function groupAutomationExecutions(
  items: AutomationExecutionResponse[],
  options: {
    locale: string;
    todayLabel: string;
    yesterdayLabel: string;
    now?: Date;
  },
): AutomationExecutionGroup[] {
  const now = options.now || new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const todayKey = localDateKey(now);
  const yesterdayKey = localDateKey(yesterday);
  const groups = new Map<string, AutomationExecutionResponse[]>();
  items.forEach((item) => {
    const key = executionDateKey(item);
    const group = groups.get(key) || [];
    group.push(item);
    groups.set(key, group);
  });
  return Array.from(groups.entries()).map(([key, groupItems]) => ({
    key,
    label:
      key === todayKey
        ? options.todayLabel
        : key === yesterdayKey
          ? options.yesterdayLabel
          : key === "unknown"
            ? "--"
            : new Intl.DateTimeFormat(options.locale, {
                month: "short",
                day: "numeric",
              }).format(new Date(`${key}T12:00:00`)),
    items: groupItems,
  }));
}
