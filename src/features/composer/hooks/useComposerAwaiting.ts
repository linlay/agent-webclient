import { useCallback } from "react";
import type { Dispatch } from "react";
import { message } from "antd";
import type { AppAction } from "@/app/state/AppContext";
import type {
  AIAwaitSubmitPayloadData,
  AppState,
  FormActiveAwaiting,
} from "@/app/state/types";
import { submitAwaiting } from "@/features/transport/lib/apiClientProxy";
import { useI18n } from "@/shared/i18n";

type FormActiveAwaitingPatch = Pick<
  FormActiveAwaiting,
  "loading" | "loadError" | "viewportHtml"
>;

export type FormActiveAwaitingPatchPayload = Partial<FormActiveAwaitingPatch> & {
  resolvedByOther?: boolean;
};

interface UseComposerAwaitingInput {
  activeAwaiting: AppState["activeAwaiting"];
  dispatch: Dispatch<AppAction>;
}

export function useComposerAwaiting(input: UseComposerAwaitingInput) {
  const { activeAwaiting, dispatch } = input;
  const { t } = useI18n();
  const isAwaitingActive = !!activeAwaiting;

  const resetEventCache = useCallback(() => {
    window.dispatchEvent(new CustomEvent("agent:reset-event-cache"));
  }, []);

  const clearActiveAwaiting = useCallback(() => {
    dispatch({ type: "CLEAR_ACTIVE_AWAITING" });
    resetEventCache();
  }, [dispatch, resetEventCache]);

  const handleAwaitingSubmit = useCallback(
    async (payload: AIAwaitSubmitPayloadData) => {
      if (!activeAwaiting) return;
      try {
        const response = await submitAwaiting({
          runId: payload.runId,
          awaitingId: payload.awaitingId,
          params: payload.params,
        });
        const responseData = response.data as Record<string, unknown> | null;
        const accepted = Boolean(responseData?.accepted ?? true);
        const status = String(responseData?.status || "");
        const detail = String(
          responseData?.detail || (accepted ? "accepted" : "unmatched"),
        );

        if (!accepted) {
          if (status === "already_resolved") {
            void message.info(t("composer.awaiting.alreadyResolved"));
            clearActiveAwaiting();
            return response;
          }
          throw new Error(
            t("composer.awaiting.unmatched", {
              detail,
            }),
          );
        }

        clearActiveAwaiting();
        dispatch({
          type: "APPEND_DEBUG",
          line: `[awaiting] submitted awaitingId=${activeAwaiting.awaitingId}, runId=${activeAwaiting.runId}, detail=${detail}`,
        });
      } catch (error) {
        const isStaleAwaiting =
          error instanceof Error &&
          /unknown awaiting|awaiting.*not found|awaiting.*expired/i.test(
            error.message,
          );
        if (isStaleAwaiting) {
          void message.warning(t("composer.awaiting.expired"));
          clearActiveAwaiting();
          dispatch({ type: "SET_STREAMING", streaming: false });
          dispatch({ type: "SET_ABORT_CONTROLLER", controller: null });
          return;
        }
        return error;
      }
    },
    [activeAwaiting, clearActiveAwaiting, dispatch, t],
  );

  const handlePatchActiveAwaiting = useCallback(
    (patch: FormActiveAwaitingPatchPayload) => {
      dispatch({ type: "PATCH_ACTIVE_AWAITING", patch });
    },
    [dispatch],
  );

  return {
    clearActiveAwaiting,
    handleAwaitingSubmit,
    handlePatchActiveAwaiting,
    isAwaitingActive,
  };
}
