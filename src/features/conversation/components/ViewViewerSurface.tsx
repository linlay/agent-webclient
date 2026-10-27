import { useChatSurfaceReplay } from "@/features/conversation/hooks/useChatSurfaceReplay";
import { ViewEmbed } from "@/features/timeline/components/ViewEmbed";
import { IndependentSurfaceFrame } from "@/features/surfaces/components/IndependentSurfaceFrame";
import { useI18n } from "@/shared/i18n";
import { useViewPreviewTransfer } from "@/features/viewers/hooks/useViewPreviewTransfer";
import { resolveViewPreview, validViewPreviewAddress, type ViewPreviewAddress } from "@/features/viewers/lib/viewPreview";

export function ViewViewerSurface({ address }: { address: ViewPreviewAddress }) {
  const { t } = useI18n();
  const valid = validViewPreviewAddress(address);
  const replay = useChatSurfaceReplay({ chatId: valid ? address.chatId : "" });
  const live = useViewPreviewTransfer(address);
  const content = live || (replay.snapshot?.chat.chatId === address.chatId
    ? resolveViewPreview(replay.snapshot.projection.timelineNodes, address) : null);
  return <IndependentSurfaceFrame kind="view" flushContent
    loading={valid && !content && replay.status === "loading"}
    error={!valid ? t("platformError.code.invalid_request") : !content ? replay.error : ""}
    notFound={valid && !content && replay.status === "ready" ? t("surface.notFound") : ""}
    onRetry={replay.reload}>
    {content && <ViewEmbed {...content} chatId={address.chatId} runId={address.runId}
      sourceId={address.sourceId} viewIndex={address.viewIndex} allowExpand={false} fill />}
  </IndependentSurfaceFrame>;
}
