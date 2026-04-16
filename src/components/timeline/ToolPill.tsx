import React, { useEffect, useMemo, useRef, useState } from "react";
import type { TimelineNode } from "../../context/types";
import type { TimelineRenderEntry } from "../../lib/timelineDisplay";
import { MaterialIcon } from "../common/MaterialIcon";
import { UiButton } from "../ui/UiButton";
import { resolveToolLabel } from "../../lib/toolDisplay";

type ToolGroupRenderEntry = Extract<
  TimelineRenderEntry,
  { kind: "tool-group" }
>;

interface ToolPillProps {
  node?: TimelineNode;
  toolGroup?: ToolGroupRenderEntry;
}

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

function resolveStatusLabel(status?: string): string {
  const value = status || "pending";
  return value === "running"
    ? "运行中"
    : value === "streaming"
      ? "运行中"
      : value === "completed"
        ? "完成"
        : value === "failed" || value === "error"
          ? "失败"
          : value === "canceled"
            ? "已取消"
            : value === "pending"
              ? "等待中"
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

function formatToolResultText(result: TimelineNode["result"]): string {
  if (!result) return "";
  const text = result.text || "";
  return text.trim() ? text : "(no output)";
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
      title: `第 ${index + 1} 次`,
      status,
      statusLabel: resolveStatusLabel(status),
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
  const [expanded, setExpanded] = useState(false);
  const [copyStatus, setCopyStatus] = useState<Record<string, string>>({});
  const copyTimerRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    return () => {
      copyTimerRef.current.forEach((timer) => window.clearTimeout(timer));
      copyTimerRef.current.clear();
    };
  }, []);

  const source = toolGroup || node;
  if (!source) return null;

  const toolLabel = formatToolPillTitle(source);
  const records = buildToolPillRecords(source);
  const expandableRecords = getExpandableToolPillRecords(records);
  const canExpand = expandableRecords.length > 0;
  const isGrouped = Boolean(toolGroup && toolGroup.count > 1);
  const latestRecord = records[records.length - 1];
  const status = latestRecord?.status || "pending";

  const flashCopyStatus = (key: string, text: string) => {
    const existing = copyTimerRef.current.get(key);
    if (existing) {
      window.clearTimeout(existing);
    }
    setCopyStatus((current) => ({ ...current, [key]: text }));
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
      flashCopyStatus(key, "已复制");
    } catch {
      flashCopyStatus(key, "复制失败");
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
        {canExpand && <MaterialIcon name="chevron_right" className="chevron" />}
      </UiButton>

      <div className={`tool-detail ${canExpand && expanded ? "is-open" : ""}`}>
        {expandableRecords.map((record) => {
          const resultText = formatToolResultText(record.result);
          const resultCopyKey = `${record.key}:result`;
          const resultCopyLabel = copyStatus[resultCopyKey] || "复制";
          const resultCopyState =
            copyStatus[resultCopyKey] === "已复制"
              ? "copied"
              : copyStatus[resultCopyKey] === "复制失败"
                ? "error"
                : "idle";

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
                <UiButton
                  className="tool-call-copy"
                  variant="ghost"
                  size="sm"
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
                      resultCopyState === "copied" ? "check" : "content_copy"
                    }
                  />
                  {resultCopyLabel}
                </UiButton>
                <code className="tool-call-result">
                  <JsonToTable className="input" text={record.argsInlineText} />
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

const JsonToTable: React.FC<{ text: any; className?: string }> = ({
  text,
  className,
}) => {
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
                value.map((v, i) => <JsonToTable key={i} text={v} />)
              ) : (
                <JsonToTable text={value} />
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  ) : (
    <span className={className}>{text || "空"}</span>
  );
};
