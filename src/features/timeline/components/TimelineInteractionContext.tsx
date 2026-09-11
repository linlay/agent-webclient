import React, { createContext, useContext } from "react";
import type { TimelineNode, TimelineSource } from "@/features/timeline/lib/timelineState";

export interface TimelineInteractionValue {
  conversationActive?: boolean;
  readOnly?: boolean;
  surfaceContext?: {
    chatId: string;
    agentKey?: string;
    teamChat?: boolean;
  };
  patchNode?: (node: TimelineNode) => void;
  openSource?: (source: TimelineSource, node?: TimelineNode) => void;
}

const TimelineInteractionContext =
  createContext<TimelineInteractionValue | null>(null);

export const TimelineInteractionProvider =
  TimelineInteractionContext.Provider;

export function useTimelineInteraction(): TimelineInteractionValue | null {
  return useContext(TimelineInteractionContext);
}
