import React, { lazy, Suspense } from "react";
import { Drawer, Modal, Spin } from "antd";
import { useLocation } from "react-router-dom";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import { useOptionalBTW } from "@/features/btw/components/BtwProvider";
import { useI18n } from "@/shared/i18n";
import { isDesktopAppMode } from "@/shared/utils/routing";
import type { SelectionExplanationState } from "@/features/composer/hooks/useDesktopSelectionActions";
import styles from "./BrowserSelectionPanels.module.css";

const BtwTab = lazy(() => import("@/features/btw/components/BtwTab").then((module) => ({ default: module.BtwTab })));
const SelectionExplainSurface = lazy(() => import("@/features/btw/components/SelectionExplainSurface").then((module) => ({ default: module.SelectionExplainSurface })));

export function BrowserSelectionPanels({
  explanation,
  onCloseExplanation,
}: {
  explanation: SelectionExplanationState | null;
  onCloseExplanation: () => void;
}) {
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
  const sideWidth = location.pathname === "/" ? "var(--right-sidebar-width, 320px)" : "440px";
  return (
    <>
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
      <Modal
        title={t("selection.toolbar.moreDetails")}
        open={Boolean(explanation)}
        onCancel={onCloseExplanation}
        footer={null}
        width={sideVisible
          ? `min(760px, calc(100vw - 32px), max(320px, calc(100vw - ${sideWidth} - 48px)))`
          : "min(760px, calc(100vw - 32px))"}
        mask={false}
        styles={{ wrapper: { pointerEvents: "none" }, content: { pointerEvents: "auto" } }}
        className={`${styles.explanation} ${sideVisible ? styles.alongside : ""}`}
        destroyOnHidden
      >
        <div className={styles.explanationBody}>
          {explanation?.status === "pending" ? (
            <div className={styles.status} role="status"><Spin /><span>{t("selection.explain.preparing")}</span></div>
          ) : explanation?.status === "error" ? (
            <div className={styles.status} role="alert">{explanation.message}</div>
          ) : explanation?.status === "ready" ? (
            <Suspense fallback={<div className={styles.status}><Spin /></div>}>
              <SelectionExplainSurface
                key={explanation.requestId}
                chatId={explanation.chatId}
                runId={explanation.runId}
                embedded
              />
            </Suspense>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
