import React from "react";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { Dropdown, Flex, Tabs, Typography, type TabsProps } from "antd";
import { AttachmentPreviewPanel } from "@/features/artifacts/components/AttachmentPreviewPanel";
import { DebugTab } from "@/app/layout/sidebar/right/DebugTab";
import { OverviewTab } from "@/app/layout/sidebar/right/OverviewTab";
import { SourceDetailTab } from "@/app/layout/sidebar/right/SourceDetailTab";
import { PlanningPreviewTab } from "@/app/layout/sidebar/right/PlanningPreviewTab";
import { BtwTab } from "@/features/btw/components/BtwTab";
import { useBTW } from "@/features/btw/components/BtwProvider";
import type { RightSidebarTabKey } from "@/app/state/uiTypes";
import { isDebugPanelEnabled } from "@/shared/config/featureFlags";
import { UiButton } from "@/shared/ui/UiButton";
import { useI18n } from "@/shared/i18n";
import { WebPreviewPanel } from "@/features/web-preview/components/WebPreviewPanel";

type RightSidebarTabsKey = string;

const RIGHT_SIDEBAR_WIDTH_STORAGE_KEY = "agent-webclient:right-sidebar-width";
const RIGHT_SIDEBAR_DEFAULT_WIDTH = 320;
const RIGHT_SIDEBAR_MIN_WIDTH = 280;
const RIGHT_SIDEBAR_MAX_WIDTH = Math.round(
  (typeof window === "undefined" ? 1280 : window.innerWidth) / 2,
);
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

function buildWebTabKey(url: string): string {
  return `web:${url}`;
}

function getWebUrlFromTabKey(key: string): string {
  return key.startsWith("web:") ? key.slice("web:".length) : "";
}

