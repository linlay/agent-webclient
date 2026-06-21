import { useCallback } from "react";
import type { Dispatch } from "react";
import { App as AntdApp } from "antd";
import type { AppAction } from "@/app/state/AppContext";
import type {
  AIAwaitSubmitPayloadData,
  AppState,
  FormActiveAwaiting,
} from "@/app/state/types";
import { submitAwaiting } from "@/features/transport/lib/apiClientProxy";
import { resolveRunAgentKey } from "@/features/chats/lib/runAgentIdentity";
import {
  getPlanningModeForPlanDecision,
  readPlanSubmitDecision,
} from "@/features/tools/lib/planDecision";
import { useI18n } from "@/shared/i18n";
import { createCompactId } from "@/shared/utils/compactId";

type FormActiveAwaitingPatch = Pick<
  FormActiveAwaiting,
  "loading" | "loadError" | "viewportHtml"
>;

export type FormActiveAwaitingPatchPayload =
  Partial<FormActiveAwaitingPatch> & {
    pendingSubmitId?: string;
  };

interface UseComposerAwaitingInput {
  activeAwaiting: AppState["activeAwaiting"];
  dispatch: Dispatch<AppAction>;
  state: Pick<
    AppState,
    "currentRunAgentKey" | "runAgentById" | "chatId" | "chatAgentById" | "chats"
  >;
}

export function resolveAwaitingSubmitAgentKey(input: {
  activeAwaiting: AppState["activeAwaiting"];
  state: UseComposerAwaitingInput["state"];
  runId: string;
}): string {
  return resolveRunAgentKey({
    runId: input.runId,
    agentKey: input.activeAwaiting?.agentKey,
    currentRunAgentKey: input.state.currentRunAgentKey,
    runAgentById: input.state.runAgentById,
    chatId: input.state.chatId,
    chatAgentById: input.state.chatAgentById,
    chats: input.state.chats,
  });
}

export function buildPlanDecisionPlanningModeAction(input: {
  activeAwaiting: AppState["activeAwaiting"];
  chatId: string;
  params: unknown;
}): AppAction | null {
  if (input.activeAwaiting?.mode !== "plan") {
    return null;
  }
  const decision = readPlanSubmitDecision(input.params);
  const chatId = String(input.chatId || "").trim();
  if (!decision || !chatId) {
    return null;
  }
  return {
    type: "SET_PLANNING_MODE",
    chatId,
    enabled: getPlanningModeForPlanDecision(decision),
    persist: true,
  };
}

export function useComposerAwaiting(input: UseComposerAwaitingInput) {
  const { activeAwaiting, dispatch, state } = input;
  const { t } = useI18n();
  const { message } = AntdApp.useApp();
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
        const agentKey = resolveAwaitingSubmitAgentKey({
          activeAwaiting,
          state,
          runId: payload.runId,
        });
        if (!agentKey) {
          const error = new Error("agentKey is required for awaiting submit");
          dispatch({
            type: "APPEND_DEBUG",
            line: `[awaiting] submit skipped: missing agentKey (awaitingId=${payload.awaitingId}, runId=${payload.runId})`,
          });
          return error;
        }
        const submitId = createCompactId("submit");
        dispatch({
          type: "PATCH_ACTIVE_AWAITING",
          patch: {
            pendingSubmitId: submitId,
          },
        });
        const response = await submitAwaiting({
          chatId: state.chatId,
          runId: payload.runId,
          agentKey,
          awaitingId: payload.awaitingId,
          submitId,
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

        const planningModeAction = buildPlanDecisionPlanningModeAction({
          activeAwaiting,
          chatId: state.chatId,
          params: payload.params,
        });
        if (planningModeAction) {
          dispatch(planningModeAction);
        }

        clearActiveAwaiting();
        if (Boolean(responseData?.continued)) {
          const runId = String(
            responseData?.runId || payload.runId || "",
          ).trim();
          const chatId = String(
            responseData?.chatId || state.chatId || "",
          ).trim();
          if (runId && chatId) {
            window.dispatchEvent(
              new CustomEvent("agent:attach-run", {
                detail: {
                  chatId,
                  runId,
                  agentKey,
                },
              }),
            );
          }
        }
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
    [
      activeAwaiting,
      clearActiveAwaiting,
      dispatch,
      message,
      state.chatAgentById,
      state.chatId,
      state.chats,
      state.currentRunAgentKey,
      state.runAgentById,
      t,
    ],
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
