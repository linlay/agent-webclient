import React, { useEffect, useRef } from "react";
import { useLocation, useNavigate, type NavigateOptions } from "react-router-dom";
import { AppShell } from "./AppShell";
import { parseComposerPrefillPayload, parseNewChatTimestamp } from "./AgentChatShell";
import { ClientNavigationContext } from "@/shared/ui/ClientNavigationContext";
import { toMobileRoute } from "@/shared/utils/mobileRoutes";
import { useAppState } from "@/app/state/AppContext";
import { useMobileViewportLock } from "./hooks/useMobileViewportLock";

/** The parent route stays mounted while management and project pages are open. */
export const MobileShell: React.FC = () => {
  const location = useLocation();
  const defaultTitle = useRef(document.title);
  const navigate = useNavigate();
  const navigatePage = React.useCallback((target: string, options?: NavigateOptions) => navigate(toMobileRoute(target), options), [navigate]);
  const state = useAppState();
  const previousChatId = useRef(state.chatId);
  const conversationSearch = useRef(location.pathname === "/mobile" ? location.search : "");
  if (location.pathname === "/mobile") conversationSearch.current = location.search;
  const currentRoute = useRef(location);
  currentRoute.current = location;
  const initialized = useRef("");
  const query = new URLSearchParams(conversationSearch.current);

  useMobileViewportLock();

  useEffect(() => {
    if (location.pathname === "/mobile") document.title = defaultTitle.current;
  }, [location.pathname]);

  useEffect(() => {
    const handleConversation = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const params = new URLSearchParams(conversationSearch.current);
      for (const key of ["chatId", "agentKey", "newChat", "composerDraft", "composerSkill", "composerUrl"]) params.delete(key);
      if (event.type !== "agent:start-new-conversation" && event.type !== "agent:select-worker") {
        if (!detail.chatId) return;
        params.set("chatId", String(detail.chatId));
      }
      const search = params.toString();
      const target = `/mobile${search ? `?${search}` : ""}`;
      if (event.type === "agent:new-chat-created" && currentRoute.current.pathname !== "/mobile") {
        conversationSearch.current = search ? `?${search}` : "";
        return;
      }
      if (`${currentRoute.current.pathname}${currentRoute.current.search}` !== target) {
        void navigate(target, { replace: event.type === "agent:new-chat-created" });
      }
    };
    const events = ["agent:load-chat", "agent:new-chat-created", "agent:start-new-conversation", "agent:select-worker"];
    events.forEach(type => window.addEventListener(type, handleConversation));
    return () => events.forEach(type => window.removeEventListener(type, handleConversation));
  }, [navigate]);

  // Worker selection can load a live Chat directly, without a load-chat event.
  useEffect(() => {
    const changed = previousChatId.current !== state.chatId;
    previousChatId.current = state.chatId;
    if (!changed || !state.chatId || location.pathname !== "/mobile" || query.get("chatId") || query.get("agentKey")) return;
    const params = new URLSearchParams(conversationSearch.current);
    params.set("chatId", state.chatId);
    void navigate(`/mobile?${params}`, { replace: true });
  }, [state.chatId, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (location.pathname !== "/mobile") return;
    const params = new URLSearchParams(location.search);
    const agentKey = params.get("agentKey")?.trim();
    if (params.get("chatId") || !agentKey) return;
    const key = `${agentKey}:${parseNewChatTimestamp(params.get("newChat"))}`;
    if (initialized.current === key) return;
    initialized.current = key;
    const prefill = params.has("composerUrl") ? null : parseComposerPrefillPayload(params);
    window.dispatchEvent(new CustomEvent("agent:start-new-conversation", {
      detail: {
        agentKey, preserveWorkerContext: true, focusComposerOnComplete: false,
        ...(prefill ? { composerDraft: prefill.draft, references: prefill.skillId ? [{ id: prefill.skillId, type: "skill" }] : [] } : {}),
      },
    }));
  }, [location.pathname, location.search]);

  return <ClientNavigationContext.Provider value={navigatePage}>
    <AppShell presentation="mobile" targetChatId={query.get("chatId") || undefined}
      conversationSearch={conversationSearch.current} />
  </ClientNavigationContext.Provider>;
};
