import { useCallback, useMemo } from "react";
import { message } from "antd";
import { useAppContext } from "@/app/state/AppContext";
import {
  deriveChatFromRun,
  isDeriveChatActionDisabled,
} from "@/features/chats/lib/chatDerivation";
import { resolveMainChatRuntime } from "@/features/runs/lib/runRuntimeState";
import { useI18n } from "@/shared/i18n";

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
  const { state, dispatch, stateRef, activeQuerySessionRequestIdRef, querySessionsRef } =
    useAppContext();
  const { t } = useI18n();
  const running = resolveMainChatRuntime(
    stateRef,
    activeQuerySessionRequestIdRef,
    querySessionsRef,
  ).running;

  const isDisabled = useCallback(
    (runId: string) => isDeriveChatActionDisabled({
      chatId: state.chatId,
      runId,
      running,
      activeAwaiting: state.activeAwaiting,
    }),
    [running, state.activeAwaiting, state.chatId],
  );

  const execute = useCallback(
    async (runId: string) => {
      if (isDisabled(runId)) return;

      try {
        const derivedChatId = await deriveChatFromRun(state.chatId, runId);
        dispatchDerivedChatNavigation(derivedChatId);
        message.success(t("timeline.run.deriveChatSuccess"));
      } catch (error) {
        const errorMessage = (error as Error)?.message || String(error);
        message.error(t("timeline.run.deriveChatFailed"));
        dispatch({
          type: "APPEND_DEBUG",
          line: `[deriveChat error] ${errorMessage}`,
        });
      }
    },
    [dispatch, isDisabled, state.chatId, t],
  );

  return useMemo(() => ({ isDisabled, execute }), [isDisabled, execute]);
}
