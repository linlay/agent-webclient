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
  type TimelineRenderEntry,
} from "@/features/timeline/lib/timelineDisplay";
import { serializeRunTranscript } from "@/features/timeline/lib/runTranscript";
import { copyText } from "@/shared/utils/copy";
import { UiButton } from "@/shared/ui/UiButton";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { resolveCurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import { submitFeedback } from "@/features/transport/lib/apiClientProxy";
import { AgentIcon } from "@/shared/icons/agent";
import { useI18n } from "@/shared/i18n";
import { Button, Dropdown, Flex, Form, Input, message, Popover } from "antd";
import type { Agent } from "@/app/state/types";

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
  const autoScrollEnabledRef = useRef(true);
  const statusTimerRef = useRef<Map<string, number>>(new Map());
  const [actionStatus, setActionStatus] = useState<Record<string, string>>({});
  const [expandedTaskGroups, setExpandedTaskGroups] = useState<
    Record<string, boolean>
  >({});
  const currentWorker = resolveCurrentWorkerSummary(state);

  const isNearBottom = (el: HTMLDivElement, threshold = 24): boolean => {
    return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
  };

  const scrollToBottom = (behavior: ScrollBehavior = "auto") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  };

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
    [currentWorker, expandedTaskGroups, state.agents, toggleTaskGroup],
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
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="conversation-stage">
      <div className="messages-scroll" ref={scrollRef} id="messages">
        <div
          className={`timeline-stack ${displayItems.length === 0 && showEmptyState ? "is-empty" : ""}`}
        >
          {displayItems.length === 0 ? (
            showEmptyState ? (
              <div className="timeline-empty">
                {currentWorker?.displayName
                  ? t("timeline.empty.withWorker", {
                      name: currentWorker.displayName,
                    })
                  : t("timeline.empty.default")}
              </div>
            ) : null
          ) : (
            <div className="timeline-lane">
              {displayItems.map((item) => {
                if (item.kind === "query") {
                  const queryTime = formatTimelineTime(item.node.ts);
                  const queryCopyKey = `${item.key}:copy`;
                  const queryCopyStatus = actionStatus[queryCopyKey] || "复制";
                  return (
                    <TimelineRow
                      key={item.key}
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
                                    icon: <MaterialIcon name="refresh" />,
                                    label: "重问",
                                  },
                                  {
                                    key: "resendInNewChat",
                                    icon: <MaterialIcon name="open_in_new" />,
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
                        {item.renderEntries.map((entry) => renderEntry(entry))}
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
                              {responseDuration ? ` · ${responseDuration}` : ""}
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
