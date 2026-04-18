import React from "react";
import { useAppState, useAppDispatch } from "@/app/state/AppContext";
import type { AgentEvent } from "@/app/state/types";
import { downloadResource, getResourceText } from "@/shared/api/apiClient";
import { formatAttachmentSize } from "@/features/artifacts/lib/attachmentUtils";
import { formatDebugTimestamp } from "@/shared/utils/debugTime";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import {
  isErrorEventType,
  type DebugEventGroup,
  getEventId,
  getEventRowGroupClass,
  classifyEventGroup,
  shouldDisplayDebugEvent,
} from "@/features/timeline/lib/debugEventDisplay";
import { Flex, Tabs, Tag } from "antd";

function formatDebugTime(timestamp?: number): string {
  return formatDebugTimestamp(timestamp);
}

const EventRow: React.FC<{
  event: AgentEvent;
  index: number;
  onClick: (e: React.MouseEvent<HTMLDivElement>) => void;
}> = ({ event, index, onClick }) => {
  const type = String(event.type || "");
  const ts = formatDebugTime(event.timestamp);
  const kindClass = getEventRowGroupClass(type);
  const errorClass = isErrorEventType(type) ? "is-error-type" : "";
  const id = getEventId(event);

  return (
    <Flex
      className={`event-row is-clickable ${kindClass} ${errorClass}`.trim()}
      data-event-index={index}
      align="center"
      onClick={onClick}
    >
      <Flex vertical style={{ flex: 1 }}>
        <Flex justify="space-between">
          <strong>{type}</strong>
          <span className="event-row-time">{ts}</span>
        </Flex>
        <span className="event-row-time">{id}</span>
      </Flex>
    </Flex>
  );
};

const textPreviewKinds = new Set(["text", "pdf"]);

const DEBUG_EVENT_TABS: Array<{
  key: "all" | Exclude<DebugEventGroup, "">;
  label: string;
  color: string;
}> = [
  { key: "all", label: "全部", color: "blue" },
  { key: "request", label: "request", color: "#5A86C8" },
  { key: "chat", label: "chat", color: "#6B92BF" },
  { key: "run", label: "run", color: "#4476AD" },
  { key: "awaiting", label: "awaiting", color: "#D2B395" },
  { key: "reasoning", label: "reasoning", color: "#7AB9A8" },
  { key: "content", label: "content", color: "#5AA79D" },
  { key: "tool", label: "tool", color: "#D6A05E" },
  { key: "action", label: "action", color: "#CA9168" },
  { key: "plan", label: "plan", color: "#8E82C4" },
  { key: "task", label: "task", color: "#A094D0" },
  { key: "artifact", label: "artifact", color: "#D98A42" },
];

const AttachmentPreviewPanel: React.FC = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const preview = state.attachmentPreview;
  const [textContent, setTextContent] = React.useState("");
  const [textLoading, setTextLoading] = React.useState(false);
  const [textError, setTextError] = React.useState("");
  const [mediaError, setMediaError] = React.useState("");
  const [downloadError, setDownloadError] = React.useState("");
  const [downloading, setDownloading] = React.useState(false);

  React.useEffect(() => {
    setMediaError("");
  }, [preview?.url, preview?.kind]);

  React.useEffect(() => {
    setDownloadError("");
    setDownloading(false);
  }, [preview?.downloadUrl, preview?.name]);

  React.useEffect(() => {
    if (!preview || preview.kind !== "text") {
      setTextContent("");
      setTextLoading(false);
      setTextError("");
      return;
    }

    const controller = new AbortController();
    setTextLoading(true);
    setTextError("");
    setTextContent("");

    void getResourceText(preview.url, { signal: controller.signal })
      .then((content) => {
        setTextContent(content);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setTextError(error instanceof Error ? error.message : "预览加载失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setTextLoading(false);
        }
      });

    return () => controller.abort();
  }, [preview]);

  const handleDownload = React.useCallback(() => {
    if (!preview || downloading) {
      return;
    }

    setDownloadError("");
    setDownloading(true);
    void downloadResource(preview.downloadUrl, { filename: preview.name })
      .catch((error: unknown) => {
        setDownloadError(
          error instanceof Error ? error.message : "附件下载失败",
        );
      })
      .finally(() => {
        setDownloading(false);
      });
  }, [downloading, preview]);

  if (!preview) {
    return null;
  }

  const metadata = [preview.mimeType || "", formatAttachmentSize(preview.size)]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="attachment-preview-panel">
      <div className="attachment-preview-toolbar">
        <div className="attachment-preview-copy">
          <strong className="attachment-preview-name" title={preview.name}>
            {preview.name}
          </strong>
          {metadata ? (
            <span className="attachment-preview-meta" title={metadata}>
              {metadata}
            </span>
          ) : null}
        </div>
        <UiButton
          variant="secondary"
          size="sm"
          onClick={handleDownload}
          loading={downloading}
        >
          下载
        </UiButton>
        <UiButton
          variant="secondary"
          size="sm"
          onClick={() => dispatch({ type: "CLOSE_ATTACHMENT_PREVIEW" })}
        >
          关闭
        </UiButton>
      </div>

      <div className="attachment-preview-body">
        {preview.kind === "image" ? (
          <img
            className="attachment-preview-image"
            src={preview.url}
            alt={preview.name}
            onError={() => setMediaError("图片预览失败，请下载查看。")}
          />
        ) : null}

        {preview.kind === "pdf" ? (
          <iframe
            className="attachment-preview-frame"
            src={preview.url}
            title={preview.name}
          />
        ) : null}

        {preview.kind === "text" ? (
          textLoading ? (
            <div className="status-line">正在加载文本预览...</div>
          ) : textError ? (
            <div className="status-line">{textError}</div>
          ) : (
            <pre className="attachment-preview-text">
              {textContent || "文件内容为空"}
            </pre>
          )
        ) : null}

        {preview.kind === "audio" ? (
          <div className="attachment-preview-media-shell">
            <audio
              className="attachment-preview-audio"
              src={preview.url}
              controls
              preload="metadata"
              onError={() => setMediaError("音频预览失败，请下载查看。")}
            />
          </div>
        ) : null}

        {preview.kind === "video" ? (
          <video
            className="attachment-preview-video"
            src={preview.url}
            controls
            preload="metadata"
            onError={() => setMediaError("视频预览失败，请下载查看。")}
          />
        ) : null}

        {mediaError ? <div className="status-line">{mediaError}</div> : null}
        {downloadError ? (
          <div className="status-line">{downloadError}</div>
        ) : null}
      </div>

      {textPreviewKinds.has(preview.kind) ? (
        <div className="attachment-preview-note">
          部分文件的实际预览效果取决于浏览器和后端返回头设置。
        </div>
      ) : null}
    </div>
  );
};

