import React from "react";
import { getAgentIconSource } from "@/shared/icons/agentIconAssets";
import type { ConversationSnapshotTurnV1 } from "./conversationSnapshot";
import styles from "./ConversationExportDocument.module.css";

export function AssistantIdentity({
  assistant,
  fallbackName,
}: {
  assistant?: ConversationSnapshotTurnV1["assistant"];
  fallbackName: string;
}): React.ReactElement {
  const fallbackIcon = getAgentIconSource();
  return (
    <div className={styles.assistantIdentity}>
      <img
        className={styles.assistantAvatar}
        src={getAgentIconSource(assistant?.iconName)}
        alt=""
        width={24}
        height={24}
        onError={(event) => {
          if (event.currentTarget.src !== fallbackIcon) {
            event.currentTarget.src = fallbackIcon;
          }
        }}
      />
      <strong>{assistant?.name || fallbackName}</strong>
    </div>
  );
}
