import React, { useEffect, useMemo, useRef, useState } from "react";
import type { TimelineNode } from "@/app/state/types";
import type { TimelineRenderEntry } from "@/features/timeline/lib/timelineDisplay";
import { resolveToolLabel } from "@/features/timeline/lib/toolDisplay";
import { t as runtimeT, useI18n } from "@/shared/i18n";
import type { TranslateParams } from "@/shared/i18n";
import { copyText } from "@/shared/utils/copy";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { Flex, Tooltip } from "antd";
import { useAppState } from "@/app/state/provider";

type ToolGroupRenderEntry = Extract<
  TimelineRenderEntry,
  { kind: "tool-group" }
>;

type TranslateFn = (key: string, params?: TranslateParams) => string;
type CopyState = "copied" | "error";

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
  if (!Number.isFinite(durationMs) || Number(durationMs) <= 0) {
    return "";
  }

  const value = Number(durationMs);
  if (value < 1000) {
    return "";
  }
  if (value < 60_000) {
    return translate("timeline.toolPill.duration.seconds", {
      count: (value / 1000).toFixed(value >= 10_000 ? 0 : 1),
    });
  }

  const totalSeconds = Math.round(value / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return translate("timeline.toolPill.duration.minutes", {
      minutes,
      seconds,
    });
  }

  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  return translate("timeline.toolPill.duration.hours", {
    hours,
    minutes: remainMinutes,
    seconds,
  });
}

export function getToolPillDurationText(
  source: TimelineNode | ToolGroupRenderEntry,
  options: {
    now?: number;
    streaming?: boolean;
    t?: TranslateFn;
  } = {},
): string {
  const nodes =
    "kind" in source && source.kind === "tool-group" ? source.nodes : [source];
  if (nodes.length === 0) {
    return "";
  }
  const hasMissingResult = nodes.some((item) => !item.result);
  if (hasMissingResult) {
    if (!options.streaming) {
      return "";
    }
    const now = Number(options.now ?? Date.now());
    if (!Number.isFinite(now)) {
      return "";
    }
    const startedAtValue = nodes.reduce(
      (prev, cur) => Math.min(prev, cur.startedAt || now),
      now,
    );
    return formatToolDuration(Math.max(0, now - startedAtValue), options.t);
  }
  if ("kind" in source && source.kind === "tool-group") {
    const startedAtValues = nodes.map((item) => Number(item.startedAt));
    const endedAtValues = nodes.map((item) => Number(item.endedAt));
    if (
      startedAtValues.some((value) => !Number.isFinite(value)) ||
      endedAtValues.some((value) => !Number.isFinite(value))
    ) {
      return "";
    }
    const startedAt = Math.min(...startedAtValues);
    return formatToolDuration(
      Math.max(0, Math.max(...endedAtValues) - startedAt),
      options.t,
    );
  }
  return formatToolDuration(nodes[0].durationMs, options.t);
}

export function formatToolPillTitle(
  source: TimelineNode | ToolGroupRenderEntry,
): string {
  if ("kind" in source && source.kind === "tool-group") {
    const baseLabel = resolveToolLabel({
      toolLabel: source.toolLabel,
      toolName: source.toolName,
    });
    return baseLabel;
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

export const ToolPill: React.FC<ToolPillProps> = ({ node, toolGroup }) => {
  const state = useAppState();
  const [expanded, setExpanded] = useState(false);
  const [copyStatus, setCopyStatus] = useState<Record<string, CopyState>>({});
  const [wrapMap, setWrapMap] = useState<Record<string, boolean>>({});
  const [nowMs, setNowMs] = useState(() => Date.now());
  const copyTimerRef = useRef<Map<string, number>>(new Map());
  const source = toolGroup || node;
  const { t } = useI18n();

  useEffect(() => {
    return () => {
      copyTimerRef.current.forEach((timer) => window.clearTimeout(timer));
      copyTimerRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!source || !state.streaming) return;
    const nodes =
      "kind" in source && source.kind === "tool-group"
        ? source.nodes
        : [source];
    if (nodes.length === 0 || nodes.every((item) => item.result)) return;

    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [state.streaming, source]);

  if (!source) return null;

  const toolLabel = formatToolPillTitle(source);
  const records = buildToolPillRecords(source, t);
  const expandableRecords = getExpandableToolPillRecords(records);
  const canExpand = expandableRecords.length > 0;
  const isGrouped = Boolean(toolGroup && toolGroup.count > 1);
  const latestRecord = records[records.length - 1];
  const status = latestRecord?.status || "pending";
  const durationText = useMemo(
    () =>
      getToolPillDurationText(source, {
        now: nowMs,
        streaming: state.streaming,
        t,
      }),
    [nowMs, state.streaming, source, t],
  );

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
    <div className="tool-call">
      <UiButton
        className={`tool-trigger ${canExpand && expanded ? "is-open" : ""}`}
        variant="ghost"
        size="sm"
        data-tool-status={status}
        data-expandable={canExpand ? "true" : "false"}
        aria-expanded={canExpand ? expanded : undefined}
        onClick={() => {
          if (!canExpand) return;
          setExpanded(!expanded);
        }}
      >
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
        {records?.some(
          (item) =>
            item.status === "running" ||
            item.status === "pending" ||
            item.status === "completed",
        ) &&
          durationText && (
            <span className="tool-pill-duration">{durationText}</span>
          )}
        {canExpand && <MaterialIcon name="chevron_right" className="chevron" />}
      </UiButton>

      <div className={`tool-detail ${canExpand && expanded ? "is-open" : ""}`}>
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
                <Flex className="tool-call-copy">
                  <Tooltip
                    title={
                      isWrap
                        ? t("timeline.toolPill.wrap.disable")
                        : t("timeline.toolPill.wrap.enable")
                    }
                  >
                    <UiButton
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
                  className="tool-call-result"
                  style={{ whiteSpace: isWrap ? "pre-wrap" : "nowrap" }}
                >
                  <JsonToTable
                    className="input"
                    text={record.argsInlineText}
                    emptyText={t("timeline.toolPill.empty")}
                  />
                  <span>{resultText}</span>
                </code>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const JsonToTable: React.FC<{
  text: any;
  className?: string;
  emptyText: string;
}> = ({ text, className, emptyText }) => {
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
                  <JsonToTable key={i} text={v} emptyText={emptyText} />
                ))
              ) : (
                <JsonToTable text={value} emptyText={emptyText} />
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
