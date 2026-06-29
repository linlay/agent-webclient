import React from "react";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { Tabs, type TabsProps } from "antd";
import { AttachmentPreviewPanel } from "@/app/layout/sidebar/right/AttachmentPreviewPanel";
import { DebugTab } from "@/app/layout/sidebar/right/DebugTab";
import { OverviewTab } from "@/app/layout/sidebar/right/OverviewTab";
import { SourceDetailTab } from "@/app/layout/sidebar/right/SourceDetailTab";
import type { RightSidebarTabKey } from "@/app/state/uiTypes";
import { isDebugPanelEnabled } from "@/shared/config/featureFlags";
import { UiButton } from "@/shared/ui/UiButton";
import { useI18n } from "@/shared/i18n";

type RightSidebarTabsKey = Exclude<RightSidebarTabKey, "debug">;

const RIGHT_SIDEBAR_WIDTH_STORAGE_KEY = "agent-webclient:right-sidebar-width";
const RIGHT_SIDEBAR_DEFAULT_WIDTH = 320;
const RIGHT_SIDEBAR_MIN_WIDTH = 280;
const RIGHT_SIDEBAR_MAX_WIDTH = 720;
const RIGHT_SIDEBAR_MAIN_MIN_WIDTH = 420;

function clampRightSidebarWidth(width: number): number {
  const viewportMax =
    typeof window === "undefined"
      ? RIGHT_SIDEBAR_MAX_WIDTH
      : Math.max(
          RIGHT_SIDEBAR_MIN_WIDTH,
          window.innerWidth - RIGHT_SIDEBAR_MAIN_MIN_WIDTH,
        );
  const maxWidth = Math.min(RIGHT_SIDEBAR_MAX_WIDTH, viewportMax);
  return Math.min(Math.max(width, RIGHT_SIDEBAR_MIN_WIDTH), maxWidth);
}

function readStoredRightSidebarWidth(): number {
  if (typeof window === "undefined") {
    return RIGHT_SIDEBAR_DEFAULT_WIDTH;
  }

  try {
    const stored = window.localStorage?.getItem(
      RIGHT_SIDEBAR_WIDTH_STORAGE_KEY,
    );
    const parsed = stored ? Number.parseInt(stored, 10) : NaN;
    return Number.isFinite(parsed)
      ? clampRightSidebarWidth(parsed)
      : RIGHT_SIDEBAR_DEFAULT_WIDTH;
  } catch {
    return RIGHT_SIDEBAR_DEFAULT_WIDTH;
  }
}

function persistRightSidebarWidth(width: number): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage?.setItem(
      RIGHT_SIDEBAR_WIDTH_STORAGE_KEY,
      String(width),
    );
  } catch {
    // Width persistence is a convenience; resizing should still work.
  }
}

