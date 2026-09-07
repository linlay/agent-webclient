import React from "react";
import { DebugPanelContent } from "@/features/debug/components/DebugPanel";

export {
  DEBUG_EVENT_TABS,
  buildDebugChatRouteUrl,
  buildDebugChatStartOpenTargets,
  buildDebugEventGroups,
} from "@/features/debug/components/DebugPanel";
export type {
  DebugChatRouteTarget,
  DebugTabKey,
} from "@/features/debug/components/DebugPanel";

/** Adapts the active application conversation to the reusable debug panel. */
export const DebugTab: React.FC = () => <DebugPanelContent />;
