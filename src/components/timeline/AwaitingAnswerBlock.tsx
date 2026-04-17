import React, { useMemo } from "react";
import type { AIAwaitSubmitParamData, TimelineNode } from "../../context/types";
import { useAppDispatch } from "../../context/AppContext";
import { MaterialIcon } from "../common/MaterialIcon";
import { UiButton } from "../ui/UiButton";
import { Flex } from "antd";

interface AwaitingAnswerBlockProps {
  node: TimelineNode;
}

function formatAwaitingAnswerValue(item: AIAwaitSubmitParamData): string {
  if (item.answer !== undefined && item.answer !== null) {
    return String(item.answer);
  }
  if (Array.isArray(item.answers)) {
    return item.answers.join(", ");
  }
  return "（无回答内容）";
}

export const AwaitingAnswerBlock: React.FC<AwaitingAnswerBlockProps> = ({
  node,
}) => {
  const dispatch = useAppDispatch();
  const expanded = Boolean(node.expanded);
  const questions = useMemo<AIAwaitSubmitParamData[]>(() => {
    try {
      const parsed = JSON.parse(node.text || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error("Error parsing questions:", error);
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
          已询问{" "}
          <span style={{ color: "var(--text-main)" }}>
            {questions?.length || 0}
          </span>{" "}
          个问题
        </span>
        <MaterialIcon name="chevron_right" className="chevron" />
      </UiButton>
      <div className={`thinking-detail ${expanded ? "is-open" : ""}`}>
        <Flex vertical gap={10}>
          {questions?.map((item) => (
            <Flex vertical key={`${item.question}:${item.header || ""}`}>
              <div>{item.header || item.question}</div>
              <div style={{ opacity: 0.5 }}>{formatAwaitingAnswerValue(item)}</div>
            </Flex>
          ))}
        </Flex>
      </div>
    </div>
  );
};
