import React, { useEffect, useRef, useState } from "react";
import { Drawer } from "antd";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import { useI18n } from "@/shared/i18n";
import { LeftSidebar } from "./LeftSidebar";
import { RightSidebar } from "./sidebar/right/RightSidebar";
import { TopNav } from "./TopNav";
import styles from "./MobileLayout.module.css";
import { useMobileViewport } from "./hooks/useMobileViewport";

export function MobileLayout({ children, conversationSearch, overlays }: { children: React.ReactNode; conversationSearch: string; overlays: React.ReactNode }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useMobileViewport(root);
  const pageOpen = location.pathname !== "/mobile";
  useEffect(() => {
    const close = () => setNavigationOpen(false);
    const events = ["agent:load-chat", "agent:start-new-conversation", "agent:select-worker"];
    events.forEach(type => window.addEventListener(type, close));
    return () => events.forEach(type => window.removeEventListener(type, close));
  }, []);
  useEffect(() => { setNavigationOpen(false); }, [location.pathname]);

  const returnToConversation = () => void navigate(`/mobile${conversationSearch}`);
  return <div ref={root} id="app" className={`${styles.root} layout-mobile`}>
    <div className={styles.conversation} data-new-chat={!state.chatId || undefined}>
      <TopNav mobile onOpenNavigation={() => setNavigationOpen(true)} />
      {children}
    </div>
    <Drawer rootClassName={`${styles.drawer} ${styles.navigation}`} title={null} closable={false}
      placement="left" width="min(380px, calc(100vw - 16px))" open={navigationOpen}
      onClose={() => setNavigationOpen(false)} forceRender getContainer={false}
      styles={{ body: { padding: 0, display: "flex", overflow: "hidden" } }}>
      <LeftSidebar mobile onClose={() => setNavigationOpen(false)} />
    </Drawer>
    <Drawer rootClassName={`${styles.drawer} ${styles.panel}`} title={t("mobile.content")}
      placement="right" width="100%" open={state.rightSidebarOpen}
      onClose={() => dispatch({ type: "CLOSE_RIGHT_SIDEBAR" })} forceRender getContainer={false}
      styles={{ body: { padding: 0, display: "flex", overflow: "hidden" } }}>
      <RightSidebar mobile />
    </Drawer>
    <Drawer rootClassName={`${styles.drawer} ${styles.page}`} title={t("mobile.backToChat")}
      placement="right" width="100%" open={pageOpen} onClose={returnToConversation}
      getContainer={false} styles={{ body: { padding: 0, overflow: "auto" } }}>
      <Outlet />
    </Drawer>
    {overlays}
  </div>;
}