export const RightSidebar: React.FC = () => {
  const { t } = useI18n();
  const dispatch = useAppDispatch();
  const state = useAppState();
  const preview = state.attachmentPreview;
  const sourceDetail = state.activeSourceDetail;
  const debugPanelEnabled = isDebugPanelEnabled();
  const desktopSidebarVisible = state.rightSidebarOpen;
  const initialPanel =
    state.rightSidebarOpenTab === "debug" && debugPanelEnabled
      ? "debug"
      : state.rightSidebarOpenTab === "preview" && preview
        ? "preview"
        : state.rightSidebarOpenTab === "sourceDetail" && sourceDetail
          ? "sourceDetail"
          : "overview";
  const [activePanel, setActivePanel] =
    React.useState<RightSidebarTabKey>(initialPanel);
  const [activeTab, setActiveTab] = React.useState<RightSidebarTabsKey>(
    initialPanel === "debug" ? "overview" : initialPanel,
  );
  const [sidebarWidth, setSidebarWidth] = React.useState(
    readStoredRightSidebarWidth,
  );

  React.useEffect(() => {
    if (!state.rightSidebarOpen || !state.rightSidebarOpenTab) {
      return;
    }

    if (state.rightSidebarOpenTab === "debug" && !debugPanelEnabled) {
      setActivePanel("overview");
      setActiveTab("overview");
      return;
    }

    if (state.rightSidebarOpenTab === "preview" && !preview) {
      setActivePanel("overview");
      setActiveTab("overview");
      return;
    }

    if (state.rightSidebarOpenTab === "sourceDetail" && !sourceDetail) {
      setActivePanel("overview");
      setActiveTab("overview");
      return;
    }

    setActivePanel(state.rightSidebarOpenTab);
    if (state.rightSidebarOpenTab !== "debug") {
      setActiveTab(state.rightSidebarOpenTab);
    }
  }, [
    preview,
    sourceDetail,
    debugPanelEnabled,
    state.rightSidebarOpen,
    state.rightSidebarOpenTab,
  ]);

  React.useEffect(() => {
    if (activePanel === "debug" && !debugPanelEnabled) {
      setActivePanel("overview");
      setActiveTab("overview");
      return;
    }
    if (activePanel === "preview" && !preview) {
      setActivePanel("overview");
      setActiveTab("overview");
    }
    if (activePanel === "sourceDetail" && !sourceDetail) {
      setActivePanel("overview");
      setActiveTab("overview");
    }
  }, [activePanel, debugPanelEnabled, preview, sourceDetail]);

  React.useEffect(() => {
    document.documentElement.style.setProperty(
      "--right-sidebar-width",
      `${sidebarWidth}px`,
    );
  }, [sidebarWidth]);

  React.useEffect(() => {
    const handleWindowResize = () => {
      setSidebarWidth((width) => clampRightSidebarWidth(width));
    };

    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, []);

  const updateSidebarWidth = React.useCallback((width: number) => {
    const nextWidth = clampRightSidebarWidth(width);
    setSidebarWidth(nextWidth);
    return nextWidth;
  }, []);

  const handleResizePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;

      event.preventDefault();
      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);
      document.body.classList.add("right-sidebar-resizing");

      const handlePointerMove = (moveEvent: PointerEvent) => {
        updateSidebarWidth(window.innerWidth - moveEvent.clientX);
      };

      const finishResize = (upEvent: PointerEvent) => {
        handle.releasePointerCapture(upEvent.pointerId);
        document.body.classList.remove("right-sidebar-resizing");
        const nextWidth = updateSidebarWidth(
          window.innerWidth - upEvent.clientX,
        );
        persistRightSidebarWidth(nextWidth);
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", finishResize);
        window.removeEventListener("pointercancel", finishResize);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", finishResize);
      window.addEventListener("pointercancel", finishResize);
    },
    [updateSidebarWidth],
  );

  const handleResizeKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      let nextWidth: number | null = null;

      if (event.key === "ArrowLeft") {
        nextWidth = sidebarWidth + 16;
      } else if (event.key === "ArrowRight") {
        nextWidth = sidebarWidth - 16;
      } else if (event.key === "Home") {
        nextWidth = RIGHT_SIDEBAR_MIN_WIDTH;
      } else if (event.key === "End") {
        nextWidth = RIGHT_SIDEBAR_MAX_WIDTH;
      }

      if (nextWidth === null) return;
      event.preventDefault();
      persistRightSidebarWidth(updateSidebarWidth(nextWidth));
    },
    [sidebarWidth, updateSidebarWidth],
  );

  const tabItems = React.useMemo<TabsProps["items"]>(() => {
    const items: NonNullable<TabsProps["items"]> = [
      {
        key: "overview",
        label: t("copilot.panel.overview"),
        icon: <MaterialIcon name="dashboard" />,
        children: <OverviewTab />,
      },
    ];

    if (sourceDetail) {
      items.push({
        key: "sourceDetail",
        label: t("copilot.panel.sourceDetail"),
        icon: <MaterialIcon name="description" />,
        children: <SourceDetailTab />,
      });
    }

    if (preview) {
      items.push({
        key: "preview",
        label: t("copilot.panel.preview"),
        icon: <MaterialIcon name="visibility" />,
        children: <AttachmentPreviewPanel />,
      });
    }

    return items;
  }, [preview, sourceDetail, t]);

  const handleTabChange = React.useCallback((key: string) => {
    const nextTab = key as RightSidebarTabsKey;
    setActiveTab(nextTab);
    setActivePanel(nextTab);
  }, []);

  return (
    <aside
      className={`sidebar right-sidebar ${desktopSidebarVisible ? "is-open" : ""}`}
    >
      <button
        type="button"
        className="right-sidebar-resize-handle"
        aria-label={t("rightSidebar.resize.ariaLabel")}
        aria-orientation="vertical"
        aria-valuemin={RIGHT_SIDEBAR_MIN_WIDTH}
        aria-valuemax={RIGHT_SIDEBAR_MAX_WIDTH}
        aria-valuenow={sidebarWidth}
        role="separator"
        tabIndex={desktopSidebarVisible ? 0 : -1}
        title={t("rightSidebar.resize.title")}
        onPointerDown={handleResizePointerDown}
        onKeyDown={handleResizeKeyDown}
      />
      {activePanel === "debug" && debugPanelEnabled ? (
        <DebugTab />
      ) : (
        <Tabs
          className="right-sidebar-tabs"
          size="small"
          activeKey={activeTab}
          onChange={handleTabChange}
          items={tabItems}
          tabBarExtraContent={
            <UiButton
              className="icon-btn"
              size="sm"
              variant="ghost"
              iconOnly
              onClick={() => dispatch({ type: "CLOSE_RIGHT_SIDEBAR" })}
              title={t("copilot.panel.close")}
              aria-label={t("copilot.panel.close")}
            >
              <MaterialIcon name="close" />
            </UiButton>
          }
        />
      )}
    </aside>
  );
};
