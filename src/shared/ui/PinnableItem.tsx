import type { ReactNode } from "react";
import { MaterialIcon } from "./MaterialIcon";
import styles from "./PinnableItem.module.css";

export function PinnableItem({ children, pinned, label, disabled, onToggle, className = "" }: {
  children: ReactNode;
  pinned: boolean;
  label: string;
  disabled?: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return <div className={`${styles.item} ${className}`} data-pinned={pinned || undefined}>
    {children}
    <button type="button" className={styles.pin} aria-label={label} title={label}
      aria-pressed={pinned} disabled={disabled}
      onMouseDown={event => event.preventDefault()}
      onClick={event => { event.stopPropagation(); onToggle(); }}>
      <MaterialIcon name="push_pin" className={styles.icon} />
    </button>
  </div>;
}
