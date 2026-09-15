import React from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { SelectionExplainSurface } from "@/features/btw/components/SelectionExplainSurface";

export const SelectionExplainPage: React.FC = () => {
  const { chatId = "" } = useParams<{ chatId: string }>();
  const [searchParams] = useSearchParams();
  return (
    <SelectionExplainSurface
      chatId={chatId.trim()}
      runId={String(searchParams.get("runId") || "").trim()}
    />
  );
};
