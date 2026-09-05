import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { Chat } from "@/features/chats/lib/chatState";
import { GlobalHistoryConsole } from "@/features/chats/components/GlobalHistoryConsole";
import { readInitialHistoryOwnerKey } from "@/features/chats/lib/historyRoute";
import {
  buildSurfaceRoute,
  readSurfacePresentationContext,
} from "@/features/surfaces/surfaceRoutes";

export const HistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const [routeSearch] = useSearchParams();
  const initialOwnerKey = React.useMemo(
    () => readInitialHistoryOwnerKey(routeSearch),
    [routeSearch],
  );

  const openChat = React.useCallback((chat: Chat) => {
    const agentKey = String(chat.agentKey || chat.firstAgentKey || "").trim();
    if (!agentKey) return;
    navigate(
      buildSurfaceRoute(
        { kind: "agent", agentKey, chatId: chat.chatId },
        readSurfacePresentationContext(routeSearch.toString()),
      ),
    );
  }, [navigate, routeSearch]);

  return (
    <GlobalHistoryConsole
      initialOwnerKey={initialOwnerKey}
      onOpenChat={openChat}
    />
  );
};
