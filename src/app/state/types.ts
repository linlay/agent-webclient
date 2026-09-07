import type { AgentsState } from "@/features/agents/lib/agentState";
import type { ArtifactsState } from "@/features/artifacts/lib/artifactsState";
import type { AutomationsState } from "@/features/automations/lib/automationsState";
import type { ChatsState } from "@/features/chats/lib/chatState";
import type { ComposerState } from "@/features/composer/lib/composerState";
import type { ConversationState } from "@/features/conversation/lib/conversationState";
import type { DebugState } from "@/features/debug/lib/debugState";
import type { MemoryState } from "@/features/memory/lib/memoryState";
import type { OverviewState } from "@/features/overview/lib/overviewState";
import type { PlanState } from "@/features/plan/lib/planState";
import type { TasksState } from "@/features/tasks/lib/tasksState";
import type { TimelineState } from "@/features/timeline/lib/timelineState";
import type { ToolsState } from "@/features/tools/lib/toolsState";
import type { UsageState } from "@/features/usage/lib/usageState";
import type { ViewersState } from "@/features/viewers/lib/viewerState";
import type { VoiceState } from "@/features/voice/lib/voiceState";
import type { WorkersState } from "@/features/workers/lib/workerState";
import type { AppChromeState } from "@/app/state/appChromeState";

/**
 * Root wire shape remains flat. Each field is owned by its domain state contract;
 * app/state only composes those contracts for Context and reducer orchestration.
 */
export type AppState =
  & AppChromeState
  & AgentsState
  & WorkersState
  & ChatsState
  & ConversationState
  & TimelineState
  & ToolsState
  & PlanState
  & TasksState
  & ArtifactsState
  & OverviewState
  & ViewersState
  & ComposerState
  & MemoryState
  & VoiceState
  & UsageState
  & AutomationsState
  & DebugState;
