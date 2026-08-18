import React, { useMemo } from "react";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import {
  Dropdown,
  Flex,
  message,
  Tabs,
  Tooltip,
  Typography,
  type TabsProps,
} from "antd";
import { ContentViewerPanel } from "@/features/viewers/components/ContentViewerPanel";
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
import { copyText } from "@/shared/utils/copy";
import { WebPreviewPanel } from "@/features/web-preview/components/WebPreviewPanel";
import { downloadViewerTarget } from "@/features/viewers/lib/viewerRuntime";
import { formatAttachmentSize } from "@/features/artifacts/lib/attachmentUtils";
import {
  getViewerTargetKey,
  type ViewerTarget,
} from "@/features/viewers/lib/viewerTarget";

type RightSidebarTabsKey = string;

const RIGHT_SIDEBAR_WIDTH_STORAGE_KEY = "agent-webclient:right-sidebar-width";
const RIGHT_SIDEBAR_DEFAULT_WIDTH = 320;
const RIGHT_SIDEBAR_MIN_WIDTH = 280;
const RIGHT_SIDEBAR_MAIN_MIN_WIDTH = 420;
const RIGHT_SIDEBAR_SSR_VIEWPORT_WIDTH = 1280;

function getRightSidebarMaxWidth(): number {
  const viewportWidth =
    typeof window === "undefined"
      ? RIGHT_SIDEBAR_SSR_VIEWPORT_WIDTH
      : window.innerWidth;
  return Math.max(
    RIGHT_SIDEBAR_MIN_WIDTH,
    viewportWidth - RIGHT_SIDEBAR_MAIN_MIN_WIDTH,
  );
}

