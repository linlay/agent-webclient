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

  if (item.payload !== undefined) {
    const reason = String(item.reason || "").trim();
    const payloadText = item.payload == null
      ? ""
      : formatUnknownJson(item.payload);
    return {
      key: `${id}:form`,
      title,
      value: reason || payloadText || "（无回答内容）",
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

export const AwaitingAnswerBlock: React.FC<AwaitingAnswerBlockProps> = ({
  node,
}) => {
  const dispatch = useAppDispatch();
  const expanded = Boolean(node.expanded);
  const items = useMemo<AwaitingAnswerDisplayItem[]>(() => {
    try {
      const parsed = JSON.parse(node.text || "[]");
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === "object" && !Array.isArray(item),
        )
        .map(formatAwaitingAnswerItem);
    } catch (error) {
      console.error("Error parsing awaiting answers:", error);
    }
    return [];
  }, [node.text]);

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
        <span>
          已提交{" "}
          <span style={{ color: "var(--text-main)" }}>
            {items.length || 0}
          </span>{" "}
          项回答
        </span>
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
