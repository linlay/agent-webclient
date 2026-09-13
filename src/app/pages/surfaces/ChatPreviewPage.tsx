import React from "react";
import { useLocation, useParams } from "react-router-dom";
import { ChatPreviewSurface } from "@/features/conversation/components/ChatPreviewSurface";
import { readChatPreviewLive } from "@/features/surfaces/surfaceRoutes";

export function ChatPreviewPage() {
  const { chatId = "" } = useParams<{ chatId: string }>();
  const { search } = useLocation();
  return <ChatPreviewSurface chatId={chatId.trim()} live={readChatPreviewLive(search)} />;
}
