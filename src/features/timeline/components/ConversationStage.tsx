import React, {
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useCallback,
  useState,
} from "react";

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;
import {
  useOptionalAppContext,
  useAppState,
  useAppDispatch,
} from "@/app/state/AppContext";
import {
  TimelineRow,
  formatTimelineTime,
} from "@/features/timeline/components/TimelineRow";
import { TimelineRenderEntryView } from "@/features/timeline/components/TimelineRenderEntryView";
import {
  buildTimelineDisplayItems,
  buildRunRenderEntries,
  type TimelineDisplayItem,
  type TimelineRenderEntry,
} from "@/features/timeline/lib/timelineDisplay";
import { serializeRunTranscript } from "@/features/timeline/lib/runTranscript";
import { RunTerminalNotice } from "@/features/timeline/components/RunTerminalNotice";
import { copyText } from "@/shared/utils/copy";
import { formatResponseDuration } from "@/shared/utils/formatResponseDuration";
import { readEpochMillis } from "@/shared/utils/platformTime";
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
import {
  type Agent,
  type ConversationSurfaceMode,
  type TimelineNode,
  type WorkerRow,
} from "@/app/state/types";
import { LogoLoading } from "@/shared/components/logo-loading";
import {
  isMainChatRuntimeObservedByLiveQuery,
  resolveMainChatRuntime,
} from "@/features/runs/lib/runRuntimeState";
import { DotLoading } from "@/shared/components/dot-loading";
import { Virtuoso } from "react-virtuoso";
import type {
  ItemProps,
  VirtuosoHandle,
  ListRange,
  StateSnapshot,
} from "react-virtuoso";
import {
  createConversationDataSignature,
  createConversationLayoutSignature,
  getConversationScrollBookmark,
  resolveConversationRestoreIndex,
  setConversationScrollBookmark,
  type ConversationScrollBookmark,
} from "@/features/timeline/lib/conversationScrollBookmark";

type CurrentWorkerSummary = ReturnType<typeof resolveCurrentWorkerSummary>;

type VirtualListItem =
  | {
      kind: "query";
      key: string;
      anchorId: string;
      item: Extract<TimelineDisplayItem, { kind: "query" }>;
    }
  | {
      kind: "run";
      key: string;
      item: Extract<TimelineDisplayItem, { kind: "run" }>;
    }
  | {
      kind: "standalone";
      key: string;
      item: Extract<TimelineDisplayItem, { kind: "standalone" }>;
    };

const ConversationVirtualItem: React.FC<ItemProps<VirtualListItem>> = ({
  children,
  item,
  ...props
}) => (
  <div {...props} data-conversation-item-key={item.key}>
    {children}
  </div>
);

const QUERY_ANCHOR_MIN_SCROLL_WIDTH = 960;

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
  "timeline-agent-switcher-menu tw:w-[min(340px,calc(100vw-40px))] tw:max-w-[calc(100vw-40px)]";
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
  "conversation-stage tw:relative tw:min-h-0 tw:flex-1 tw:overflow-hidden tw:animate-fade-slide-in";
const CONVERSATION_STAGE_SCROLL_TO_BOTTOM_CLASS_NAME =
  "conversation-stage-scroll-to-bottom tw:rounded-full tw:pointer-events-auto";
const VIRTUOSO_CLASS_NAME = [
  "conversation-stage-virtuoso tw:h-full tw:bg-transparent",
  SCROLLBAR_THIN_CLASS_NAME,
].join(" ");
const CONVERSATION_TRANSITION_OVERLAY_CLASS_NAME =
  "conversation-transition-overlay tw:absolute tw:inset-0 tw:z-20 tw:grid tw:place-items-center tw:overflow-hidden tw:bg-bg-base tw:px-6";
const CONVERSATION_TRANSITION_OVERLAY_HOLD_MS = 160;
const CONVERSATION_TRANSITION_OVERLAY_FADE_MS = 80;
const CONVERSATION_SCROLL_RESTORE_TIMEOUT_MS = 2_000;
const CONVERSATION_TRANSITION_OVERLAY_REDUCED_MOTION_HOLD_MS =
  CONVERSATION_TRANSITION_OVERLAY_HOLD_MS;
const CONVERSATION_TRANSITION_REDUCED_MOTION_QUERY =
  "(prefers-reduced-motion: reduce)";
const CONVERSATION_TRANSITION_SKELETON_CLASS_NAME =
  "conversation-transition-skeleton";
const CONVERSATION_TRANSITION_SKELETON_BLOCK_CLASS_NAME =
  "conversation-transition-skeleton-block";
const CONVERSATION_TRANSITION_SKELETON_QUERY_BLOCK_CLASS_NAME =
  "conversation-transition-skeleton-block is-query";
const CONVERSATION_TRANSITION_SKELETON_RUN_BLOCK_CLASS_NAME =
  "conversation-transition-skeleton-block is-run";
const CONVERSATION_TRANSITION_SKELETON_CAPTION_CLASS_NAME =
  "conversation-transition-skeleton-caption";
const CONVERSATION_TRANSITION_SKELETON_LINE_CLASS_NAME =
  "conversation-transition-skeleton-line";
const CONVERSATION_TRANSITION_SKELETON_SMALL_LINE_CLASS_NAME =
  "conversation-transition-skeleton-line is-small";
const CONVERSATION_TRANSITION_SKELETON_QUERY_PILL_CLASS_NAME =
  "conversation-transition-skeleton-query-pill";
const CONVERSATION_TRANSITION_SKELETON_DOT_CLASS_NAME =
  "conversation-transition-skeleton-dot";
const CONVERSATION_TRANSITION_SKELETON_CARD_CLASS_NAME =
  "conversation-transition-skeleton-card";
const CONVERSATION_TRANSITION_ERROR_CLASS_NAME =
  "conversation-transition-error tw:flex tw:max-w-[420px] tw:flex-col tw:items-center tw:gap-3 tw:text-center";
const TIMELINE_STACK_CLASS_NAME =
  "timeline-stack tw:relative tw:m-auto tw:min-h-full tw:w-full tw:max-w-[800px]";
const TIMELINE_STACK_EMPTY_CLASS_NAME =
  "is-empty tw:flex tw:items-end tw:justify-center";
const TIMELINE_EMPTY_SCROLL_CLASS_NAME = [
  "messages-scroll tw:h-full tw:flex tw:flex-col tw:overflow-y-auto tw:bg-transparent tw:px-5 tw:pb-[26px] tw:pt-5",
  SCROLLBAR_THIN_CLASS_NAME,
].join(" ");
const TIMELINE_QUERY_ANCHOR_RAIL_CLASS_NAME = "timeline-query-anchor-rail";
const TIMELINE_QUERY_ANCHOR_PREVIEW_CLASS_NAME =
  "timeline-query-anchor-preview tw:max-w-[360px] tw:text-xs";
const TIMELINE_QUERY_ANCHOR_PREVIEW_QUERY_CLASS_NAME =
  "timeline-query-anchor-preview-query tw:overflow-hidden tw:[display:-webkit-box] tw:[-webkit-box-orient:vertical] tw:[-webkit-line-clamp:2]";
const TIMELINE_QUERY_ANCHOR_PREVIEW_CONTENT_CLASS_NAME =
  "timeline-query-anchor-preview-content tw:overflow-hidden tw:text-ink-muted tw:[display:-webkit-box] tw:[-webkit-box-orient:vertical] tw:[-webkit-line-clamp:3]";
