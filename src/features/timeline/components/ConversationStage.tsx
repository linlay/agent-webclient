import React, {
  useRef,
  useEffect,
  useMemo,
  useCallback,
  useState,
} from "react";
import { useAppState, useAppDispatch } from "@/app/state/AppContext";
import {
  TimelineRow,
  formatTimelineTime,
} from "@/features/timeline/components/TimelineRow";
import {
  buildTimelineDisplayItems,
  buildRunRenderEntries,
  type TimelineDisplayItem,
  type TimelineRenderEntry,
} from "@/features/timeline/lib/timelineDisplay";
import { serializeRunTranscript } from "@/features/timeline/lib/runTranscript";
import { copyText } from "@/shared/utils/copy";
import { UiButton } from "@/shared/ui/UiButton";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { SCROLLBAR_THIN_CLASS_NAME } from "@/shared/styles/scrollbarClassNames";
import { resolveCurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import { deriveChat, submitFeedback } from "@/shared/data";
import { AgentIcon } from "@/shared/icons/agent";
import { useI18n } from "@/shared/i18n";
import {
  Button,
  Collapse,
  Dropdown,
  Flex,
  Form,
  Input,
  message,
  Popover,
  Tooltip,
} from "antd";
import type { InputRef } from "antd";
import type { Agent, TimelineNode, WorkerRow } from "@/app/state/types";

type CurrentWorkerSummary = ReturnType<typeof resolveCurrentWorkerSummary>;

const QUERY_ANCHOR_MIN_SCROLL_WIDTH = 960;
const QUERY_ANCHOR_ACTIVE_OFFSET = 96;
const QUERY_ANCHOR_TIMELINE_WIDTH = 800;
const QUERY_ANCHOR_EDGE_INSET = 12;

const TIMELINE_EMPTY_CLASS_NAME =
  "timeline-empty tw:relative tw:text-center tw:text-xl tw:font-bold tw:leading-[1.35]";
const TIMELINE_EMPTY_AGENT_SWITCHER_CLASS_NAME =
  "timeline-empty-agent-switcher tw:relative tw:inline-flex tw:align-baseline";
const TIMELINE_AGENT_SWITCHER_TRIGGER_CLASS_NAME =
  "timeline-agent-switcher-trigger tw:m-0 tw:inline-flex tw:max-w-[min(300px,62vw)] tw:items-center tw:rounded-lg tw:border-0 tw:bg-transparent tw:px-[5px] tw:py-px tw:font-[inherit] tw:font-extrabold tw:leading-[1.25] tw:text-ink-1 tw:align-baseline tw:shadow-none tw:hover:bg-[color-mix(in_srgb,var(--accent-soft)_58%,transparent)] tw:hover:text-accent-electric-strong tw:focus-visible:bg-[color-mix(in_srgb,var(--accent-soft)_58%,transparent)] tw:focus-visible:text-accent-electric-strong tw:focus-visible:outline-none tw:active:transform-none";
const TIMELINE_AGENT_SWITCHER_TRIGGER_NAME_CLASS_NAME =
  "timeline-agent-switcher-trigger-name tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap";
const TIMELINE_AGENT_SWITCHER_ARROW_CLASS_NAME =
  "timeline-agent-switcher-arrow tw:ml-px tw:shrink-0 tw:translate-y-px tw:text-[19px] tw:text-[color-mix(in_srgb,var(--ink-muted)_72%,transparent)] tw:opacity-[0.58]";
const TIMELINE_AGENT_SWITCHER_MENU_CLASS_NAME =
  "timeline-agent-switcher-menu tw:absolute tw:bottom-[calc(100%+10px)] tw:left-1/2 tw:z-30 tw:w-[min(340px,calc(100vw-40px))] tw:max-w-[calc(100vw-40px)] tw:-translate-x-1/2 tw:rounded-lg tw:border tw:border-[color-mix(in_srgb,var(--line-soft)_92%,transparent)] tw:bg-[color-mix(in_srgb,var(--bg-elev-2)_94%,white)] tw:p-2.5 tw:shadow-floating";
const TIMELINE_AGENT_SWITCHER_SEARCH_CLASS_NAME =
  "timeline-agent-switcher-search tw:w-full";
const TIMELINE_AGENT_SWITCHER_EMPTY_CLASS_NAME =
  "timeline-agent-switcher-empty tw:px-2.5 tw:pb-2.5 tw:pt-[18px] tw:text-[13px] tw:font-semibold tw:text-ink-muted";
const TIMELINE_AGENT_SWITCHER_LIST_CLASS_NAME =
  "timeline-agent-switcher-list tw:mt-2 tw:grid tw:max-h-[248px] tw:gap-1 tw:overflow-y-auto tw:pr-0.5";
const TIMELINE_AGENT_SWITCHER_OPTION_CLASS_NAME =
  "timeline-agent-switcher-option tw:flex tw:min-h-8 tw:w-full tw:min-w-0 tw:items-center tw:gap-1.5 tw:rounded-lg tw:border tw:border-transparent tw:bg-transparent tw:p-1.5 tw:text-left tw:shadow-none tw:hover:border-[color-mix(in_srgb,var(--accent-electric)_28%,transparent)] tw:hover:bg-[color-mix(in_srgb,var(--accent-soft)_68%,transparent)] tw:focus-visible:border-[color-mix(in_srgb,var(--accent-electric)_28%,transparent)] tw:focus-visible:bg-[color-mix(in_srgb,var(--accent-soft)_68%,transparent)] tw:focus-visible:outline-none tw:active:transform-none";
const TIMELINE_AGENT_SWITCHER_OPTION_ACTIVE_CLASS_NAME =
  "is-active tw:border-[color-mix(in_srgb,var(--accent-electric)_28%,transparent)] tw:bg-[color-mix(in_srgb,var(--accent-soft)_68%,transparent)]";
const TIMELINE_AGENT_SWITCHER_AVATAR_CLASS_NAME =
  "timeline-agent-switcher-avatar tw:shrink-0";
const TIMELINE_AGENT_SWITCHER_OPTION_COPY_CLASS_NAME =
  "timeline-agent-switcher-option-copy tw:flex tw:min-w-0 tw:items-baseline tw:gap-1.5 tw:leading-[1.2]";
const TIMELINE_AGENT_SWITCHER_OPTION_NAME_CLASS_NAME =
  "tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-[13px] tw:font-bold tw:text-ink-1";
const TIMELINE_AGENT_SWITCHER_OPTION_ROLE_CLASS_NAME =
  "tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-xs tw:font-medium tw:text-ink-muted";
const CONVERSATION_STAGE_CLASS_NAME =
  "conversation-stage tw:min-h-0 tw:flex-1 tw:overflow-hidden tw:animate-fade-slide-in";
const MESSAGES_SCROLL_CLASS_NAME = [
  "messages-scroll tw:h-full tw:overflow-y-auto tw:bg-transparent tw:px-5 tw:pb-[26px] tw:pt-5 tw:scroll-smooth",
  SCROLLBAR_THIN_CLASS_NAME,
].join(" ");
const TIMELINE_STACK_CLASS_NAME =
  "timeline-stack tw:relative tw:m-auto tw:min-h-full tw:w-full tw:max-w-[800px]";
const TIMELINE_STACK_ANCHORS_CLASS_NAME = "has-query-anchors";
const TIMELINE_STACK_EMPTY_CLASS_NAME =
  "is-empty tw:flex tw:items-end tw:justify-center";
const TIMELINE_QUERY_ANCHOR_RAIL_CLASS_NAME =
  "timeline-query-anchor-rail tw:sticky tw:top-1/2 tw:z-[2] tw:ml-[calc(-1*var(--query-anchor-offset,56px))] tw:hidden tw:w-fit tw:-translate-y-1/2 tw:flex-col tw:justify-center tw:overflow-visible tw:[.has-query-anchors_&]:flex";
const TIMELINE_QUERY_ANCHOR_PREVIEW_CLASS_NAME =
  "timeline-query-anchor-preview tw:max-w-[360px] tw:text-xs";
const TIMELINE_QUERY_ANCHOR_PREVIEW_QUERY_CLASS_NAME =
  "timeline-query-anchor-preview-query tw:overflow-hidden tw:[display:-webkit-box] tw:[-webkit-box-orient:vertical] tw:[-webkit-line-clamp:2]";
const TIMELINE_QUERY_ANCHOR_PREVIEW_CONTENT_CLASS_NAME =
  "timeline-query-anchor-preview-content tw:overflow-hidden tw:text-ink-muted tw:[display:-webkit-box] tw:[-webkit-box-orient:vertical] tw:[-webkit-line-clamp:3]";
const TIMELINE_QUERY_ANCHOR_LINE_CLASS_NAME =
  "timeline-query-anchor-line tw:relative tw:inline-flex tw:min-h-3 tw:w-[40px] tw:translate-x-[-6px] tw:animate-[timeline-query-anchor-enter_0.28s_ease_forwards] tw:items-center tw:justify-start tw:rounded-none tw:border-0 tw:bg-transparent tw:p-0 tw:text-ink-muted tw:opacity-0 tw:shadow-none tw:hover:bg-transparent tw:hover:text-ink-2 tw:hover:shadow-none tw:hover:outline-none tw:hover:[&_.timeline-query-anchor-line-bar]:opacity-100 tw:active:transform-none";
const TIMELINE_QUERY_ANCHOR_LINE_ACTIVE_CLASS_NAME =
  "is-active tw:[.timeline-query-anchor-rail:not(:hover)_&_.timeline-query-anchor-line-bar]:opacity-100";
const TIMELINE_QUERY_ANCHOR_LINE_BAR_CLASS_NAME =
  "timeline-query-anchor-line-bar tw:block tw:h-0.5 tw:origin-left tw:bg-ink-1 tw:opacity-30 tw:transition-[width,opacity] tw:duration-100";
const TIMELINE_LANE_CLASS_NAME =
  "timeline-lane tw:relative tw:flex tw:flex-col tw:gap-2.5";
const TIMELINE_QUERY_ANCHOR_ROW_CLASS_NAME =
  "timeline-query-anchor-row tw:relative";
const TIMELINE_META_ROW_CLASS_NAME =
  "timeline-meta-row tw:flex tw:min-w-0 tw:flex-nowrap tw:items-center tw:gap-3";
const TIMELINE_RUN_META_CLASS_NAME =
  "timeline-run-meta tw:ml-6 tw:flex tw:min-w-0 tw:flex-nowrap tw:items-center tw:gap-3";
const TIMELINE_META_ACTIONS_CLASS_NAME =
  "timeline-meta-actions tw:inline-flex tw:shrink-0 tw:items-center tw:gap-0.5";
const TIMELINE_META_BUTTON_CLASS_NAME =
  "timeline-meta-btn tw:!min-h-[22px] tw:!min-w-[22px] tw:!w-[22px] tw:!rounded-pill tw:!px-1.5 tw:text-ink-muted tw:[&_.material-icon]:text-sm tw:[&_.ui-btn-label]:inline-flex tw:[&_.ui-btn-label]:items-center tw:[&_.ui-btn-label]:gap-1";
const TIMELINE_META_BUTTON_DOWNVOTED_CLASS_NAME =
  "is-downvoted tw:bg-[color-mix(in_srgb,var(--accent-danger)_12%,transparent)] tw:text-[color-mix(in_srgb,var(--accent-danger)_78%,var(--ink-1))]";
const TIMELINE_ROW_TIME_CLASS_NAME =
  "timeline-row-time tw:ml-auto tw:shrink-0 tw:pl-2 tw:text-[10px] tw:leading-none tw:text-ink-muted tw:tracking-[0.02em]";
const TIMELINE_RUN_GROUP_CLASS_NAME =
  "timeline-run-group tw:relative tw:flex tw:flex-col tw:gap-2 tw:before:absolute tw:before:bottom-0 tw:before:left-2 tw:before:top-0 tw:before:w-px tw:before:bg-line-soft tw:before:content-['']";
const TIMELINE_RUN_ITEMS_CLASS_NAME =
  "timeline-run-items tw:flex tw:flex-col tw:gap-2";
const TIMELINE_RUN_TIME_CLASS_NAME =
  "timeline-run-time tw:ml-auto tw:shrink-0 tw:pl-2 tw:text-[10px] tw:leading-none tw:text-ink-muted tw:tracking-[0.02em]";
const TIMELINE_TASK_GROUP_CLASS_NAME =
  "timeline-task-group tw:flex tw:flex-col tw:gap-2";
const TIMELINE_TASK_GROUP_HEADER_CLASS_NAME =
  "timeline-task-group-header tw:group tw:cursor-pointer tw:appearance-none tw:py-[5px]";
const TIMELINE_TASK_GROUP_HEADER_EXPANDED_CLASS_NAME = "is-expanded";
const TIMELINE_TASK_GROUP_AGENT_CLASS_NAME =
  "timeline-task-group-agent tw:inline-flex tw:max-w-[160px] tw:shrink-0 tw:items-center tw:gap-[5px] tw:min-w-0";
const TIMELINE_TASK_GROUP_AGENT_AVATAR_CLASS_NAME =
  "timeline-task-group-agent-avatar tw:shrink-0";
const TIMELINE_TASK_GROUP_AGENT_NAME_CLASS_NAME =
  "timeline-task-group-agent-name tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-xs tw:font-semibold";
const TIMELINE_TASK_GROUP_TITLE_CLASS_NAME =
  "timeline-task-group-title tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-xs tw:font-semibold";
const TIMELINE_TASK_GROUP_STATUS_BASE_CLASS_NAME =
  "timeline-task-group-status tw:h-[7px] tw:w-[7px] tw:shrink-0 tw:rounded-full tw:bg-[color-mix(in_srgb,var(--ink-muted)_84%,transparent)]";
const TIMELINE_TASK_GROUP_STATUS_CLASS_BY_STATUS: Record<string, string> = {
  running:
    "tw:animate-[timeline-task-status-flash_1s_infinite] tw:bg-accent-electric",
  completed: "tw:bg-accent-lime",
  success: "tw:bg-accent-lime",
  failed: "tw:bg-accent-danger",
  error: "tw:bg-accent-danger",
  canceled: "tw:bg-accent-warn",
};
const TIMELINE_TASK_GROUP_DURATION_CLASS_NAME =
  "timeline-task-group-duration tw:shrink-0 tw:text-[11px] tw:leading-none tw:text-ink-muted";
const TIMELINE_TASK_GROUP_ICON_CLASS_NAME =
  "tw:shrink-0 tw:text-lg tw:opacity-0 tw:group-hover:opacity-100";
const TIMELINE_TASK_GROUP_ICON_EXPANDED_CLASS_NAME = "tw:opacity-100";
const TIMELINE_TASK_GROUP_ERROR_CLASS_NAME =
  "timeline-task-group-error tw:ml-[34px] tw:break-words tw:text-xs tw:leading-[1.45] tw:text-[color-mix(in_srgb,var(--accent-danger)_82%,var(--ink-1))]";
const TIMELINE_TASK_GROUP_BODY_CLASS_NAME =
  "timeline-task-group-body tw:flex tw:flex-col tw:gap-2";

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

export function shouldEnableQueryAnchors(width: number): boolean {
  return Number.isFinite(width) && width >= QUERY_ANCHOR_MIN_SCROLL_WIDTH;
}

export function isDeriveChatActionDisabled(input: {
  chatId?: unknown;
  runId?: unknown;
  streaming?: boolean;
  activeAwaiting?: unknown;
}): boolean {
  return !String(input.chatId || "").trim()
    || !String(input.runId || "").trim()
    || input.streaming === true
    || Boolean(input.activeAwaiting);
}

export function dispatchDerivedChatNavigation(chatId: string): void {
  const normalizedChatId = String(chatId || "").trim();
  if (
    !normalizedChatId ||
    typeof window === "undefined" ||
    typeof window.dispatchEvent !== "function"
  ) {
    return;
  }

  window.dispatchEvent(new CustomEvent("agent:refresh-chats"));
  window.dispatchEvent(
    new CustomEvent("agent:load-chat", {
      detail: {
        chatId: normalizedChatId,
        focusComposerOnComplete: true,
      },
    }),
  );
}

function resolveQueryAnchorOffset(width: number): number {
  if (!Number.isFinite(width)) return 56;
  const sideGutter = Math.max(0, (width - QUERY_ANCHOR_TIMELINE_WIDTH) / 2);
  return Math.max(56, sideGutter - QUERY_ANCHOR_EDGE_INSET);
}

function buildQueryAnchorId(nodeId: string): string {
  return `query-${nodeId}`;
}

function readQueryAnchorId(element: Element): string {
  return String((element as HTMLElement).dataset.queryAnchorId || "").trim();
}

function findLastRunContentText(
  item: Extract<TimelineDisplayItem, { kind: "run" }>,
): string {
  const nodes = Array.isArray(item.nodes) ? item.nodes : [];
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index];
    if (node?.kind !== "content") continue;
    const text = String(node.text || "").trim();
    if (text) return text;
  }
  return "";
}

