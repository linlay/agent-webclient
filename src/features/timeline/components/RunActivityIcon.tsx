import React, { useEffect, useState } from "react";
import styles from "./RunActivityIcon.module.css";

// Preserve the eight double-arc faces supplied for ordinary run activity.
const EXPRESSIONS = [
  { name: "curious", face: <>
    <path d="M 58,56 C 34,82 32,120 56,144" fill="none" stroke="currentColor" strokeWidth="15" strokeLinecap="round" />
    <path d="M 142,56 C 166,82 168,120 144,144" fill="none" stroke="currentColor" strokeWidth="15" strokeLinecap="round" />
    <g className={styles.eyes}>
      <rect x="80" y="72" width="13" height="38" rx="6.5" fill="currentColor" />
      <rect x="114" y="72" width="13" height="38" rx="6.5" fill="currentColor" />
    </g>
    <circle cx="103" cy="124" r="5.5" fill="currentColor" />
  </> },
  { name: "pout", face: <>
    <path d="M 56,58 C 30,84 30,118 56,142" fill="none" stroke="currentColor" strokeWidth="15.5" strokeLinecap="round" />
    <path d="M 144,58 C 170,84 170,118 144,142" fill="none" stroke="currentColor" strokeWidth="15.5" strokeLinecap="round" />
    <g className={styles.eyes}>
      <rect x="70" y="74" width="13" height="38" rx="6.5" fill="currentColor" transform="rotate(-17 76.5 93)" />
      <rect x="117" y="74" width="13" height="38" rx="6.5" fill="currentColor" transform="rotate(17 123.5 93)" />
    </g>
    <path d="M 92,126 C 96,119 104,119 108,126" fill="none" stroke="currentColor" strokeWidth="8.5" strokeLinecap="round" />
  </> },
  { name: "side-eye", face: <>
    <path d="M 58,56 C 34,82 32,120 56,144" fill="none" stroke="currentColor" strokeWidth="15" strokeLinecap="round" />
    <path d="M 142,56 C 166,82 168,120 144,144" fill="none" stroke="currentColor" strokeWidth="15" strokeLinecap="round" />
    <g className={styles.eyes}>
      <rect x="60" y="86" width="28" height="12" rx="6" fill="currentColor" />
      <rect x="102" y="86" width="28" height="12" rx="6" fill="currentColor" />
    </g>
    <rect x="96" y="118" width="14" height="8" rx="4" fill="currentColor" />
  </> },
  { name: "ponder", face: <>
    <path d="M 58,56 C 34,82 32,120 56,144" fill="none" stroke="currentColor" strokeWidth="15" strokeLinecap="round" />
    <path d="M 142,56 C 166,82 168,120 144,144" fill="none" stroke="currentColor" strokeWidth="15" strokeLinecap="round" />
    <g className={styles.eyes}>
      <rect x="72" y="72" width="13" height="40" rx="6.5" fill="currentColor" />
      <rect x="114" y="80" width="13" height="26" rx="6.5" fill="currentColor" />
    </g>
    <path d="M 89,122 C 93,127 98,125 100,120 C 102,125 107,127 111,122" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
  </> },
  { name: "wink", face: <>
    <path d="M 58,60 C 34,86 32,122 56,146" fill="none" stroke="currentColor" strokeWidth="15" strokeLinecap="round" />
    <path d="M 142,52 C 166,78 168,114 144,138" fill="none" stroke="currentColor" strokeWidth="15" strokeLinecap="round" />
    <g className={styles.eyes}>
      <rect x="72" y="74" width="13" height="38" rx="6.5" fill="currentColor" />
      <path d="M 108,96 C 114,84 126,84 132,96" fill="none" stroke="currentColor" strokeWidth="11" strokeLinecap="round" />
    </g>
    <circle cx="104" cy="124" r="5.5" fill="none" stroke="currentColor" strokeWidth="6" />
  </> },
  { name: "surprise", face: <>
    <path d="M 54,54 C 30,82 30,118 54,146" fill="none" stroke="currentColor" strokeWidth="15" strokeLinecap="round" />
    <path d="M 146,54 C 170,82 170,118 146,146" fill="none" stroke="currentColor" strokeWidth="15" strokeLinecap="round" />
    <g className={styles.eyes}>
      <rect x="74" y="68" width="14" height="42" rx="7" fill="currentColor" />
      <rect x="112" y="68" width="14" height="42" rx="7" fill="currentColor" />
    </g>
    <rect x="94" y="118" width="12" height="16" rx="6" fill="currentColor" />
  </> },
  { name: "focus", face: <>
    <path d="M 56,58 C 32,84 32,116 56,142" fill="none" stroke="currentColor" strokeWidth="15.5" strokeLinecap="round" />
    <path d="M 144,58 C 168,84 168,116 144,142" fill="none" stroke="currentColor" strokeWidth="15.5" strokeLinecap="round" />
    <g className={styles.eyes}>
      <rect x="62" y="84" width="30" height="12" rx="6" fill="currentColor" transform="rotate(18 77 90)" />
      <rect x="108" y="84" width="30" height="12" rx="6" fill="currentColor" transform="rotate(-18 123 90)" />
    </g>
    <path d="M 90,120 C 96,115 104,115 110,120" fill="none" stroke="currentColor" strokeWidth="8.5" strokeLinecap="round" />
  </> },
  { name: "happy", face: <>
    <path d="M 56,58 C 30,84 28,120 56,144" fill="none" stroke="currentColor" strokeWidth="15" strokeLinecap="round" />
    <path d="M 144,58 C 170,84 172,120 144,144" fill="none" stroke="currentColor" strokeWidth="15" strokeLinecap="round" />
    <g className={styles.eyes}>
      <path d="M 66,96 C 72,82 86,82 92,96" fill="none" stroke="currentColor" strokeWidth="11.5" strokeLinecap="round" />
      <path d="M 108,96 C 114,82 128,82 134,96" fill="none" stroke="currentColor" strokeWidth="11.5" strokeLinecap="round" />
    </g>
    <path d="M 92,118 C 96,125 104,125 108,118" fill="none" stroke="currentColor" strokeWidth="8.5" strokeLinecap="round" />
  </> },
];
const MOTIONS = ["peek", "tilt", "bounce", "sway"] as const;

