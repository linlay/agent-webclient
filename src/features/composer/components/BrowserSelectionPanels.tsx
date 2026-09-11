import React, { lazy, Suspense } from "react";
import { Drawer, Spin } from "antd";
import { useLocation } from "react-router-dom";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import { useOptionalBTW } from "@/features/btw/components/BtwProvider";
import { useI18n } from "@/shared/i18n";
import { isDesktopAppMode } from "@/shared/utils/routing";
import styles from "./BrowserSelectionPanels.module.css";

const BtwTab = lazy(() => import("@/features/btw/components/BtwTab").then((module) => ({ default: module.BtwTab })));

export function BrowserSelectionPanels() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const location = useLocation();
  const btw = useOptionalBTW();
  const { t } = useI18n();
  if (isDesktopAppMode()) return null;

  // The full website already renders RightSidebar. Agent/Copilot routes reuse
  // the same BtwProvider and BtwTab through a drawer instead of opening a tab.
  const sideVisible = state.rightSidebarOpen && state.rightSidebarOpenTab === "btw" &&
    Boolean(btw?.getSession(state.chatId));
  const sideOpen = location.pathname !== "/" && sideVisible;
  return (
    <Drawer
      title={t("selection.sideChat.title")}
      placement="right"
      width="min(440px, 100vw)"
      open={sideOpen}
      mask={false}
      styles={{ body: { padding: 0, overflow: "hidden" } }}
      onClose={() => dispatch({ type: "CLOSE_RIGHT_SIDEBAR" })}
      destroyOnHidden
    >
      <Suspense fallback={<div className={styles.status}><Spin /></div>}>
        <BtwTab />
      </Suspense>
    </Drawer>
  );
}
