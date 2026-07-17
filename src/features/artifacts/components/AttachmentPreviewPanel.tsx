import React from "react";
import {
  downloadResource,
  getAgentFile,
  getResourceText,
  type AgentFileResponse,
} from "@/shared/data";
import {
  formatAttachmentSize,
} from "@/features/artifacts/lib/attachmentUtils";
import {
  getAttachmentPreviewKind,
  type AttachmentPreviewKind,
  type AttachmentPreviewState,
} from "@/features/artifacts/lib/attachmentPreview";
import { t } from "@/shared/i18n";
import { UiButton } from "@/shared/ui/UiButton";
import { Image } from "antd";
import { MaterialIcon } from "@/shared/icons/material";

const textPreviewKinds = new Set(["text", "pdf", "html"]);

const ATTACHMENT_PREVIEW_PANEL_CLASS_NAME =
  "attachment-preview-panel tw:flex tw:h-full tw:flex-col";

const ATTACHMENT_PREVIEW_TOOLBAR_CLASS_NAME =
  "attachment-preview-toolbar tw:flex tw:items-center tw:gap-2.5 tw:border-b tw:border-line-soft tw:py-[4px] tw:px-[10px]";

const ATTACHMENT_PREVIEW_NAME_CLASS_NAME =
  "attachment-preview-name tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-[13px] tw:text-ink-1";

const ATTACHMENT_PREVIEW_META_CLASS_NAME =
  "attachment-preview-meta tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-[11px] tw:text-ink-muted";

const ATTACHMENT_PREVIEW_BODY_CLASS_NAME =
  "attachment-preview-body tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-2.5 tw:overflow-auto";

const ATTACHMENT_PREVIEW_STATUS_CLASS_NAME = "status-line tw:m-2.5";

const ATTACHMENT_PREVIEW_VIDEO_CLASS_NAME =
  "attachment-preview-video tw:block tw:h-auto tw:max-h-full tw:w-full tw:rounded-[14px] tw:bg-[color-mix(in_srgb,var(--bg-input)_82%,white)] tw:object-contain";

const ATTACHMENT_PREVIEW_FRAME_CLASS_NAME =
  "attachment-preview-frame tw:min-h-[480px] tw:w-full tw:flex-1 tw:border-0 tw:[html[data-theme=dark]_&]:border-[color-mix(in_srgb,var(--line-soft)_100%,transparent)] tw:[html[data-theme=dark]_&]:bg-[color-mix(in_srgb,var(--bg-elev-1)_92%,var(--bg-elev-2))]";

const ATTACHMENT_PREVIEW_TEXT_CLASS_NAME =
  "attachment-preview-text tw:m-0 tw:min-h-full tw:flex-1 tw:overflow-auto tw:whitespace-pre-wrap tw:break-words tw:p-3.5 tw:font-code tw:text-xs tw:leading-[1.6] tw:text-ink-1";

const ATTACHMENT_PREVIEW_TEXT_WITH_LINES_CLASS_NAME =
  "attachment-preview-text attachment-preview-text-lines tw:m-0 tw:min-h-full tw:flex-1 tw:overflow-auto tw:whitespace-pre-wrap tw:break-words tw:p-0 tw:font-code tw:text-xs tw:leading-[1.6] tw:text-ink-1";

const ATTACHMENT_PREVIEW_LINE_CLASS_NAME =
  "attachment-preview-line tw:block tw:min-h-[1.6em] tw:px-3.5 tw:py-0";

const ATTACHMENT_PREVIEW_TARGET_LINE_CLASS_NAME =
  "is-target tw:bg-[color-mix(in_srgb,var(--accent-electric)_16%,transparent)] tw:text-ink-1";

const ATTACHMENT_PREVIEW_MEDIA_SHELL_CLASS_NAME =
  "attachment-preview-media-shell tw:rounded-[14px] tw:border tw:border-line-soft tw:bg-[color-mix(in_srgb,var(--bg-input)_82%,white)] tw:px-3.5 tw:py-[18px] tw:[html[data-theme=dark]_&]:border-[color-mix(in_srgb,var(--line-soft)_100%,transparent)] tw:[html[data-theme=dark]_&]:bg-[color-mix(in_srgb,var(--bg-elev-1)_92%,var(--bg-elev-2))]";

const ATTACHMENT_PREVIEW_AUDIO_CLASS_NAME =
  "attachment-preview-audio tw:w-full";

const ATTACHMENT_PREVIEW_NOTE_CLASS_NAME =
  "attachment-preview-note tw:px-3 tw:pb-3 tw:pt-0 tw:text-[11px] tw:leading-[1.5] tw:text-ink-muted";

interface AttachmentPreviewPanelProps {
  preview: AttachmentPreviewState;
}

export interface TextPreviewLine {
  lineNumber: number;
  text: string;
  target: boolean;
}