/** Decorative live activity only; retry/error indicators keep their own semantics. */
export function RunActivityIcon() {
  const [pose, setPose] = useState({ expression: 0, motion: "peek", tick: 0 });

  useEffect(() => {
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    const schedule = () => {
      if (disposed || reducedMotion?.matches || document.hidden) return;
      timer = setTimeout(() => {
        const offset = 1 + Math.floor(Math.random() * (EXPRESSIONS.length - 1));
        const motion = MOTIONS[Math.floor(Math.random() * MOTIONS.length)];
        setPose(previous => ({
          // Always pick a different face, independent of message updates.
          expression: (previous.expression + offset) % EXPRESSIONS.length,
          motion,
          tick: previous.tick + 1,
        }));
        schedule();
      }, 1800 + Math.random() * 2600);
    };
    const reset = () => {
      clearTimeout(timer);
      schedule();
    };
    schedule();
    reducedMotion?.addEventListener("change", reset);
    document.addEventListener("visibilitychange", reset);
    return () => {
      disposed = true;
      clearTimeout(timer);
      reducedMotion?.removeEventListener("change", reset);
      document.removeEventListener("visibilitychange", reset);
    };
  }, []);

  return (
    <span className={styles.icon} aria-hidden="true" data-run-activity-icon="" data-expression={EXPRESSIONS[pose.expression].name}>
      <svg viewBox="20 35 160 130" fill="currentColor" focusable="false">
        <g key={pose.tick} className={styles[pose.motion]}>
          {EXPRESSIONS[pose.expression].face}
        </g>
      </svg>
    </span>
  );
}
