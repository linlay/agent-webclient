import React, { useEffect, useMemo, useRef, useState } from "react";
import type { TimelineNode } from "@/app/state/types";
import type { TimelineRenderEntry } from "@/features/timeline/lib/timelineDisplay";
import { resolveToolLabel } from "@/features/timeline/lib/toolDisplay";
import { formatToolDuration as formatToolDurationFromLib } from "@/features/timeline/lib/timelineDuration";
import type { TranslateFn } from "@/features/timeline/lib/timelineDuration";
import { t as runtimeT, useI18n } from "@/shared/i18n";
import { copyText } from "@/shared/utils/copy";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { SCROLLBAR_THIN_CLASS_NAME } from "@/shared/styles/scrollbarClassNames";
import { Flex, Tooltip } from "antd";
import { useOptionalAppContext } from "@/app/state/provider";
import { resolveMainChatRuntime } from "@/features/runs/lib/runRuntimeState";
import { TimelineCollapse } from "./collapse";
import { useTimelineInteraction } from "./TimelineInteractionContext";

type ToolGroupRenderEntry = Extract<
  TimelineRenderEntry,
  { kind: "tool-group" }
>;

type CopyState = "copied" | "error";
const TOOL_CALL_RESULT_CLASS_NAME = [
  "tool-call-result",
  SCROLLBAR_THIN_CLASS_NAME,
].join(" ");
const TERMINAL_TOOL_STATUSES = new Set([
  "success",
  "failed",
  "error",
  "canceled",
]);

interface ToolPillProps {
  node?: TimelineNode;
  toolGroup?: ToolGroupRenderEntry;
}

export interface ToolPillRecord {
  key: string;
  title: string;
  status: string;
  statusLabel: string;
  hasDetails: boolean;
  description: string;
  argsText: string;
  argsInlineText: string;
  result: TimelineNode["result"];
  kbaseIndexSummary?: KbaseIndexSummary;
  durationMs?: number;
}

export type KbaseIndexSummaryKind =
  | "success"
  | "skipped"
  | "failed";

export interface KbaseIndexSummary {
  kind: KbaseIndexSummaryKind;
  messageKey:
    | "timeline.toolPill.kbase.success"
    | "timeline.toolPill.kbase.skipped"
    | "timeline.toolPill.kbase.failed";
}

interface ToolPillDurationOptions {
  now?: number;
  conversationActive?: boolean;
  translate?: TranslateFn;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseToolResultRecord(
  result: TimelineNode["result"],
): Record<string, unknown> | null {
  const text = String(result?.text || "").trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!isRecord(parsed)) return null;
    const candidates = [parsed, parsed.result, parsed.data];
    return (
      candidates.find(
        (candidate): candidate is Record<string, unknown> =>
          isRecord(candidate) && Array.isArray(candidate.hooks),
      ) || parsed
    );
  } catch {
    return null;
  }
}

export function resolveKbaseIndexSummary(
  node: TimelineNode,
): KbaseIndexSummary | null {
  const toolName = String(node.toolName || "")
    .trim()
    .toLowerCase();
  if (toolName !== "file_write" && toolName !== "file_edit") {
    return null;
  }
  const result = parseToolResultRecord(node.result);
  const hooks = Array.isArray(result?.hooks) ? result.hooks : [];
  let best: KbaseIndexSummary | null = null;
  const priority: Record<KbaseIndexSummaryKind, number> = {
    success: 1,
    skipped: 2,
    failed: 3,
  };
  for (const hook of hooks) {
    if (!isRecord(hook) || hook.name !== "kbase-index") continue;
    let candidate: KbaseIndexSummary | null = null;
    if (hook.status === "failed") {
      candidate = {
        kind: "failed",
        messageKey: "timeline.toolPill.kbase.failed",
      };
    } else if (
      hook.status === "skipped" &&
      hook.reason === "excluded_by_kbase_config"
    ) {
      candidate = {
        kind: "skipped",
        messageKey: "timeline.toolPill.kbase.skipped",
      };
    } else if (hook.status === "success") {
      candidate = {
        kind: "success",
        messageKey: "timeline.toolPill.kbase.success",
      };
    }
    if (
      candidate &&
      (!best || priority[candidate.kind] > priority[best.kind])
    ) {
      best = candidate;
    }
  }
  return best;
}

function isFinishedToolNode(node: TimelineNode): boolean {
  return (
    TERMINAL_TOOL_STATUSES.has(node.status || "") ||
    node.endedAt != null ||
    Boolean(node.result)
  );
}

