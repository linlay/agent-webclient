import { useCallback, useMemo } from "react";
import { useAppContext } from "@/app/state/AppContext";
import {
  deriveChatFromRun,
  isDeriveChatActionDisabled,
} from "@/features/chats/lib/chatDerivation";
import { useI18n } from "@/shared/i18n";
import { useAppMessage } from "@/shared/ui/useAppMessage";

export function dispatchDerivedChatNavigation(chatId: string): void {
  const normalizedChatId = String(chatId || "").trim();
  if (
    !normalizedChatId ||
    typeof window === "undefined" ||
    typeof window.dispatchEvent !== "function"
  ) {
    return;
  }

  window.dispatchEvent(new CustomEvent("agent:refresh-chats"));
  window.dispatchEvent(
    new CustomEvent("agent:load-chat", {
      detail: {
        chatId: normalizedChatId,
        focusComposerOnComplete: true,
      },
    }),
  );
}

export function useDeriveChatAction() {
  const { state: { chatId }, dispatch } = useAppContext();
  const { t } = useI18n();
  const message = useAppMessage();

  const isDisabled = useCallback(
    (runId: string) => isDeriveChatActionDisabled({ chatId, runId }),
    [chatId],
  );

  const execute = useCallback(
    async (runId: string) => {
      if (isDisabled(runId)) return;

      try {
        const derived = await deriveChatFromRun(chatId, runId);
        dispatchDerivedChatNavigation(derived.chatId);
        if (derived.unavailableResources.length > 0) {
          message.warning(t("timeline.run.deriveChatResourcesUnavailable", {
            count: derived.unavailableResources.length,
          }));
        } else {
          message.success(t("timeline.run.deriveChatSuccess"));
        }
      } catch (error) {
        const errorMessage = (error as Error)?.message || String(error);
        message.error(t("timeline.run.deriveChatFailed"));
        dispatch({
          type: "APPEND_DEBUG",
          line: `[deriveChat error] ${errorMessage}`,
        });
      }
    },
    [dispatch, isDisabled, message, chatId, t],
  );

  return useMemo(() => ({ isDisabled, execute }), [isDisabled, execute]);
}
