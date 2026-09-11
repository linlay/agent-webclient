import type { AppState } from "@/app/state/types";
import { getAppAccessToken } from "@/shared/data/auth/appAuth";
import { readStoredAccessToken } from "@/shared/data/auth/accessTokenStorage";
import { isAppMode } from "@/shared/utils/routing";
import { resolveInitialThemeMode } from "@/shared/styles/theme";
import { restoreTerminalDockOpen } from "@/features/terminal/lib/terminalDockPersistence";
import { isGatewayBackendMode } from "@/shared/config/backendMode";
import { restoreComposerDrafts } from "@/shared/data/auth/composerDraftPersistence";
import { createInitialAppChromeState } from "@/app/state/appChromeState";
import { createInitialAgentsState } from "@/features/agents/lib/agentState";
import { createInitialArtifactsState } from "@/features/artifacts/lib/artifactsState";
import { createInitialAutomationsState } from "@/features/automations/lib/automationsState";
import { createInitialChatsState } from "@/features/chats/lib/chatState";
import { createInitialComposerState } from "@/features/composer/lib/composerState";
import { createInitialConversationState } from "@/features/conversation/lib/conversationState";
import { createInitialDebugState } from "@/features/debug/lib/debugState";
import { createInitialMemoryState } from "@/features/memory/lib/memoryState";
import { createInitialOverviewState } from "@/features/overview/lib/overviewState";
import { createInitialPlanState } from "@/features/plan/lib/planState";
import { createInitialTasksState } from "@/features/tasks/lib/tasksState";
import { createInitialTimelineState } from "@/features/timeline/lib/timelineState";
import { createInitialToolsState } from "@/features/tools/lib/toolsState";
import { createInitialUsageState } from "@/features/usage/lib/usageState";
import { createInitialViewersState } from "@/features/viewers/lib/viewerState";
import { createInitialVoiceState } from "@/features/voice/lib/voiceState";
import { createInitialWorkersState } from "@/features/workers/lib/workerState";

export function createInitialState(): AppState {
  const appMode = isAppMode();
  const gatewayMode = isGatewayBackendMode();
  const accessToken = gatewayMode
    ? ""
    : appMode
      ? getAppAccessToken() || ""
      : readStoredAccessToken();
  const restoredDrafts = gatewayMode ? restoreComposerDrafts() : null;

  return {
    ...createInitialAgentsState(),
    ...createInitialWorkersState(),
    ...createInitialChatsState(),
    ...createInitialConversationState(),
    ...createInitialTimelineState(),
    ...createInitialToolsState(),
    ...createInitialPlanState(),
    ...createInitialTasksState(),
    ...createInitialArtifactsState(),
    ...createInitialOverviewState(),
    ...createInitialViewersState(),
    ...createInitialComposerState(),
    ...createInitialMemoryState(),
    ...createInitialVoiceState(),
    ...createInitialUsageState(),
    ...createInitialAutomationsState(),
    ...createInitialDebugState(),
    ...createInitialAppChromeState({
      themeMode: resolveInitialThemeMode(),
      accessToken,
      terminalDockOpen: restoreTerminalDockOpen(),
    }),
    composerDraft: restoredDrafts?.composerDraft || "",
    composerDraftByChatId: restoredDrafts?.composerDraftByChatId || {},
  };
}
