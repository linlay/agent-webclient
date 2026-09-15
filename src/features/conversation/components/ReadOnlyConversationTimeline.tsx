import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import type { Agent } from "@/features/agents/lib/agentState";
import type { TimelineNode, TimelineSource } from "@/features/timeline/lib/timelineState";
import type { ChatDetailResponse } from "@/shared/data";
import type { ChatReplayProjection } from "@/features/conversation/lib/chatReplayProjection";
import {
  buildTimelineDisplayItems,
  type TimelineDisplayItem,
} from "@/features/timeline/lib/timelineDisplay";
import {
  TimelineRow,
  formatTimelineTime,
} from "@/features/timeline/components/TimelineRow";
import { TimelineRenderEntryView } from "@/features/timeline/components/TimelineRenderEntryView";
import {
  TimelineInteractionProvider,
  type TimelineInteractionValue,
} from "@/features/timeline/components/TimelineInteractionContext";
import { RunTerminalNotice } from "@/features/timeline/components/RunTerminalNotice";
import { formatResponseDuration } from "@/shared/utils/formatResponseDuration";
import { useOpenTarget } from "@/features/surfaces/openTarget";
import { useI18n } from "@/shared/i18n";
import styles from "./ReadOnlyConversationTimeline.module.css";

export interface ReadOnlyConversationTimelineProps {
  chat: ChatDetailResponse;
  projection: ChatReplayProjection;
  agents: Agent[];
  agentKey?: string;
  teamChat?: boolean;
  startAtBottom?: boolean;
  ariaLabel?: string;
  emptyLabel?: string;
}

export const ReadOnlyConversationTimeline: React.FC<
  ReadOnlyConversationTimelineProps
> = ({
  chat,
  projection,
  agents,
  agentKey = "",
  teamChat = false,
  startAtBottom = false,
  ariaLabel,
  emptyLabel,
}) => {
  const { locale, t } = useI18n();
  const openTarget = useOpenTarget();
  const virtuoso = useRef<VirtuosoHandle>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [expandedNodeIds, setExpandedNodeIds] = useState<Map<string, boolean>>(
    () => new Map(),
  );
  const [expandedTaskGroups, setExpandedTaskGroups] = useState<
    Record<string, boolean>
  >({});
  const chatId = String(chat.chatId || projection.state.chatId || "").trim();
  const activeRunId = String(chat.activeRun?.runId || "").trim();

  useEffect(() => {
    setAtBottom(true);
    setExpandedNodeIds(new Map());
    setExpandedTaskGroups({});
  }, [chatId]);

  const timelineEntries = useMemo(
    () =>
      projection.state.timelineOrder
        .map((id) => {
          const node = projection.state.timelineNodes.get(id);
          if (!node || !expandedNodeIds.has(id)) return node;
          return { ...node, expanded: expandedNodeIds.get(id) };
        })
        .filter((node): node is TimelineNode => Boolean(node)),
    [expandedNodeIds, projection],
  );
  const displayItems = useMemo(
    () =>
      buildTimelineDisplayItems(
        timelineEntries,
        projection.state.events,
        projection.state.taskItemsById,
        { hasActiveRun: Boolean(activeRunId) },
      ),
    [activeRunId, projection, timelineEntries],
  );
  useEffect(() => {
    if (!startAtBottom || !atBottom) return;
    const frame = requestAnimationFrame(() => virtuoso.current?.autoscrollToBottom());
    return () => cancelAnimationFrame(frame);
  }, [projection, startAtBottom, atBottom]);

  const patchNode = useCallback((node: TimelineNode) => {
    setExpandedNodeIds((current) => {
      const next = new Map(current);
      next.set(node.id, Boolean(node.expanded));
      return next;
    });
  }, []);

  const openSource = useCallback(
    (source: TimelineSource, node?: TimelineNode) => {
      const publishId = String(node?.sourcePublishId || "").trim();
      if (!publishId) return;
      openTarget({
        version: 1,
        kind: "source",
        chatId,
        publishId,
        sourceId: source.id,
        source,
        title: source.title || source.name,
      });
    },
    [chatId, openTarget],
  );

  const interaction = useMemo<TimelineInteractionValue>(
    () => ({
      conversationActive: false,
      readOnly: true,
      surfaceContext: {
        chatId,
        agentKey: String(agentKey || "").trim() || undefined,
        teamChat,
      },
      patchNode,
      openSource,
    }),
    [agentKey, chatId, openSource, patchNode, teamChat],
  );

  const toggleTaskGroup = useCallback((key: string) => {
    setExpandedTaskGroups((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }, []);

  const renderEntry = useCallback(
    (
      entry: Extract<
        TimelineDisplayItem,
        { kind: "run" }
      >["renderEntries"][number],
    ) => (
      <TimelineRenderEntryView
        key={entry.key}
        entry={entry}
        agents={agents}
        fallbackAgentKey={agentKey}
        expandedTaskGroups={expandedTaskGroups}
        onToggleTaskGroup={toggleTaskGroup}
      />
    ),
    [agentKey, agents, expandedTaskGroups, toggleTaskGroup],
  );

  if (displayItems.length === 0) {
    return (
      <div className={styles.empty} role="status">
        {emptyLabel || t("automationHistory.chat.empty")}
      </div>
    );
  }

  return (
    <TimelineInteractionProvider value={interaction}>
      <div
        className={styles.root}
        role="region"
        aria-label={ariaLabel || t("automationHistory.panel.chat")}
      >
        <Virtuoso
          ref={startAtBottom ? virtuoso : undefined}
          initialTopMostItemIndex={startAtBottom ? { index: "LAST", align: "end" } : undefined}
          followOutput={startAtBottom ? "auto" : false}
          atBottomStateChange={startAtBottom ? setAtBottom : undefined}
          className={styles.virtuoso}
          data={displayItems}
          computeItemKey={(_index, item) => item.key}
          increaseViewportBy={400}
          itemContent={(_index, item) => {
            if (item.kind === "query") {
              return (
                <div className={styles.item}>
                  <TimelineRow node={item.node} showTime />
                </div>
              );
            }

            if (item.kind === "run") {
              const duration = formatResponseDuration(
                item.responseDurationMs,
                t,
              );
              const time = formatTimelineTime(item.completedAt, locale, {
                today: t("timeline.time.today"),
                yesterday: t("timeline.time.yesterday"),
              });
              return (
                <div className={styles.item}>
                  <section
                    className={styles.run}
                    data-run-id={item.runId || undefined}
                  >
                    <div className={styles.runEntries}>
                      {item.renderEntries.map(renderEntry)}
                    </div>
                    {item.terminalType ? (
                      <RunTerminalNotice
                        terminalType={item.terminalType}
                        duration={duration}
                      />
                    ) : null}
                    {time.short ? (
                      <div className={styles.runMeta}>
                        <time title={time.full}>
                          {time.short}{duration ? ` · ${duration}` : ""}
                        </time>
                      </div>
                    ) : null}
                  </section>
                </div>
              );
            }

            return (
              <div className={styles.item}>
                <TimelineRenderEntryView
                  entry={item.renderEntry}
                  agents={agents}
                  fallbackAgentKey={agentKey}
                  expandedTaskGroups={expandedTaskGroups}
                  onToggleTaskGroup={toggleTaskGroup}
                />
              </div>
            );
          }}
        />
        {startAtBottom && !atBottom && <button type="button" className={styles.latest}
          onClick={() => virtuoso.current?.scrollToIndex({ index: "LAST", align: "end", behavior: "auto" })}>
          {t("chatPreview.latest")}
        </button>}
      </div>
    </TimelineInteractionProvider>
  );
};