function findLastRunContentNode(
  item: Extract<TimelineDisplayItem, { kind: "run" }>,
): TimelineNode | null {
  const nodes = Array.isArray(item.nodes) ? item.nodes : [];
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index];
    if (node?.kind === "content") return node;
  }
  return null;
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
  currentWorker: CurrentWorkerSummary;
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

function formatResponseDuration(durationMs: number | undefined, t: (key: string, params?: Record<string, unknown>) => string): string {
  if (!Number.isFinite(durationMs) || Number(durationMs) < 0) {
    return "";
  }

  const value = Number(durationMs);
  if (value < 1000) {
    return t("timeline.toolPill.duration.milliseconds", { count: Math.round(value) });
  }
  if (value < 60_000) {
    return t("timeline.toolPill.duration.seconds", { count: Number((value / 1000).toFixed(value >= 10_000 ? 0 : 1)) });
  }

  const totalSeconds = Math.round(value / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return t("timeline.toolPill.duration.minutes", { minutes, seconds });
  }

  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  return t("timeline.responseDuration.hours", { hours, minutes: remainMinutes });
}

function formatTaskStatus(status: string, t: (key: string, params?: Record<string, unknown>) => string): string {
  switch (status) {
    case "running":
      return t("timeline.taskStatus.running");
    case "completed":
      return t("timeline.taskStatus.completed");
    case "failed":
      return t("timeline.taskStatus.failed");
    case "canceled":
      return t("timeline.taskStatus.canceled");
    default:
      return status || t("timeline.taskStatus.default");
  }
}

