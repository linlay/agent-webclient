import React from "react";
import styles from "./ConversationExportDocument.module.css";

export function ReasoningDisclosure({
  children,
  label,
  statusIcon,
  segment = false,
}: {
  children: React.ReactNode;
  label: string;
  statusIcon?: string;
  segment?: boolean;
}): React.ReactElement {
  return (
    <details className={segment ? styles.reasoningSegment : styles.reasoning}>
      <summary>
        {statusIcon ? (
          <span className={styles.reasoningStatusIcon} aria-hidden="true">
            {statusIcon}
          </span>
        ) : null}
        <span className={styles.reasoningLabel}>{label}</span>
        <span className={styles.reasoningArrow} aria-hidden="true" />
      </summary>
      <div
        className={segment ? styles.reasoningSegmentBody : styles.reasoningBody}
      >
        {children}
      </div>
    </details>
  );
}
