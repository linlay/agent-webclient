import React from "react";
import styles from "./ShortcutHint.module.css";

export function ShortcutHint({ keyLabel, modifier = "Meta" }: {
  keyLabel: string;
  modifier?: "Meta" | "Control";
}) {
  return <kbd className={styles.hint} aria-hidden="true">
    {modifier === "Meta" ? (
      <svg className={styles.icon} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5.5 5.5H3.75A2.25 2.25 0 1 1 6 3.25v9.5A2.25 2.25 0 1 1 3.75 10.5H12.25A2.25 2.25 0 1 1 10 12.75v-9.5A2.25 2.25 0 1 1 12.25 5.5H5.5v5h5" />
      </svg>
    ) : <span>Ctrl</span>}
    {keyLabel === "Enter" ? (
      <svg className={styles.icon} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 3v6H3m3-3L3 9l3 3" />
      </svg>
    ) : <span>{keyLabel}</span>}
  </kbd>;
}
