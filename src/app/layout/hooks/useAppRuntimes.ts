import { useChatActions } from "@/features/chats/hooks/useChatActions";
import { useMessageActions } from "@/features/composer/hooks/useMessageActions";
import { useMemoryRecordsInitialization } from "@/features/settings/hooks/useMemoryRecordsInitialization";
import { useActionRuntime } from "@/features/tools/hooks/useActionRuntime";
import { useSseAttachTransport } from "@/features/transport/hooks/useSseAttachTransport";
import { useWsTransport } from "@/features/transport/hooks/useWsTransport";
import { useVoiceChatRuntime } from "@/features/voice/hooks/useVoiceChatRuntime";
import { useVoiceRuntime } from "@/features/voice/hooks/useVoiceRuntime";

export function useAppRuntimes(): void {
  useWsTransport();
  useSseAttachTransport();
  useChatActions();
  useMessageActions();
  useActionRuntime();
  useVoiceRuntime();
  useVoiceChatRuntime();
  useMemoryRecordsInitialization();
}
