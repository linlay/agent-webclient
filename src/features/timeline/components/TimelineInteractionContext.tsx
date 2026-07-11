import React, { createContext, useContext } from "react";
import type { TimelineNode, TimelineSource } from "@/app/state/types";

export interface TimelineInteractionValue {
  conversationActive?: boolean;
  patchNode?: (node: TimelineNode) => void;
  openSource?: (source: TimelineSource) => void;
}

const TimelineInteractionContext =
  createContext<TimelineInteractionValue | null>(null);

export const TimelineInteractionProvider =
  TimelineInteractionContext.Provider;

export function useTimelineInteraction(): TimelineInteractionValue | null {
  return useContext(TimelineInteractionContext);
}