function clampRightSidebarWidth(
  width: number,
  maxWidth = getRightSidebarMaxWidth(),
): number {
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
    return clampRightSidebarWidth(
      Number.isFinite(parsed) ? parsed : RIGHT_SIDEBAR_DEFAULT_WIDTH,
    );
  } catch {
    return clampRightSidebarWidth(RIGHT_SIDEBAR_DEFAULT_WIDTH);
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

const ViewerTabTooltip: React.FC<{ target: ViewerTarget }> = ({ target }) => {
  const typeLabel = target.type === "resource" ? target.mimeType || "" : "";
  const sizeBytes = target.type === "resource" ? target.sizeBytes : undefined;
  const sizeLabel = useMemo(() => formatAttachmentSize(sizeBytes), [sizeBytes]);
  return (
    <div>
      <div>{target.name}</div>
      <Flex gap={10}>
      {typeLabel ? <div>{typeLabel}</div> : null}
      {sizeLabel ? <div>{sizeLabel}</div> : null}
      </Flex>
    </div>
  );
}

export const RightSidebar: React.FC = () => {
  const { t } = useI18n();
  const dispatch = useAppDispatch();
  const state = useAppState();
  const { discardBTW, getSession } = useBTW();
  const viewerTabs = state.viewerTabs;
  const sourceDetail = state.activeSourceDetail;
  const planningPreviews = state.planningPreviews;
  const webPreviews = state.webPreviews;
  const hasBTWSession = Boolean(state.chatId && getSession(state.chatId));
  const debugPanelEnabled = isDebugPanelEnabled();
  const currentChat = state.chats?.find((chat) => chat.chatId === state.chatId);
  const teamChat = Boolean(
    currentChat?.owner?.kind === "orchestrated-team"
    || String(currentChat?.teamId || "").trim(),
  );
  const desktopSidebarVisible = state.rightSidebarOpen;
  const selectedPanel =
    state.rightSidebarOpenTab === "debug" && debugPanelEnabled
      ? "debug"
      : state.rightSidebarOpenTab === "btw" && hasBTWSession
        ? "btw"
        : state.rightSidebarOpenTab === "viewer" && viewerTabs.length > 0
					? `viewer:${(state.activeViewerKey && viewerTabs.some((target) => getViewerTargetKey(target) === state.activeViewerKey)
						? state.activeViewerKey
						: getViewerTargetKey(viewerTabs[viewerTabs.length - 1]))}`
					: state.rightSidebarOpenTab === "sourceDetail" && sourceDetail
						? "sourceDetail"
						: state.rightSidebarOpenTab === "planningPreview" &&
							planningPreviews.length > 0
							? `planningPreview:${(state.activePlanningPreviewNodeId && planningPreviews.some(p => p.nodeId === state.activePlanningPreviewNodeId)
								? state.activePlanningPreviewNodeId
								: planningPreviews[planningPreviews.length - 1].nodeId)}`
              : state.rightSidebarOpenTab === "web" && webPreviews.length > 0
                ? buildWebTabKey(
                    state.activeWebPreviewUrl ||
                      webPreviews[webPreviews.length - 1].url,
                  )
                : "overview";
  const activePanel: RightSidebarTabKey = selectedPanel === "debug"
    ? "debug"
    : selectedPanel.startsWith("viewer:")
			? "viewer"
      : selectedPanel.startsWith("planningPreview:")
        ? "planningPreview"
        : selectedPanel.startsWith("web:")
          ? "web"
          : (selectedPanel as RightSidebarTabKey);
  const activeTab: RightSidebarTabsKey = selectedPanel === "debug"
    ? "overview"
    : selectedPanel;
  const [sidebarWidth, setSidebarWidth] = React.useState(
    readStoredRightSidebarWidth,
  );
  const [sidebarMaxWidth, setSidebarMaxWidth] = React.useState(
    getRightSidebarMaxWidth,
  );
  const [tabFullscreenRequests, setTabFullscreenRequests] = React.useState<
    Record<string, number>
  >({});

  React.useEffect(() => {
    document.documentElement.style.setProperty(
      "--right-sidebar-width",
      `${sidebarWidth}px`,
    );
  }, [sidebarWidth]);

  React.useEffect(() => {
    const handleWindowResize = () => {
      const nextMaxWidth = getRightSidebarMaxWidth();
      setSidebarMaxWidth(nextMaxWidth);
      setSidebarWidth((width) => clampRightSidebarWidth(width, nextMaxWidth));
    };

    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, []);

  const updateSidebarWidth = React.useCallback((width: number) => {
    const nextMaxWidth = getRightSidebarMaxWidth();
    const nextWidth = clampRightSidebarWidth(width, nextMaxWidth);
    setSidebarMaxWidth(nextMaxWidth);
    setSidebarWidth(nextWidth);
    return nextWidth;
  }, []);

  const handleCloseTab = React.useCallback(
    (key: React.Key) => {
      if (key === "btw") {
        if (state.chatId) {
          discardBTW(state.chatId);
        }
        dispatch({ type: "OPEN_RIGHT_SIDEBAR", tab: "overview" });
      } else if (typeof key === "string" && key.startsWith("viewer:")) {
        const viewerKeyToRemove = key.slice("viewer:".length);
        const remaining = viewerTabs.filter(
          (target) => getViewerTargetKey(target) !== viewerKeyToRemove,
        );
        dispatch({
          type: "OPEN_RIGHT_SIDEBAR",
          tab: remaining.length > 0 ? "viewer" : "overview",
          removeViewerKey: viewerKeyToRemove,
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
    [
      dispatch,
      state.chatId,
      discardBTW,
      viewerTabs,
      planningPreviews,
      webPreviews,
    ],
  );

  const handleRefreshWebTab = React.useCallback(
    (key: string) => {
      dispatch({
        type: "REFRESH_WEB_PREVIEW",
        url: getWebUrlFromTabKey(key),
      });
    },
    [dispatch],
  );

  const handleViewerDownload = React.useCallback(
    (target: ViewerTarget) => {
      void (async () => {
        try {
          await downloadViewerTarget(target, {
            chatId: state.chatId,
            teamChat,
          });
        } catch (error: unknown) {
          message.error(
            error instanceof Error
              ? error.message
              : t("contentViewer.error.download"),
          );
        }
      })();
    },
    [state.chatId, teamChat, t],
  );

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
        nextWidth = sidebarMaxWidth;
      }

      if (nextWidth === null) return;
      event.preventDefault();
      persistRightSidebarWidth(updateSidebarWidth(nextWidth));
    },
    [sidebarMaxWidth, sidebarWidth, updateSidebarWidth],
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

    for (const target of viewerTabs) {
      const viewerKey = getViewerTargetKey(target);
      items.push({
        key: `viewer:${viewerKey}`,
        label: (
          <Tooltip title={<ViewerTabTooltip target={target} />} placement="rightTop">
            <Flex align="center" gap={4}>
              <MaterialIcon name="visibility" />
              <Typography.Text ellipsis className="tw:!max-w-[100px]">
                {target.name}
              </Typography.Text>
            </Flex>
          </Tooltip>
        ),
        children: (
          <ContentViewerPanel
            target={target}
            fullscreenRequest={
              tabFullscreenRequests[`viewer:${viewerKey}`] ?? 0
            }
          />
        ),
      });
    }

    for (const preview of webPreviews) {
      const tabKey = buildWebTabKey(preview.url);
      items.push({
        key: tabKey,
        label: (
          <Flex align="center" gap={4}>
            <MaterialIcon name="open_in_new" />
            <Typography.Text
              ellipsis={{
                tooltip: {
                  title: preview.title,
                  placement: "right",
                },
              }}
              className="tw:!max-w-[100px]"
            >
              {preview.title}
            </Typography.Text>
          </Flex>
        ),
        children: (
          <WebPreviewPanel
            refreshKey={
              state.webPreviewRefreshRevisionByUrl.get(preview.url) ?? 0
            }
            fullscreenRequest={tabFullscreenRequests[tabKey] ?? 0}
            preview={preview}
          />
        ),
      });
    }

    return items;
  }, [
    hasBTWSession,
    viewerTabs,
    sourceDetail,
    planningPreviews,
    t,
    webPreviews,
    state.webPreviewRefreshRevisionByUrl,
    tabFullscreenRequests,
  ]);

  const handleTabChange = React.useCallback(
    (key: string) => {
      if (key.startsWith("viewer:")) {
        dispatch({
          type: "OPEN_RIGHT_SIDEBAR",
          tab: "viewer",
          activeViewerKey: key.slice("viewer:".length),
        });
      } else if (key.startsWith("planningPreview:")) {
        dispatch({
          type: "OPEN_RIGHT_SIDEBAR",
          tab: "planningPreview",
          activePlanningPreviewNodeId: key.slice("planningPreview:".length),
        });
      } else if (key.startsWith("web:")) {
        dispatch({
          type: "OPEN_RIGHT_SIDEBAR",
          tab: "web",
          activeWebPreviewUrl: getWebUrlFromTabKey(key),
        });
      } else {
        dispatch({
          type: "OPEN_RIGHT_SIDEBAR",
          tab: key as RightSidebarTabKey,
        });
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
        aria-valuemax={sidebarMaxWidth}
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
                const isViewerTab = node.key.startsWith("viewer:");

                const menuitems = [
                  ...(isWebTab
                    ? [
                        {
                          key: "refresh",
                          label: t("rightSidebar.web.contextMenu.refresh"),
                          icon: (
                            <MaterialIcon
                              name="refresh"
                              className="tw:opacity-[0.5]"
                            />
                          ),
                          onClick: () =>
                            handleRefreshWebTab(node.key as string),
                        },
                        {
                          key: "copy",
                          label: t("rightSidebar.web.contextMenu.copyUrl"),
                          icon: (
                            <MaterialIcon
                              name="content_copy"
                              className="tw:opacity-[0.5]"
                            />
                          ),
                          onClick: () => {
                            const url = getWebUrlFromTabKey(node.key as string);
                            copyText(url).then(() => {
                              message.success(t("rightSidebar.copy.success"));
                            });
                          },
                        },
                        {
                          key: "fullscreen",
                          label: t("rightSidebar.web.contextMenu.fullscreen"),
                          icon: (
                            <MaterialIcon
                              name="crop_free"
                              className="tw:opacity-[0.5]"
                            />
                          ),
                          onClick: () => {
                            const tabKey = node.key as string;
                            setTabFullscreenRequests((prev) => ({
                              ...prev,
                              [tabKey]: (prev[tabKey] ?? 0) + 1,
                            }));
                          },
                        },
                      ]
                    : isViewerTab
                      ? [
                          {
                            key: "download",
                            label: t("contentViewer.action.download"),
                            icon: (
                              <MaterialIcon
                                name="download"
                                className="tw:opacity-[0.5]"
                              />
                            ),
                            onClick: () => {
                              const viewerKey = (node.key as string).slice(
                                "viewer:".length,
                              );
                              const target = viewerTabs.find(
                                (item) => getViewerTargetKey(item) === viewerKey,
                              );
                              if (target) {
                                handleViewerDownload(target);
                              }
                            },
                          },
                          {
                            key: "fullscreen",
                            label: t("rightSidebar.web.contextMenu.fullscreen"),
                            icon: (
                              <MaterialIcon
                                name="crop_free"
                                className="tw:opacity-[0.5]"
                              />
                            ),
                            onClick: () => {
                              const tabKey = node.key as string;
                              setTabFullscreenRequests((prev) => ({
                                ...prev,
                                [tabKey]: (prev[tabKey] ?? 0) + 1,
                              }));
                            },
                          },
                        ]
                      : []),
                  {
                    key: "close",
                    label: t("rightSidebar.web.contextMenu.close"),
                    icon: (
                      <MaterialIcon name="close" className="tw:opacity-[0.5]" />
                    ),
                    onClick: () => handleCloseTab(node.key as string),
                  },
                ];

                return (
                  <Dropdown
                    key={node.key}
                    trigger={["contextMenu"]}
                    overlayStyle={{
                      minWidth: 100,
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
