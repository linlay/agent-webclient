import React from "react";
import { useI18n } from "@/shared/i18n";
import { TimelineCollapse } from "@/shared/ui/TimelineCollapse";
import type { TimelineNode } from "../lib/timelineState";
import { useTimelineInteraction } from "./TimelineInteractionContext";
import styles from "./TimelinePresentation.module.css";

export function SnapshotSteerMessage({ node, source }: {
  node: TimelineNode;
  source: NonNullable<TimelineNode["steerSource"]>;
}): React.ReactElement {
  const { t } = useI18n();
  const interaction = useTimelineInteraction();
  const text = node.text || "";
  const attachments = (node.attachments || []).filter(attachment => attachment.name?.trim());
  const label = t(`timeline.steer.received.${source}`);
  if (!text.trim() && attachments.length === 0) return <>{label}</>;

  return (
    <TimelineCollapse
      label={label}
      expanded={Boolean(node.expanded)}
      onExpand={expanded => interaction?.setExpanded?.(node.id, expanded)}
      destroyOnHidden
    >
      <div className={`awaiting-detail ${styles["awaiting-detail"]}`}>
        {text.trim() && text}
        {attachments.length > 0 && (
          <div className="tw:flex tw:flex-wrap tw:gap-2">
            {attachments.map((attachment, index) => (
              <React.Fragment key={`${attachment.name}_${index}`}>
                {interaction?.renderAttachment?.(attachment, {}) ?? <span>{attachment.name}</span>}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </TimelineCollapse>
  );
}
