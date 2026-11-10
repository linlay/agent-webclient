import React, { useEffect, useRef } from "react";
import styles from "./TimelineActivityText.module.css";
import { ACTIVITY_SWEEP_BAND_PX, getActivitySweepTiming } from "../lib/activitySweepTiming";

/**
 * Activity announce text. After mount the highlight band is driven by the Web Animations API:
 * it travels from fully left of the text to fully right of it at a constant speed, then rests
 * until the cycle ends. Duration therefore scales with the measured text width.
 */
export function TimelineActivityText({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== "function") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const width = el.getBoundingClientRect().width;
    const timing = getActivitySweepTiming(width);
    if (!timing) return;

    const band = ACTIVITY_SWEEP_BAND_PX;
    const from = `${-band}px 0, 0 0`;
    const to = `${width}px 0, 0 0`;
    const animation = el.animate(
      [
        { backgroundPosition: from, offset: 0 },
        { backgroundPosition: to, offset: timing.sweepEndRatio },
        { backgroundPosition: to, offset: 1 },
      ],
      { duration: timing.periodSec * 1000, iterations: Infinity, easing: "linear" },
    );
    return () => animation.cancel();
  }, [text]);

  return <span ref={ref} className={styles.activityText}>{text}</span>;
}
