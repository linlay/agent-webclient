import { useCallback, useRef } from "react";
import type { MessageInstance } from "antd/es/message/interface";
import { useAppState } from "@/app/state/AppContext";
import { useOpenTarget } from "@/features/surfaces/openTarget";
import { useRunTransport } from "@/features/transport/hooks/useRealtimeTransport";
import type { RunExecution } from "@/features/transport/contracts/realtimeTransport";
import type { QueryModelOverride } from "@/shared/data";
import { createRequestId } from "@/shared/data";
import { resolveRunOwner } from "@/features/runs/lib/runOwner";
import { toRunOwner } from "@/shared/data/runOwner";
import { useI18n } from "@/shared/i18n";
import { useDesktopSelectionActionHandler } from "@/shared/data/desktop/desktopContextMenu";
import type { SelectedTextFragment } from "@/features/selection/lib/selectedTextReference";
import {
  cancelSelectedTextTransfer,
  DESKTOP_SELECTION_BTW_TARGET,
  stageSelectedTextTransfer,
} from "@/features/selection/lib/selectionTransfer";

export function useDesktopSelectionActions(input: {
  addMainFragment: (fragment: SelectedTextFragment) => boolean;
  model: QueryModelOverride;
  messageApi: MessageInstance;
}) {
  const { addMainFragment, model, messageApi } = input;
  const state = useAppState();
  const { t } = useI18n();
  const runs = useRunTransport();
  const openTarget = useOpenTarget();
  const explanationExecutionsRef = useRef(new Map<string, RunExecution>());

  const handleAction = useCallback(async ({
    action,
    fragment,
  }: {
    action: "add-to-chat" | "more-details" | "ask-in-side-chat";
    fragment: SelectedTextFragment;
  }) => {
    if (action === "add-to-chat") {
      addMainFragment(fragment);
      window.dispatchEvent(new CustomEvent("agent:focus-composer"));
      return { ok: true } as const;
    }

    const chatId = String(state.chatId || "").trim();
    if (!chatId) {
      void messageApi.warning(t("selection.action.chatRequired"));
      return { ok: false, code: "chat_required" as const };
    }

    if (action === "ask-in-side-chat") {
      const transfer = stageSelectedTextTransfer({
        targetId: DESKTOP_SELECTION_BTW_TARGET,
        chatId,
        fragment,
      });
      if (!transfer) {
        return { ok: false, code: "surface_not_ready" as const };
      }
      const opened = openTarget({
        version: 1,
        kind: "btw",
        chatId,
        instanceId: DESKTOP_SELECTION_BTW_TARGET,
        selectionTransferTarget: DESKTOP_SELECTION_BTW_TARGET,
        title: t("selection.sideChat.title"),
      });
      if (!opened) {
        cancelSelectedTextTransfer(transfer.transferId);
        return { ok: false, code: "surface_not_ready" as const };
      }
      if (!await transfer.delivered) {
        return { ok: false, code: "surface_not_ready" as const };
      }
      return { ok: true } as const;
    }

    const owner = resolveRunOwner({
      chatId,
      chats: state.chats,
      fallbackOwner: toRunOwner({
        agentKey: state.chatAgentById.get(chatId) || state.currentRunAgentKey,
      }),
    });
    if (!owner) {
      void messageApi.error(t("selection.action.failed"));
      return { ok: false, code: "surface_not_ready" as const };
    }

    const requestId = createRequestId("selection_explain");
    const execution = runs.startBtw({
      requestId,
      chatId,
      message: t("selection.explain.prompt"),
      accessLevel: "default",
      model,
      references: [fragment.reference],
      stream: true,
      owner,
      onEvent: () => undefined,
    });
    explanationExecutionsRef.current.set(requestId, execution);
    void execution.completion.finally(() => {
      if (explanationExecutionsRef.current.get(requestId) === execution) {
        explanationExecutionsRef.current.delete(requestId);
      }
    });
    try {
      const identity = await execution.identity;
      return {
        ok: true,
        handoff: {
          chatId: identity.chatId || chatId,
          runId: identity.runId,
        },
      } as const;
    } catch {
      explanationExecutionsRef.current.delete(requestId);
      void messageApi.error(t("selection.action.failed"));
      return { ok: false, code: "run_start_failed" as const };
    }
  }, [
    addMainFragment,
    messageApi,
    model,
    openTarget,
    runs,
    state.chatAgentById,
    state.chatId,
    state.chats,
    state.currentRunAgentKey,
    t,
  ]);

  useDesktopSelectionActionHandler(handleAction);
}
