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
import { buildDocumentRunSections } from "../lib/runPresentationSections";
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
  expandedRuns: Record<string, boolean>;
  onToggleRun: (key: string) => void;
  expandedTasks: Record<string, boolean>;
  onToggleTask: (key: string) => void;
  /** 生效过程档位，仅用于展示：simple 不渲染节点图标与时间线竖线。 */
  detailLevel?: EventDetailLevel;
  /** 主对话舞台：舞台整块作为 Agent 头像的指针跟随范围；预览、导出等复用方不开启。 */
  pointerSurface?: boolean;
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
    /**
     * 传 `false` 会连 react-virtuoso 内部的“条目长高就贴底”一起关掉；
     * 局部展开期间必须用它，返回 false 的函数挡不住那条内部路径。
     */
    followOutput?: false | ((atBottom: boolean) => "auto" | false);
    atBottomStateChange?: (atBottom: boolean) => void;
    totalListHeightChanged?: (height: number) => void;
    atBottomThreshold?: number;
    rangeChanged?: (range: ListRange) => void;
    isScrolling?: (scrolling: boolean) => void;
    Footer?: React.ComponentType<{ context: unknown }>;
  };
}

// Virtuoso 用条目的 offsetHeight 计算高度与偏移，条目根节点及其子节点的 margin
// 若塌陷到条目框之外就不计入；滚到底后再按 scrollToIndex(LAST, end) 贴底会停在
// 真实底部之上，表现为“滚到底又往上跳一点”。用 flow-root 让条目自成 BFC，
// 把内容 margin 收进条目自身的盒子。见 Timeline.module.css。
const CONVERSATION_ITEM_CLASS_NAME = "conversation-stage-item";
const ConversationItem = ({ item, children, ...rest }: React.HTMLAttributes<HTMLDivElement> & { item: ConversationListItem }) =>
  <div {...rest} className={CONVERSATION_ITEM_CLASS_NAME} data-conversation-item-key={item.key}>{children}</div>;

export function ConversationStage({
  items, agents, skills, fallbackAgentKey, tasks, expandedRuns, onToggleRun,
  expandedTasks, onToggleTask, detailLevel, queryMeta, runMeta, runHeader, viewport,
  pointerSurface = false,
}: ConversationStageProps): React.ReactElement {
  const { t } = useI18n();
  const renderEntry = (entry: TimelineRenderEntry) => <TimelineRenderEntryView
    key={entry.key} entry={entry} agents={agents} skills={skills}
    fallbackAgentKey={fallbackAgentKey} expandedTaskGroups={expandedTasks}
    onToggleTaskGroup={onToggleTask}
  />;
  const renderItem =
    (_index: number, listItem: ConversationListItem) => {
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
        const documentSections = viewport?.mode === "document" ? buildDocumentRunSections(item.nodes, tasks) : undefined;
        const lastProcessSection = documentSections?.findLastIndex(section => section.hasProcess) ?? -1;
        const expanded = Boolean(expandedRuns[item.key]);
        const collapse = Boolean(item.completedAt) && (documentSections
          ? lastProcessSection >= 0
          : item.nodes.length > 1 && process.length > 0 && !item.nodes.some(isImageGenerationTool));
        // Keep trailing results mounted and interleave earlier results with the unfolded process.
        const processEntries = documentSections
          ? documentSections.slice(0, lastProcessSection + 1).flatMap(section => expanded
            ? section.entries
            : section.entries.filter(entry => !section.collapsedEntries.some(result => result.key === entry.key)))
          : collapse ? buildRunRenderEntries(process, tasks) : [];
        const visibleEntries = documentSections
          ? (collapse && expanded ? documentSections.slice(lastProcessSection + 1) : documentSections)
              .flatMap(section => collapse && !expanded ? section.collapsedEntries : section.entries)
          : collapse ? buildRunRenderEntries(persistent, tasks) : item.renderEntries;
        return <Flex vertical gap={8} data-run-id={item.runId || undefined} className="timeline-run-block tw:mb-4">
          {runHeader?.(item)}
          {collapse && <Collapse ghost destroyOnHidden className="timeline-run-collapse"
            activeKey={expanded ? ["run-entries"] : []}
            onChange={() => onToggleRun(item.key)}
            items={[{
              key: "run-entries",
              label: documentSections && !duration ? t("timeline.run.process") : t("timeline.run.processed", { duration }),
              children: <div className="timeline-run-items tw:flex tw:flex-col tw:gap-[12px]">
                {processEntries.map(renderEntry)}
              </div>,
            }]} />}
          {documentSections
            ? <div className="timeline-run-items tw:flex tw:flex-col tw:gap-[12px]">{visibleEntries.map(renderEntry)}</div>
            : <section className="timeline-run-group tw:relative tw:flex tw:flex-col tw:gap-2 tw:mt-[4px]">
              {collapse ? visibleEntries.map(renderEntry)
                : <div className="timeline-run-items tw:flex tw:flex-col tw:gap-[12px]">{visibleEntries.map(renderEntry)}</div>}
            </section>}
          {(documentSections || !collapse) && <RunTerminalNotice terminalType={item.terminalType} duration={duration} />}
          {item.completedAt ? runMeta?.(item, duration) : null}
        </Flex>;
      }
      return renderEntry(listItem.item.renderEntry);
    };
  if (viewport?.mode === "document") return <div>
    {items.map((item, index) => <ConversationItem key={item.key} item={item}>
      {renderItem(index, item)}
    </ConversationItem>)}
  </div>;
  return <Virtuoso
    key={viewport?.instanceKey}
    ref={viewport?.ref}
    data={items}
    computeItemKey={(_index, item) => item.key}
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
    className={`conversation-stage-virtuoso tw:h-full ${SCROLLBAR_THIN_CLASS_NAME}`}
    id={viewport?.scrollerId || "messages"}
    data-desktop-workspace-arrow-keys="allow"
    data-detail-level={detailLevel}
    // Agent avatars in the chat follow the pointer anywhere in the stage, not just their own row.
    data-agent-pointer-surface={pointerSurface ? "" : undefined}
    components={{ Footer: viewport?.Footer, Item: ConversationItem }}
    itemContent={renderItem}
  />;
}
