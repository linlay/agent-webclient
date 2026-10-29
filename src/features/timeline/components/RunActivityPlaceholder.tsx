import React from "react";
import { useRunActivityPlaceholder } from "../hooks/useRunActivityPlaceholder";
import { TimelineActivityRow } from "./TimelineRow";

export interface RunActivityPlaceholderProps {
  active: boolean;
  scopeKey: string;
}

/**
 * Transition shown while a running conversation has no displayable node yet.
 * Query rows are context only and do not count; a real activity line does.
 * It reuses the activity row so the marker, character and shimmer match the
 * normal progress line.
 */
export function RunActivityPlaceholder({
  active,
  scopeKey,
}: RunActivityPlaceholderProps) {
  const text = useRunActivityPlaceholder({ active, scopeKey });
  if (!text) return null;
  return (
    <div data-run-activity-placeholder="">
      <TimelineActivityRow text={text} placeholder />
    </div>
  );
}