const TIMELINE_QUERY_ANCHOR_LINE_CLASS_NAME =
  "timeline-query-anchor-line tw:relative tw:inline-flex tw:min-h-[10px] tw:w-[26px] tw:animate-[timeline-query-anchor-enter_0.28s_ease_forwards] tw:items-center tw:justify-start tw:rounded-none tw:border-0 tw:bg-transparent tw:p-0 tw:text-ink-muted tw:opacity-0 tw:shadow-none tw:hover:bg-transparent tw:hover:text-ink-2 tw:hover:shadow-none tw:hover:outline-none tw:hover:[&_.timeline-query-anchor-line-bar]:opacity-100 tw:active:transform-none";
const TIMELINE_QUERY_ANCHOR_LINE_ACTIVE_CLASS_NAME =
  "is-active tw:[.timeline-query-anchor-rail:not(:hover)_&_.timeline-query-anchor-line-bar]:opacity-100";
const TIMELINE_QUERY_ANCHOR_LINE_BAR_CLASS_NAME =
  "timeline-query-anchor-line-bar tw:block tw:h-[2px] tw:origin-left tw:bg-ink-1 tw:opacity-30 tw:transition-[width,opacity] tw:duration-100";
const TIMELINE_META_ROW_CLASS_NAME =
  "timeline-meta-row tw:flex tw:min-w-0 tw:flex-nowrap tw:items-center tw:gap-3";
const TIMELINE_RUN_META_CLASS_NAME =
  "timeline-run-meta tw:flex tw:min-w-0 tw:flex-nowrap tw:items-center tw:gap-3";
const TIMELINE_META_ACTIONS_CLASS_NAME =
  "timeline-meta-actions tw:inline-flex tw:shrink-0 tw:items-center tw:gap-1";
const TIMELINE_META_BUTTON_CLASS_NAME =
  "timeline-meta-btn ui-icon-hover-20 tw:!h-5 tw:!min-h-5 tw:!w-5 tw:!min-w-5 tw:!rounded-lg tw:!p-0 tw:text-ink-muted tw:[&_.material-icon]:text-sm tw:[&_.ui-btn-label]:inline-flex tw:[&_.ui-btn-label]:items-center tw:[&_.ui-btn-label]:gap-1";
const TIMELINE_META_BUTTON_DOWNVOTED_CLASS_NAME =
  "is-downvoted tw:bg-[color-mix(in_srgb,var(--accent-danger)_12%,transparent)] tw:text-[color-mix(in_srgb,var(--accent-danger)_78%,var(--ink-1))]";
const TIMELINE_ROW_TIME_CLASS_NAME =
  "timeline-row-time tw:ml-auto tw:shrink-0 tw:pl-2 tw:text-[10px] tw:leading-none tw:text-ink-muted tw:tracking-[0.02em]";
const TIMELINE_RUN_GROUP_CLASS_NAME =
  "timeline-run-group tw:relative tw:flex tw:flex-col tw:gap-2 tw:before:absolute tw:before:bottom-0 tw:before:left-2 tw:before:top-0 tw:before:w-px tw:before:bg-line-soft tw:before:content-['']";
const TIMELINE_RUN_ITEMS_CLASS_NAME =
  "timeline-run-items tw:flex tw:flex-col tw:gap-[12px]";
const TIMELINE_RUN_TIME_CLASS_NAME =
  "timeline-run-time tw:ml-auto tw:shrink-0 tw:pl-2 tw:text-[10px] tw:leading-none tw:text-ink-muted tw:tracking-[0.02em]";

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
  return (
    !String(input.chatId || "").trim() ||
    !String(input.runId || "").trim() ||
    input.streaming === true ||
    Boolean(input.activeAwaiting)
  );
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

function buildQueryAnchorId(nodeId: string): string {
  return `query-${nodeId}`;
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
  const node = nodes[nodes.length - 1];
  if (node?.kind === "content") return node;
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

const RunElapsedTime: React.FC<{ startTimeMs: number | null }> = ({
  startTimeMs,
}) => {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startTimeMs == null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startTimeMs]);

  if (startTimeMs == null)
    return <div>{t("conversationStage.scrollToBottom")}</div>;

  const duration = formatResponseDuration(Math.max(0, now - startTimeMs), t);
  return (
    <Flex vertical align="center">
      <div>{t("conversationStage.scrollToBottom")}</div>
      <div className="tw:text-xs tw:text-text-muted">
        {t("timeline.run.processed", { duration })}
      </div>
    </Flex>
  );
};

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

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleSelectAgent = (option: TimelineAgentOption) => {
    setOpen(false);
    setSearchText("");
    dispatchTimelineAgentSwitch(option);
  };

  return (
    <span className={TIMELINE_EMPTY_AGENT_SWITCHER_CLASS_NAME}>
      <Popover
        open={open}
        onOpenChange={setOpen}
        trigger={["click"]}
        placement="top"
        arrow={false}
        content={
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
                            className:
                              TIMELINE_AGENT_SWITCHER_AVATAR_CLASS_NAME,
                            width: 20,
                            height: 20,
                          },
                          avatar: {
                            className:
                              TIMELINE_AGENT_SWITCHER_AVATAR_CLASS_NAME,
                            size: 20,
                          },
                        }}
                      />
                      <span
                        className={
                          TIMELINE_AGENT_SWITCHER_OPTION_COPY_CLASS_NAME
                        }
                      >
                        <strong
                          className={
                            TIMELINE_AGENT_SWITCHER_OPTION_NAME_CLASS_NAME
                          }
                        >
                          {option.name}
                        </strong>
                        {!option.hideRole && (
                          <span
                            className={
                              TIMELINE_AGENT_SWITCHER_OPTION_ROLE_CLASS_NAME
                            }
                          >
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
        }
      >
        <button
          className={TIMELINE_AGENT_SWITCHER_TRIGGER_CLASS_NAME}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={t("timeline.agentSwitcher.ariaLabel", {
            name: displayName,
          })}
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
      </Popover>
    </span>
  );
};

function buildVirtualItemsDataSignature(
  items: readonly VirtualListItem[],
  expandedTaskGroups: Record<string, boolean>,
  expandedRunCollapses: Record<string, boolean>,
): string {
  const itemRevisions = items.map((item) => {
    let revision = "";
    try {
      revision = JSON.stringify(item.item);
    } catch {
      revision = item.key;
    }
    return [
      item.key,
      revision,
      Boolean(expandedTaskGroups[item.key]),
      Boolean(expandedRunCollapses[item.key]),
    ];
  });
  return createConversationDataSignature([
    ...itemRevisions,
    Object.entries(expandedTaskGroups).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
    Object.entries(expandedRunCollapses).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  ]);
}

function readRootFontSize(): string {
  if (
    typeof document === "undefined" ||
    typeof getComputedStyle !== "function"
  ) {
    return "";
  }
  return getComputedStyle(document.documentElement).fontSize;
}

function findVisibleConversationAnchor(
  scroller: HTMLElement,
  itemKeys: readonly string[],
): { key: string; index: number; offset: number } | null {
  const viewportRect = scroller.getBoundingClientRect();
  const elements = scroller.querySelectorAll<HTMLElement>(
    "[data-conversation-item-key]",
  );
  for (const element of elements) {
    const rect = element.getBoundingClientRect();
    if (rect.bottom <= viewportRect.top || rect.top >= viewportRect.bottom) {
      continue;
    }
    const key = String(element.dataset.conversationItemKey || "").trim();
    const index = itemKeys.indexOf(key);
    if (key && index >= 0) {
      return { key, index, offset: rect.top - viewportRect.top };
    }
  }
  return null;
}

