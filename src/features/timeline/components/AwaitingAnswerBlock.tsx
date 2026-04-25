import React, { useMemo } from "react";
import type { TimelineNode } from "@/app/state/types";
import { useAppDispatch } from "@/app/state/AppContext";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { Flex } from "antd";

interface AwaitingAnswerBlockProps {
  node: TimelineNode;
}

interface AwaitingAnswerDisplayItem {
  key: string;
  title: string;
  value: string;
}

interface AwaitingAnswerEnvelope {
  status?: "answered" | "error";
  items?: Record<string, unknown>[];
  error?: {
    code?: string;
    message?: string;
  };
}

function formatUnknownJson(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatAwaitingAnswerItem(item: Record<string, unknown>): AwaitingAnswerDisplayItem {
  const id = String(item.id || "").trim();
  const question = String(item.question || "").trim();
  const title =
    question
    || String(item.title || "").trim()
    || String(item.command || "").trim()
    || String(item.action || "").trim()
    || id
    || "未命名项";

  if (typeof item.decision === "string" && item.decision.trim()) {
    const reason = String(item.reason || "").trim();
    return {
      key: `${id}:${item.decision}`,
      title,
      value: reason
        ? `${item.decision} · ${reason}`
        : item.decision,
    };
  }

  if (item.form !== undefined) {
    const formText = item.form == null
      ? ""
      : formatUnknownJson(item.form);
    return {
      key: `${id}:form`,
      title,
      value: formText || "（无回答内容）",
    };
  }

  if (typeof item.action === "string" && item.action.trim()) {
    return {
      key: `${id}:action`,
      title,
      value: item.action,
    };
  }

  if (item.answer !== undefined && item.answer !== null) {
    return {
      key: `${id}:answer`,
      title,
      value: String(item.answer),
    };
  }

  if (Array.isArray(item.answers)) {
    return {
      key: `${id}:answers`,
      title,
      value: item.answers.map((entry) => String(entry)).join(", ") || "（无回答内容）",
    };
  }

  if (typeof item.reason === "string" && item.reason.trim()) {
    return {
      key: `${id}:reason`,
      title,
      value: item.reason,
    };
  }

  return {
    key: id || title,
    title,
    value: "（无回答内容）",
  };
}

function parseAwaitingAnswerEnvelope(text: string): AwaitingAnswerEnvelope {
  try {
    const parsed = JSON.parse(text || "[]");
    if (Array.isArray(parsed)) {
      return {
        status: "answered",
        items: parsed.filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === "object" && !Array.isArray(item),
        ),
      };
    }
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    const record = parsed as Record<string, unknown>;
    const status = record.status === "answered" || record.status === "error"
      ? record.status
      : undefined;
    const items = Array.isArray(record.items)
      ? record.items.filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === "object" && !Array.isArray(item),
        )
      : undefined;
    const error = record.error && typeof record.error === "object" && !Array.isArray(record.error)
      ? record.error as AwaitingAnswerEnvelope["error"]
      : undefined;
    return {
      status,
      items,
      error,
    };
  } catch (error) {
    console.error("Error parsing awaiting answers:", error);
    return {};
  }
}

export const AwaitingAnswerBlock: React.FC<AwaitingAnswerBlockProps> = ({
  node,
}) => {
  const dispatch = useAppDispatch();
  const expanded = Boolean(node.expanded);
  const envelope = useMemo(() => parseAwaitingAnswerEnvelope(node.text || "[]"), [node.text]);
  const items = useMemo<AwaitingAnswerDisplayItem[]>(() => {
    if (envelope.status === "error") {
      const errorCode = String(envelope.error?.code || "").trim();
      const errorMessage = String(envelope.error?.message || "").trim();
      return [{
        key: `error:${errorCode || "unknown"}`,
        title: "状态",
        value: errorMessage || errorCode || "等待异常",
      }];
    }
    return (envelope.items || []).map(formatAwaitingAnswerItem);
  }, [envelope]);
  const summaryText = envelope.status === "error"
    ? (node.title || "等待异常")
    : `已提交 ${items.length || 0} 项回答`;

  return (
    <div>
      <UiButton
        className={`thinking-trigger ${expanded ? "is-open" : ""}`}
        variant="ghost"
        size="sm"
        onClick={() =>
          dispatch({
            type: "SET_TIMELINE_NODE",
            id: node.id,
            node: {
              ...node,
              expanded: !expanded,
            },
          })
        }
      >
        <span>{summaryText}</span>
        <MaterialIcon name="chevron_right" className="chevron" />
      </UiButton>
      <div className={`thinking-detail ${expanded ? "is-open" : ""}`}>
        <Flex vertical gap={10}>
          {items.map((item) => (
            <Flex vertical key={item.key} className="awaiting-answer-item">
              <div className="awaiting-answer-question">{item.title}</div>
              <div className="awaiting-answer-value">{item.value}</div>
            </Flex>
          ))}
        </Flex>
      </div>
    </div>
  );
};