function resolveTaskGroupAgent(
  entry: Extract<TimelineRenderEntry, { kind: "task-group" }>,
  agents: Agent[],
  currentWorker: ReturnType<typeof resolveCurrentWorkerSummary>,
): Agent | null {
  const fallbackAgentKey =
    currentWorker?.type === "agent" ? currentWorker.sourceId : "";
  const agentKey = String(entry.subAgentKey || fallbackAgentKey || "").trim();
  if (!agentKey) return null;

  return (
    agents.find((agent) => String(agent?.key || "").trim() === agentKey) || {
      key: agentKey,
      name: agentKey,
    }
  );
}

export const TimelineAgentSwitcher: React.FC<{
  currentWorker: CurrentWorkerSummary;
  options: TimelineAgentOption[];
  initialOpen?: boolean;
  initialSearchText?: string;
}> = ({
  currentWorker,
  options,
  initialOpen = false,
  initialSearchText = "",
}) => {
  const { t } = useI18n();
  const [open, setOpen] = useState(initialOpen);
  const [searchText, setSearchText] = useState(initialSearchText);
  const searchInputRef = useRef<InputRef>(null);
  const rootRef = useRef<HTMLSpanElement>(null);
  const currentAgentKey =
    currentWorker?.type === "agent" ? currentWorker.sourceId : "";
  const activeOption =
    options.find((option) => option.key === currentAgentKey) || options[0];
  const displayName =
    currentWorker?.displayName || activeOption?.name || currentAgentKey;
  const filteredOptions = useMemo(
    () => filterTimelineAgentOptions(options, searchText),
    [options, searchText],
  );

  useEffect(() => {
    if (!open) return;
    searchInputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        rootRef.current &&
        target instanceof Node &&
        rootRef.current.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleSelectAgent = (option: TimelineAgentOption) => {
    setOpen(false);
    setSearchText("");
    dispatchTimelineAgentSwitch(option);
  };

  return (
    <span className={TIMELINE_EMPTY_AGENT_SWITCHER_CLASS_NAME} ref={rootRef}>
      <button
        className={TIMELINE_AGENT_SWITCHER_TRIGGER_CLASS_NAME}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("timeline.agentSwitcher.ariaLabel", {
          name: displayName,
        })}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={TIMELINE_AGENT_SWITCHER_TRIGGER_NAME_CLASS_NAME}>
          {displayName}
        </span>
        <MaterialIcon
          className={TIMELINE_AGENT_SWITCHER_ARROW_CLASS_NAME}
          name="keyboard_arrow_down"
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className={TIMELINE_AGENT_SWITCHER_MENU_CLASS_NAME}>
          <Input
            ref={searchInputRef}
            className={TIMELINE_AGENT_SWITCHER_SEARCH_CLASS_NAME}
            size="small"
            variant="filled"
            value={searchText}
            placeholder={t("timeline.agentSwitcher.searchPlaceholder")}
            onChange={(event) => setSearchText(event.target.value)}
          />
          {filteredOptions.length === 0 ? (
            <div className={TIMELINE_AGENT_SWITCHER_EMPTY_CLASS_NAME}>
              {t("timeline.agentSwitcher.empty")}
            </div>
          ) : (
            <div
              className={TIMELINE_AGENT_SWITCHER_LIST_CLASS_NAME}
              role="listbox"
              aria-label={t("timeline.agentSwitcher.listAriaLabel")}
            >
              {filteredOptions.map((option) => {
                const selected = option.key === currentAgentKey;
                return (
                  <button
                    key={option.key}
                    className={[
                      TIMELINE_AGENT_SWITCHER_OPTION_CLASS_NAME,
                      selected
                        ? TIMELINE_AGENT_SWITCHER_OPTION_ACTIVE_CLASS_NAME
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => handleSelectAgent(option)}
                  >
                    <AgentIcon
                      icon={option.icon}
                    type="agent"
                    props={{
                      icon: {
                        className: TIMELINE_AGENT_SWITCHER_AVATAR_CLASS_NAME,
                        width: 20,
                        height: 20,
                      },
                      avatar: {
                        className: TIMELINE_AGENT_SWITCHER_AVATAR_CLASS_NAME,
                        size: 20,
                      },
                    }}
                  />
                    <span className={TIMELINE_AGENT_SWITCHER_OPTION_COPY_CLASS_NAME}>
                      <strong className={TIMELINE_AGENT_SWITCHER_OPTION_NAME_CLASS_NAME}>
                        {option.name}
                      </strong>
                      {!option.hideRole && (
                        <span className={TIMELINE_AGENT_SWITCHER_OPTION_ROLE_CLASS_NAME}>
                          {option.role || "--"}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </span>
  );
};

interface ConversationStageProps {
  showEmptyState?: boolean;
}

export const ConversationStage: React.FC<ConversationStageProps> = ({
  showEmptyState = true,
}) => {
  const { t } = useI18n();
  const state = useAppState();
  const dispatch = useAppDispatch();
  const scrollRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const autoScrollEnabledRef = useRef(true);
  const statusTimerRef = useRef<Map<string, number>>(new Map());
  const [actionStatus, setActionStatus] = useState<Record<string, string>>({});
  const [queryAnchorsEnabled, setQueryAnchorsEnabled] = useState(false);
  const [activeQueryAnchorId, setActiveQueryAnchorId] = useState("");
  const [derivingRunId, setDerivingRunId] = useState("");
  const [expandedTaskGroups, setExpandedTaskGroups] = useState<
    Record<string, boolean>
  >({});
  const currentWorker = resolveCurrentWorkerSummary(state);
  const timelineAgentOptions = useMemo(
    () =>
      buildTimelineAgentOptions({
        agents: state.agents,
        workerRows: state.workerRows,
        currentWorker,
      }),
    [currentWorker, state.agents, state.workerRows],
  );
  const canSwitchEmptyAgent =
    currentWorker?.type === "agent" &&
    timelineAgentOptions.some(
      (option) => option.key !== currentWorker.sourceId,
    );

  const isNearBottom = (el: HTMLDivElement, threshold = 24): boolean => {
    return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
  };

  const scrollToBottom = (behavior: ScrollBehavior = "auto") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  };

  const updateActiveQueryAnchor = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !queryAnchorsEnabled) {
      setActiveQueryAnchorId("");
      return;
    }

    const queryRows = Array.from(
      el.querySelectorAll<HTMLElement>(".timeline-query-anchor-row"),
    );
    if (queryRows.length === 0) {
      setActiveQueryAnchorId("");
      return;
    }

    const threshold =
      el.getBoundingClientRect().top + QUERY_ANCHOR_ACTIVE_OFFSET;
    let nextActiveId = readQueryAnchorId(queryRows[0]);
    for (const row of queryRows) {
      const anchorId = readQueryAnchorId(row);
      if (!anchorId) continue;
      if (row.getBoundingClientRect().top <= threshold) {
        nextActiveId = anchorId;
        continue;
      }
      break;
    }

    setActiveQueryAnchorId((current) =>
      current === nextActiveId ? current : nextActiveId,
    );
  }, [queryAnchorsEnabled]);

  const handleQueryAnchorClick = useCallback((anchorId: string) => {
    const normalizedAnchorId = String(anchorId || "").trim();
    const el = scrollRef.current;
    if (!normalizedAnchorId || !el || typeof document === "undefined") return;

    const target = document.getElementById(normalizedAnchorId);
    if (!target) return;

    const scrollTop =
      target.getBoundingClientRect().top -
      el.getBoundingClientRect().top +
      el.scrollTop -
      12;
    el.scrollTo({
      top: Math.max(0, scrollTop),
      behavior: "smooth",
    });
    setActiveQueryAnchorId(normalizedAnchorId);
  }, []);

  const timelineEntries = useMemo(() => {
    return state.timelineOrder
      .map((id) => state.timelineNodes.get(id))
      .filter((node): node is NonNullable<typeof node> => Boolean(node));
  }, [state.timelineOrder, state.timelineNodes]);
  const displayItems = useMemo(() => {
    return buildTimelineDisplayItems(
      timelineEntries,
      state.events,
      state.taskItemsById,
    );
  }, [timelineEntries, state.events, state.taskItemsById]);
  const queryAnchorItems = useMemo(() => {
    const anchors: Array<{
      key: string;
      anchorId: string;
      queryText: string;
      lastRunContent: string;
    }> = [];
    for (let index = 0; index < displayItems.length; index += 1) {
      const item = displayItems[index];
      if (item.kind !== "query") continue;

      const nextItem = displayItems[index + 1];
      anchors.push({
        key: item.key,
        anchorId: buildQueryAnchorId(item.node.id),
        queryText: String(item.node.text || "").trim() || t("timeline.query.noText"),
        lastRunContent:
          nextItem?.kind === "run" ? findLastRunContentText(nextItem) : "",
      });
    }
    return anchors;
  }, [displayItems, t]);

  const flashActionStatus = useCallback((key: string, text: string) => {
    const existing = statusTimerRef.current.get(key);
    if (existing) {
      window.clearTimeout(existing);
    }
    setActionStatus((current) => ({ ...current, [key]: text }));
    const timer = window.setTimeout(() => {
      setActionStatus((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      statusTimerRef.current.delete(key);
    }, 1600);
    statusTimerRef.current.set(key, timer);
  }, []);

  const handleCopy = useCallback(
    async (key: string, text: string) => {
      try {
        await copyText(text);
        flashActionStatus(key, t("timeline.toolPill.copy.copied"));
      } catch {
        flashActionStatus(key, t("timeline.toolPill.copy.failed"));
      }
    },
    [flashActionStatus, t],
  );

  const handleDownvote = useCallback(
    async (runId: string, nextDownvoted: boolean) => {
      const chatId = String(state.chatId || "").trim();
      const normalizedRunId = String(runId || "").trim();
      if (!chatId || !normalizedRunId) {
        dispatch({
          type: "APPEND_DEBUG",
          line: "[feedback error] missing chatId or runId",
        });
        return;
      }
      dispatch({
        type: "SET_RUN_DOWNVOTED",
        runKey: normalizedRunId,
        downvoted: nextDownvoted,
      });
      try {
        await submitFeedback({
          chatId,
          runId: normalizedRunId,
          type: nextDownvoted ? "thumbs_down" : "clear",
        });
        message.success(nextDownvoted ? t("timeline.feedback.downvoted") : t("timeline.feedback.cleared"));
      } catch (error) {
        dispatch({
          type: "SET_RUN_DOWNVOTED",
          runKey: normalizedRunId,
          downvoted: !nextDownvoted,
        });
        dispatch({
          type: "APPEND_DEBUG",
          line: `[feedback error] ${(error as Error).message}`,
        });
      }
    },
    [dispatch, state.chatId, t],
  );

  const handleResend = useCallback(
    (text: string) => {
      if (state.streaming || !text.trim()) return;
      window.dispatchEvent(
        new CustomEvent("agent:send-message", { detail: { message: text } }),
      );
    },
    [state.streaming],
  );

  const handleResendInNewChat = useCallback(
    (text: string) => {
      const messageText = text.trim();
      if (state.streaming || !messageText) return;

      const workerDetail: Record<string, string | boolean> = {
        preserveWorkerContext: true,
        focusComposerOnComplete: false,
      };
      const sendDetail: Record<string, string> = { message: messageText };
      if (currentWorker?.type === "agent" && currentWorker.sourceId) {
        workerDetail.agentKey = currentWorker.sourceId;
        sendDetail.agentKey = currentWorker.sourceId;
      } else if (currentWorker?.type === "team" && currentWorker.sourceId) {
        sendDetail.teamId = currentWorker.sourceId;
      }

      window.dispatchEvent(
        new CustomEvent("agent:start-new-conversation", {
          detail: workerDetail,
        }),
      );
      window.dispatchEvent(
        new CustomEvent("agent:send-message", { detail: sendDetail }),
      );
    },
    [currentWorker, state.streaming],
  );

  const handleDeriveChat = useCallback(
    async (runId: string) => {
      const sourceChatId = String(state.chatId || "").trim();
      const sourceRunId = String(runId || "").trim();
      if (
        isDeriveChatActionDisabled({
          chatId: sourceChatId,
          runId: sourceRunId,
          streaming: state.streaming,
          activeAwaiting: state.activeAwaiting,
        })
      ) {
        return;
      }

      setDerivingRunId(sourceRunId);
      try {
        const response = await deriveChat({ sourceChatId, sourceRunId });
        const derivedChatId = String(response.data?.chatId || "").trim();
        if (!derivedChatId) {
          throw new Error("derive response missing chatId");
        }
        dispatchDerivedChatNavigation(derivedChatId);
        message.success(t("timeline.run.deriveChatSuccess"));
      } catch (error) {
        const errorMessage = (error as Error)?.message || String(error);
        message.error(t("timeline.run.deriveChatFailed"));
        dispatch({
          type: "APPEND_DEBUG",
          line: `[deriveChat error] ${errorMessage}`,
        });
      } finally {
        setDerivingRunId((current) => (
          current === sourceRunId ? "" : current
        ));
      }
    },
    [
      dispatch,
      state.activeAwaiting,
      state.chatId,
      state.streaming,
      t,
    ],
  );

  const toggleTaskGroup = useCallback((key: string) => {
    setExpandedTaskGroups((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }, []);

  const renderEntry = useCallback(
    (entry: TimelineRenderEntry) => {
      if (entry.kind === "node") {
        if (entry.node.kind === "agent-group") return null;
        return <TimelineRow key={entry.key} node={entry.node} />;
      }
      if (entry.kind === "task-group") {
        const expanded = Boolean(expandedTaskGroups[entry.key]);
        const taskDuration = formatResponseDuration(entry.durationMs, t);
        const statusText = formatTaskStatus(entry.status, t);
        const taskAgent = resolveTaskGroupAgent(
          entry,
          state.agents,
          currentWorker,
        );
        return (
          <section key={entry.key} className={TIMELINE_TASK_GROUP_CLASS_NAME}>
            <Flex
              className={[
                TIMELINE_TASK_GROUP_HEADER_CLASS_NAME,
                expanded ? TIMELINE_TASK_GROUP_HEADER_EXPANDED_CLASS_NAME : "",
              ]
                .filter(Boolean)
                .join(" ")}
              align="center"
              gap={8}
              aria-expanded={expanded}
              onClick={() => toggleTaskGroup(entry.key)}
            >
              {taskAgent && (
                <span className={TIMELINE_TASK_GROUP_AGENT_CLASS_NAME}>
                  <AgentIcon
                    icon={taskAgent.icon}
                    type="agent"
                    props={{
                      icon: {
                        className: TIMELINE_TASK_GROUP_AGENT_AVATAR_CLASS_NAME,
                        width: 20,
                        height: 20,
                      },
                      avatar: {
                        className: TIMELINE_TASK_GROUP_AGENT_AVATAR_CLASS_NAME,
                        size: 20,
                      },
                    }}
                  />
                  <span className={TIMELINE_TASK_GROUP_AGENT_NAME_CLASS_NAME}>
                    {taskAgent.name || taskAgent.key}
                  </span>
                </span>
              )}
              <span className={TIMELINE_TASK_GROUP_TITLE_CLASS_NAME}>
                {entry.taskName || entry.taskId}
              </span>
              <span
                className={[
                  TIMELINE_TASK_GROUP_STATUS_BASE_CLASS_NAME,
                  TIMELINE_TASK_GROUP_STATUS_CLASS_BY_STATUS[
                    entry.status || "unknown"
                  ] || "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-label={statusText}
                title={statusText}
              />
              {taskDuration && (
                <span className={TIMELINE_TASK_GROUP_DURATION_CLASS_NAME}>
                  {taskDuration}
                </span>
              )}
              <MaterialIcon
                className={[
                  TIMELINE_TASK_GROUP_ICON_CLASS_NAME,
                  expanded ? TIMELINE_TASK_GROUP_ICON_EXPANDED_CLASS_NAME : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                name={expanded ? "expand_more" : "chevron_right"}
              />
            </Flex>
            {entry.error && (
              <div className={TIMELINE_TASK_GROUP_ERROR_CLASS_NAME}>
                {entry.error}
              </div>
            )}
            {expanded && (
              <div className={TIMELINE_TASK_GROUP_BODY_CLASS_NAME}>
                {entry.renderEntries.map((childEntry) =>
                  renderEntry(childEntry),
                )}
              </div>
            )}
          </section>
        );
      }
      return <TimelineRow key={entry.key} toolGroup={entry} />;
    },
    [
      currentWorker,
      expandedTaskGroups,
      state.agents,
      state.streaming,
      t,
      toggleTaskGroup,
    ],
  );

  useEffect(() => {
    return () => {
      statusTimerRef.current.forEach((timer) => window.clearTimeout(timer));
      statusTimerRef.current.clear();
    };
  }, []);

  /* Default behavior: enter with auto-scroll enabled and stay pinned to bottom. */
  useEffect(() => {
    scrollToBottom("auto");
  }, []);

  /* Auto-scroll while pinned to bottom (including initial load). */
  useEffect(() => {
    if (!autoScrollEnabledRef.current) return;
    scrollToBottom("auto");
  }, [state.streaming, timelineEntries.length, state.chatId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      autoScrollEnabledRef.current = isNearBottom(el);
      updateActiveQueryAnchor();
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [updateActiveQueryAnchor]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const updateWidthState = (width = el.clientWidth) => {
      setQueryAnchorsEnabled(shouldEnableQueryAnchors(width));
      el.style.setProperty(
        "--query-anchor-offset",
        `${resolveQueryAnchorOffset(width)}px`,
      );
    };

    updateWidthState();
    if (typeof ResizeObserver === "undefined") {
      if (typeof window === "undefined") return;
      const handleResize = () => updateWidthState();
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }

    const observer = new ResizeObserver(() => {
      updateWidthState(el.clientWidth);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    updateActiveQueryAnchor();
  }, [
    displayItems,
    queryAnchorsEnabled,
    state.chatId,
    updateActiveQueryAnchor,
  ]);

  return (
    <div className={CONVERSATION_STAGE_CLASS_NAME}>
      <div className={MESSAGES_SCROLL_CLASS_NAME} ref={scrollRef} id="messages">
        <div
          className={[
            TIMELINE_STACK_CLASS_NAME,
            queryAnchorsEnabled ? TIMELINE_STACK_ANCHORS_CLASS_NAME : "",
            displayItems.length === 0 && showEmptyState
              ? TIMELINE_STACK_EMPTY_CLASS_NAME
              : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {displayItems.length === 0 ? (
            showEmptyState ? (
              <div className={TIMELINE_EMPTY_CLASS_NAME}>
                {currentWorker?.displayName ? (
                  canSwitchEmptyAgent ? (
                    <>
                      {t("timeline.empty.withAgentPrefix")}
                      <TimelineAgentSwitcher
                        currentWorker={currentWorker}
                        options={timelineAgentOptions}
                      />
                      {t("timeline.empty.withAgentSuffix")}
                    </>
                  ) : (
                    t("timeline.empty.withWorker", {
                      name: currentWorker.displayName,
                    })
                  )
                ) : (
                  t("timeline.empty.default")
                )}
              </div>
            ) : null
          ) : (
            <>
              {queryAnchorItems.length > 0 && (
                <nav
                  ref={anchorRef}
                  className={TIMELINE_QUERY_ANCHOR_RAIL_CLASS_NAME}
                  style={
                    {
                      "--hover-index": (
                        queryAnchorItems.length + 999
                      ).toString(),
                    } as React.CSSProperties
                  }
                  onMouseLeave={() => {
                    if (!anchorRef.current) return;
                    anchorRef.current.style.setProperty(
                      "--hover-index",
                      (queryAnchorItems.length + 999).toString(),
                    );
                  }}
                >
                  {queryAnchorItems.map((anchor, index) => {
                    const active = activeQueryAnchorId === anchor.anchorId;
                    return (
                      <Tooltip
                        key={anchor.key}
                        rootClassName={TIMELINE_QUERY_ANCHOR_PREVIEW_CLASS_NAME}
                        trigger="hover"
                        placement="right"
                        title={
                          <div>
                            <div className={TIMELINE_QUERY_ANCHOR_PREVIEW_QUERY_CLASS_NAME}>
                              {anchor.queryText}
                            </div>
                            <div className={TIMELINE_QUERY_ANCHOR_PREVIEW_CONTENT_CLASS_NAME}>
                              {anchor.lastRunContent}
                            </div>
                          </div>
                        }
                      >
                        <button
                          className={[
                            TIMELINE_QUERY_ANCHOR_LINE_CLASS_NAME,
                            active
                              ? TIMELINE_QUERY_ANCHOR_LINE_ACTIVE_CLASS_NAME
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          type="button"
                          aria-current={active ? "location" : undefined}
                          aria-label={`定位到第 ${index + 1} 个提问`}
                          onMouseEnter={() => {
                            if (!anchorRef.current) return;
                            anchorRef.current.style.setProperty(
                              "--hover-index",
                              index.toString(),
                            );
                          }}
                          onClick={() =>
                            handleQueryAnchorClick(anchor.anchorId)
                          }
                        >
                          <span
                            className={TIMELINE_QUERY_ANCHOR_LINE_BAR_CLASS_NAME}
                            aria-hidden="true"
                            style={
                              {
                                "--index": index,
                              } as React.CSSProperties
                            }
                          />
                        </button>
                      </Tooltip>
                    );
                  })}
                </nav>
              )}
              <div className={TIMELINE_LANE_CLASS_NAME}>
                {displayItems.map((item) => {
                  if (item.kind === "query") {
                    const queryTime = formatTimelineTime(item.node.ts);
                    const queryCopyKey = `${item.key}:copy`;
                    const queryCopyStatus =
                      actionStatus[queryCopyKey] || t("timeline.toolPill.copy.action");
                    const queryAnchorId = buildQueryAnchorId(item.node.id);
                    return (
                      <div
                        key={item.key}
                        id={queryAnchorId}
                        className={TIMELINE_QUERY_ANCHOR_ROW_CLASS_NAME}
                        data-query-anchor-id={queryAnchorId}
                      >
                        <TimelineRow
                          node={item.node}
                          metaNode={
                            <div className={TIMELINE_META_ROW_CLASS_NAME}>
                              <div className={TIMELINE_META_ACTIONS_CLASS_NAME}>
                                <UiButton
                                  className={TIMELINE_META_BUTTON_CLASS_NAME}
                                  variant="ghost"
                                  size="sm"
                                  iconOnly
                                  title={queryCopyStatus}
                                  aria-label={queryCopyStatus}
                                  onClick={() =>
                                    handleCopy(
                                      queryCopyKey,
                                      item.node.text || "",
                                    )
                                  }
                                >
                                  <MaterialIcon name="content_copy" />
                                </UiButton>
                                <Dropdown
                                  placement="bottomRight"
                                  menu={{
                                    onClick: (info) => {
                                      if (info.key === "resend") {
                                        handleResend(item.node.text || "");
                                      } else if (
                                        info.key === "resendInNewChat"
                                      ) {
                                        handleResendInNewChat(
                                          item.node.text || "",
                                        );
                                      }
                                    },
                                    items: [
                                      {
                                        key: "resend",
                                        icon: <MaterialIcon name="refresh" />,
                                        label: t("timeline.query.resend"),
                                      },
                                      {
                                        key: "resendInNewChat",
                                        icon: (
                                          <MaterialIcon name="open_in_new" />
                                        ),
                                        label: t("timeline.query.resendInNewChat"),
                                      },
                                    ],
                                  }}
                                >
                                  <UiButton
                                    className={TIMELINE_META_BUTTON_CLASS_NAME}
                                    variant="ghost"
                                    size="sm"
                                    iconOnly
                                    disabled={state.streaming}
                                    title={t("timeline.query.resend")}
                                    aria-label={t("timeline.query.resend")}
                                  >
                                    <MaterialIcon name="refresh" />
                                  </UiButton>
                                </Dropdown>
                              </div>
                              {queryTime.short && (
                                <div
                                  className={TIMELINE_ROW_TIME_CLASS_NAME}
                                  title={queryTime.full}
                                >
                                  {queryTime.short}
                                </div>
                              )}
                            </div>
                          }
                        />
                      </div>
                    );
                  }

                  if (item.kind === "run") {
                    const isCompleted = Boolean(item.completedAt);
                    const time = formatTimelineTime(item.completedAt);
                    const responseDuration = formatResponseDuration(
                      item.responseDurationMs, t,
                    );
                    const runCopyKey = `${item.key}:copy`;
                    const runId = String(item.runId || "").trim();
                    const isDownvoted = Boolean(
                      runId && state.downvotedRunKeys.has(runId),
                    );
                    const runCopyStatus = actionStatus[runCopyKey] || t("timeline.toolPill.copy.action");
                    const deriveChatDisabled = isDeriveChatActionDisabled({
                      chatId: state.chatId,
                      runId,
                      streaming: state.streaming,
                      activeAwaiting: state.activeAwaiting,
                    });
                    const deriveChatTitle = t("timeline.run.deriveChat");

                    const lastContentNode = findLastRunContentNode(item);
                    const shouldCollapse =
                      isCompleted &&
                      lastContentNode != null &&
                      item.nodes.length > 1;

                    return (
                      <Flex key={item.key} vertical gap={8}>
                        {shouldCollapse && (
                          <Collapse
                            ghost
                            destroyOnHidden
                            className="timeline-run-collapse"
                            items={[
                              {
                                key: "run-entries",
                                label: t("timeline.run.processed", { duration: responseDuration }),
                                children: (
                                  <div className={TIMELINE_RUN_ITEMS_CLASS_NAME}>
                                    {buildRunRenderEntries(
                                      item.nodes.filter(
                                        (n) => n.id !== lastContentNode!.id,
                                      ),
                                    ).map((entry) => renderEntry(entry))}
                                  </div>
                                ),
                              },
                            ]}
                          />
                        )}
                        <section
                          key={item.key}
                          className={TIMELINE_RUN_GROUP_CLASS_NAME}
                        >
                          {shouldCollapse ? (
                            buildRunRenderEntries([lastContentNode!]).map(
                              (entry) => renderEntry(entry),
                            )
                          ) : (
                            <div className={TIMELINE_RUN_ITEMS_CLASS_NAME}>
                              {item.renderEntries.map((entry) =>
                                renderEntry(entry),
                              )}
                            </div>
                          )}
                          {isCompleted && (
                            <div className={TIMELINE_RUN_META_CLASS_NAME}>
                              <div className={TIMELINE_META_ACTIONS_CLASS_NAME}>
                                <UiButton
                                  className={TIMELINE_META_BUTTON_CLASS_NAME}
                                  variant="ghost"
                                  size="sm"
                                  iconOnly
                                  title={runCopyStatus}
                                  aria-label={runCopyStatus}
                                  onClick={() =>
                                    handleCopy(
                                      runCopyKey,
                                      serializeRunTranscript(
                                        item.queryNode,
                                        item.nodes,
                                      ),
                                    )
                                  }
                                >
                                  <MaterialIcon name="content_copy" />
                                </UiButton>
                                {isDownvoted ? (
                                  <UiButton
                                    className={[
                                      TIMELINE_META_BUTTON_CLASS_NAME,
                                      TIMELINE_META_BUTTON_DOWNVOTED_CLASS_NAME,
                                    ].join(" ")}
                                    variant="ghost"
                                    size="sm"
                                    iconOnly
                                    active
                                    title={t("timeline.feedback.clearDownvote")}
                                    aria-label={t("timeline.feedback.clearDownvote")}
                                    disabled={!runId}
                                    onClick={() => handleDownvote(runId, false)}
                                  >
                                    <MaterialIcon name="thumb_down" />
                                  </UiButton>
                                ) : (
                                  <Popover
                                    destroyOnHidden
                                    trigger={["click"]}
                                    content={
                                      <FeedbackModal
                                        onFinish={() => {
                                          handleDownvote(runId, true);
                                        }}
                                      />
                                    }
                                  >
                                    <UiButton
                                      className={TIMELINE_META_BUTTON_CLASS_NAME}
                                      variant="ghost"
                                      size="sm"
                                      iconOnly
                                      title={t("timeline.feedback.downvote")}
                                      aria-label={t("timeline.feedback.downvote")}
                                      disabled={!runId}
                                    >
                                      <MaterialIcon name="thumb_down" />
                                    </UiButton>
                                  </Popover>
                                )}
                                <UiButton
                                  className={TIMELINE_META_BUTTON_CLASS_NAME}
                                  variant="ghost"
                                  size="sm"
                                  iconOnly
                                  loading={derivingRunId === runId}
                                  title={deriveChatTitle}
                                  aria-label={deriveChatTitle}
                                  disabled={deriveChatDisabled}
                                  onClick={() => handleDeriveChat(runId)}
                                >
                                  <MaterialIcon name="git_fork" />
                                </UiButton>
                              </div>
                              {time.short && (
                                <div
                                  className={TIMELINE_RUN_TIME_CLASS_NAME}
                                  title={
                                    responseDuration
                                      ? `${time.full} · ${t("timeline.run.responseDuration", { duration: responseDuration })}`
                                      : time.full
                                  }
                                >
                                  {time.short}
                                  {responseDuration
                                    ? ` · ${responseDuration}`
                                    : ""}
                                </div>
                              )}
                            </div>
                          )}
                        </section>
                      </Flex>
                    );
                  }

                  return renderEntry(item.renderEntry);
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const FeedbackModal: React.FC<{
  onFinish: (values: any) => void;
}> = (props) => {
  const { onFinish } = props;
  const { t } = useI18n();

  return (
    <Form onFinish={onFinish} size="small" style={{ width: 320 }}>
      <strong>{t("timeline.feedback.title")}</strong>
      <Form.Item name="reason" style={{ margin: "10px 0" }}>
        <Input.TextArea
          placeholder={t("timeline.feedback.placeholder")}
          rows={4}
        />
      </Form.Item>
      <Flex gap={10} justify="flex-end">
        <Button type="primary" htmlType="submit">
          {t("timeline.feedback.submit")}
        </Button>
      </Flex>
    </Form>
  );
};
