import React from "react";
import { useParams } from "react-router-dom";
import { DebugViewerSurface } from "@/features/debug/components/DebugViewerSurface";

export const DebugViewerPage: React.FC = () => {
  const { chatId = "" } = useParams<{ chatId: string }>();
  return <DebugViewerSurface chatId={chatId.trim()} />;
};
