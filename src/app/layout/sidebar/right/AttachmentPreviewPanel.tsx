import React from "react";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import { downloadResource, getResourceText } from "@/shared/api/apiClient";
import { formatAttachmentSize } from "@/features/artifacts/lib/attachmentUtils";
import { UiButton } from "@/shared/ui/UiButton";

const textPreviewKinds = new Set(["text", "pdf"]);

export const AttachmentPreviewPanel: React.FC = () => {
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
          onClick={() =>
            dispatch({ type: "OPEN_RIGHT_SIDEBAR", tab: "overview", preview: null })
          }
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
