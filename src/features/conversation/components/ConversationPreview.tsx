import { bindCssModuleClasses } from "@/shared/utils/cssModuleClasses";
import timelinePresentation from "@/features/timeline/components/TimelinePresentation.module.css";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { VirtuosoHandle } from "react-virtuoso";
import type { Agent } from "@/features/agents/lib/agentState";
import type { TimelineNode, TimelineSource } from "@/features/timeline/lib/timelineState";
import type { TaskItemMeta } from "@/features/tasks/lib/tasksState";
import {
  buildTimelineDisplayItemsFromTerminals,
  type RunTerminalInfo,
  type TimelineDisplayItem,
} from "@/features/timeline/lib/timelineDisplay";
import { ConversationStage, toConversationListItems } from "@/features/timeline/components/ConversationStage";
import { formatTimelineTime } from "@/features/timeline/components/TimelineRow";
import { TimelineInteractionProvider, type TimelineInteractionValue } from "@/features/timeline/components/TimelineInteractionContext";
import { serializeRunTranscript } from "@/features/timeline/lib/runTranscript";
import { copyWebText } from "@/shared/utils/webClipboard";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { useI18n } from "@/shared/i18n";
import type { MarkdownContentProps } from "@/features/viewers/components/MarkdownContent";
import styles from "./ConversationPreview.module.css";
const presentationClasses = bindCssModuleClasses({ ...timelinePresentation });


export interface ConversationPreviewProps {
  data: {
    chatId: string;
    nodes: readonly TimelineNode[];
    terminals: readonly RunTerminalInfo[];
    tasks: Map<string, TaskItemMeta>;
    hasActiveRun?: boolean;
    capturedAt?: number;
  };
  agents: Agent[];
  agentKey?: string;
  teamChat?: boolean;
  startAtBottom?: boolean;
  ariaLabel?: string;
  emptyLabel?: string;
  renderMarkdown?: (props: MarkdownContentProps) => React.ReactNode;
  renderAttachment?: TimelineInteractionValue["renderAttachment"];
  openTarget?: TimelineInteractionValue["openTarget"];
  copyText?: TimelineInteractionValue["copyText"];
  getChatHref?: TimelineInteractionValue["getChatHref"];
  onCopyResult?: TimelineInteractionValue["onCopyResult"];
  viewportMode?: "container" | "document";
  renderRunHeader?: (item: Extract<TimelineDisplayItem, { kind: "run" }>) => React.ReactNode;
}

