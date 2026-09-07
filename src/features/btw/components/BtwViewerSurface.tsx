import React from "react";
import { BtwTabView } from "@/features/btw/components/BtwTab";
import { useStandaloneBtwRuntime } from "@/features/btw/hooks/useStandaloneBtwRuntime";
import { useChatSurfaceReplay } from "@/features/conversation/hooks/useChatSurfaceReplay";
import { IndependentSurfaceFrame } from "@/features/surfaces/components/IndependentSurfaceFrame";
import { useI18n } from "@/shared/i18n";

export const BtwViewerSurface: React.FC<{
  chatId: string;
  initialBtwId: string;
  onBtwIdChange: (btwId: string) => void;
  onBtwIdClear: () => void;
}> = ({ chatId, initialBtwId, onBtwIdChange, onBtwIdClear }) => {
  const { t } = useI18n();
  const chatRuntime = useChatSurfaceReplay({ chatId });
  const runtime = useStandaloneBtwRuntime({
    chatId,
    initialBtwId,
    owner: chatRuntime.snapshot?.owner || null,
    onBtwId: onBtwIdChange,
  });
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
        onSend={runtime.send}
        onDraftChange={runtime.setDraft}
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
