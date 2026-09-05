import type { AgentEvent } from "@/app/state/types";
import {
  classifyEventGroup,
  shouldDisplayDebugEvent,
  type DebugEventGroup,
} from "@/features/events/lib/debugEventDisplay";

export const DEBUG_EVENT_TABS: Array<{
  key: "all" | Exclude<DebugEventGroup, "">;
  labelKey: string;
  color: string;
}> = [
  { key: "all", labelKey: "rightSidebar.debug.tabs.all", color: "blue" },
  { key: "request", labelKey: "rightSidebar.debug.tabs.request", color: "#5A86C8" },
  { key: "chat", labelKey: "rightSidebar.debug.tabs.chat", color: "#6B92BF" },
  { key: "run", labelKey: "rightSidebar.debug.tabs.run", color: "#4476AD" },
  { key: "debug", labelKey: "rightSidebar.debug.tabs.debug", color: "#7C8AA5" },
  { key: "awaiting", labelKey: "rightSidebar.debug.tabs.awaiting", color: "#D2B395" },
  { key: "memory", labelKey: "rightSidebar.debug.tabs.memory", color: "#7091B6" },
  { key: "reasoning", labelKey: "rightSidebar.debug.tabs.reasoning", color: "#7AB9A8" },
  { key: "planning", labelKey: "rightSidebar.debug.tabs.planning", color: "#8B9AD8" },
  { key: "content", labelKey: "rightSidebar.debug.tabs.content", color: "#5AA79D" },
  { key: "tool", labelKey: "rightSidebar.debug.tabs.tool", color: "#D6A05E" },
  { key: "action", labelKey: "rightSidebar.debug.tabs.action", color: "#CA9168" },
  { key: "plan", labelKey: "rightSidebar.debug.tabs.plan", color: "#8E82C4" },
  { key: "task", labelKey: "rightSidebar.debug.tabs.task", color: "#A094D0" },
  { key: "artifact", labelKey: "rightSidebar.debug.tabs.artifact", color: "#D98A42" },
  { key: "source", labelKey: "rightSidebar.debug.tabs.source", color: "#4F9FC7" },
];

export type DebugTabKey = (typeof DEBUG_EVENT_TABS)[number]["key"];

export function buildDebugEventGroups(
  events: AgentEvent[],
): Map<DebugTabKey, Array<{ event: AgentEvent; index: number }>> {
  const grouped = new Map<DebugTabKey, Array<{ event: AgentEvent; index: number }>>();
  DEBUG_EVENT_TABS.forEach((tab) => grouped.set(tab.key, []));
  events.forEach((event, index) => {
    if (!shouldDisplayDebugEvent(event)) return;
    grouped.get("all")?.push({ event, index });
    const group = classifyEventGroup(String(event.type || ""));
    if (group) grouped.get(group)?.push({ event, index });
  });
  return grouped;
}
