import type { Agent } from "@/features/agents/lib/agentState";
import type { WorkerRow } from "./workerState";
import type { CurrentWorkerSummary } from "./currentWorker";

export interface TimelineAgentOption {
  key: string;
  name: string;
  role: string;
  hideRole?: boolean;
  icon?: Agent["icon"];
  searchText: string;
}

function normalizeSearchText(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function buildTimelineAgentSearchText(input: {
  key: string;
  name: string;
  role: string;
  searchText?: string;
}): string {
  return [input.name, input.role, input.key, input.searchText]
    .map(normalizeSearchText)
    .filter(Boolean)
    .join(" ");
}

function pushUniqueTimelineAgentOption(
  options: TimelineAgentOption[],
  option: {
    key?: unknown;
    name?: unknown;
    role?: unknown;
    hideRole?: boolean;
    icon?: Agent["icon"];
    searchText?: unknown;
  },
): void {
  const key = String(option.key || "").trim();
  if (!key || options.some((item) => item.key === key)) {
    return;
  }

  const name = String(option.name || key).trim() || key;
  const role = String(option.role || "").trim();
  options.push({
    key,
    name,
    role,
    hideRole: option.hideRole,
    icon: option.icon,
    searchText: buildTimelineAgentSearchText({
      key,
      name,
      role,
      searchText: String(option.searchText || ""),
    }),
  });
}

export function buildTimelineAgentOptions(input: {
  agents: Agent[];
  workerRows: WorkerRow[];
  currentWorker: Pick<NonNullable<CurrentWorkerSummary>, "type" | "sourceId" | "displayName" | "role"> | null;
}): TimelineAgentOption[] {
  const iconByAgentKey = new Map<string, Agent["icon"]>();
  for (const agent of Array.isArray(input.agents) ? input.agents : []) {
    const key = String(agent?.key || "").trim();
    if (key) {
      iconByAgentKey.set(key, agent.icon);
    }
  }

  const agentTypeByKey = new Map<string, WorkerRow["agentType"]>();
  for (const row of Array.isArray(input.workerRows) ? input.workerRows : []) {
    if (row?.type !== "agent") continue;
    const key = String(row.sourceId || "").trim();
    if (key && row.agentType) {
      agentTypeByKey.set(key, row.agentType);
    }
  }

  function shouldHide(agentKey: string): boolean {
    const agentType = agentTypeByKey.get(agentKey);
    return agentType === "coder" || agentType === "kbase";
  }

  const options: TimelineAgentOption[] = [];
  if (input.currentWorker?.type === "agent") {
    pushUniqueTimelineAgentOption(options, {
      key: input.currentWorker.sourceId,
      name: input.currentWorker.displayName,
      role: input.currentWorker.role,
      hideRole: shouldHide(input.currentWorker.sourceId),
      icon: iconByAgentKey.get(input.currentWorker.sourceId),
    });
  }

  const rows = Array.isArray(input.workerRows) ? input.workerRows : [];
  for (const row of rows) {
    if (row?.type !== "agent") continue;
    pushUniqueTimelineAgentOption(options, {
      key: row.sourceId,
      name: row.displayName,
      role: row.role,
      hideRole: row.agentType === "coder" || row.agentType === "kbase",
      icon: iconByAgentKey.get(row.sourceId),
      searchText: row.searchText,
    });
  }

  if (options.length <= 1) {
    for (const agent of Array.isArray(input.agents) ? input.agents : []) {
      const agentKey = String(agent?.key || "").trim();
      pushUniqueTimelineAgentOption(options, {
        key: agent?.key,
        name: agent?.name,
        role: agent?.role || "",
        hideRole:
          agent?.type === "coder" ||
          String(agent?.mode || "").toUpperCase() === "CODER" ||
          String(agent?.mode || "").toUpperCase() === "KBASE",
        icon: agent?.icon,
      });
    }
  }

  return options;
}

export function filterTimelineAgentOptions(
  options: TimelineAgentOption[],
  searchText: string,
): TimelineAgentOption[] {
  const normalizedSearch = normalizeSearchText(searchText);
  if (!normalizedSearch) {
    return options;
  }

  return options.filter((option) =>
    normalizeSearchText(option.searchText).includes(normalizedSearch),
  );
}

export function dispatchTimelineAgentSwitch(option: TimelineAgentOption): void {
  const agentKey = String(option?.key || "").trim();
  if (
    !agentKey ||
    typeof window === "undefined" ||
    typeof window.dispatchEvent !== "function"
  ) {
    return;
  }

  const detail = {
    workerKey: `agent:${agentKey}`,
    agentKey,
    focusComposerOnComplete: true,
    preferNewChat: true,
  };

  if (typeof CustomEvent === "function") {
    window.dispatchEvent(new CustomEvent("agent:select-worker", { detail }));
    return;
  }

  const event = new Event("agent:select-worker") as CustomEvent<typeof detail>;
  Object.defineProperty(event, "detail", { value: detail });
  window.dispatchEvent(event);
}
