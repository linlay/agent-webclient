import React from "react";
import styles from "./StatusChip.module.css";

/**
 * Visual tone of a status chip. Tones only change color; geometry is shared so
 * chips never resize when the underlying state changes.
 */
export type StatusChipTone = "neutral" | "active" | "success" | "danger" | "muted" | "pending";

export interface StatusChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: StatusChipTone;
  /** Leading 6px dot, used for live runs. */
  dot?: boolean;
  /** Pulses the dot; only meaningful with `dot`. */
  pulse?: boolean;
  /** Desktop-parity highlight sweep, used for states that need the user. */
  shimmer?: boolean;
}

export const StatusChip: React.FC<StatusChipProps> = ({
  tone = "neutral",
  dot = false,
  pulse = false,
  shimmer = false,
  className = "",
  children,
  ...rest
}) => (
  <span
    className={[styles.chip, className].filter(Boolean).join(" ")}
    data-tone={tone}
    data-pulse={pulse && dot ? "" : undefined}
    data-shimmer={shimmer ? "" : undefined}
    {...rest}
  >
    {dot ? <span className={styles.dot} aria-hidden="true" /> : null}
    {children}
  </span>
);
