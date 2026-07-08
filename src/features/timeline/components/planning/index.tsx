import { Skeleton } from "@/shared/components/skeleton";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { Collapse, Flex, Tooltip } from "antd";
import { ContentBlock } from "../ContentBlock";
import { copyText } from "@/shared/utils/copy";
import useApp from "antd/es/app/useApp";
import { TimelineNode } from "@/app/state/timelineTypes";
import { useState } from "react";
import { useI18n } from "@/shared/i18n";
import { useAppDispatch } from "@/app/state/AppContext";

interface PlanningTimelineProps {
  node: TimelineNode;
}

const EXPAND_DIV_CLASS_NAME =
  "tw:absolute tw:inset-x-0 tw:bottom-0 tw:bg-[linear-gradient(180deg,transparent,var(--bg-base))] tw:p-4";
export const PlanningTimeline: React.FC<PlanningTimelineProps> = ({ node }) => {
  const { message } = useApp();
  const { t } = useI18n();
  const dispatch = useAppDispatch();
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
              t("planningTimeline.implementPlan")
            ) : (
              <Skeleton text={t("planningTimeline.writing")} active />
            ),
          extra: (
            <Flex gap={4}>
              <Tooltip title={t("planningTimeline.openInSidebar")}>
                <UiButton
                  className="ui-icon-hover-20"
                  variant="ghost"
                  size="sm"
                  iconOnly
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch({
                      type: "OPEN_RIGHT_SIDEBAR",
                      tab: "planningPreview",
                      planningPreview: {
                        nodeId: node.id,
                        label: node.text || node.id,
                      },
                    });
                  }}
                >
                  <MaterialIcon name="open_in_new" />
                </UiButton>
              </Tooltip>
              <Tooltip title={t("planningTimeline.copy")}>
                <UiButton
                  className="ui-icon-hover-20"
                  variant="ghost"
                  size="sm"
                  iconOnly
                  onClick={(e) => {
                    e.stopPropagation();
                    copyText(node.text || "").then(() => {
                      message.success(t("planningTimeline.copySuccess"));
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
                <Flex className={EXPAND_DIV_CLASS_NAME} justify="center">
                  <UiButton
                    size="sm"
                    variant="primary"
                    className="tw:rounded-[20px]"
                    onClick={() => setExpanded(true)}
                  >
                    {t("planningTimeline.expand")}
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
