import React from "react";
import { useParams, useSearchParams } from "react-router-dom";
import type { TimelineSource } from "@/app/state/types";
import { SourceDetailContent } from "@/app/layout/sidebar/right/SourceDetailTab";
import { useChatSurfaceReplay } from "@/features/surfaces/useChatSurfaceReplay";
import { useI18n } from "@/shared/i18n";
import { IndependentSurfaceFrame } from "./SurfaceFrame";

function findSource(
  timelineNodes: Iterable<import("@/app/state/types").TimelineNode>,
  sourceId: string,
): TimelineSource | null {
  for (const node of timelineNodes) {
    if (node.kind !== "source") continue;
    const source = node.sources?.find((item) => item.id === sourceId);
    if (source) return source;
  }
  return null;
}

export const SourceViewPage: React.FC = () => {
  const { sourceId: routeSourceId } = useParams<{ sourceId: string }>();
  const [searchParams] = useSearchParams();
  const sourceId = String(routeSourceId || "").trim();
  const chatId = String(searchParams.get("chatId") || "").trim();
  const chunkId = String(searchParams.get("chunkId") || "").trim();
  const { t } = useI18n();
  const runtime = useChatSurfaceReplay({ chatId });
  const source = React.useMemo(
    () => runtime.snapshot
      ? findSource(runtime.snapshot.projection.timelineNodes.values(), sourceId)
      : null,
    [runtime.snapshot, sourceId],
  );
  const invalid = !sourceId || !chatId;
  const missing = runtime.status === "ready" && !source;
  const error = invalid
    ? t("platformError.code.invalid_request")
    : runtime.error;
  return (
    <IndependentSurfaceFrame
      kind="source"
      title={t("copilot.panel.sourceDetail")}
      identity={sourceId}
      loading={!invalid && runtime.status === "loading"}
      error={error}
      notFound={missing ? t("surface.notFound") : ""}
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
