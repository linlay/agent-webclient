import React, { useCallback, useEffect, useRef, useState } from "react";
import { Drawer } from "antd";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import { useI18n } from "@/shared/i18n";
import { LeftSidebar } from "./LeftSidebar";
import { RightSidebar } from "./sidebar/right/RightSidebar";
import { TopNav } from "./TopNav";
import { MobileSwipeDrawer, type MobileSwipeDrawerHandle } from "@/shared/ui/MobileSwipeDrawer";
import styles from "./MobileLayout.module.css";
import { useMobileViewport } from "./hooks/useMobileViewport";
import { useMobileSwipeGestures } from "@/shared/ui/hooks/useMobileSwipeGestures";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import {
  MobilePageHeaderActionProvider,
  MobilePageHeaderActionSlot,
} from "@/shared/ui/MobilePageHeaderAction";

export function MobileLayout({ children, conversationSearch, overlays }: { children: React.ReactNode; conversationSearch: string; overlays: React.ReactNode }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const conversation = useRef<HTMLDivElement>(null);
  const navigationDrawer = useRef<MobileSwipeDrawerHandle>(null);
  const contentDrawer = useRef<MobileSwipeDrawerHandle>(null);
  useMobileViewport(root);
  const pageOpen = location.pathname !== "/mobile";

  const openNavigation = useCallback(() => {
    setNavigationOpen(true);
    if (state.rightSidebarOpen) dispatch({ type: "CLOSE_RIGHT_SIDEBAR" });
  }, [dispatch, state.rightSidebarOpen]);
  const closeNavigation = useCallback(() => setNavigationOpen(false), []);
  const openContent = useCallback(() => {
    setNavigationOpen(false);
    dispatch({ type: "OPEN_RIGHT_SIDEBAR", tab: "overview" });
  }, [dispatch]);
  const closeContent = useCallback(() => dispatch({ type: "CLOSE_RIGHT_SIDEBAR" }), [dispatch]);

  useMobileSwipeGestures({
    rootRef: root,
    left: { ref: navigationDrawer, open: navigationOpen, onOpen: openNavigation, onClose: closeNavigation },
    right: { ref: contentDrawer, open: state.rightSidebarOpen, onOpen: openContent, onClose: closeContent },
    disabled: pageOpen,
  });

  useEffect(() => {
    const close = () => setNavigationOpen(false);
    const events = ["agent:load-chat", "agent:start-new-conversation", "agent:select-worker"];
    events.forEach(type => window.addEventListener(type, close));
    return () => events.forEach(type => window.removeEventListener(type, close));
  }, []);
  useEffect(() => { setNavigationOpen(false); }, [location.pathname]);
  // Only one drawer is present at a time: opening content from a link keeps the
  // navigation from lingering underneath.
  useEffect(() => {
    if (state.rightSidebarOpen) setNavigationOpen(false);
  }, [state.rightSidebarOpen]);
  // The screen behind an open drawer is not part of the interaction or the
  // accessibility tree until it closes again.
  const drawerOpen = navigationOpen || state.rightSidebarOpen;
  useEffect(() => {
    const element = conversation.current;
    if (!element) return;
    element.inert = drawerOpen;
    return () => { element.inert = false; };
  }, [drawerOpen]);

  const returnToConversation = () => void navigate(`/mobile${conversationSearch}`);
  return <div ref={root} id="app" className={`${styles.root} layout-mobile`}>
    <div ref={conversation} className={styles.conversation} data-new-chat={!state.chatId || undefined}>
      <TopNav mobile onOpenNavigation={openNavigation} />
      {children}
    </div>
    <MobileSwipeDrawer ref={navigationDrawer} side="left" open={navigationOpen}
      onClose={closeNavigation} ariaLabel={t("mobile.navigation")} className={styles.navigation}>
      <LeftSidebar mobile onClose={closeNavigation} />
    </MobileSwipeDrawer>
    <MobileSwipeDrawer ref={contentDrawer} side="right" open={state.rightSidebarOpen}
      onClose={closeContent} ariaLabel={t("mobile.content")} className={styles.panel}>
      <RightSidebar mobile />
    </MobileSwipeDrawer>
    <MobilePageHeaderActionProvider>
      <Drawer rootClassName={`${styles.drawer} ${styles.page}`} title={t("mobile.backToChat")}
        placement="right" width="100%" open={pageOpen} onClose={returnToConversation}
        getContainer={false} extra={<MobilePageHeaderActionSlot />} push={false}
        closeIcon={<MaterialIcon name="keyboard_arrow_right" style={{ width: 20, height: 20, fontSize: 20 }} />}
        styles={{ body: { padding: 0, overflow: "auto" } }}>
        <Outlet />
      </Drawer>
    </MobilePageHeaderActionProvider>
    {overlays}
  </div>;
}