function findConversationItemElement(
  scroller: HTMLElement,
  itemKey: string,
): HTMLElement | null {
  const elements = scroller.querySelectorAll<HTMLElement>(
    "[data-conversation-item-key]",
  );
  for (const element of elements) {
    if (element.dataset.conversationItemKey === itemKey) return element;
  }
  return null;
}

function isConversationScrollerAtBottom(scroller: HTMLElement): boolean {
  const maximumScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  return maximumScrollTop - scroller.scrollTop <= 1;
}

function ConversationTransitionOverlay({
  busy,
  error,
  phase,
  onRetry,
  onTransitionEnd,
  retryLabel,
}: {
  busy: boolean;
  error: string;
  phase: "visible" | "exiting";
  onRetry: () => void;
  onTransitionEnd: (event: React.TransitionEvent<HTMLDivElement>) => void;
  retryLabel: string;
}) {
  return (
    <div
      className={[
        CONVERSATION_TRANSITION_OVERLAY_CLASS_NAME,
        phase === "exiting" ? "is-exiting" : "is-visible",
      ].join(" ")}
      aria-busy={busy}
      data-transition-phase={phase}
      onTransitionEnd={onTransitionEnd}
      role={error ? "alert" : "status"}
    >
      {error ? (
        <div className={CONVERSATION_TRANSITION_ERROR_CLASS_NAME}>
          <MaterialIcon name="error" />
          <strong>{error}</strong>
          <UiButton size="sm" onClick={onRetry}>
            {retryLabel}
          </UiButton>
        </div>
      ) : (
        <div
          className={CONVERSATION_TRANSITION_SKELETON_CLASS_NAME}
          aria-hidden="true"
        >
          <div
            className={CONVERSATION_TRANSITION_SKELETON_QUERY_BLOCK_CLASS_NAME}
          >
            <div
              className={CONVERSATION_TRANSITION_SKELETON_QUERY_PILL_CLASS_NAME}
            />
            <div
              className={`${CONVERSATION_TRANSITION_SKELETON_SMALL_LINE_CLASS_NAME} tw:w-24 tw:mr-[10px]`}
            />
          </div>
          <div className={CONVERSATION_TRANSITION_SKELETON_BLOCK_CLASS_NAME}>
            <div
              className={CONVERSATION_TRANSITION_SKELETON_CAPTION_CLASS_NAME}
            >
              <span
                className={CONVERSATION_TRANSITION_SKELETON_DOT_CLASS_NAME}
              />
              <span
                className={`${CONVERSATION_TRANSITION_SKELETON_LINE_CLASS_NAME} tw:w-20`}
              />
            </div>
          </div>
          <div
            className={CONVERSATION_TRANSITION_SKELETON_RUN_BLOCK_CLASS_NAME}
          >
            <div className={CONVERSATION_TRANSITION_SKELETON_CARD_CLASS_NAME}>
              <div
                className={`${CONVERSATION_TRANSITION_SKELETON_SMALL_LINE_CLASS_NAME} tw:w-[38%]`}
              />
              <div
                className={`${CONVERSATION_TRANSITION_SKELETON_SMALL_LINE_CLASS_NAME} tw:w-[56%]`}
              />
              <div
                className={`${CONVERSATION_TRANSITION_SKELETON_SMALL_LINE_CLASS_NAME} tw:w-[48%]`}
              />
            </div>
          </div>
          <div className={CONVERSATION_TRANSITION_SKELETON_BLOCK_CLASS_NAME}>
            <div
              className={CONVERSATION_TRANSITION_SKELETON_CAPTION_CLASS_NAME}
            >
              <span
                className={`${CONVERSATION_TRANSITION_SKELETON_DOT_CLASS_NAME} dot-blue`}
              />
              <span
                className={`${CONVERSATION_TRANSITION_SKELETON_LINE_CLASS_NAME} tw:w-20`}
              />
            </div>
          </div>
          <div
            className={CONVERSATION_TRANSITION_SKELETON_RUN_BLOCK_CLASS_NAME}
          >
            <div
              className={`${CONVERSATION_TRANSITION_SKELETON_CARD_CLASS_NAME} tw:h-[70px]`}
            />
            <div
              className={`${CONVERSATION_TRANSITION_SKELETON_CARD_CLASS_NAME} tw:h-[70px]`}
            />
          </div>

          <div className={CONVERSATION_TRANSITION_SKELETON_BLOCK_CLASS_NAME}>
            <div
              className={CONVERSATION_TRANSITION_SKELETON_CAPTION_CLASS_NAME}
            >
              <span
                className={`${CONVERSATION_TRANSITION_SKELETON_DOT_CLASS_NAME} dot-green`}
              />
              <span
                className={`${CONVERSATION_TRANSITION_SKELETON_LINE_CLASS_NAME} tw:w-[70%]`}
              />
            </div>
          </div>

          <div
            className={CONVERSATION_TRANSITION_SKELETON_RUN_BLOCK_CLASS_NAME}
          >
            <span
              className={`${CONVERSATION_TRANSITION_SKELETON_LINE_CLASS_NAME} tw:w-[90%]`}
            />
            <span
              className={`${CONVERSATION_TRANSITION_SKELETON_LINE_CLASS_NAME} tw:w-[80%]`}
            />
            <span
              className={`${CONVERSATION_TRANSITION_SKELETON_LINE_CLASS_NAME} tw:w-[40%]`}
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface ConversationStageProps {
  surfaceMode: ConversationSurfaceMode;
  expectedChatId?: string;
  showEmptyState?: boolean;
  onResendInNewChat?: (message: string) => void;
}

export const ConversationStage: React.FC<ConversationStageProps> = ({
  surfaceMode,
  expectedChatId,
  showEmptyState = true,
  onResendInNewChat,
}) => {
  const { t } = useI18n();
  const state = useAppState();
  const dispatch = useAppDispatch();
  const appContext = useOptionalAppContext();
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const statusTimerRef = useRef<Map<string, number>>(new Map());
  const [actionStatus, setActionStatus] = useState<Record<string, string>>({});
  const [queryAnchorsEnabled, setQueryAnchorsEnabled] = useState(false);
  const [activeQueryAnchorId, setActiveQueryAnchorId] = useState("");
  const [derivingRunId, setDerivingRunId] = useState("");
  const [expandedTaskGroups, setExpandedTaskGroups] = useState<
    Record<string, boolean>
  >({});
  const [expandedRunCollapses, setExpandedRunCollapses] = useState<
    Record<string, boolean>
  >({});
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [containerWidth, setContainerWidth] = useState(0);
  const isAtBottomRef = useRef(true);
  const restoringRef = useRef(false);
  const restoreTargetModeRef = useRef<"anchor" | "bottom" | null>(null);
  const restoreAtBottomObservedRef = useRef(false);
  const rangeRef = useRef<ListRange>({ startIndex: 0, endIndex: 0 });
  const saveTimerRef = useRef<number | null>(null);
  const restoredTransitionRef = useRef<{
    seq: number;
    targetChatId: string;
  } | null>(null);
  const restoreAttemptRef = useRef<{
    seq: number;
    targetChatId: string;
    startedAt: number;
  } | null>(null);
  const lastScrollRequestIdRef = useRef(
    state.conversationScrollRequest?.id || 0,
  );
  const currentWorker = resolveCurrentWorkerSummary(state);
  const mainChatRuntime = appContext
    ? resolveMainChatRuntime(
        appContext.stateRef,
        appContext.activeQuerySessionRequestIdRef,
        appContext.querySessionsRef,
      )
    : null;
  const isMainChatRunning = Boolean(mainChatRuntime?.running);

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
      // attach 续接观察的 run 没有 query 头，events 里也暂无终结事件；
      // 传入活跃 run 标记，避免流式期间的节点全部退化为 standalone
      { hasActiveRun: Boolean(state.currentChatActiveRun) },
    );
  }, [
    timelineEntries,
    state.events,
    state.taskItemsById,
    state.currentChatActiveRun,
  ]);

  const runStartedAt = useMemo(() => {
    if (!isMainChatRunning && !state.streaming) return null;
    const lastQuery = displayItems?.findLast((event) => event.kind === "query");
    if (!lastQuery) return null;
    const timestamp = lastQuery.node.ts;
    if (timestamp) return readEpochMillis(timestamp) ?? null;
    return null;
  }, [isMainChatRunning, state.streaming, displayItems]);

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
        queryText:
          String(item.node.text || "").trim() || t("timeline.query.noText"),
        lastRunContent:
          nextItem?.kind === "run" ? findLastRunContentText(nextItem) : "",
      });
    }
    return anchors;
  }, [displayItems, t]);

  const virtualItems = useMemo((): VirtualListItem[] => {
    return displayItems.map((item) => {
      if (item.kind === "query") {
        return {
          kind: "query",
          key: item.key,
          anchorId: buildQueryAnchorId(item.node.id),
          item,
        };
      }
      if (item.kind === "run") {
        return { kind: "run", key: item.key, item };
      }
      return { kind: "standalone", key: item.key, item };
    });
  }, [displayItems]);

  const virtualItemKeys = useMemo(
    () => virtualItems.map((item) => item.key),
    [virtualItems],
  );
  const dataSignature = useMemo(
    () =>
      buildVirtualItemsDataSignature(
        virtualItems,
        expandedTaskGroups,
        expandedRunCollapses,
      ),
    [expandedRunCollapses, expandedTaskGroups, virtualItems],
  );
  const layoutSignature = useMemo(
    () =>
      createConversationLayoutSignature({
        surfaceMode,
        containerWidth,
        themeMode: state.themeMode,
        rootFontSize: readRootFontSize(),
      }),
    [containerWidth, state.themeMode, surfaceMode],
  );
  const currentBookmark = useMemo(
    () =>
      state.chatId
        ? getConversationScrollBookmark({ surfaceMode, chatId: state.chatId })
        : null,
    [dataSignature, layoutSignature, state.chatId, surfaceMode],
  );
  const transition = state.chatTransition;
  const transitionPending = Boolean(
    transition &&
    (transition.phase === "loading" ||
      transition.phase === "applying" ||
      transition.phase === "restoring"),
  );
  const normalizedExpectedChatId = String(expectedChatId || "").trim();
  const routeTargetMismatch = Boolean(
    normalizedExpectedChatId && normalizedExpectedChatId !== state.chatId,
  );
  const overlayTargetChatId = String(
    transition?.targetChatId || normalizedExpectedChatId,
  ).trim();
  const liveQueryOwnsOverlayTarget = Boolean(
    mainChatRuntime &&
    overlayTargetChatId &&
    isMainChatRuntimeObservedByLiveQuery(mainChatRuntime, overlayTargetChatId),
  );
  const liveQueryTakesDisplayPriority = Boolean(
    liveQueryOwnsOverlayTarget && transition?.kind !== "same-chat-reload",
  );
  const backgroundTransitionOwnsDisplayedChat = Boolean(
    transition?.displayMode === "background" &&
    transition.targetChatId &&
    transition.targetChatId === state.chatId &&
    (!normalizedExpectedChatId ||
      transition.targetChatId === normalizedExpectedChatId),
  );
  const transitionError = transition?.phase === "error" ? transition.error : "";
  const transitionOverlayVisible =
    Boolean(transitionError) ||
    (!liveQueryTakesDisplayPriority &&
      !backgroundTransitionOwnsDisplayedChat &&
      (routeTargetMismatch || transitionPending));
  const transitionOverlayIdentity = transition
    ? `${transition.seq}:${transition.targetChatId}`
    : `route:${normalizedExpectedChatId}`;
  const transitionOverlayImmediateDismiss = Boolean(
    !transitionError &&
    (liveQueryTakesDisplayPriority ||
      backgroundTransitionOwnsDisplayedChat ||
      !overlayTargetChatId),
  );
  const [transitionOverlayPresentation, setTransitionOverlayPresentation] =
    useState<{ identity: string; phase: "visible" | "exiting" } | null>(null);
  const transitionOverlayIdentityRef = useRef("");
  const transitionOverlayShownAtRef = useRef(0);
  const transitionOverlayHoldTimerRef = useRef<number | null>(null);
  const transitionOverlayUnmountTimerRef = useRef<number | null>(null);
  const clearTransitionOverlayTimers = useCallback(() => {
    if (transitionOverlayHoldTimerRef.current !== null) {
      window.clearTimeout(transitionOverlayHoldTimerRef.current);
      transitionOverlayHoldTimerRef.current = null;
    }
    if (transitionOverlayUnmountTimerRef.current !== null) {
      window.clearTimeout(transitionOverlayUnmountTimerRef.current);
      transitionOverlayUnmountTimerRef.current = null;
    }
  }, []);
  const finishTransitionOverlayPresentation = useCallback(
    (identity: string) => {
      if (transitionOverlayIdentityRef.current !== identity) return;
      clearTransitionOverlayTimers();
      transitionOverlayIdentityRef.current = "";
      transitionOverlayShownAtRef.current = 0;
      setTransitionOverlayPresentation((current) =>
        current?.identity === identity ? null : current,
      );
    },
    [clearTransitionOverlayTimers],
  );
  const beginTransitionOverlayExit = useCallback(
    (identity: string, reducedMotion: boolean) => {
      if (transitionOverlayIdentityRef.current !== identity) return;
      if (transitionOverlayHoldTimerRef.current !== null) {
        window.clearTimeout(transitionOverlayHoldTimerRef.current);
        transitionOverlayHoldTimerRef.current = null;
      }
      if (transitionOverlayUnmountTimerRef.current !== null) {
        window.clearTimeout(transitionOverlayUnmountTimerRef.current);
        transitionOverlayUnmountTimerRef.current = null;
      }
      if (reducedMotion) {
        finishTransitionOverlayPresentation(identity);
        return;
      }
      setTransitionOverlayPresentation((current) =>
        current?.identity === identity
          ? { ...current, phase: "exiting" }
          : current,
      );
      transitionOverlayUnmountTimerRef.current = window.setTimeout(
        () => finishTransitionOverlayPresentation(identity),
        CONVERSATION_TRANSITION_OVERLAY_FADE_MS,
      );
    },
    [finishTransitionOverlayPresentation],
  );

  useIsomorphicLayoutEffect(() => {
    if (transitionOverlayImmediateDismiss) {
      const activeIdentity = transitionOverlayIdentityRef.current;
      if (activeIdentity) {
        finishTransitionOverlayPresentation(activeIdentity);
      }
      return;
    }

    if (transitionOverlayVisible) {
      clearTransitionOverlayTimers();
      if (transitionOverlayIdentityRef.current !== transitionOverlayIdentity) {
        transitionOverlayIdentityRef.current = transitionOverlayIdentity;
        transitionOverlayShownAtRef.current = window.performance.now();
      }
      setTransitionOverlayPresentation((current) =>
        current?.identity === transitionOverlayIdentity &&
        current.phase === "visible"
          ? current
          : { identity: transitionOverlayIdentity, phase: "visible" },
      );
      return;
    }

    const activeIdentity = transitionOverlayIdentityRef.current;
    if (!activeIdentity) return;
    if (
      transitionOverlayHoldTimerRef.current !== null ||
      transitionOverlayUnmountTimerRef.current !== null
    ) {
      return;
    }
    const reducedMotion = Boolean(
      window.matchMedia?.(CONVERSATION_TRANSITION_REDUCED_MOTION_QUERY).matches,
    );
    const holdMs = reducedMotion
      ? CONVERSATION_TRANSITION_OVERLAY_REDUCED_MOTION_HOLD_MS
      : CONVERSATION_TRANSITION_OVERLAY_HOLD_MS;
    const elapsedMs = Math.max(
      0,
      window.performance.now() - transitionOverlayShownAtRef.current,
    );
    const remainingHoldMs = Math.max(0, holdMs - elapsedMs);
    if (remainingHoldMs === 0) {
      beginTransitionOverlayExit(activeIdentity, reducedMotion);
      return;
    }
    transitionOverlayHoldTimerRef.current = window.setTimeout(
      () => beginTransitionOverlayExit(activeIdentity, reducedMotion),
      remainingHoldMs,
    );
  }, [
    beginTransitionOverlayExit,
    clearTransitionOverlayTimers,
    finishTransitionOverlayPresentation,
    transitionOverlayIdentity,
    transitionOverlayImmediateDismiss,
    transitionOverlayVisible,
  ]);

  useEffect(
    () => () => {
      clearTransitionOverlayTimers();
    },
    [clearTransitionOverlayTimers],
  );

  const handleTransitionOverlayTransitionEnd = useCallback(
    (event: React.TransitionEvent<HTMLDivElement>) => {
      if (
        event.target !== event.currentTarget ||
        event.propertyName !== "opacity" ||
        transitionOverlayPresentation?.phase !== "exiting"
      ) {
        return;
      }
      finishTransitionOverlayPresentation(
        transitionOverlayPresentation.identity,
      );
    },
    [finishTransitionOverlayPresentation, transitionOverlayPresentation],
  );
  const restorationReady =
    liveQueryTakesDisplayPriority ||
    backgroundTransitionOwnsDisplayedChat ||
    (!transitionOverlayVisible &&
      (!transition ||
        transition.phase === "ready" ||
        transition.targetChatId !== state.chatId));
  useEffect(() => {
    if (
      !liveQueryTakesDisplayPriority ||
      !transition ||
      transition.kind === "same-chat-reload" ||
      transition.targetChatId !== overlayTargetChatId
    ) {
      return;
    }
    // A route-driven history transaction can race with canonical new-Chat
    // promotion. Once the original query owns the target, cancel the stale
    // transaction so it cannot keep Composer interactions blocked or apply a
    // late history response over live deltas.
    dispatch({ type: "CLEAR_CHAT_TRANSITION" });
  }, [
    dispatch,
    liveQueryTakesDisplayPriority,
    overlayTargetChatId,
    transition,
  ]);
  const matchingSnapshot = Boolean(
    currentBookmark?.snapshot &&
    currentBookmark.dataSignature === dataSignature &&
    currentBookmark.layoutSignature === layoutSignature,
  )
    ? currentBookmark?.snapshot
    : undefined;
  const virtuosoInstanceKey = `${surfaceMode}:${state.chatId}:${
    transition?.kind === "same-chat-reload" &&
    transition.targetChatId === state.chatId
      ? transition.seq
      : 0
  }`;

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
        message.success(t("timeline.toolPill.copy.copied"));
      } catch {
        flashActionStatus(key, t("timeline.toolPill.copy.failed"));
        message.error(t("timeline.toolPill.copy.failed"));
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
        message.success(
          nextDownvoted
            ? t("timeline.feedback.downvoted")
            : t("timeline.feedback.cleared"),
        );
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
      if (isMainChatRunning || !text.trim()) return;
      window.dispatchEvent(
        new CustomEvent("agent:send-message", { detail: { message: text } }),
      );
    },
    [isMainChatRunning],
  );

  const handleResendInNewChat = useCallback(
    (text: string) => {
      const messageText = text.trim();
      if (isMainChatRunning || !messageText) return;
      if (onResendInNewChat) {
        onResendInNewChat(messageText);
        return;
      }

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
    [currentWorker, isMainChatRunning, onResendInNewChat],
  );

  const handleDeriveChat = useCallback(
    async (runId: string) => {
      const sourceChatId = String(state.chatId || "").trim();
      const sourceRunId = String(runId || "").trim();
      if (
        isDeriveChatActionDisabled({
          chatId: sourceChatId,
          runId: sourceRunId,
          streaming: isMainChatRunning,
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
        setDerivingRunId((current) => (current === sourceRunId ? "" : current));
      }
    },
    [dispatch, isMainChatRunning, state.activeAwaiting, state.chatId, t],
  );

  const toggleTaskGroup = useCallback((key: string) => {
    setExpandedTaskGroups((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }, []);

  const toggleRunCollapse = useCallback((key: string) => {
    setExpandedRunCollapses((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }, []);

  const renderEntry = useCallback(
    (entry: TimelineRenderEntry) => (
      <TimelineRenderEntryView
        key={entry.key}
        entry={entry}
        agents={state.agents}
        fallbackAgentKey={
          currentWorker?.type === "agent" ? currentWorker.sourceId : ""
        }
        expandedTaskGroups={expandedTaskGroups}
        onToggleTaskGroup={toggleTaskGroup}
      />
    ),
    [
      currentWorker,
      expandedTaskGroups,
      state.agents,
      toggleTaskGroup,
    ],
  );

  const captureCurrentBookmark = useCallback(() => {
    const chatId = String(state.chatId || "").trim();
    if (!chatId || restoringRef.current) return;
    const fallbackIndex = Math.max(
      0,
      Math.min(virtualItemKeys.length - 1, rangeRef.current.startIndex || 0),
    );
    const visibleAnchor = scrollerRef.current
      ? findVisibleConversationAnchor(scrollerRef.current, virtualItemKeys)
      : null;
    const anchorIndex = visibleAnchor?.index ?? fallbackIndex;
    const anchorItemKey =
      visibleAnchor?.key || virtualItemKeys[anchorIndex] || null;
    const bookmarkBase: ConversationScrollBookmark = {
      anchorItemKey,
      anchorIndex,
      previousItemKey:
        anchorIndex > 0 ? virtualItemKeys[anchorIndex - 1] || null : null,
      nextItemKey: virtualItemKeys[anchorIndex + 1] || null,
      anchorOffset: visibleAnchor?.offset || 0,
      atBottom: isAtBottomRef.current,
      dataSignature,
      layoutSignature,
      savedAt: Date.now(),
    };
    const commit = (snapshot?: StateSnapshot) => {
      setConversationScrollBookmark(
        { surfaceMode, chatId },
        { ...bookmarkBase, ...(snapshot ? { snapshot } : {}) },
      );
    };
    if (virtuosoRef.current) {
      virtuosoRef.current.getState((snapshot) => commit(snapshot));
    } else {
      commit();
    }
  }, [
    dataSignature,
    layoutSignature,
    state.chatId,
    surfaceMode,
    virtualItemKeys,
  ]);

  const captureCurrentBookmarkRef = useRef(captureCurrentBookmark);
  captureCurrentBookmarkRef.current = captureCurrentBookmark;

  useIsomorphicLayoutEffect(() => {
    const viewportHandle = appContext?.conversationViewportRef;
    if (!viewportHandle) return;
    const handle = {
      captureCurrent: () => captureCurrentBookmarkRef.current(),
    };
    viewportHandle.current = handle;
    return () => {
      captureCurrentBookmarkRef.current();
      if (viewportHandle.current === handle) {
        viewportHandle.current = null;
      }
    };
  }, [appContext?.conversationViewportRef]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        captureCurrentBookmarkRef.current();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const handleIsScrolling = useCallback((scrolling: boolean) => {
    if (scrolling) {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      return;
    }
    if (restoringRef.current) return;
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      captureCurrentBookmarkRef.current();
    }, 150);
  }, []);

  const handleAtBottomStateChange = useCallback((atBottom: boolean) => {
    if (restoringRef.current) {
      if (restoreTargetModeRef.current === "bottom") {
        restoreAtBottomObservedRef.current = atBottom;
      }
      return;
    }
    isAtBottomRef.current = atBottom;
    setIsAtBottom(atBottom);
  }, []);

  const handleRangeChanged = useCallback(
    (range: ListRange) => {
      rangeRef.current = range;
      if (!queryAnchorsEnabled) return;
      let activeAnchorId = "";
      for (let i = range.startIndex; i >= 0; i--) {
        const item = virtualItems[i];
        if (item?.kind === "query") {
          activeAnchorId = item.anchorId;
          break;
        }
      }
      setActiveQueryAnchorId((current) =>
        current === activeAnchorId ? current : activeAnchorId,
      );
    },
    [queryAnchorsEnabled, virtualItems],
  );

  const handleQueryAnchorClick = useCallback(
    (anchorId: string) => {
      const normalizedAnchorId = String(anchorId || "").trim();
      if (!normalizedAnchorId) return;
      const index = virtualItems.findIndex(
        (item) => item.kind === "query" && item.anchorId === normalizedAnchorId,
      );
      if (index >= 0 && virtuosoRef.current) {
        virtuosoRef.current.scrollToIndex({
          index,
          behavior: "smooth",
          align: "start",
        });
        setActiveQueryAnchorId(normalizedAnchorId);
      }
    },
    [virtualItems],
  );

  const handleScrollToBottomClick = () => {
    dispatch({
      type: "REQUEST_CONVERSATION_SCROLL",
      chatId: state.chatId,
      reason: "user-click",
    });
  };

  useEffect(() => {
    const request = state.conversationScrollRequest;
    if (!request || request.id <= lastScrollRequestIdRef.current) return;
    lastScrollRequestIdRef.current = request.id;
    if (
      request.target !== "bottom" ||
      request.chatId !== state.chatId ||
      !restorationReady
    ) {
      return;
    }
    isAtBottomRef.current = true;
    setIsAtBottom(true);
    virtuosoRef.current?.scrollToIndex({
      index: "LAST",
      behavior: "smooth",
      align: "end",
    });
  }, [restorationReady, state.chatId, state.conversationScrollRequest]);

  useIsomorphicLayoutEffect(() => {
    if (
      !transition ||
      transition.phase !== "applying" ||
      transition.targetChatId !== state.chatId
    ) {
      return;
    }
    dispatch({
      type: "ADVANCE_CHAT_TRANSITION",
      seq: transition.seq,
      targetChatId: transition.targetChatId,
      phase: "restoring",
    });
  }, [dispatch, state.chatId, transition]);

  useIsomorphicLayoutEffect(() => {
    if (
      !transition ||
      transition.phase !== "restoring" ||
      transition.targetChatId !== state.chatId ||
      (restoredTransitionRef.current?.seq === transition.seq &&
        restoredTransitionRef.current.targetChatId === transition.targetChatId)
    ) {
      return;
    }

    restoringRef.current = true;
    const existingAttempt = restoreAttemptRef.current;
    const restoreAttempt =
      existingAttempt?.seq === transition.seq &&
      existingAttempt.targetChatId === transition.targetChatId
        ? existingAttempt
        : {
            seq: transition.seq,
            targetChatId: transition.targetChatId,
            startedAt: Date.now(),
          };
    restoreAttemptRef.current = restoreAttempt;
    const bookmark = currentBookmark;
    const bookmarkMatchesCurrentTimeline = Boolean(
      bookmark &&
        bookmark.dataSignature === dataSignature &&
        bookmark.layoutSignature === layoutSignature,
    );
    const restorableBookmark = bookmarkMatchesCurrentTimeline ? bookmark : null;
    const resolvedBookmarkIndex = restorableBookmark && !restorableBookmark.atBottom
      ? resolveConversationRestoreIndex(restorableBookmark, virtualItemKeys)
      : -1;
    const shouldRestoreBottom = Boolean(
      !restorableBookmark ||
        restorableBookmark.atBottom ||
        resolvedBookmarkIndex < 0,
    );
    isAtBottomRef.current = shouldRestoreBottom;
    setIsAtBottom(shouldRestoreBottom);
    restoreTargetModeRef.current = shouldRestoreBottom ? "bottom" : "anchor";
    restoreAtBottomObservedRef.current = false;
    let cancelled = false;
    let frameId = 0;
    let stableFrameCount = 0;
    let issuedIndexScroll = false;
    const targetIndex = shouldRestoreBottom
      ? virtualItemKeys.length - 1
      : resolvedBookmarkIndex;
    const targetItemKey = targetIndex >= 0 ? virtualItemKeys[targetIndex] : "";
    const restoreStartedAt = restoreAttempt.startedAt;
    const fallbackReason = !bookmark
      ? "missing-bookmark"
      : !bookmarkMatchesCurrentTimeline
        ? "signature-mismatch"
        : !bookmark.atBottom && resolvedBookmarkIndex < 0
          ? "unresolved-anchor"
          : "";
    dispatch({
      type: "APPEND_DEBUG",
      line: `[chat-scroll-restore-start] chatId=${transition.targetChatId} transitionSeq=${transition.seq} mode=${shouldRestoreBottom ? "bottom" : "anchor"} targetIndex=${targetIndex} targetKey=${targetItemKey || "none"} targetOffset=${restorableBookmark?.anchorOffset || 0}`,
    });
    if (fallbackReason) {
      dispatch({
        type: "APPEND_DEBUG",
        line: `[chat-scroll-restore-fallback-bottom] chatId=${transition.targetChatId} transitionSeq=${transition.seq} reason=${fallbackReason}`,
      });
    }

    const isStillCurrent = () => {
      const latest = appContext?.stateRef.current.chatTransition;
      return Boolean(
        latest &&
        latest.seq === transition.seq &&
        latest.targetChatId === transition.targetChatId &&
        latest.phase === "restoring",
      );
    };
    if (!isStillCurrent()) {
      restoringRef.current = false;
      restoreTargetModeRef.current = null;
      restoreAtBottomObservedRef.current = false;
      return;
    }
    let timeoutId: number | null = null;
    let completed = false;
    const finish = (reason: "empty" | "stable" | "timeout") => {
      if (cancelled || completed || !isStillCurrent()) return;
      completed = true;
      restoredTransitionRef.current = {
        seq: transition.seq,
        targetChatId: transition.targetChatId,
      };
      if (
        restoreAttemptRef.current?.seq === transition.seq &&
        restoreAttemptRef.current.targetChatId === transition.targetChatId
      ) {
        restoreAttemptRef.current = null;
      }
      window.cancelAnimationFrame(frameId);
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      restoringRef.current = false;
      restoreTargetModeRef.current = null;
      restoreAtBottomObservedRef.current = false;
      const scroller = scrollerRef.current;
      const elapsedMs = Math.max(0, Date.now() - restoreStartedAt);
      if (reason === "timeout") {
        const scrollTop = scroller?.scrollTop || 0;
        const remainingErrorPx = shouldRestoreBottom && scroller
          ? Math.max(0, scroller.scrollHeight - scroller.clientHeight - scrollTop)
          : (() => {
              const element =
                targetItemKey && scroller
                  ? findConversationItemElement(scroller, targetItemKey)
                  : null;
              if (!element || !scroller) return "unknown";
              return Math.abs(
                element.getBoundingClientRect().top -
                  scroller.getBoundingClientRect().top -
                  (restorableBookmark?.anchorOffset || 0),
              );
            })();
        dispatch({
          type: "APPEND_DEBUG",
          line: `[chat-scroll-restore-timeout] chatId=${transition.targetChatId} transitionSeq=${transition.seq} mode=${shouldRestoreBottom ? "bottom" : "anchor"} targetIndex=${targetIndex} targetKey=${targetItemKey || "none"} scrollTop=${scrollTop} remainingErrorPx=${remainingErrorPx} elapsedMs=${elapsedMs}`,
        });
      }
      dispatch({
        type: "APPEND_DEBUG",
        line: `[chat-scroll-restore-ready] chatId=${transition.targetChatId} transitionSeq=${transition.seq} mode=${shouldRestoreBottom ? "bottom" : "anchor"} targetIndex=${targetIndex} targetKey=${targetItemKey || "none"} targetOffset=${restorableBookmark?.anchorOffset || 0} scrollTop=${scroller?.scrollTop || 0} elapsedMs=${elapsedMs}`,
      });
      dispatch({
        type: "ADVANCE_CHAT_TRANSITION",
        seq: transition.seq,
        targetChatId: transition.targetChatId,
        phase: "ready",
      });
      if (transition.focusComposerOnReady) {
        window.requestAnimationFrame(() => {
          window.dispatchEvent(new CustomEvent("agent:focus-composer"));
        });
      }
    };
    const settle = () => {
      if (cancelled || !isStillCurrent()) return;
      if (virtualItemKeys.length === 0) {
        finish("empty");
        return;
      }
      if (shouldRestoreBottom) {
        if (!issuedIndexScroll) {
          issuedIndexScroll = true;
          virtuosoRef.current?.scrollToIndex({
            index: "LAST",
            behavior: "auto",
            align: "end",
          });
        }
        const scroller = scrollerRef.current;
        const bottomReached = restoreAtBottomObservedRef.current ||
          Boolean(scroller && isConversationScrollerAtBottom(scroller));
        stableFrameCount = bottomReached ? stableFrameCount + 1 : 0;
      } else {
        const scroller = scrollerRef.current;
        const element =
          targetItemKey && scroller
            ? findConversationItemElement(scroller, targetItemKey)
            : null;
        if (!element || !scroller) {
          if (!issuedIndexScroll && targetIndex >= 0) {
            issuedIndexScroll = true;
            virtuosoRef.current?.scrollToIndex({
              index: targetIndex,
              behavior: "auto",
              align: "start",
            });
          }
          stableFrameCount = 0;
        } else {
          const delta =
            element.getBoundingClientRect().top -
            scroller.getBoundingClientRect().top -
            (restorableBookmark?.anchorOffset || 0);
          if (Math.abs(delta) <= 1) {
            stableFrameCount += 1;
          } else {
            stableFrameCount = 0;
            virtuosoRef.current?.scrollBy({
              top: delta,
              behavior: "auto",
            });
          }
        }
      }
      if (stableFrameCount >= 2) {
        finish("stable");
        return;
      }
      frameId = window.requestAnimationFrame(settle);
    };

    if (!shouldRestoreBottom && !matchingSnapshot && targetIndex >= 0) {
      issuedIndexScroll = true;
      virtuosoRef.current?.scrollToIndex({
        index: targetIndex,
        behavior: "auto",
        align: "start",
      });
    }
    const timeoutDelayMs = Math.max(
      0,
      CONVERSATION_SCROLL_RESTORE_TIMEOUT_MS -
        Math.max(0, Date.now() - restoreStartedAt),
    );
    timeoutId = window.setTimeout(() => finish("timeout"), timeoutDelayMs);
    frameId = window.requestAnimationFrame(settle);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      restoringRef.current = false;
      restoreTargetModeRef.current = null;
      restoreAtBottomObservedRef.current = false;
    };
  }, [
    appContext?.stateRef,
    currentBookmark,
    dataSignature,
    dispatch,
    layoutSignature,
    matchingSnapshot,
    state.chatId,
    transition,
    virtualItemKeys,
  ]);

  useEffect(() => {
    return () => {
      statusTimerRef.current.forEach((timer) => window.clearTimeout(timer));
      statusTimerRef.current.clear();
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateWidthState = (width = el.clientWidth) => {
      setContainerWidth(width);
      setQueryAnchorsEnabled(shouldEnableQueryAnchors(width));
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

  const emptyStateContent = !state.chatId && showEmptyState && (
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
  );

  const Footer = useCallback(() => {
    const running = isMainChatRunning || state.streaming;
    if (isAtBottom && !running) {
      return null;
    }
    return (
      <Tooltip
        title={
          running ? (
            <RunElapsedTime startTimeMs={runStartedAt} />
          ) : (
            t("conversationStage.scrollToBottom")
          )
        }
        placement="top"
      >
        <UiButton
          className={CONVERSATION_STAGE_SCROLL_TO_BOTTOM_CLASS_NAME}
          iconOnly
          size="sm"
          onClick={handleScrollToBottomClick}
        >
          {running ? (
            <DotLoading color="primary" height={15} />
          ) : (
            <MaterialIcon name="arrow_downward" />
          )}
        </UiButton>
      </Tooltip>
    );
  }, [isAtBottom, isMainChatRunning, runStartedAt, state.streaming]);

  return (
    <div className={CONVERSATION_STAGE_CLASS_NAME} ref={containerRef}>
      {queryAnchorItems.length > 0 && queryAnchorsEnabled && (
        <nav
          ref={anchorRef}
          className={TIMELINE_QUERY_ANCHOR_RAIL_CLASS_NAME}
          style={
            {
              "--hover-index": (queryAnchorItems.length + 999).toString(),
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
                    <div
                      className={TIMELINE_QUERY_ANCHOR_PREVIEW_QUERY_CLASS_NAME}
                    >
                      {anchor.queryText}
                    </div>
                    <div
                      className={
                        TIMELINE_QUERY_ANCHOR_PREVIEW_CONTENT_CLASS_NAME
                      }
                    >
                      {anchor.lastRunContent}
                    </div>
                  </div>
                }
              >
                <button
                  className={[
                    TIMELINE_QUERY_ANCHOR_LINE_CLASS_NAME,
                    active ? TIMELINE_QUERY_ANCHOR_LINE_ACTIVE_CLASS_NAME : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  type="button"
                  aria-current={active ? "location" : undefined}
                  aria-label={t("conversationStage.queryAnchor", {
                    index: index + 1,
                  })}
                  onMouseEnter={() => {
                    if (!anchorRef.current) return;
                    anchorRef.current.style.setProperty(
                      "--hover-index",
                      index.toString(),
                    );
                  }}
                  onClick={() => handleQueryAnchorClick(anchor.anchorId)}
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

      {!state.chatId ? (
        showEmptyState ? (
          <div
            className={[
              TIMELINE_EMPTY_SCROLL_CLASS_NAME,
              TIMELINE_STACK_CLASS_NAME,
              TIMELINE_STACK_EMPTY_CLASS_NAME,
            ].join(" ")}
          >
            {isMainChatRunning || state.streaming ? (
              <LogoLoading text={t("logoLoading.text")} />
            ) : (
              emptyStateContent
            )}
          </div>
        ) : null
      ) : (
        <Virtuoso
          key={virtuosoInstanceKey}
          ref={virtuosoRef}
          data={virtualItems}
          computeItemKey={(_index, item) => item.key}
          restoreStateFrom={matchingSnapshot}
          scrollerRef={(ref) => {
            scrollerRef.current =
              ref && typeof (ref as HTMLElement).querySelectorAll === "function"
                ? (ref as HTMLElement)
                : null;
          }}
          increaseViewportBy={window.innerHeight}
          followOutput={(atBottom) =>
            restorationReady &&
            !restoringRef.current &&
            isAtBottomRef.current &&
            atBottom
              ? "smooth"
              : false
          }
          atBottomThreshold={50}
          atBottomStateChange={handleAtBottomStateChange}
          rangeChanged={handleRangeChanged}
          isScrolling={handleIsScrolling}
          className={VIRTUOSO_CLASS_NAME}
          id="messages"
          data-desktop-workspace-arrow-keys="allow"
          components={{
            Footer,
            Item: ConversationVirtualItem,
          }}
          itemContent={(_index, listItem) => {
            if (listItem.kind === "query") {
              const item = listItem.item;
              const queryTime = formatTimelineTime(item.node.ts);
              const queryCopyKey = `${item.key}:copy`;
              const queryCopyStatus =
                actionStatus[queryCopyKey] ||
                t("timeline.toolPill.copy.action");
              const queryAnchorId = listItem.anchorId;
              return (
                <div
                  id={queryAnchorId}
                  className="timeline-query-anchor-row tw:relative"
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
                              handleCopy(queryCopyKey, item.node.text || "")
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
                                } else if (info.key === "resendInNewChat") {
                                  handleResendInNewChat(item.node.text || "");
                                }
                              },
                              items: [
                                {
                                  key: "resend",
                                  icon: (
                                    <MaterialIcon
                                      name="refresh"
                                      className="tw:!h-3.5 tw:!w-3.5 tw:!text-sm"
                                    />
                                  ),
                                  label: t("timeline.query.resend"),
                                },
                                {
                                  key: "resendInNewChat",
                                  icon: (
                                    <MaterialIcon
                                      name="open_in_new"
                                      className="tw:!h-3.5 tw:!w-3.5 tw:!text-sm"
                                    />
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
                              disabled={isMainChatRunning}
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
            if (listItem.kind === "run") {
              const item = listItem.item;
              const isCompleted = Boolean(item.completedAt);
              const time = formatTimelineTime(item.completedAt);
              const responseDuration = formatResponseDuration(
                item.responseDurationMs,
                t,
              );
              const runCopyKey = `${item.key}:copy`;
              const runId = String(item.runId || "").trim();
              const isDownvoted = Boolean(
                runId && state.downvotedRunKeys.has(runId),
              );
              const runCopyStatus =
                actionStatus[runCopyKey] || t("timeline.toolPill.copy.action");
              const deriveChatDisabled = isDeriveChatActionDisabled({
                chatId: state.chatId,
                runId,
                streaming: isMainChatRunning,
                activeAwaiting: state.activeAwaiting,
              });
              const deriveChatTitle = t("timeline.run.deriveChat");

              const lastContentNode = findLastRunContentNode(item);
              const shouldCollapse = isCompleted && item.nodes.length > 1;
              return (
                <Flex vertical gap={8}>
                  {shouldCollapse && (
                    <Collapse
                      ghost
                      destroyOnHidden
                      className="timeline-run-collapse"
                      activeKey={
                        expandedRunCollapses[item.key] ? ["run-entries"] : []
                      }
                      onChange={() => toggleRunCollapse(item.key)}
                      items={[
                        {
                          key: "run-entries",
                          label: t("timeline.run.processed", {
                            duration: responseDuration,
                          }),
                          children: (
                            <div className={TIMELINE_RUN_ITEMS_CLASS_NAME}>
                              {buildRunRenderEntries(
                                lastContentNode
                                  ? item.nodes.slice(0, -1)
                                  : item.nodes,
                                state.taskItemsById,
                              ).map((entry) => renderEntry(entry))}
                            </div>
                          ),
                        },
                      ]}
                    />
                  )}
                  <section className={TIMELINE_RUN_GROUP_CLASS_NAME}>
                    {shouldCollapse ? (
                      buildRunRenderEntries(
                        lastContentNode ? [lastContentNode] : [],
                      ).map((entry) => renderEntry(entry))
                    ) : (
                      <div className={TIMELINE_RUN_ITEMS_CLASS_NAME}>
                        {item.renderEntries.map((entry) => renderEntry(entry))}
                      </div>
                    )}
                  </section>
                  {!shouldCollapse && (
                    <RunTerminalNotice
                      terminalType={item.terminalType}
                      duration={responseDuration}
                    />
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
                          <MaterialIcon name="branches" />
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
                          {responseDuration ? ` · ${responseDuration}` : ""}
                        </div>
                      )}
                    </div>
                  )}
                </Flex>
              );
            }
            return renderEntry(listItem.item.renderEntry);
          }}
        />
      )}
      {transitionOverlayPresentation ? (
        <ConversationTransitionOverlay
          busy={Boolean(transitionOverlayVisible && !transitionError)}
          error={transitionError}
          phase={transitionOverlayPresentation.phase}
          retryLabel={t("surface.retry")}
          onTransitionEnd={handleTransitionOverlayTransitionEnd}
          onRetry={() => {
            const targetChatId = String(
              transition?.targetChatId || normalizedExpectedChatId,
            ).trim();
            if (!targetChatId) return;
            window.dispatchEvent(
              new CustomEvent("agent:load-chat", {
                detail: {
                  chatId: targetChatId,
                  focusComposerOnComplete:
                    transition?.focusComposerOnReady === true,
                },
              }),
            );
          }}
        />
      ) : null}
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
