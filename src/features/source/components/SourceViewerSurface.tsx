import React from "react";
import { useChatSurfaceReplay } from "@/features/conversation/hooks/useChatSurfaceReplay";
import { SourceDetailContent } from "@/features/source/components/SourceDetail";
import { findSourceById } from "@/features/source/lib/sourceLookup";
import { IndependentSurfaceFrame } from "@/features/surfaces/components/IndependentSurfaceFrame";
import { useI18n } from "@/shared/i18n";

export const SourceViewerSurface: React.FC<{
  chatId: string;
  chunkId: string;
  sourceId: string;
}> = ({ chatId, chunkId, sourceId }) => {
  const { t } = useI18n();
  const runtime = useChatSurfaceReplay({ chatId });
  const source = React.useMemo(
    () => runtime.snapshot
      ? findSourceById(runtime.snapshot.projection.timelineNodes.values(), sourceId)
      : null,
    [runtime.snapshot, sourceId],
  );
  const invalid = !sourceId || !chatId;
  return (
    <IndependentSurfaceFrame
      kind="source"
      loading={!invalid && runtime.status === "loading"}
      error={invalid ? t("platformError.code.invalid_request") : runtime.error}
      notFound={runtime.status === "ready" && !source ? t("surface.notFound") : ""}
    >
      <SourceDetailContent
        source={source}
        chatId={chatId}
        teamChat={runtime.snapshot?.owner?.kind === "orchestrated-team"}
        initialChunkId={chunkId}
      />
    </IndependentSurfaceFrame>
  );
};