export const RightSidebar: React.FC = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const preview = state.attachmentPreview;
  const desktopSidebarVisible =
    state.desktopDebugSidebarEnabled || Boolean(preview);
  const showHeader = state.layoutMode !== "desktop-fixed" || Boolean(preview);

  const openEventPopover = React.useCallback(
    (event: AgentEvent, idx: number, target: HTMLDivElement) => {
      const rect = target.getBoundingClientRect();
      dispatch({
        type: "SET_EVENT_POPOVER",
        index: idx,
        event,
        anchor: {
          x: rect.left,
          y: rect.bottom,
        },
      });
    },
    [dispatch],
  );

  const eventsByTab = React.useMemo(() => {
    const grouped = new Map<
      (typeof DEBUG_EVENT_TABS)[number]["key"],
      Array<{ event: AgentEvent; index: number }>
    >();

    DEBUG_EVENT_TABS.forEach((tab) => grouped.set(tab.key, []));

    state.events.forEach((event, index) => {
      if (!shouldDisplayDebugEvent(event)) {
        return;
      }
      grouped.get("all")?.push({ event, index });
      const group = classifyEventGroup(String(event.type || ""));
      if (group && group !== "request") {
        grouped.get(group)?.push({ event, index });
      }
    });

    return grouped;
  }, [state.events]);

  const tabItems = React.useMemo(
    () =>
      DEBUG_EVENT_TABS.flatMap((tab) => {
        const entries = eventsByTab.get(tab.key) || [];
        if (tab.key !== "all" && entries.length === 0) {
          return [];
        }
        return [
          {
            key: tab.key,
            label: `${tab.label} (${entries.length})`,
            color: tab.color,
            children: (
              <div className="debug-events-tab">
                {entries.map(({ event, index }) => (
                  <EventRow
                    key={`${index}-${String(event.type || "")}`}
                    event={event}
                    index={index}
                    onClick={(e) =>
                      openEventPopover(event, index, e.currentTarget)
                    }
                  />
                ))}
              </div>
            ),
          },
        ];
      }),
    [eventsByTab, openEventPopover],
  );

  const handleClose = () => {
    if (preview) {
      dispatch({ type: "CLOSE_ATTACHMENT_PREVIEW" });
      if (state.layoutMode !== "desktop-fixed") {
        dispatch({ type: "SET_RIGHT_DRAWER_OPEN", open: false });
      }
      return;
    }

    dispatch({ type: "SET_RIGHT_DRAWER_OPEN", open: false });
  };

  return (
    <aside
      className={`sidebar right-sidebar ${
        state.layoutMode === "desktop-fixed"
          ? desktopSidebarVisible
            ? "is-open"
            : ""
          : state.rightDrawerOpen
            ? "is-open"
            : ""
      }`}
      id="right-sidebar"
    >
      {showHeader && (
        <div className="sidebar-head">
          <h2>{preview ? "资源预览" : "调试面板"}</h2>
          <UiButton
            className="drawer-close"
            aria-label={preview ? "关闭资源预览" : "关闭调试面板"}
            variant="ghost"
            size="sm"
            iconOnly
            onClick={handleClose}
          >
            <MaterialIcon name="close" />
          </UiButton>
        </div>
      )}

      {preview ? (
        <AttachmentPreviewPanel />
      ) : (
        <div className="debug-panel">
          <div className="list" id="events-list">
            {state.events.length === 0 ? (
              <div className="status-line">暂无事件</div>
            ) : (
              <Tabs
                size="small"
                renderTabBar={(props) => {
                  return (
                    <Flex wrap gap={6}>
                      {tabItems.map((item) => (
                        <Tag
                          key={item.key}
                          style={{ cursor: "pointer", borderRadius: 12 }}
                          color={
                            props.activeKey === item.key
                              ? item.color
                              : undefined
                          }
                          onClick={(e) => props.onTabClick(item.key, e)}
                        >
                          {item.label}
                        </Tag>
                      ))}
                    </Flex>
                  );
                }}
                items={tabItems}
              />
            )}
          </div>
        </div>
      )}
    </aside>
  );
};
