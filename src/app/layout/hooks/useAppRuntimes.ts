import { useConversationActions } from "@/features/conversation/hooks/useConversationActions";
import { useChatReadSync } from "@/features/chats/hooks/useChatReadSync";
import { useMainChatRunActivation } from "@/features/runs/hooks/useMainChatRunActivation";
import { useDesktopLiveSurfaceRecovery } from "@/features/runs/hooks/useDesktopLiveSurfaceRecovery";
import { useConversationEventHandler } from "@/features/conversation/hooks/useConversationEventHandler";
import { useMessageActions } from "@/features/composer/hooks/useMessageActions";
import { useMemoryRecordsInitialization } from "@/features/memory/hooks/useMemoryRecordsInitialization";
import { useConversationWsRuntime } from "@/features/conversation/hooks/useConversationWsRuntime";
import { useVoiceChatRuntime } from "@/features/voice/hooks/useVoiceChatRuntime";
import { useVoiceRuntime } from "@/features/voice/hooks/useVoiceRuntime";
import { useWorkerData } from "@/features/workers/hooks/useWorkerData";
import { useWorkerConversationSelection } from "@/features/workers/hooks/useWorkerConversationSelection";

export interface UseAppRuntimesOptions {
  initialWorkerRefreshEnabled?: boolean;
}

export function useAppRuntimes(
  options: UseAppRuntimesOptions = {},
) {
  useMainChatRunActivation();
  const { handleEvent } = useConversationEventHandler();
  useConversationWsRuntime({ onAgentEvent: handleEvent });
  const conversationActions = useConversationActions();
  useDesktopLiveSurfaceRecovery(conversationActions.loadChat);
  const { selectWorkerConversation } = useWorkerConversationSelection(conversationActions);
  const workerData = useWorkerData({
    loadChat: conversationActions.loadChat,
    selectWorkerConversation,
    initialRefreshEnabled: options.initialWorkerRefreshEnabled,
  });
  useChatReadSync();
  useMessageActions({ onAgentEvent: handleEvent });
  useVoiceRuntime();
  useVoiceChatRuntime({ onAgentEvent: handleEvent });
  useMemoryRecordsInitialization();
  return {
    ...workerData,
    startNewConversation: conversationActions.startNewConversation,
  };
}