export const RightSidebar: React.FC = () => {
  const { t } = useI18n();
  const dispatch = useAppDispatch();
  const state = useAppState();
  const { discardBTW, getSession } = useBTW();
  const previews = state.attachmentPreview;
  const sourceDetail = state.activeSourceDetail;
  const planningPreviews = state.planningPreviews;
  const webPreviews = state.webPreviews;
  const hasBTWSession = Boolean(state.chatId && getSession(state.chatId));
  const debugPanelEnabled = isDebugPanelEnabled();
  const desktopSidebarVisible = state.rightSidebarOpen;
  const initialPanel =
    state.rightSidebarOpenTab === "debug" && debugPanelEnabled
      ? "debug"
      : state.rightSidebarOpenTab === "btw" && hasBTWSession
        ? "btw"
        : state.rightSidebarOpenTab === "preview" && previews.length > 0
          ? `preview:${previews[previews.length - 1].url}`
          : state.rightSidebarOpenTab === "sourceDetail" && sourceDetail
            ? "sourceDetail"
            : state.rightSidebarOpenTab === "planningPreview" &&
                planningPreviews.length > 0
              ? `planningPreview:${planningPreviews[planningPreviews.length - 1].nodeId}`
              : state.rightSidebarOpenTab === "web" && webPreviews.length > 0
                ? buildWebTabKey(
                    state.activeWebPreviewUrl ||
                      webPreviews[webPreviews.length - 1].url,
                  )
                : "overview";
  const [activePanel, setActivePanel] = React.useState<RightSidebarTabKey>(
    initialPanel === "debug"
      ? "debug"
      : initialPanel.startsWith("preview:")
        ? "preview"
        : initialPanel.startsWith("planningPreview:")
          ? "planningPreview"
          : initialPanel.startsWith("web:")
            ? "web"
            : (initialPanel as RightSidebarTabKey),
  );
  const [activeTab, setActiveTab] = React.useState<RightSidebarTabsKey>(
    initialPanel === "debug" ? "overview" : initialPanel,
  );
  const [sidebarWidth, setSidebarWidth] = React.useState(
    readStoredRightSidebarWidth,
  );
  const [tabRefreshKeys, setTabRefreshKeys] = React.useState<
    Record<string, number>
  >({});

  React.useEffect(() => {
    if (!state.rightSidebarOpen || !state.rightSidebarOpenTab) {
      return;
    }

    if (state.rightSidebarOpenTab === "debug" && !debugPanelEnabled) {
      setActivePanel("overview");
      setActiveTab("overview");
      return;
    }

    if (state.rightSidebarOpenTab === "btw" && !hasBTWSession) {
      setActivePanel("overview");
      setActiveTab("overview");
      return;
    }

    if (state.rightSidebarOpenTab === "preview" && previews.length === 0) {
      setActivePanel("overview");
      setActiveTab("overview");
      return;
    }

    if (state.rightSidebarOpenTab === "sourceDetail" && !sourceDetail) {
      setActivePanel("overview");
      setActiveTab("overview");
      return;
    }

    if (
      state.rightSidebarOpenTab === "planningPreview" &&
      planningPreviews.length === 0
    ) {
      setActivePanel("overview");
      setActiveTab("overview");
      return;
    }

    if (state.rightSidebarOpenTab === "web" && webPreviews.length === 0) {
      setActivePanel("overview");
      setActiveTab("overview");
      return;
    }

    const nextPanel = state.rightSidebarOpenTab;
    setActivePanel(nextPanel);
    if (nextPanel !== "debug") {
      if (nextPanel === "preview") {
        const lastPreview = previews[previews.length - 1];
        if (lastPreview) {
          setActiveTab(`preview:${lastPreview.url}`);
        }
      } else if (nextPanel === "planningPreview") {
        const lastPlanning = planningPreviews[planningPreviews.length - 1];
        if (lastPlanning) {
          setActiveTab(`planningPreview:${lastPlanning.nodeId}`);
        }
      } else if (nextPanel === "web") {
        const activeWebPreview = webPreviews.find(
          (preview) => preview.url === state.activeWebPreviewUrl,
        );
        const fallbackWebPreview = webPreviews[webPreviews.length - 1];
        const nextWebPreview = activeWebPreview || fallbackWebPreview;
        if (nextWebPreview) {
          setActiveTab(buildWebTabKey(nextWebPreview.url));
        }
      } else {
        setActiveTab(nextPanel);
      }
    }
  }, [
    previews,
    sourceDetail,
    planningPreviews,
    webPreviews,
    debugPanelEnabled,
    hasBTWSession,
    state.rightSidebarOpen,
    state.rightSidebarOpenTab,
    state.activeWebPreviewUrl,
  ]);

  React.useEffect(() => {
    if (activePanel === "debug" && !debugPanelEnabled) {
      setActivePanel("overview");
      setActiveTab("overview");
      return;
    }
    if (activePanel === "btw" && !hasBTWSession) {
      setActivePanel("overview");
      setActiveTab("overview");
      return;
    }
    if (activePanel === "preview" && previews.length === 0) {
      setActivePanel("overview");
      setActiveTab("overview");
    }
    if (activePanel === "sourceDetail" && !sourceDetail) {
      setActivePanel("overview");
      setActiveTab("overview");
    }
    if (activePanel === "planningPreview" && planningPreviews.length === 0) {
      setActivePanel("overview");
      setActiveTab("overview");
    }
    if (activePanel === "web" && webPreviews.length === 0) {
      setActivePanel("overview");
      setActiveTab("overview");
    }
  }, [
    activePanel,
    debugPanelEnabled,
    hasBTWSession,
    previews,
    sourceDetail,
    planningPreviews,
    webPreviews,
  ]);

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

  const handleCloseTab = React.useCallback(
    (key: React.Key) => {
      if (key === "btw") {
        if (state.chatId) {
          discardBTW(state.chatId);
        }
        setActivePanel("overview");
        setActiveTab("overview");
        dispatch({ type: "OPEN_RIGHT_SIDEBAR", tab: "overview" });
      } else if (typeof key === "string" && key.startsWith("preview:")) {
        const urlToRemove = key.slice("preview:".length);
        const remaining = previews.filter((p) => p.url !== urlToRemove);
        dispatch({
          type: "OPEN_RIGHT_SIDEBAR",
          tab: remaining.length > 0 ? "preview" : "overview",
          removePreviewUrl: urlToRemove,
        });
      } else if (
        typeof key === "string" &&
        key.startsWith("planningPreview:")
      ) {
        const nodeIdToRemove = key.slice("planningPreview:".length);
        const remaining = planningPreviews.filter(
          (p) => p.nodeId !== nodeIdToRemove,
        );
        dispatch({
          type: "OPEN_RIGHT_SIDEBAR",
          tab: remaining.length > 0 ? "planningPreview" : "overview",
          removePlanningPreviewNodeId: nodeIdToRemove,
        });
      } else if (typeof key === "string" && key.startsWith("web:")) {
        const urlToRemove = getWebUrlFromTabKey(key);
        const remaining = webPreviews.filter(
          (preview) => preview.url !== urlToRemove,
        );
        dispatch({
          type: "OPEN_RIGHT_SIDEBAR",
          tab: remaining.length > 0 ? "web" : "overview",
          removeWebPreviewUrl: urlToRemove,
        });
      } else if (key === "sourceDetail") {
        dispatch({
          type: "OPEN_RIGHT_SIDEBAR",
          tab: "overview",
          sourceDetail: null,
        });
      }
    },
    [dispatch, state.chatId, discardBTW, previews, planningPreviews, webPreviews],
  );

  const handleRefreshWebTab = React.useCallback((key: string) => {
    setTabRefreshKeys((prev) => ({
      ...prev,
      [key]: (prev[key] ?? 0) + 1,
    }));
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
        label: (
          <Flex align="center" gap={4}>
            <MaterialIcon name="dashboard" />
            <span>{t("copilot.panel.overview")}</span>
          </Flex>
        ),
        closable: false,
        children: <OverviewTab />,
      },
    ];

    if (hasBTWSession) {
      items.push({
        key: "btw",
        label: (
          <Flex align="center" gap={4}>
            <MaterialIcon name="question_answer" />
            <span>{t("btw.title")}</span>
          </Flex>
        ),
        closable: true,
        children: <BtwTab />,
      });
    }

    if (sourceDetail) {
      items.push({
        key: "sourceDetail",
        label: (
          <Flex align="center" gap={4}>
            <MaterialIcon name="book_2" />
            <span>{t("copilot.panel.sourceDetail")}</span>
          </Flex>
        ),
        children: <SourceDetailTab />,
      });
    }

    for (const p of planningPreviews) {
      items.push({
        key: `planningPreview:${p.nodeId}`,
        label: (
          <Flex align="center" gap={4}>
            <MaterialIcon name="assignment" />
            <Typography.Text ellipsis className="tw:!max-w-[100px]">
              {p.label}
            </Typography.Text>
          </Flex>
        ),
        children: <PlanningPreviewTab nodeId={p.nodeId} />,
      });
    }

    for (const p of previews) {
      items.push({
        key: `preview:${p.url}`,
        label: (
          <Flex align="center" gap={4}>
            <MaterialIcon name="visibility" />
            <span>{p.name}</span>
          </Flex>
        ),
        children: <AttachmentPreviewPanel preview={p} />,
      });
    }

    for (const preview of webPreviews) {
      const tabKey = buildWebTabKey(preview.url);
      items.push({
        key: tabKey,
        label: (
          <Flex align="center" gap={4}>
            <MaterialIcon name="open_in_new" />
            <Typography.Text ellipsis className="tw:!max-w-[100px]">
              {preview.title}
            </Typography.Text>
          </Flex>
        ),
        children: (
          <WebPreviewPanel
            refreshKey={tabRefreshKeys[tabKey] ?? 0}
            preview={preview}
          />
        ),
      });
    }

    return items;
  }, [hasBTWSession, previews, sourceDetail, planningPreviews, t, webPreviews, tabRefreshKeys]);

  const handleTabChange = React.useCallback(
    (key: string) => {
      setActiveTab(key);
      if (key.startsWith("preview:")) {
        setActivePanel("preview");
        dispatch({ type: "OPEN_RIGHT_SIDEBAR", tab: "preview" });
      } else if (key.startsWith("planningPreview:")) {
        setActivePanel("planningPreview");
        dispatch({ type: "OPEN_RIGHT_SIDEBAR", tab: "planningPreview" });
      } else if (key.startsWith("web:")) {
        setActivePanel("web");
        dispatch({
          type: "OPEN_RIGHT_SIDEBAR",
          tab: "web",
          activeWebPreviewUrl: getWebUrlFromTabKey(key),
        });
      } else {
        setActivePanel(key as RightSidebarTabKey);
        dispatch({ type: "OPEN_RIGHT_SIDEBAR", tab: key as RightSidebarTabKey });
      }
    },
    [dispatch],
  );

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
          type="editable-card"
          hideAdd
          onChange={handleTabChange}
          items={tabItems}
          onEdit={(key, action) => {
            if (action === "remove" && typeof key === "string") {
              handleCloseTab(key);
            }
          }}
          renderTabBar={(tabBarProps, DefaultTabBar) => (
            <DefaultTabBar {...tabBarProps}>
              {(node) => {
                if (node.key === "overview" || !node.key) return node;
                const isWebTab = node.key.startsWith("web:");

                const menuitems = [
                  ...(isWebTab
                    ? [
                        {
                          key: "refresh",
                          label: "刷新",
                          onClick: () =>
                            handleRefreshWebTab(node.key as string),
                        },
                      ]
                    : []),
                  {
                    key: "close",
                    label: "关闭",
                    onClick: () => handleCloseTab(node.key as string),
                  },
                ];

                return (
                  <Dropdown
                    key={node.key}
                    trigger={["contextMenu"]}
                    overlayStyle={{
                      width: 100,
                    }}
                    menu={{
                      items: menuitems,
                    }}
                  >
                    {node}
                  </Dropdown>
                );
              }}
            </DefaultTabBar>
          )}
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
