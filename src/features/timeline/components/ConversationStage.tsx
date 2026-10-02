import React from "react";
import { Collapse, Flex } from "antd";
import { Virtuoso, type ListRange, type StateSnapshot, type VirtuosoHandle } from "react-virtuoso";
import type { Agent } from "@/features/agents/lib/agentState";
import type { TaskItemMeta } from "@/features/tasks/lib/tasksState";
import type { AgentSkill } from "@/shared/data/api/client";
import { useI18n } from "@/shared/i18n";
import { formatResponseDuration } from "@/shared/utils/formatResponseDuration";
import { SCROLLBAR_THIN_CLASS_NAME } from "@/shared/styles/scrollbarClassNames";
import { TimelineRow } from "./TimelineRow";
import { TimelineRenderEntryView } from "./TimelineRenderEntryView";
import { RunTerminalNotice } from "./RunTerminalNotice";
import { buildRunRenderEntries, type TimelineDisplayItem, type TimelineRenderEntry } from "../lib/timelineDisplay";
import { isImageGenerationTool } from "../lib/imageGenerationDisplay";
import "./Timeline.module.css";
import "./TimelineCompat.module.css";

export type ConversationListItem =
  | { kind: "query"; key: string; anchorId: string; item: Extract<TimelineDisplayItem, { kind: "query" }> }
  | { kind: "run"; key: string; item: Extract<TimelineDisplayItem, { kind: "run" }> }
  | { kind: "standalone"; key: string; item: Extract<TimelineDisplayItem, { kind: "standalone" }> };

export function toConversationListItems(items: readonly TimelineDisplayItem[]): ConversationListItem[] {
  return items.map((item) => item.kind === "query"
    ? { kind: "query", key: item.key, anchorId: `query-${item.node.id}`, item }
    : item.kind === "run"
      ? { kind: "run", key: item.key, item }
      : { kind: "standalone", key: item.key, item });
}

export interface ConversationStageProps {
  items: ConversationListItem[];
  agents: Agent[];
  skills?: readonly AgentSkill[];
  fallbackAgentKey?: string;
  tasks?: Map<string, TaskItemMeta>;
  expandedRuns: Record<string, boolean>;
  onToggleRun: (key: string) => void;
  expandedTasks: Record<string, boolean>;
  onToggleTask: (key: string) => void;
  queryMeta?: (item: Extract<TimelineDisplayItem, { kind: "query" }>) => React.ReactNode;
  runMeta?: (item: Extract<TimelineDisplayItem, { kind: "run" }>, duration: string) => React.ReactNode;
  runHeader?: (item: Extract<TimelineDisplayItem, { kind: "run" }>) => React.ReactNode;
  viewport?: {
    mode?: "container" | "document";
    scrollerId?: string;
    initialPosition?: "top" | "bottom";
    instanceKey?: string;
    ref?: React.Ref<VirtuosoHandle>;
    snapshot?: StateSnapshot;
    scrollerRef?: (element: HTMLElement | Window | null) => void;
    followOutput?: (atBottom: boolean) => "auto" | false;
    atBottomStateChange?: (atBottom: boolean) => void;
    rangeChanged?: (range: ListRange) => void;
    isScrolling?: (scrolling: boolean) => void;
    Footer?: React.ComponentType<{ context: unknown }>;
  };
}

const ConversationItem = ({ item, children, ...rest }: React.HTMLAttributes<HTMLDivElement> & { item: ConversationListItem }) =>
  <div {...rest} data-conversation-item-key={item.key}>{children}</div>;

export function ConversationStage({
  items, agents, skills, fallbackAgentKey, tasks, expandedRuns, onToggleRun,
  expandedTasks, onToggleTask, queryMeta, runMeta, runHeader, viewport,
}: ConversationStageProps): React.ReactElement {
  const { t } = useI18n();
  const renderEntry = (entry: TimelineRenderEntry) => <TimelineRenderEntryView
    key={entry.key} entry={entry} agents={agents} skills={skills}
    fallbackAgentKey={fallbackAgentKey} expandedTaskGroups={expandedTasks}
    onToggleTaskGroup={onToggleTask}
  />;
  return <Virtuoso
    key={viewport?.instanceKey}
    ref={viewport?.ref}
    data={items}
    computeItemKey={(_index, item) => item.key}
    useWindowScroll={viewport?.mode === "document"}
    initialTopMostItemIndex={viewport?.initialPosition === "bottom" ? { index: "LAST" } : undefined}
    restoreStateFrom={viewport?.snapshot}
    scrollerRef={viewport?.scrollerRef}
    increaseViewportBy={typeof window === "undefined" ? 0 : window.innerHeight}
    followOutput={viewport?.followOutput}
    atBottomThreshold={200}
    atBottomStateChange={viewport?.atBottomStateChange}
    rangeChanged={viewport?.rangeChanged}
    isScrolling={viewport?.isScrolling}
    className={viewport?.mode === "document" ? "conversation-stage-virtuoso" : `conversation-stage-virtuoso tw:h-full ${SCROLLBAR_THIN_CLASS_NAME}`}
    id={viewport?.scrollerId || "messages"}
    data-desktop-workspace-arrow-keys="allow"
    components={{ Footer: viewport?.Footer, Item: ConversationItem }}
    itemContent={(_index, listItem) => {
      if (listItem.kind === "query") return <div id={listItem.anchorId}
        className="timeline-query-anchor-row tw:relative"
        data-query-anchor-id={listItem.anchorId}>
        <TimelineRow node={listItem.item.node} skills={skills} metaNode={queryMeta?.(listItem.item)} />
      </div>;
      if (listItem.kind === "run") {
        const { item } = listItem;
        const duration = formatResponseDuration(item.responseDurationMs, t);
        const final = item.nodes[item.nodes.length - 1]?.kind === "content"
          ? item.nodes[item.nodes.length - 1] : null;
        const collapse = Boolean(item.completedAt)
          && item.nodes.length > 1
          && !item.nodes.some(isImageGenerationTool);
        return <Flex vertical gap={8} data-run-id={item.runId || undefined}>
          {runHeader?.(item)}
          {collapse && <Collapse ghost destroyOnHidden className="timeline-run-collapse"
            activeKey={expandedRuns[item.key] ? ["run-entries"] : []}
            onChange={() => onToggleRun(item.key)}
            items={[{ key: "run-entries", label: t("timeline.run.processed", { duration }), children:
              <div className="timeline-run-items tw:flex tw:flex-col tw:gap-[12px]">
                {buildRunRenderEntries(final ? item.nodes.slice(0, -1) : item.nodes, tasks).map(renderEntry)}
              </div> }]} />}
          <section className="timeline-run-group tw:relative tw:flex tw:flex-col tw:gap-2 tw:mt-[4px]">
            {collapse ? buildRunRenderEntries(final ? [final] : []).map(renderEntry)
              : <div className="timeline-run-items tw:flex tw:flex-col tw:gap-[12px]">{item.renderEntries.map(renderEntry)}</div>}
          </section>
          {!collapse && <RunTerminalNotice terminalType={item.terminalType} duration={duration} />}
          {item.completedAt && runMeta?.(item, duration)}
        </Flex>;
      }
      return renderEntry(listItem.item.renderEntry);
    }}
  />;
}