export function buildTextPreviewLines(
  content: string,
  targetLine?: number,
): TextPreviewLine[] {
  const normalizedTargetLine =
    Number.isFinite(targetLine) && Number(targetLine) > 0
      ? Math.floor(Number(targetLine))
      : 0;
  const lines = content.split(/\r\n|\n|\r/);
  return lines.map((text, index) => {
    const lineNumber = index + 1;
    return {
      lineNumber,
      text,
      target: lineNumber === normalizedTargetLine,
    };
  });
}

export function resolveWorkspaceFilePreviewKind(
  response: AgentFileResponse | null,
  fallbackKind: AttachmentPreviewState["kind"],
): AttachmentPreviewKind {
  if (!response) {
    return fallbackKind;
  }
  if (response.contentKind === "text") {
    return "text";
  }
  return getAttachmentPreviewKind({
    name: response.name,
    mimeType: response.mimeType,
  });
}

export const AttachmentPreviewPanel: React.FC<AttachmentPreviewPanelProps> = ({
  preview,
}) => {
  const [workspaceFile, setWorkspaceFile] =
    React.useState<AgentFileResponse | null>(null);
  const [textContent, setTextContent] = React.useState("");
  const [textLoading, setTextLoading] = React.useState(false);
  const [textError, setTextError] = React.useState("");
  const [mediaError, setMediaError] = React.useState("");
  const [downloadError, setDownloadError] = React.useState("");
  const [downloading, setDownloading] = React.useState(false);
  const textContainerRef = React.useRef<HTMLPreElement | null>(null);
  const workspaceFileRequest = preview.workspaceFile;
  const workspaceFileResponse =
    workspaceFileRequest &&
    workspaceFile?.agentKey === workspaceFileRequest.agentKey &&
    workspaceFile.requestedPath === workspaceFileRequest.path
      ? workspaceFile
      : null;
  const previewKind = resolveWorkspaceFilePreviewKind(
    workspaceFileResponse,
    preview.kind,
  );
  const previewUrl = workspaceFileRequest
    ? workspaceFileResponse?.contentUrl || ""
    : preview.url;
  const downloadUrl = workspaceFileRequest
    ? workspaceFileResponse?.contentUrl || ""
    : preview.downloadUrl;
  const previewName = workspaceFileResponse?.name || preview.name;
  const previewMimeType = workspaceFileResponse?.mimeType || preview.mimeType;
  const previewSizeBytes = workspaceFileResponse?.sizeBytes ?? preview.sizeBytes;
  const previewSourcePath = workspaceFileResponse?.path || preview.sourcePath;

  React.useEffect(() => {
    setMediaError("");
  }, [previewKind, previewUrl]);

  React.useEffect(() => {
    setDownloadError("");
    setDownloading(false);
  }, [downloadUrl, previewName]);

  React.useEffect(() => {
    setWorkspaceFile(null);

    if (workspaceFileRequest) {
      let disposed = false;
      setTextLoading(true);
      setTextError("");
      setTextContent("");

      void getAgentFile(workspaceFileRequest)
        .then((response) => {
          if (disposed) return;
          const file = response.data;
          setWorkspaceFile(file);
          setTextContent(file.contentKind === "text" ? file.content || "" : "");
        })
        .catch((error: unknown) => {
          if (disposed) return;
          setTextError(
            error instanceof Error
              ? error.message
              : t("rightSidebar.preview.error.loadText"),
          );
        })
        .finally(() => {
          if (!disposed) {
            setTextLoading(false);
          }
        });

      return () => {
        disposed = true;
      };
    }

    if (preview.kind !== "text") {
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
  }, [preview, workspaceFileRequest]);

  React.useEffect(() => {
    if (!preview?.line || previewKind !== "text" || textLoading || textError) {
      return;
    }
    const container = textContainerRef.current;
    if (!container) return;

    const target = container.querySelector<HTMLElement>(
      `[data-preview-line="${preview.line}"]`,
    );
    if (!target) return;

    window.requestAnimationFrame(() => {
      target.scrollIntoView({ block: "center" });
    });
  }, [preview?.line, previewKind, textContent, textError, textLoading]);

  const handleDownload = React.useCallback(() => {
    if (downloading) {
      return;
    }

    if (!downloadUrl) {
      return;
    }

    setDownloadError("");
    setDownloading(true);
    void downloadResource(downloadUrl, { filename: previewName })
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
  }, [downloadUrl, downloading, previewName]);

  const sourceLocation = previewSourcePath
    ? `${previewSourcePath}${preview.line ? `:${preview.line}` : ""}`
    : "";
  const metadata = [
    sourceLocation,
    previewMimeType || "",
    formatAttachmentSize(previewSizeBytes),
  ]
    .filter(Boolean)
    .join(" · ");
  const targetLine =
    Number.isFinite(preview.line) && Number(preview.line) > 0
      ? Math.floor(Number(preview.line))
      : undefined;
  const textLines = React.useMemo(
    () => buildTextPreviewLines(textContent, targetLine),
    [targetLine, textContent],
  );

  return (
    <div className={ATTACHMENT_PREVIEW_PANEL_CLASS_NAME}>
      <div className={ATTACHMENT_PREVIEW_TOOLBAR_CLASS_NAME}>
        <strong
          className={ATTACHMENT_PREVIEW_NAME_CLASS_NAME}
          title={previewName}
        >
          {previewName}
        </strong>
        {metadata ? (
          <span className={ATTACHMENT_PREVIEW_META_CLASS_NAME} title={metadata}>
            {metadata}
          </span>
        ) : null}
        <UiButton
          variant="ghost"
          size="sm"
          onClick={handleDownload}
          loading={downloading}
          disabled={!downloadUrl}
          iconOnly
        >
          <MaterialIcon name="download" />
        </UiButton>
      </div>

      <div className={ATTACHMENT_PREVIEW_BODY_CLASS_NAME}>
        {previewKind === "image" ? (
          <Image
            className="attachment-preview-image"
            src={previewUrl}
            alt={previewName}
            onError={() => setMediaError(t("rightSidebar.preview.error.image"))}
          />
        ) : null}

        {previewKind === "pdf" ? (
          <iframe
            className={ATTACHMENT_PREVIEW_FRAME_CLASS_NAME}
            src={previewUrl}
            title={previewName}
          />
        ) : null}

        {previewKind === "html" ? (
          <iframe
            className={ATTACHMENT_PREVIEW_FRAME_CLASS_NAME}
            src={previewUrl}
            title={previewName}
            sandbox="allow-forms allow-modals allow-popups allow-scripts"
          />
        ) : null}

        {previewKind === "text" ? (
          textLoading ? (
            <div className={ATTACHMENT_PREVIEW_STATUS_CLASS_NAME}>
              {t("rightSidebar.preview.text.loading")}
            </div>
          ) : textError ? (
            <div className={ATTACHMENT_PREVIEW_STATUS_CLASS_NAME}>
              {textError}
            </div>
          ) : targetLine ? (
            <pre
              ref={textContainerRef}
              className={ATTACHMENT_PREVIEW_TEXT_WITH_LINES_CLASS_NAME}
            >
              {textLines.map((line) => (
                <span
                  key={line.lineNumber}
                  className={[
                    ATTACHMENT_PREVIEW_LINE_CLASS_NAME,
                    line.target
                      ? ATTACHMENT_PREVIEW_TARGET_LINE_CLASS_NAME
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  data-preview-line={line.lineNumber}
                >
                  {line.text || " "}
                </span>
              ))}
            </pre>
          ) : (
            <pre className={ATTACHMENT_PREVIEW_TEXT_CLASS_NAME}>
              {textContent || t("rightSidebar.preview.text.empty")}
            </pre>
          )
        ) : null}

        {previewKind === "audio" ? (
          <div className={ATTACHMENT_PREVIEW_MEDIA_SHELL_CLASS_NAME}>
            <audio
              className={ATTACHMENT_PREVIEW_AUDIO_CLASS_NAME}
              src={previewUrl}
              controls
              preload="metadata"
              onError={() =>
                setMediaError(t("rightSidebar.preview.error.audio"))
              }
            />
          </div>
        ) : null}

        {previewKind === "video" ? (
          <video
            className={ATTACHMENT_PREVIEW_VIDEO_CLASS_NAME}
            src={previewUrl}
            controls
            preload="metadata"
            onError={() => setMediaError(t("rightSidebar.preview.error.video"))}
          />
        ) : null}

        {previewKind === "office" ? (
          <div className={ATTACHMENT_PREVIEW_STATUS_CLASS_NAME}>
            {t("rightSidebar.preview.office.downloadOnly")}
          </div>
        ) : null}

        {previewKind === "unsupported" ? (
          <div className={ATTACHMENT_PREVIEW_STATUS_CLASS_NAME}>
            {t("rightSidebar.preview.unsupported.downloadOnly")}
          </div>
        ) : null}

        {mediaError ? (
          <div className={ATTACHMENT_PREVIEW_STATUS_CLASS_NAME}>
            {mediaError}
          </div>
        ) : null}
        {downloadError ? (
          <div className={ATTACHMENT_PREVIEW_STATUS_CLASS_NAME}>
            {downloadError}
          </div>
        ) : null}
      </div>

      {workspaceFileResponse?.truncated ? (
        <div className={ATTACHMENT_PREVIEW_NOTE_CLASS_NAME}>
          {t("rightSidebar.preview.text.truncated")}
        </div>
      ) : null}

      {textPreviewKinds.has(previewKind) ? (
        <div className={ATTACHMENT_PREVIEW_NOTE_CLASS_NAME}>
          {t("rightSidebar.preview.note")}
        </div>
      ) : null}
    </div>
  );
};