function resolveStatusLabel(
  status?: string,
  translate: TranslateFn = runtimeT,
): string {
  const value = status || "pending";
  return value === "running"
    ? translate("timeline.toolPill.status.running")
    : value === "streaming"
      ? translate("timeline.toolPill.status.running")
      : value === "completed"
        ? translate("timeline.toolPill.status.completed")
        : value === "success"
          ? translate("timeline.toolPill.status.success")
          : value === "failed" || value === "error"
            ? translate("timeline.toolPill.status.failed")
            : value === "canceled"
              ? translate("timeline.toolPill.status.canceled")
              : value === "pending"
                ? translate("timeline.toolPill.status.pending")
                : value;
}

export function formatToolArgumentsInline(argsText: string): string {
  const trimmed = argsText.trim();
  if (!trimmed) return "";

  try {
    return JSON.stringify(JSON.parse(trimmed));
  } catch {
    return trimmed.replace(/\s+/g, " ");
  }
}

function formatToolResultText(
  result: TimelineNode["result"],
  translate: TranslateFn = runtimeT,
): string {
  if (!result) return "";
  const text = result.text || "";
  return text.trim() ? text : translate("timeline.toolPill.noOutput");
}

export function formatToolDuration(
  durationMs?: number,
  translate: TranslateFn = runtimeT,
): string {
  return formatToolDurationFromLib(durationMs, translate);
}

export function formatToolPillTitle(
  source: TimelineNode | ToolGroupRenderEntry,
  translate: TranslateFn = runtimeT,
): string {
  if ("kind" in source && source.kind === "tool-group") {
    const baseLabel = resolveToolLabel({
      toolLabel: source.toolLabel,
      toolName: source.toolName,
    });
    return translate("timeline.toolPill.groupTitle", {
      label: baseLabel,
      count: source.count,
    });
  }

  return resolveToolLabel(source);
}

export function buildToolPillRecords(
  source: TimelineNode | ToolGroupRenderEntry,
  translate: TranslateFn = runtimeT,
): ToolPillRecord[] {
  const nodes =
    "kind" in source && source.kind === "tool-group" ? source.nodes : [source];

  return nodes.map((node, index) => {
    const status = node.status || "pending";
    const argsText = node.argsText || "";
    const result = node.result || null;
    const kbaseIndexSummary = resolveKbaseIndexSummary(node);
    const hasDetails = Boolean(argsText.trim()) || Boolean(result);
    return {
      key: node.id,
      title: translate("timeline.toolPill.runTitle", { index: index + 1 }),
      status,
      statusLabel: resolveStatusLabel(status, translate),
      hasDetails,
      description: hasDetails ? node.description || "" : "",
      argsText,
      argsInlineText: formatToolArgumentsInline(argsText),
      result,
      ...(kbaseIndexSummary ? { kbaseIndexSummary } : {}),
      durationMs: node.durationMs,
    };
  });
}

export function getExpandableToolPillRecords(
  records: ToolPillRecord[],
): ToolPillRecord[] {
  return records.filter((record) => record.hasDetails);
}

export function canExpandToolPill(
  source: TimelineNode | ToolGroupRenderEntry,
): boolean {
  return getExpandableToolPillRecords(buildToolPillRecords(source)).length > 0;
}

export function getToolPillDurationText(
  source: TimelineNode | ToolGroupRenderEntry,
  options: ToolPillDurationOptions = {},
): string {
  if (!options.conversationActive) return "";

  const nodes =
    "kind" in source && source.kind === "tool-group" ? source.nodes : [source];
  if (nodes.length === 0 || nodes.every(isFinishedToolNode)) return "";

  let earliestStart: number | null = null;
  for (const node of nodes) {
    if (
      node.startedAt != null &&
      (earliestStart == null || node.startedAt < earliestStart)
    ) {
      earliestStart = node.startedAt;
    }
  }
  if (earliestStart == null) return "";

  return formatToolDuration(
    Math.max(0, (options.now ?? Date.now()) - earliestStart),
    options.translate,
  );
}

