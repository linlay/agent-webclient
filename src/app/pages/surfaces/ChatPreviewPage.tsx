import React from "react";
import { useLocation, useParams } from "react-router-dom";
import { ChatPreviewSurface } from "@/features/conversation/components/ChatPreviewSurface";
import { ChatTimelineSurface } from "@/features/conversation/components/ChatTimelineSurface";
import { readChatPreviewLive } from "@/features/surfaces/lib/surfaceRoutes";

export function ChatPreviewPage() {
  const { chatId = "" } = useParams<{ chatId: string }>();
  const { search } = useLocation();
  if (new URLSearchParams(search).get("presentation") === "timeline") {
    return <ChatTimelineSurface key={chatId} chatId={chatId.trim()} live={readChatPreviewLive(search)} />;
  }
  return <ChatPreviewSurface chatId={chatId.trim()} live={readChatPreviewLive(search)} />;
}
