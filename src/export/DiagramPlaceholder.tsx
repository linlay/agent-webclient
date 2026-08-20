import React from "react";
import {
  conversationExportMessages,
  resolveConversationExportLocale,
} from "@/shared/i18n/conversationExport";
import styles from "./ConversationExportDocument.module.css";

export const DiagramLoading: React.FC<{ className?: string }> = ({
  className,
}) => {
  const copy = conversationExportMessages[resolveConversationExportLocale()];
  return (
    <div
      className={[styles.diagramLoading, className].filter(Boolean).join(" ")}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className={styles.diagramLoadingSpinner} aria-hidden="true" />
      <p>{copy.diagramLoading}</p>
    </div>
  );
};

export const DiagramFallback: React.FC<{
  language: string;
  source: string;
}> = ({ language, source }) => {
  const copy = conversationExportMessages[resolveConversationExportLocale()];
  return (
    <figure className={styles.codeBlock}>
      <figcaption>
        {language} · {copy.diagramUnavailable}
      </figcaption>
      <pre>
        <code>{source}</code>
      </pre>
    </figure>
  );
};