export const ConversationPreview: React.FC<ConversationPreviewProps> = ({
  data, agents, agentKey = "", teamChat = false,
  startAtBottom = false, ariaLabel, emptyLabel, renderMarkdown, renderAttachment,
  openTarget, getChatHref, copyText = copyWebText, onCopyResult, viewportMode = "container", renderRunHeader,
}) => {
  const { t } = useI18n();
  const scrollerId = React.useId();
  const virtuoso = useRef<VirtuosoHandle>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [expandedNodeIds, setExpandedNodeIds] = useState<Map<string, boolean>>(() => new Map());
  const [expandedRuns, setExpandedRuns] = useState<Record<string, boolean>>({});
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});
  const chatId = data.chatId.trim();
  const copyGeneration = useRef(0);

  useEffect(() => {
    setAtBottom(true);
    setExpandedNodeIds(new Map());
    setExpandedRuns({});
    setExpandedTasks({});
    return () => { copyGeneration.current += 1; };
  }, [chatId]);

  const nodes = useMemo(() => data.nodes.map((node) => expandedNodeIds.has(node.id)
    ? { ...node, expanded: expandedNodeIds.get(node.id) } : node), [data.nodes, expandedNodeIds]);
  const displayItems = useMemo(() => buildTimelineDisplayItemsFromTerminals(
    nodes, data.terminals, data.tasks, { hasActiveRun: data.hasActiveRun },
  ), [data.hasActiveRun, data.tasks, data.terminals, nodes]);
  const items = useMemo(() => toConversationListItems(displayItems), [displayItems]);

  useEffect(() => {
    if (!startAtBottom || !atBottom) return;
    const frame = requestAnimationFrame(() => virtuoso.current?.autoscrollToBottom());
    return () => cancelAnimationFrame(frame);
  }, [atBottom, data, startAtBottom]);

  const openSource = useCallback((source: TimelineSource, node?: TimelineNode) => {
    const publishId = String(node?.sourcePublishId || "").trim();
    if (!publishId) return;
    openTarget?.({ version: 1, kind: "source", chatId, publishId, sourceId: source.id,
      source, title: source.title || source.name });
  }, [chatId, openTarget]);
  const interaction = useMemo<TimelineInteractionValue>(() => ({
    conversationActive: false, readOnly: true, copyText, onCopyResult, getChatHref, capturedAt: data.capturedAt,
    surfaceContext: { chatId, agentKey: agentKey || undefined, teamChat },
    openSource: openTarget ? openSource : undefined, openTarget, renderMarkdown, renderAttachment,
    getRunStatus: (node) => ({ active: false, terminal: data.terminals.find((item) => item.runId === node.runId)?.type }),
    setExpanded: (nodeId, expanded) => setExpandedNodeIds((current) => {
      const next = new Map(current);
      next.set(nodeId, expanded);
      return next;
    }),
  }), [agentKey, chatId, copyText, onCopyResult, getChatHref, data.capturedAt, data.terminals, openSource, openTarget, renderAttachment, renderMarkdown, teamChat]);
  const copy = useCallback(async (text: string) => {
    const generation = copyGeneration.current;
    try {
      await copyText(text);
      if (generation === copyGeneration.current) onCopyResult?.(true);
    } catch {
      if (generation === copyGeneration.current) onCopyResult?.(false);
    }
  }, [copyText, onCopyResult]);

  if (displayItems.length === 0) return <div className={styles.empty} role="status">
    {emptyLabel || t("automationHistory.chat.empty")}
  </div>;

  const queryMeta = (item: Extract<TimelineDisplayItem, { kind: "query" }>) => {
    const time = formatTimelineTime(item.node.ts);
    return <div className="timeline-meta-row tw:flex tw:min-w-0 tw:flex-nowrap tw:items-center tw:gap-3">
      <UiButton variant="ghost" size="sm" iconOnly title={t("timeline.toolPill.copy.action")}
        aria-label={t("timeline.toolPill.copy.action")}
        onClick={() => void copy(item.node.text || "")}><MaterialIcon name="content_copy" /></UiButton>
      {time.short && <div className={presentationClasses("timeline-row-time tw:ml-auto tw:shrink-0 tw:pl-2 tw:text-[12px] tw:leading-none tw:text-ink-muted")} title={time.full}>{time.short}</div>}
    </div>;
  };
  const runMeta = (item: Extract<TimelineDisplayItem, { kind: "run" }>, duration: string) => {
    const time = formatTimelineTime(item.completedAt);
    return <div className="timeline-run-meta tw:flex tw:min-w-0 tw:flex-nowrap tw:items-center tw:gap-3 tw:mt-[4px]">
      {item.terminalType === "run.complete" && duration && <MaterialIcon name="stop_circle" aria-hidden="true" className="tw:text-ink-muted" />}
      {time.short && <div className="timeline-run-time tw:text-[12px] tw:text-ink-muted" title={time.full}>{time.short}</div>}
      {item.terminalType === "run.complete" && duration && <span className="timeline-run-duration tw:text-xs tw:text-ink-muted" title={t("timeline.run.responseDuration", { duration })}>{duration}</span>}
      <div className="timeline-meta-actions tw:ml-auto">
        <UiButton variant="ghost" size="sm" iconOnly title={t("timeline.toolPill.copy.action")}
          aria-label={t("timeline.toolPill.copy.action")}
          onClick={() => void copy(serializeRunTranscript(item.queryNode, item.nodes))}>
          <MaterialIcon name="content_copy" />
        </UiButton>
      </div>
    </div>;
  };

  return <TimelineInteractionProvider value={interaction}>
    <div className={viewportMode === "document" ? styles.document : styles.root} role="region" aria-label={ariaLabel || t("automationHistory.panel.chat")}>
      <ConversationStage items={items} agents={agents} fallbackAgentKey={agentKey}
        tasks={data.tasks}
        expandedRuns={expandedRuns}
        onToggleRun={(key) => setExpandedRuns((current) => ({ ...current, [key]: !current[key] }))}
        expandedTasks={expandedTasks}
        onToggleTask={(key) => setExpandedTasks((current) => ({ ...current, [key]: !current[key] }))}
        queryMeta={viewportMode === "document" ? undefined : queryMeta}
        runMeta={viewportMode === "document" ? undefined : runMeta}
        runHeader={renderRunHeader}
        viewport={{ ref: virtuoso, scrollerId, instanceKey: chatId || scrollerId,
          mode: viewportMode, initialPosition: startAtBottom ? "bottom" : "top",
          followOutput: startAtBottom ? (bottom) => bottom ? "auto" : false : undefined,
          atBottomStateChange: startAtBottom ? setAtBottom : undefined }} />
      {startAtBottom && !atBottom && <button type="button" className={styles.latest}
        onClick={() => virtuoso.current?.scrollToIndex({ index: "LAST", align: "end", behavior: "auto" })}>
        {t("chatPreview.latest")}
      </button>}
    </div>
  </TimelineInteractionProvider>;
};
