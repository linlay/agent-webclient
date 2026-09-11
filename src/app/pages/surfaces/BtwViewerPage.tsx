import React from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { BtwViewerSurface } from "@/features/btw/components/BtwViewerSurface";
import {
  isSelectionTransferTarget,
  SELECTION_TRANSFER_TARGET_QUERY_PARAM,
} from "@/features/selection/lib/selectionTransfer";

export const BtwViewerPage: React.FC = () => {
  const { chatId = "" } = useParams<{ chatId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawSelectionTransferTarget = String(
    searchParams.get(SELECTION_TRANSFER_TARGET_QUERY_PARAM) || "",
  ).trim();
  const selectionTransferTarget = isSelectionTransferTarget(rawSelectionTransferTarget)
    ? rawSelectionTransferTarget
    : "";
  const updateBtwId = React.useCallback((btwId: string) => {
    const normalized = String(btwId || "").trim();
    if (!normalized || normalized === searchParams.get("btwId")) return;
    const next = new URLSearchParams(searchParams);
    next.set("btwId", normalized);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  const clearBtwId = React.useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("btwId");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  return (
    <BtwViewerSurface
      chatId={chatId.trim()}
      initialBtwId={String(searchParams.get("btwId") || "").trim()}
      selectionTransferTarget={selectionTransferTarget}
      onBtwIdChange={updateBtwId}
      onBtwIdClear={clearBtwId}
    />
  );
};
