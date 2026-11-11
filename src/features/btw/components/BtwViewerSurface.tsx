import React from "react";
import { BtwTabView } from "@/features/btw/components/BtwTab";
import { useStandaloneBtwRuntime } from "@/features/btw/hooks/useStandaloneBtwRuntime";
import { useChatSurfaceReplay } from "@/features/conversation/hooks/useChatSurfaceReplay";
import { IndependentSurfaceFrame } from "@/features/surfaces/components/IndependentSurfaceFrame";
import { useI18n } from "@/shared/i18n";
import { receiveSelectedTextTransfers } from "@/features/selection/lib/selectionTransfer";
import { receiveBtwLaunches } from "@/features/btw/lib/btwLaunchTransfer";
import { useRealtimeTransport } from "@/features/transport/hooks/useRealtimeTransport";
import { isDesktopAppMode } from "@/shared/utils/routing";

export const BtwViewerSurface: React.FC<{
  chatId: string;
  initialBtwId: string;
  selectionTransferTarget?: string;
  btwLaunchTarget?: string;
  onBtwIdChange: (btwId: string) => void;
  onBtwIdClear: () => void;
}> = ({ chatId, initialBtwId, selectionTransferTarget, btwLaunchTarget, onBtwIdChange, onBtwIdClear }) => {
  const { t } = useI18n();
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
        onNewBranch={() => {
          const created = runtime.newBranch();
          if (created) onBtwIdClear();
          return created;
        }}
        onPatchTimelineNode={runtime.patchTimelineNode}
      />
    </IndependentSurfaceFrame>
  );
};
