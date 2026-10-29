import { bindCssModuleClasses } from "@/shared/utils/cssModuleClasses";
import timelinePresentation from "@/features/timeline/components/TimelinePresentation.module.css";
import { Skeleton } from "@/shared/components/skeleton";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { Collapse, Flex, Tooltip } from "antd";
import { ContentBlock } from "../ContentBlock";
import { useTimelineCopy } from "../TimelineInteractionContext";
import { TimelineNode } from "@/features/timeline/lib/timelineState";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/shared/i18n";
import { useTimelineInteraction } from "../TimelineInteractionContext";
const presentationClasses = bindCssModuleClasses({ ...timelinePresentation });


interface PlanningTimelineProps {
  node: TimelineNode;
}

const EXPAND_DIV_CLASS_NAME =
  "tw:absolute tw:inset-x-0 tw:bottom-0 tw:bg-[linear-gradient(180deg,transparent,var(--bg-base))] tw:p-4";
export const PlanningTimeline: React.FC<PlanningTimelineProps> = ({ node }) => {
  const { t } = useI18n();
  const copyText = useTimelineCopy();
  const interaction = useTimelineInteraction();
  const chatId = String(interaction?.surfaceContext?.chatId || "").trim();
  const [expanded, setExpanded] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const copyRequest = useRef(0);
  useEffect(() => () => { copyRequest.current += 1; }, [node.text]);
  const copy = async () => {
    const request = ++copyRequest.current;
    try {
      await copyText(node.text || "");
      if (request !== copyRequest.current) return;
      if (interaction?.onCopyResult) interaction.onCopyResult(true, t("planningTimeline.copySuccess"));
      else setCopyStatus(t("planningTimeline.copySuccess"));
    } catch {
      if (request !== copyRequest.current) return;
      if (interaction?.onCopyResult) interaction.onCopyResult(false, t("timeline.toolPill.copy.failed"));
      else setCopyStatus(t("timeline.toolPill.copy.failed"));
    }
  };

  return (
    <Collapse
      defaultActiveKey="planning"
      expandIconPosition="end"
      className={presentationClasses("timeline-planning-collapse")}
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
              {node.planningId && chatId && interaction?.openTarget ? <Tooltip title={t("planningTimeline.openInSidebar")}>
                <UiButton
                  className="ui-icon-hover-20"
                  variant="ghost"
                  size="sm"
                  iconOnly
                  disabled={!node.planningId}
                  onClick={(e) => {
                    e.stopPropagation();
                    interaction?.openTarget?.({
                      version: 1,
                      kind: "planning",
                      chatId,
                      planningId: node.planningId || "",
                      nodeId: node.id,
                      label: node.text || node.id,
                    });
                  }}
                >
                  <MaterialIcon name="open_in_new" />
                </UiButton>
              </Tooltip> : null}
              <Tooltip title={t("planningTimeline.copy")}>
                <UiButton
                  className="ui-icon-hover-20"
                  variant="ghost"
                  size="sm"
                  iconOnly
                  onClick={(e) => {
                    e.stopPropagation();
                    void copy();
                  }}
                >
                  <MaterialIcon name="content_copy" />
                </UiButton>
              </Tooltip>
              {!interaction?.onCopyResult && copyStatus && <span role="status">{copyStatus}</span>}
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
