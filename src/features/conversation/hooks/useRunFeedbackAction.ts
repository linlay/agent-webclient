import { useCallback } from "react";
import { useAppContext } from "@/app/state/AppContext";
import { submitFeedback } from "@/shared/data";
import { useI18n } from "@/shared/i18n";
import { useAppMessage } from "@/shared/ui/useAppMessage";

export function useRunFeedbackAction() {
  const { state, dispatch } = useAppContext();
  const { t } = useI18n();
  const message = useAppMessage();

  return useCallback(
    async (runId: string, nextDownvoted: boolean, comment?: string) => {
      const chatId = String(state.chatId || "").trim();
      const normalizedRunId = String(runId || "").trim();
      if (!chatId || !normalizedRunId) {
        dispatch({
          type: "APPEND_DEBUG",
          line: "[feedback error] missing chatId or runId",
        });
        return;
      }
      dispatch({
        type: "SET_RUN_DOWNVOTED",
        runKey: normalizedRunId,
        downvoted: nextDownvoted,
      });
      try {
        const normalizedComment = String(comment || "").trim();
        await submitFeedback({
          chatId,
          runId: normalizedRunId,
          type: nextDownvoted ? "thumbs_down" : "clear",
          ...(nextDownvoted && normalizedComment ? { comment: normalizedComment } : {}),
        });
        message.success(
          nextDownvoted
            ? t("timeline.feedback.downvoted")
            : t("timeline.feedback.cleared"),
        );
      } catch (error) {
        dispatch({
          type: "SET_RUN_DOWNVOTED",
          runKey: normalizedRunId,
          downvoted: !nextDownvoted,
        });
        dispatch({
          type: "APPEND_DEBUG",
          line: `[feedback error] ${(error as Error).message}`,
        });
      }
    },
    [dispatch, message, state.chatId, t],
  );
}
