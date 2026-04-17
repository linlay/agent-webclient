import React, { useMemo } from "react";
import type { AIAwaitSubmitParamData, TimelineNode } from "../../context/types";
import { useAppDispatch } from "../../context/AppContext";
import { MaterialIcon } from "../common/MaterialIcon";
import { UiButton } from "../ui/UiButton";
import { Flex } from "antd";

interface AwaitingAnswerBlockProps {
  node: TimelineNode;
}

export const AwaitingAnswerBlock: React.FC<AwaitingAnswerBlockProps> = ({
  node,
}) => {
  const dispatch = useAppDispatch();
  const expanded = Boolean(node.expanded);
  const questions = useMemo<AIAwaitSubmitParamData[]>(() => {
    try {
      return JSON.parse(node.text || "[]");
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
            <Flex vertical key={item.question}>
              <div>{item.question}</div>
              <div style={{ opacity: 0.5 }}>{item.answer ? item.answer : item?.answers?.join(', ')}</div>
            </Flex>
          ))}
        </Flex>
      </div>
    </div>
  );
};
