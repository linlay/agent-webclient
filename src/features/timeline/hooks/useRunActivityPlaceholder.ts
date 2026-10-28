import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/shared/i18n";

/**
 * Rotating copy for the transition row shown while an active conversation has
 * no displayable timeline node yet. Keep the first entry generic: it is visible
 * longest and must fit any agent mode. Order is the display order; every
 * Chinese label is prefixed with 正在 in the locale files.
 */
export const RUN_ACTIVITY_PLACEHOLDER_KEYS = [
  "timeline.activity.placeholder.thinking",
  "timeline.activity.placeholder.pondering",
  "timeline.activity.placeholder.deliberating",
  "timeline.activity.placeholder.cogitating",
  "timeline.activity.placeholder.contemplating",
  "timeline.activity.placeholder.mulling",
  "timeline.activity.placeholder.musing",
  "timeline.activity.placeholder.reasoning",
  "timeline.activity.placeholder.inferring",
  "timeline.activity.placeholder.calculating",
  "timeline.activity.placeholder.computing",
  "timeline.activity.placeholder.deciphering",
  "timeline.activity.placeholder.unraveling",
  "timeline.activity.placeholder.synthesizing",
  "timeline.activity.placeholder.coalescing",
  "timeline.activity.placeholder.crystallizing",
  "timeline.activity.placeholder.envisioning",
  "timeline.activity.placeholder.imagining",
  "timeline.activity.placeholder.ideating",
  "timeline.activity.placeholder.sketching",
  "timeline.activity.placeholder.composing",
  "timeline.activity.placeholder.crafting",
  "timeline.activity.placeholder.forging",
  "timeline.activity.placeholder.brewing",
  "timeline.activity.placeholder.percolating",
  "timeline.activity.placeholder.simmering",
  "timeline.activity.placeholder.incubating",
  "timeline.activity.placeholder.hatching",
  "timeline.activity.placeholder.polishing",
  "timeline.activity.placeholder.tinkering",
] as const;

export const RUN_ACTIVITY_PLACEHOLDER_INTERVAL_MS = 2400;

function pickPlaceholderIndex(): number {
  return Math.floor(Math.random() * RUN_ACTIVITY_PLACEHOLDER_KEYS.length);
}

export interface RunActivityPlaceholderOptions {
  active: boolean;
  /** Chat/run identity; a switch restarts from a new random entry. */
  scopeKey: string;
}

/**
 * Returns the current transition sentence, or null when no run is active.
 * Every activation starts at a random label and then rotates in pool order.
 * The timer only exists while a placeholder is actually visible.
 */
export function useRunActivityPlaceholder({
  active,
  scopeKey,
}: RunActivityPlaceholderOptions): string | null {
  const { t } = useI18n();
  const [index, setIndex] = useState(pickPlaceholderIndex);
  const scopeRef = useRef(scopeKey);
  const wasActiveRef = useRef(active);

  useEffect(() => {
    if (!active) {
      wasActiveRef.current = false;
      return;
    }
    const scopeChanged = scopeRef.current !== scopeKey;
    const reactivated = !wasActiveRef.current;
    scopeRef.current = scopeKey;
    wasActiveRef.current = true;
    if (scopeChanged || reactivated) {
      setIndex(pickPlaceholderIndex());
    }
    const timer = setInterval(() => {
      setIndex(current => (current + 1) % RUN_ACTIVITY_PLACEHOLDER_KEYS.length);
    }, RUN_ACTIVITY_PLACEHOLDER_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active, scopeKey]);

  if (!active) return null;
  return t(RUN_ACTIVITY_PLACEHOLDER_KEYS[index % RUN_ACTIVITY_PLACEHOLDER_KEYS.length]);
}
