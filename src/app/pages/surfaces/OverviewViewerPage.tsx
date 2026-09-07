import React from "react";
import { useParams } from "react-router-dom";
import { OverviewViewerSurface } from "@/features/overview/components/OverviewViewerSurface";

export const OverviewViewerPage: React.FC = () => {
  const { chatId = "" } = useParams<{ chatId: string }>();
  return <OverviewViewerSurface chatId={chatId.trim()} />;
};
