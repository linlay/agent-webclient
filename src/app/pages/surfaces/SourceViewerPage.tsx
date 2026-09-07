import React from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { SourceViewerSurface } from "@/features/source/components/SourceViewerSurface";

export const SourceViewerPage: React.FC = () => {
  const { sourceId = "" } = useParams<{ sourceId: string }>();
  const [searchParams] = useSearchParams();
  return (
    <SourceViewerSurface
      sourceId={sourceId.trim()}
      chatId={String(searchParams.get("chatId") || "").trim()}
      chunkId={String(searchParams.get("chunkId") || "").trim()}
    />
  );
};