export const ToolPill: React.FC<ToolPillProps> = ({ node, toolGroup }) => {
  const [expanded, setExpanded] = useState(false);
  const [copyStatus, setCopyStatus] = useState<Record<string, CopyState>>({});
  const [wrapMap, setWrapMap] = useState<Record<string, boolean>>({});
  const copyTimerRef = useRef<Map<string, number>>(new Map());
  const source = toolGroup || node;
  const { t } = useI18n();
  const appContext = useOptionalAppContext();
  const interaction = useTimelineInteraction();
  const mainChatStreaming =
    interaction?.conversationActive ??
    (appContext
      ? resolveMainChatRuntime(
          appContext.stateRef,
          appContext.activeQuerySessionRequestIdRef,
          appContext.querySessionsRef,
        ).streaming
      : false);

  const { isLive, startTimeMs } = useMemo(() => {
    const nodes = toolGroup?.nodes || (node ? [node] : []);
    if (nodes.length === 0)
      return {
        isLive: false,
        startTimeMs: null,
      };

    let earliestStart: number | null = null;
    for (const n of nodes) {
      if (
        n.startedAt != null &&
        (earliestStart == null || n.startedAt < earliestStart)
      ) {
        earliestStart = n.startedAt;
      }
    }

    const allDone = nodes.every(isFinishedToolNode);

    if (allDone) {
      return {
        isLive: false,
        startTimeMs: null,
      };
    }

    if (mainChatStreaming && earliestStart != null) {
      return {
        isLive: true,
        startTimeMs: earliestStart,
      };
    }

    return { isLive: false, startTimeMs: null };
  }, [mainChatStreaming, node, toolGroup]);

  const [liveNow, setLiveNow] = useState(Date.now());

  useEffect(() => {
    if (!isLive) return;
    const timer = setInterval(() => setLiveNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isLive]);

  const displayDurationMs = useMemo(() => {
    if (!isLive || !startTimeMs) return 0;
    return Math.floor(Math.max(0, liveNow - startTimeMs) / 1000) * 1000;
  }, [isLive, startTimeMs, liveNow]);

  useEffect(() => {
    return () => {
      copyTimerRef.current.forEach((timer) => window.clearTimeout(timer));
      copyTimerRef.current.clear();
    };
  }, []);

  if (!source) return null;

  const toolLabel = formatToolPillTitle(source, t);
  const records = buildToolPillRecords(source, t);
  const expandableRecords = getExpandableToolPillRecords(records);
  const canExpand = expandableRecords.length > 0;
  const isGrouped = Boolean(toolGroup && toolGroup.count > 1);
  const latestRecord = records[records.length - 1];
  const status = latestRecord?.status || "pending";

  const flashCopyStatus = (key: string, state: CopyState) => {
    const existing = copyTimerRef.current.get(key);
    if (existing) {
      window.clearTimeout(existing);
    }
    setCopyStatus((current) => ({ ...current, [key]: state }));
    const timer = window.setTimeout(() => {
      setCopyStatus((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      copyTimerRef.current.delete(key);
    }, 1600);
    copyTimerRef.current.set(key, timer);
  };

  const handleCopyResult = async (key: string, text: string) => {
    try {
      await copyText(text);
      flashCopyStatus(key, "copied");
    } catch {
      flashCopyStatus(key, "error");
    }
  };

  return (
    <TimelineCollapse
      expanded={canExpand && expanded}
      onExpand={() => {
        if (!canExpand) return;
        setExpanded(!expanded);
      }}
      label={
        <Flex align="center" gap={6}>
          <span className="tool-pill-label" title={toolLabel}>
            {toolLabel}
          </span>
          {isGrouped ? (
            expandableRecords.map((record) => (
              <span
                key={record.key}
                className="tool-status-dot"
                data-tool-status={record.status}
              />
            ))
          ) : (
            <span className="tool-status-dot" data-tool-status={status} />
          )}
          <span className="tool-pill-duration">
            {displayDurationMs ? formatToolDuration(displayDurationMs, t) : ""}
          </span>
        </Flex>
      }
    >
      <Flex vertical gap={16}>
        {expandableRecords.map((record) => {
          const resultText = formatToolResultText(record.result, t);
          const resultCopyKey = `${record.key}:result`;
          const resultCopyState = copyStatus[resultCopyKey] || "idle";
          const resultCopyLabel =
            resultCopyState === "copied"
              ? t("timeline.toolPill.copy.copied")
              : resultCopyState === "error"
                ? t("timeline.toolPill.copy.failed")
                : t("timeline.toolPill.copy.action");
          const isWrap = wrapMap[record.key] || false;
          const kbaseSummaryClass =
            record.kbaseIndexSummary?.kind === "success"
              ? "tw:border-[color-mix(in_srgb,var(--accent-lime)_36%,var(--line-soft))] tw:bg-[color-mix(in_srgb,var(--accent-lime)_10%,transparent)] tw:text-[color-mix(in_srgb,var(--accent-lime)_72%,#194d35)]"
              : record.kbaseIndexSummary?.kind === "skipped"
                ? "tw:border-[color-mix(in_srgb,#e6a700_36%,var(--line-soft))] tw:bg-[color-mix(in_srgb,#e6a700_10%,transparent)] tw:text-[#7a5600]"
                : "tw:border-[color-mix(in_srgb,var(--accent-danger)_32%,var(--line-soft))] tw:bg-[color-mix(in_srgb,var(--accent-danger)_8%,transparent)] tw:text-[color-mix(in_srgb,var(--accent-danger)_78%,#56121c)]";

          return (
            <div
              key={record.key}
              className={`tool-call-card ${isGrouped ? "is-grouped" : ""}`}
              data-tool-status={record.status}
            >
              {isGrouped && (
                <div className="tool-call-head">
                  <span className="tool-call-title tool-call-meta">
                    {record.title}
                  </span>
                  <span className="tool-call-title tool-call-meta tool-call-meta-status">
                    {record.statusLabel}
                  </span>
                </div>
              )}

              <div className="tool-call-body">
                {record.kbaseIndexSummary ? (
                  <div
                    className={`kbase-index-summary tw:mb-2 tw:rounded-lg tw:border tw:px-2.5 tw:py-2 tw:text-[12px] tw:font-medium ${kbaseSummaryClass}`}
                    data-kbase-index-status={record.kbaseIndexSummary.kind}
                    role={
                      record.kbaseIndexSummary.kind === "success"
                        ? "status"
                        : "alert"
                    }
                  >
                    {t(record.kbaseIndexSummary.messageKey)}
                  </div>
                ) : null}
                <Flex className="tool-call-copy" align="center" gap={4}>
                  {!!record.durationMs && (
                    <span style={{ marginRight: 4 }}>
                      {formatToolDuration(record.durationMs, t)}
                    </span>
                  )}
                  <Tooltip
                    title={
                      isWrap
                        ? t("timeline.toolPill.wrap.disable")
                        : t("timeline.toolPill.wrap.enable")
                    }
                  >
                    <UiButton
                      className="ui-icon-hover-20"
                      variant="ghost"
                      size="sm"
                      iconOnly
                      onClick={() =>
                        setWrapMap((current) => ({
                          ...current,
                          [record.key]: !isWrap,
                        }))
                      }
                    >
                      <MaterialIcon
                        name={
                          isWrap ? "format_text_wrap" : "format_text_overflow"
                        }
                      />
                    </UiButton>
                  </Tooltip>
                  <Tooltip title={resultCopyLabel}>
                    <UiButton
                      className="ui-icon-hover-20"
                      variant="ghost"
                      size="sm"
                      iconOnly
                      data-copy-state={resultCopyState}
                      onClick={() => {
                        void handleCopyResult(
                          resultCopyKey,
                          record.argsInlineText + "\n\n" + resultText,
                        );
                      }}
                    >
                      <MaterialIcon
                        name={
                          resultCopyState === "copied"
                            ? "check"
                            : "content_copy"
                        }
                      />
                    </UiButton>
                  </Tooltip>
                </Flex>
                <code
                  className={TOOL_CALL_RESULT_CLASS_NAME}
                  style={{ whiteSpace: isWrap ? "pre-wrap" : "nowrap" }}
                >
                  <JsonToTable className="input" text={record.argsInlineText} />
                  <span>{resultText}</span>
                </code>
              </div>
            </div>
          );
        })}
      </Flex>
    </TimelineCollapse>
  );
};

const JsonToTable: React.FC<{
  text: any;
  className?: string;
  emptyText?: string;
}> = ({ text, className, emptyText }) => {
  const { t } = useI18n();
  const json = useMemo<Record<string, any>>(() => {
    if (typeof text === "object") return text;
    try {
      const obj = JSON.parse(text);
      return Object.keys(obj)?.length > 0 ? obj : null;
    } catch (error) {}
    return null;
  }, [text]);
  return json ? (
    <table className={className}>
      <tbody>
        {Object.entries(json).map(([key, value]) => (
          <tr key={key}>
            <td>{key}</td>
            <td>
              {Array.isArray(value) ? (
                value.map((v, i) => (
                  <JsonToTable
                    key={i}
                    text={v}
                    emptyText={t("timeline.toolPill.empty")}
                  />
                ))
              ) : (
                <JsonToTable
                  text={value}
                  emptyText={t("timeline.toolPill.empty")}
                />
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  ) : (
    <span className={className}>{text || emptyText}</span>
  );
};
