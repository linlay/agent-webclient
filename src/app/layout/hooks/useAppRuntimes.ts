import { useConversationActions } from "@/features/conversation/hooks/useConversationActions";
import { useChatReadSync } from "@/features/chats/hooks/useChatReadSync";
import { useMainChatRunActivation } from "@/features/runs/hooks/useMainChatRunActivation";
import { useConversationEventHandler } from "@/features/conversation/hooks/useConversationEventHandler";
import { useMessageActions } from "@/features/composer/hooks/useMessageActions";
import { useMemoryRecordsInitialization } from "@/features/settings/hooks/useMemoryRecordsInitialization";
import { useActionRuntime } from "@/features/tools/hooks/useActionRuntime";
import { useConversationWsRuntime } from "@/features/conversation/hooks/useConversationWsRuntime";
import { useVoiceChatRuntime } from "@/features/voice/hooks/useVoiceChatRuntime";
import { useVoiceRuntime } from "@/features/voice/hooks/useVoiceRuntime";
import { useWorkerData } from "@/features/workers/hooks/useWorkerData";
import { useWorkerConversationSelection } from "@/features/workers/hooks/useWorkerConversationSelection";

export function useAppRuntimes(): void {
  useMainChatRunActivation();
  const { handleEvent } = useConversationEventHandler();
  useConversationWsRuntime({ onAgentEvent: handleEvent });
  const conversationActions = useConversationActions();
  const { selectWorkerConversation } = useWorkerConversationSelection(conversationActions);
  useWorkerData({
    loadChat: conversationActions.loadChat,
    selectWorkerConversation,
  });
  useChatReadSync();
  useMessageActions({ onAgentEvent: handleEvent });
  useActionRuntime();
  useVoiceRuntime();
  useVoiceChatRuntime({ onAgentEvent: handleEvent });
  useMemoryRecordsInitialization();
}
