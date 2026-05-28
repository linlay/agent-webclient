import { Skeleton } from "@/shared/components/skeleton";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { Collapse, Flex, Tooltip } from "antd";
import { ContentBlock } from "../ContentBlock";
import { copyText } from "@/shared/utils/copy";
import useApp from "antd/es/app/useApp";
import { TimelineNode } from "@/app/state/timelineTypes";
import Style from "./index.module.css";
import { useState } from "react";

interface PlanningTimelineProps {
  node: TimelineNode;
}
export const PlanningTimeline: React.FC<PlanningTimelineProps> = ({ node }) => {
  const { message } = useApp();
  const [expanded, setExpanded] = useState(false);

  return (
    <Collapse
      defaultActiveKey="planning"
      expandIconPosition="end"
      className="timeline-planning-collapse"
      ghost
      items={[
        {
          key: "planning",
          label:
            node.status === "completed" ? (
              "实施计划"
            ) : (
              <Skeleton text="正在编写计划" active />
            ),
          extra: (
            <Flex>
              <Tooltip title="复制">
                <UiButton
                  variant="ghost"
                  size="sm"
                  iconOnly
                  onClick={(e) => {
                    e.stopPropagation();
                    copyText(node.text || "").then(() => {
                      message.success("复制成功");
                    });
                  }}
                >
                  <MaterialIcon name="content_copy" />
                </UiButton>
              </Tooltip>
            </Flex>
          ),
          children: (
            <div style={expanded ? {} : { maxHeight: 300, overflow: "hidden" }}>
              <ContentBlock node={node} />
              {!expanded && (
                <Flex className={Style.ExpandDiv} justify="center">
                  <UiButton size="sm" variant="primary" onClick={() => setExpanded(true)}>
                    展开计划
                  </UiButton>
                </Flex>
              )}
            </div>
          ),
        },
      ]}
    />
  );
};
