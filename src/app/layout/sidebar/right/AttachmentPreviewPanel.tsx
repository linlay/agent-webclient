import React from "react";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import { downloadResource, getResourceText } from "@/shared/api/apiClient";
import type { AttachmentPreviewState } from "@/features/artifacts/lib/attachmentPreview";
import { formatAttachmentSize } from "@/features/artifacts/lib/attachmentUtils";
import { t } from "@/shared/i18n";
import { UiButton } from "@/shared/ui/UiButton";
import { Image } from "antd";

const textPreviewKinds = new Set(["text", "pdf", "html"]);

export const AttachmentPreviewPanel: React.FC<{
  previewOverride?: AttachmentPreviewState | null;
}> = ({ previewOverride }) => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const hasPreviewOverride = previewOverride !== undefined;
  const preview = hasPreviewOverride ? previewOverride : state.attachmentPreview;
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
        setTextError(
          error instanceof Error
            ? error.message
            : t("rightSidebar.preview.error.loadText"),
        );
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
          error instanceof Error
            ? error.message
            : t("rightSidebar.preview.error.download"),
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
          {t("rightSidebar.preview.actions.download")}
        </UiButton>
        <UiButton
          variant="secondary"
          size="sm"
          onClick={() =>
            dispatch({
              type: "OPEN_RIGHT_SIDEBAR",
              tab: "overview",
              preview: null,
            })
          }
        >
          {t("rightSidebar.preview.actions.close")}
        </UiButton>
      </div>

      <div className="attachment-preview-body">
        {preview.kind === "image" ? (
          <Image
            className="attachment-preview-image"
            src={preview.url}
            alt={preview.name}
            onError={() => setMediaError(t("rightSidebar.preview.error.image"))}
          />
        ) : null}

        {preview.kind === "pdf" ? (
          <iframe
            className="attachment-preview-frame"
            src={preview.url}
            title={preview.name}
          />
        ) : null}

        {preview.kind === "html" ? (
          <iframe
            className="attachment-preview-frame"
            src={preview.url}
            title={preview.name}
            sandbox="allow-forms allow-modals allow-popups allow-scripts"
          />
        ) : null}

        {preview.kind === "text" ? (
          textLoading ? (
            <div className="status-line">
              {t("rightSidebar.preview.text.loading")}
            </div>
          ) : textError ? (
            <div className="status-line">{textError}</div>
          ) : (
            <pre className="attachment-preview-text">
              {textContent || t("rightSidebar.preview.text.empty")}
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
              onError={() => setMediaError(t("rightSidebar.preview.error.audio"))}
            />
          </div>
        ) : null}

        {preview.kind === "video" ? (
          <video
            className="attachment-preview-video"
            src={preview.url}
            controls
            preload="metadata"
            onError={() => setMediaError(t("rightSidebar.preview.error.video"))}
          />
        ) : null}

        {preview.kind === "office" ? (
          <div className="status-line">
            {t("rightSidebar.preview.office.downloadOnly")}
          </div>
        ) : null}

        {mediaError ? <div className="status-line">{mediaError}</div> : null}
        {downloadError ? (
          <div className="status-line">{downloadError}</div>
        ) : null}
      </div>

      {textPreviewKinds.has(preview.kind) ? (
        <div className="attachment-preview-note">
          {t("rightSidebar.preview.note")}
        </div>
      ) : null}
    </div>
  );
};
