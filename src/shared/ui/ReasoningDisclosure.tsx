import React, { useState } from "react";
import styles from "./ReasoningDisclosure.module.css";

export type ReasoningDisclosureProps = {
  label: React.ReactNode;
  children: React.ReactNode;
  expanded?: boolean;
  defaultExpanded?: boolean;
  chevronPosition?: "start" | "end";
  onExpandedChange?: (expanded: boolean) => void;
  className?: string;
};

export const ReasoningDisclosure: React.FC<ReasoningDisclosureProps> = ({
  label,
  children,
  expanded,
  defaultExpanded = false,
  chevronPosition = "start",
  onExpandedChange,
  className,
}) => {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const isControlled = typeof expanded === "boolean";
  const isExpanded = isControlled ? expanded : internalExpanded;
  const contentId = React.useId();

  const toggleExpanded = (): void => {
    const nextExpanded = !isExpanded;
    if (!isControlled) {
      setInternalExpanded(nextExpanded);
    }
    onExpandedChange?.(nextExpanded);
  };

  return (
    <section
      className={[styles.root, className].filter(Boolean).join(" ")}
      data-expanded={isExpanded ? "true" : "false"}
    >
      <button
        type="button"
        className={styles.trigger}
        aria-expanded={isExpanded}
        aria-controls={contentId}
        onClick={toggleExpanded}
      >
        {chevronPosition === "start" ? (
          <span className={styles.chevron} aria-hidden="true">›</span>
        ) : null}
        <span className={styles.label}>{label}</span>
        {chevronPosition === "end" ? (
          <span className={styles.chevron} aria-hidden="true">›</span>
        ) : null}
      </button>
      {isExpanded ? (
        <div id={contentId} className={styles.content}>
          {children}
        </div>
      ) : null}
    </section>
  );
};
