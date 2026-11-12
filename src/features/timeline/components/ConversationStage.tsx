import React from "react";
import { Collapse, Flex } from "antd";
import { Virtuoso, type ListRange, type StateSnapshot, type VirtuosoHandle } from "react-virtuoso";
import type { Agent } from "@/features/agents/lib/agentState";
import type { TaskItemMeta } from "@/features/tasks/lib/tasksState";
import type { AgentSkill } from "@/shared/data/api/dto/agents";
import { useI18n } from "@/shared/i18n";
import { formatResponseDuration } from "@/shared/utils/formatResponseDuration";
import { SCROLLBAR_THIN_CLASS_NAME } from "@/shared/styles/scrollbarClassNames";
import { TimelineRow } from "./TimelineRow";
import { TimelineRenderEntryView } from "./TimelineRenderEntryView";
import { RunTerminalNotice } from "./RunTerminalNotice";
import type { EventDetailLevel } from "@/shared/data/eventDetailLevel";
import { buildRunRenderEntries, type TimelineDisplayItem, type TimelineRenderEntry } from "../lib/timelineDisplay";
import { isImageGenerationTool } from "../lib/imageGenerationDisplay";
import { runPresentationSections } from "../lib/runPresentationSections";
import "./Timeline.module.css";

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

/** 未显式配置时的贴底容差，保持预览等其它 Surface 的既有行为。 */
const DEFAULT_AT_BOTTOM_THRESHOLD_PX = 100;

export interface ConversationStageProps {
  items: ConversationListItem[];
  agents: Agent[];
  skills?: readonly AgentSkill[];
  fallbackAgentKey?: string;
  tasks?: Map<string, TaskItemMeta>;
  keepUserInteractionsVisible?: boolean;
  expandedRuns: Record<string, boolean>;
  onToggleRun: (key: string) => void;
  expandedTasks: Record<string, boolean>;
  onToggleTask: (key: string) => void;
  /** 生效过程档位，仅用于展示：simple 不渲染节点图标与时间线竖线。 */
  detailLevel?: EventDetailLevel;
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
    totalListHeightChanged?: (height: number) => void;
    atBottomThreshold?: number;
    rangeChanged?: (range: ListRange) => void;
    isScrolling?: (scrolling: boolean) => void;
    Footer?: React.ComponentType<{ context: unknown }>;
  };
}

const ConversationItem = ({ item, children, ...rest }: React.HTMLAttributes<HTMLDivElement> & { item: ConversationListItem }) =>
  <div {...rest} data-conversation-item-key={item.key}>{children}</div>;

export function ConversationStage({
  items, agents, skills, fallbackAgentKey, tasks, expandedRuns, onToggleRun,
  expandedTasks, onToggleTask, detailLevel, queryMeta, runMeta, runHeader, viewport, keepUserInteractionsVisible = false,
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
    atBottomThreshold={
      viewport?.atBottomThreshold ?? DEFAULT_AT_BOTTOM_THRESHOLD_PX
    }
    atBottomStateChange={viewport?.atBottomStateChange}
    totalListHeightChanged={viewport?.totalListHeightChanged}
    rangeChanged={viewport?.rangeChanged}
    isScrolling={viewport?.isScrolling}
    className={viewport?.mode === "document" ? "conversation-stage-virtuoso" : `conversation-stage-virtuoso tw:h-full ${SCROLLBAR_THIN_CLASS_NAME}`}
    id={viewport?.scrollerId || "messages"}
    data-desktop-workspace-arrow-keys="allow"
    data-detail-level={detailLevel}
    components={{ Footer: viewport?.Footer, Item: ConversationItem }}
    itemContent={(_index, listItem) => {
      if (listItem.kind === "query") return <div id={listItem.anchorId}
        className="timeline-query-anchor-row tw:relative"
        data-query-anchor-id={listItem.anchorId}>
        <TimelineRow node={listItem.item.node} agents={agents} skills={skills} metaNode={queryMeta?.(listItem.item)} />
      </div>;
      if (listItem.kind === "run") {
        const { item } = listItem;
        const duration = formatResponseDuration(item.responseDurationMs, t);
        const lastNode = item.nodes[item.nodes.length - 1];
        const final = lastNode?.kind === "content"
          || (lastNode?.kind === "message" && lastNode.role === "system"
            && lastNode.systemMessageLevel === "error" && !lastNode.taskId)
          ? lastNode : null;
        // Inputs remain readable and asks remain actionable after the receiving
        // Run ends. Only execution details belong in the collapsed process.
        const persistent = item.nodes.filter(node => node === final ||
          (node.kind === "message" && node.role === "user" && !node.taskId));
        const persistentIds = new Set(persistent.map(node => node.id));
        const process = item.nodes.filter(node => !persistentIds.has(node.id));
        const collapse = Boolean(item.completedAt)
          && item.nodes.length > 1 && process.length > 0
          && !item.nodes.some(isImageGenerationTool);
        return <Flex vertical gap={8} data-run-id={item.runId || undefined} className="timeline-run-block tw:mb-4">
          {runHeader?.(item)}
          {keepUserInteractionsVisible ? runPresentationSections(item.nodes).map(section => {
            const key = `${item.key}:${section.key}`;
            // Submitted inputs must also stay outside task-group collapses.
            const entries: TimelineRenderEntry[] = section.process
              ? buildRunRenderEntries(section.nodes, tasks)
              : section.nodes.map(node => ({ kind: "node", key: `node_${node.id}`, node }));
            const content = <div className="timeline-run-items tw:flex tw:flex-col tw:gap-[12px]">{entries.map(renderEntry)}</div>;
            return section.process && item.completedAt && !section.nodes.some(isImageGenerationTool)
              ? <Collapse key={key} ghost destroyOnHidden className="timeline-run-collapse"
                  activeKey={expandedRuns[key] ? [key] : []} onChange={() => onToggleRun(key)}
                  items={[{ key, label: t("timeline.run.process"), children: content }]} />
              : <React.Fragment key={key}>{content}</React.Fragment>;
          }) : <>
            {collapse && <Collapse ghost destroyOnHidden className="timeline-run-collapse"
              activeKey={expandedRuns[item.key] ? ["run-entries"] : []}
              onChange={() => onToggleRun(item.key)}
              items={[{ key: "run-entries", label: t("timeline.run.processed", { duration }), children:
                <div className="timeline-run-items tw:flex tw:flex-col tw:gap-[12px]">
                  {buildRunRenderEntries(process, tasks).map(renderEntry)}
                </div> }]} />}
            <section className="timeline-run-group tw:relative tw:flex tw:flex-col tw:gap-2 tw:mt-[4px]">
              {collapse ? buildRunRenderEntries(persistent, tasks).map(renderEntry)
                : <div className="timeline-run-items tw:flex tw:flex-col tw:gap-[12px]">{item.renderEntries.map(renderEntry)}</div>}
            </section>
          </>}
          {(keepUserInteractionsVisible || !collapse) && <RunTerminalNotice terminalType={item.terminalType} duration={duration} />}
          {item.completedAt ? runMeta?.(item, duration) : null}
        </Flex>;
      }
      return renderEntry(listItem.item.renderEntry);
    }}
  />;
}
