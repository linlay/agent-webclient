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
import { buildTimelineDisplayItems } from "@/features/timeline/lib/timelineDisplay";
import { serializeRunTranscript } from "@/features/timeline/lib/runTranscript";
import { UiButton } from "@/shared/ui/UiButton";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) {
    throw new Error("copy failed");
  }
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

export const ConversationStage: React.FC = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollEnabledRef = useRef(true);
  const statusTimerRef = useRef<Map<string, number>>(new Map());
  const [actionStatus, setActionStatus] = useState<Record<string, string>>({});

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
    return buildTimelineDisplayItems(timelineEntries, state.events);
  }, [timelineEntries, state.events]);

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

  const handleResend = useCallback(
    (text: string) => {
      if (state.streaming || !text.trim()) return;
      window.dispatchEvent(
        new CustomEvent("agent:send-message", { detail: { message: text } }),
      );
    },
    [state.streaming],
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
          className={`timeline-stack ${displayItems.length === 0 ? "is-empty" : ""}`}
        >
          {displayItems.length === 0 ? (
            <div className="timeline-empty">新建聊天</div>
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
                            <UiButton
                              className="timeline-meta-btn"
                              variant="ghost"
                              size="sm"
                              iconOnly
                              disabled={state.streaming}
                              title="重问"
                              aria-label="重问"
                              onClick={() => handleResend(item.node.text || "")}
                            >
                              <MaterialIcon name="refresh" />
                            </UiButton>
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
                  const isDownvoted = state.downvotedRunKeys.has(item.key);
                  const runCopyStatus = actionStatus[runCopyKey] || "复制";
                  return (
                    <section key={item.key} className="timeline-run-group">
                      <div className="timeline-run-items">
                        {item.renderEntries.map((entry) =>
                          entry.kind === "node" ? (
                            <TimelineRow key={entry.key} node={entry.node} />
                          ) : (
                            <TimelineRow key={entry.key} toolGroup={entry} />
                          ),
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
                            <UiButton
                              className={`timeline-meta-btn ${isDownvoted ? "is-downvoted" : ""}`}
                              variant="ghost"
                              size="sm"
                              iconOnly
                              active={isDownvoted}
                              title={isDownvoted ? "取消点踩" : "点踩"}
                              aria-label={isDownvoted ? "取消点踩" : "点踩"}
                              onClick={() =>
                                dispatch({
                                  type: "TOGGLE_RUN_DOWNVOTE",
                                  runKey: item.key,
                                })
                              }
                            >
                              <MaterialIcon name="thumb_down" />
                            </UiButton>
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

                return <TimelineRow key={item.key} node={item.node} />;
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
