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
  type TimelineDisplayItem,
  type TimelineRenderEntry,
} from "@/features/timeline/lib/timelineDisplay";
import { serializeRunTranscript } from "@/features/timeline/lib/runTranscript";
import { copyText } from "@/shared/utils/copy";
import { UiButton } from "@/shared/ui/UiButton";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { resolveCurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import { submitFeedback } from "@/shared/data";
import { AgentIcon } from "@/shared/icons/agent";
import { useI18n } from "@/shared/i18n";
import {
  Button,
  Dropdown,
  Flex,
  Form,
  Input,
  message,
  Popover,
  Tooltip,
} from "antd";
import type { InputRef } from "antd";
import type { Agent, WorkerRow } from "@/app/state/types";

type CurrentWorkerSummary = ReturnType<typeof resolveCurrentWorkerSummary>;

const QUERY_ANCHOR_MIN_SCROLL_WIDTH = 960;
const QUERY_ANCHOR_ACTIVE_OFFSET = 96;
const QUERY_ANCHOR_TIMELINE_WIDTH = 800;
const QUERY_ANCHOR_EDGE_INSET = 12;

export interface TimelineAgentOption {
  key: string;
  name: string;
  role: string;
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

  const options: TimelineAgentOption[] = [];
  if (input.currentWorker?.type === "agent") {
    pushUniqueTimelineAgentOption(options, {
      key: input.currentWorker.sourceId,
      name: input.currentWorker.displayName,
      role: input.currentWorker.role,
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
      icon: iconByAgentKey.get(row.sourceId),
      searchText: row.searchText,
    });
  }

  if (options.length <= 1) {
    for (const agent of Array.isArray(input.agents) ? input.agents : []) {
      pushUniqueTimelineAgentOption(options, {
        key: agent?.key,
        name: agent?.name,
        role: agent?.role || "",
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

function formatResponseDuration(durationMs?: number): string {
  if (!Number.isFinite(durationMs) || Number(durationMs) < 0) {
    return "";
  }

  const value = Number(durationMs);
  if (value < 1000) {
    return `${Math.round(value)}毫秒`;
  }
  if (value < 60_000) {
    return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}秒`;
  }

  const totalSeconds = Math.round(value / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return `${minutes}分${seconds}秒`;
  }

  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  return `${hours}小时${remainMinutes}分`;
}

function formatTaskStatus(status: string): string {
  switch (status) {
    case "running":
      return "进行中";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    case "canceled":
      return "已取消";
    default:
      return status || "任务";
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
    <span className="timeline-empty-agent-switcher" ref={rootRef}>
      <button
        className="timeline-agent-switcher-trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("timeline.agentSwitcher.ariaLabel", {
          name: displayName,
        })}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="timeline-agent-switcher-trigger-name">
          {displayName}
        </span>
        <MaterialIcon
          className="timeline-agent-switcher-arrow"
          name="keyboard_arrow_down"
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="timeline-agent-switcher-menu">
          <Input
            ref={searchInputRef}
            className="timeline-agent-switcher-search"
            size="small"
            variant="filled"
            value={searchText}
            placeholder={t("timeline.agentSwitcher.searchPlaceholder")}
            onChange={(event) => setSearchText(event.target.value)}
          />
          {filteredOptions.length === 0 ? (
            <div className="timeline-agent-switcher-empty">
              {t("timeline.agentSwitcher.empty")}
            </div>
          ) : (
            <div
              className="timeline-agent-switcher-list"
              role="listbox"
              aria-label={t("timeline.agentSwitcher.listAriaLabel")}
            >
              {filteredOptions.map((option) => {
                const selected = option.key === currentAgentKey;
                return (
                  <button
                    key={option.key}
                    className={`timeline-agent-switcher-option ${selected ? "is-active" : ""}`.trim()}
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
                          className: "timeline-agent-switcher-avatar",
                          width: 28,
                          height: 28,
                        },
                        avatar: {
                          className: "timeline-agent-switcher-avatar",
                          size: 28,
                        },
                      }}
                    />
                    <span className="timeline-agent-switcher-option-copy">
                      <strong>{option.name}</strong>
                      <span>{option.role || "--"}</span>
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

    if (typeof window === "undefined") return;
    const nextUrl = `${window.location.pathname}${window.location.search}#${encodeURIComponent(normalizedAnchorId)}`;
    if (window.history && typeof window.history.replaceState === "function") {
      window.history.replaceState(null, "", nextUrl);
      return;
    }
    window.location.hash = normalizedAnchorId;
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
        queryText: String(item.node.text || "").trim() || "无文本提问",
        lastRunContent:
          nextItem?.kind === "run" ? findLastRunContentText(nextItem) : "",
      });
    }
    return anchors;
  }, [displayItems]);

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
        flashActionStatus(key, "已复制");
      } catch {
        flashActionStatus(key, "复制失败");
      }
    },
    [flashActionStatus],
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
        message.success(nextDownvoted ? "已点踩" : "已取消点踩");
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
    [dispatch, state.chatId],
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
        const taskDuration = formatResponseDuration(entry.durationMs);
        const statusText = formatTaskStatus(entry.status);
        const taskAgent = resolveTaskGroupAgent(
          entry,
          state.agents,
          currentWorker,
        );
        return (
          <section key={entry.key} className="timeline-task-group">
            <Flex
              className={`timeline-task-group-header ${expanded ? "is-expanded" : ""}`.trim()}
              align="center"
              gap={8}
              aria-expanded={expanded}
              onClick={() => toggleTaskGroup(entry.key)}
            >
              {taskAgent && (
                <span className="timeline-task-group-agent">
                  <AgentIcon
                    icon={taskAgent.icon}
                    type="agent"
                    props={{
                      icon: {
                        className: "timeline-task-group-agent-avatar",
                        width: 20,
                        height: 20,
                      },
                      avatar: {
                        className: "timeline-task-group-agent-avatar",
                        size: 20,
                      },
                    }}
                  />
                  <span className="timeline-task-group-agent-name">
                    {taskAgent.name || taskAgent.key}
                  </span>
                </span>
              )}
              <span className="timeline-task-group-title">
                {entry.taskName || entry.taskId}
              </span>
              <span
                className={`timeline-task-group-status tool-status-dot is-${entry.status || "unknown"}`.trim()}
                data-tool-status={entry.status || "unknown"}
                aria-label={statusText}
                title={statusText}
              />
              {taskDuration && (
                <span className="timeline-task-group-duration">
                  {taskDuration}
                </span>
              )}
              <MaterialIcon name={expanded ? "expand_more" : "chevron_right"} />
            </Flex>
            {entry.error && (
              <div className="timeline-task-group-error">{entry.error}</div>
            )}
            {expanded && (
              <div className="timeline-task-group-body">
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
    <div className="conversation-stage">
      <div className="messages-scroll" ref={scrollRef} id="messages">
        <div
          className={`timeline-stack ${queryAnchorsEnabled ? "has-query-anchors" : ""} ${displayItems.length === 0 && showEmptyState ? "is-empty" : ""}`.trim()}
        >
          {displayItems.length === 0 ? (
            showEmptyState ? (
              <div className="timeline-empty">
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
                  className="timeline-query-anchor-rail"
                  style={
                    {
                      "--hover-index": (queryAnchorItems.length + 5).toString(),
                    } as React.CSSProperties
                  }
                  onMouseLeave={() => {
                    if (!anchorRef.current) return;
                    anchorRef.current.style.setProperty(
                      "--hover-index",
                      (queryAnchorItems.length + 5).toString(),
                    );
                  }}
                >
                  {queryAnchorItems.map((anchor, index) => {
                    const active = activeQueryAnchorId === anchor.anchorId;
                    return (
                      <Tooltip
                        rootClassName="timeline-query-anchor-preview"
                        trigger="hover"
                        placement="right"
                        title={
                          <div>
                            <div className="timeline-query-anchor-preview-query">
                              {anchor.queryText}
                            </div>
                            <div className="timeline-query-anchor-preview-content">
                              {anchor.lastRunContent}
                            </div>
                          </div>
                        }
                      >
                        <button
                          key={anchor.key}
                          className={`timeline-query-anchor-line ${active ? "is-active" : ""}`.trim()}
                          type="button"
                          aria-current={active ? "location" : undefined}
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
                            className="timeline-query-anchor-line-bar"
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
              <div className="timeline-lane">
                {displayItems.map((item) => {
                  if (item.kind === "query") {
                    const queryTime = formatTimelineTime(item.node.ts);
                    const queryCopyKey = `${item.key}:copy`;
                    const queryCopyStatus =
                      actionStatus[queryCopyKey] || "复制";
                    const queryAnchorId = buildQueryAnchorId(item.node.id);
                    return (
                      <div
                        key={item.key}
                        id={queryAnchorId}
                        className="timeline-query-anchor-row"
                        data-query-anchor-id={queryAnchorId}
                      >
                        <TimelineRow
                          node={item.node}
                          metaNode={
                            <div className="timeline-meta-row">
                              <div className="timeline-meta-actions">
                                <UiButton
                                  className="timeline-meta-btn"
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
                                        label: "重问",
                                      },
                                      {
                                        key: "resendInNewChat",
                                        icon: (
                                          <MaterialIcon name="open_in_new" />
                                        ),
                                        label: "新对话重问",
                                      },
                                    ],
                                  }}
                                >
                                  <UiButton
                                    className="timeline-meta-btn"
                                    variant="ghost"
                                    size="sm"
                                    iconOnly
                                    disabled={state.streaming}
                                    title="重问"
                                    aria-label="重问"
                                  >
                                    <MaterialIcon name="refresh" />
                                  </UiButton>
                                </Dropdown>
                              </div>
                              {queryTime.short && (
                                <div
                                  className="timeline-row-time"
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
                      item.responseDurationMs,
                    );
                    const runCopyKey = `${item.key}:copy`;
                    const runId = String(item.runId || "").trim();
                    const isDownvoted = Boolean(
                      runId && state.downvotedRunKeys.has(runId),
                    );
                    const runCopyStatus = actionStatus[runCopyKey] || "复制";
                    return (
                      <section key={item.key} className="timeline-run-group">
                        <div className="timeline-run-items">
                          {item.renderEntries.map((entry) =>
                            renderEntry(entry),
                          )}
                        </div>
                        {isCompleted && (
                          <div className="timeline-run-meta">
                            <div className="timeline-meta-actions">
                              <UiButton
                                className="timeline-meta-btn"
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
                                  className="timeline-meta-btn is-downvoted"
                                  variant="ghost"
                                  size="sm"
                                  iconOnly
                                  active
                                  title="取消点踩"
                                  aria-label="取消点踩"
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
                                    className="timeline-meta-btn"
                                    variant="ghost"
                                    size="sm"
                                    iconOnly
                                    title="点踩"
                                    aria-label="点踩"
                                    disabled={!runId}
                                  >
                                    <MaterialIcon name="thumb_down" />
                                  </UiButton>
                                </Popover>
                              )}
                            </div>
                            {time.short && (
                              <div
                                className="timeline-run-time"
                                title={
                                  responseDuration
                                    ? `${time.full} · 响应耗时 ${responseDuration}`
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

  return (
    <Form onFinish={onFinish} size="small" style={{ width: 320 }}>
      <strong>反馈（选填）</strong>
      <Form.Item name="reason" style={{ margin: "10px 0" }}>
        <Input.TextArea
          placeholder="我们想知道你对此回答不满意的原因，你认为更好的回答是什么？"
          rows={4}
        />
      </Form.Item>
      <Flex gap={10} justify="flex-end">
        <Button type="primary" htmlType="submit">
          提交
        </Button>
      </Flex>
    </Form>
  );
};
