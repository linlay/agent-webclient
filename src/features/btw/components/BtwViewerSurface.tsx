import React from "react";
import { BtwTabView } from "@/features/btw/components/BtwTab";
import { useStandaloneBtwRuntime } from "@/features/btw/hooks/useStandaloneBtwRuntime";
import {
  canResetBtwBranch,
  getLatestBtwAnswer,
} from "@/features/btw/lib/btwSession";
import { useChatSurfaceReplay } from "@/features/conversation/hooks/useChatSurfaceReplay";
import { IndependentSurfaceFrame } from "@/features/surfaces/components/IndependentSurfaceFrame";
import { useI18n } from "@/shared/i18n";
import { useAppMessage } from "@/shared/ui/useAppMessage";
import { copyText } from "@/shared/utils/copy";
import { receiveSelectedTextTransfers } from "@/features/selection/lib/selectionTransfer";
import { receiveBtwLaunches } from "@/features/btw/lib/btwLaunchTransfer";
import { useRealtimeTransport } from "@/features/transport/hooks/useRealtimeTransport";
import { isDesktopAppMode } from "@/shared/utils/routing";
import { useDesktopWorkPanelBtwAction } from "@/shared/data/desktop/desktopContextMenu";
import {
  hasDesktopHostBridge,
  postDesktopHostMessage,
} from "@/shared/data/desktop/desktopHostBridge";

export const BtwViewerSurface: React.FC<{
  chatId: string;
  initialBtwId: string;
  selectionTransferTarget?: string;
  btwLaunchTarget?: string;
  onBtwIdChange: (btwId: string) => void;
  onBtwIdClear: () => void;
}> = ({ chatId, initialBtwId, selectionTransferTarget, btwLaunchTarget, onBtwIdChange, onBtwIdClear }) => {
  const { t } = useI18n();
  const message = useAppMessage();
  const transport = useRealtimeTransport();
  const chatRuntime = useChatSurfaceReplay({ chatId });
  const runtime = useStandaloneBtwRuntime({
    chatId,
    initialBtwId,
    owner: chatRuntime.snapshot?.owner || null,
    onBtwId: onBtwIdChange,
  });
  React.useEffect(() => {
    if (!selectionTransferTarget || !chatId) return;
    return receiveSelectedTextTransfers({
      targetId: selectionTransferTarget,
      chatId,
      onFragment: runtime.addDraftSelection,
    });
  }, [chatId, runtime.addDraftSelection, selectionTransferTarget]);
  const ownerReady = chatRuntime.status === "ready" && Boolean(chatRuntime.snapshot?.owner);
  React.useEffect(() => {
    const target = btwLaunchTarget || selectionTransferTarget;
    if (!isDesktopAppMode() || !target || !ownerReady || typeof BroadcastChannel !== "function") return;
    return receiveBtwLaunches(chatId, target, {
      isReady: () => transport.isSurfaceActive?.() !== false,
      accept: (options) => {
        // Only a new, uniquely addressed WorkPanel tab may send an inline question.
        if (options.message && !btwLaunchTarget) return false;
        return runtime.acceptLaunch(options);
      },
    });
  }, [btwLaunchTarget, chatId, ownerReady, runtime.acceptLaunch, selectionTransferTarget, transport]);
  const latestAnswer = React.useMemo(
    () => getLatestBtwAnswer(runtime.session),
    [runtime.session],
  );
  const canReset = canResetBtwBranch(runtime.session);
  const running = runtime.session.status === "running";
  React.useEffect(() => {
    if (!hasDesktopHostBridge()) return;
    postDesktopHostMessage({
      type: "desktop:agent-webclient:btw-state",
      requestId: `btw_state_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      running,
      hasLatestAnswer: Boolean(latestAnswer),
      canResetBranch: canReset,
    });
  }, [canReset, latestAnswer, running]);
  useDesktopWorkPanelBtwAction(
    hasDesktopHostBridge()
      ? (operation) => {
          if (operation === "copy-latest-answer") {
            if (latestAnswer) void copyText(latestAnswer);
            return;
          }
          if (operation === "new-branch") {
            if (runtime.newBranch()) {
              onBtwIdClear();
              void message.success(t("btw.new.created"));
            }
          }
        }
      : null,
  );
  const invalid = !chatId;
  const missingOwner = chatRuntime.status === "ready" && !chatRuntime.snapshot?.owner;
  return (
    <IndependentSurfaceFrame
      kind="btw"
      loading={!invalid && chatRuntime.status === "loading"}
      error={invalid || missingOwner ? t("platformError.code.invalid_request") : chatRuntime.error}
    >
      <BtwTabView
        parentChatId={chatId}
        session={runtime.session}
        onSend={() => runtime.send(t("btw.selectionOnlyPrompt"))}
        onDraftChange={runtime.setDraft}
        onRemoveDraftSelection={runtime.removeDraftSelection}
        onInterrupt={runtime.interrupt}
        onPatchTimelineNode={runtime.patchTimelineNode}
      />
    </IndependentSurfaceFrame>
  );
};
