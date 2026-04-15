import React from "react";
import { useAppState, useAppDispatch } from "../../context/AppContext";
import type { AgentEvent } from "../../context/types";
import { downloadResource, getResourceText } from "../../lib/apiClient";
import { formatAttachmentSize } from "../../lib/attachmentUtils";
import { MaterialIcon } from "../common/MaterialIcon";
import { UiButton } from "../ui/UiButton";
import {
  classifyEventGroup,
  isErrorEventType,
  summarizeEvent,
} from "../../lib/debugEventDisplay";

const logTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function formatDebugTime(timestamp?: number): string {
  if (!timestamp) return "--";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "--";
  return logTimeFormatter.format(date);
}

const EventRow: React.FC<{
  event: AgentEvent;
  index: number;
  onClick: (e: React.MouseEvent<HTMLDivElement>) => void;
}> = ({ event, index, onClick }) => {
  const type = String(event.type || "");
  const seq = event.seq ?? "-";
  const ts = formatDebugTime(event.timestamp);
  const group = classifyEventGroup(type);
  const kindClass = group ? `event-group-${group}` : "";
  const summary = summarizeEvent(event);
  const errorClass = isErrorEventType(type) ? "is-error-type" : "";

  return (
    <div
      className={`event-row is-clickable ${kindClass} ${errorClass}`.trim()}
      data-event-index={index}
      onClick={onClick}
    >
      <div className="event-row-head">
        <strong>{`#${seq} ${type}`}</strong>
        <span className="event-row-time">{ts}</span>
      </div>
      {summary && <div className="event-row-summary">{summary}</div>}
    </div>
  );
};

const textPreviewKinds = new Set(["text", "pdf"]);

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
              state.events.map((event, idx) => (
                <EventRow
                  key={idx}
                  event={event}
                  index={idx}
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    dispatch({
                      type: "SET_EVENT_POPOVER",
                      index: idx,
                      event,
                      anchor: {
                        x: rect.left,
                        y: rect.bottom,
                      },
                    });
                  }}
                />
              ))
            )}
          </div>
        </div>
      )}
    </aside>
  );
};
