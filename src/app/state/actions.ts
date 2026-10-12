import type { AppState } from "@/app/state/types";
import type { AppChromeAction } from "@/app/state/appChromeState";
import type { AgentsAction } from "@/features/agents/lib/agentState";
import type { ArtifactsAction } from "@/features/artifacts/lib/artifactsState";
import type { AutomationsAction } from "@/features/automations/lib/automationsState";
import type { ChatsAction } from "@/features/chats/lib/chatState";
import type { ComposerAction } from "@/features/composer/lib/composerState";
import type { ConversationAction } from "@/features/conversation/lib/conversationState";
import type { DebugAction } from "@/features/debug/lib/debugState";
import type { OverviewAction } from "@/features/overview/lib/overviewState";
import type { PlanAction } from "@/features/plan/lib/planState";
import type { TasksAction } from "@/features/tasks/lib/tasksState";
import type { TimelineAction } from "@/features/timeline/lib/timelineState";
import type { ToolsAction } from "@/features/tools/lib/toolsState";
import type { UsageAction } from "@/features/usage/lib/usageState";
import type { ViewersAction } from "@/features/viewers/lib/viewerState";
import type { VoiceAction } from "@/features/voice/lib/voiceState";
import type { WorkersAction } from "@/features/workers/lib/workerState";

/** Complete replay projection; unrelated app state is never part of this transaction. */
export type ConversationReplaySnapshot = Pick<AppState,
  | "chatId"
  | "currentChatActiveRun"
  | "runId"
  | "timelineNodes"
  | "timelineOrder"
  | "contentNodeById"
  | "reasoningNodeById"
  | "toolNodeById"
  | "toolStates"
  | "timelineCounter"
  | "activeReasoningKey"
  | "activeAwaiting"
  | "pendingAwaitings"
  | "events"
  | "debugEvents"
  | "artifacts"
  | "fileChanges"
  | "plan"
  | "planRuntimeByTaskId"
  | "taskItemsById"
  | "activeTaskIds"
  | "planCurrentRunningTaskId"
  | "planLastTouchedTaskId"
  | "downvotedRunKeys"
>;

export type AppCoordinationAction =
  | { type: "CLEAR_CONVERSATION_OVERVIEW" }
  | { type: "RESET_CONVERSATION" }
  | { type: "RESET_ACTIVE_CONVERSATION" }
  | { type: "CLEAR_GATEWAY_IDENTITY_STATE" }
  | { type: "APPLY_CONVERSATION_REPLAY"; snapshot: ConversationReplaySnapshot };

export type AppAction =
  | AgentsAction
  | WorkersAction
  | ChatsAction
  | ConversationAction
  | TimelineAction
  | ToolsAction
  | PlanAction
  | TasksAction
  | ArtifactsAction
  | OverviewAction
  | ViewersAction
  | ComposerAction
  | VoiceAction
  | UsageAction
  | AutomationsAction
  | DebugAction
  | AppChromeAction
  | AppCoordinationAction;
