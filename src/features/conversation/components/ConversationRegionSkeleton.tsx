import React from "react";
import styles from "./ConversationSurface.module.css";

export function ConversationRegionSkeleton({ region, phase = "visible" }: {
  region: "plan-tasks" | "header";
  phase?: "visible" | "exiting";
}) {
  return <div className={styles.skeleton} data-conversation-skeleton={region}
    data-transition-phase={phase} aria-hidden="true">
    <span /><span />
  </div>;
}
