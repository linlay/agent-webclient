import React from "react";
import {
  getAgentFile,
  type AgentFileResponse,
} from "@/shared/data";
import {
  downloadAttachmentPreview,
  limitTextPreview,
  readArtifactResourceText,
} from "@/features/artifacts/lib/artifactResourceRuntime";
import {
  getAttachmentPreviewKind,
  isAttachmentPreviewKindSupported,
  type AttachmentPreviewKind,
  type AttachmentPreviewState,
} from "@/features/artifacts/lib/attachmentPreview";
import { t } from "@/shared/i18n";
import { Image, message } from "antd";
import { useAppState } from "@/app/state/AppContext";
import { useAuthenticatedResourceUrl } from "@/shared/ui/useAuthenticatedResourceUrl";
import { useDesktopContextMenuTarget } from "@/shared/data/desktop/desktopContextMenu";

const ATTACHMENT_PREVIEW_PANEL_CLASS_NAME =
  "attachment-preview-panel tw:flex tw:h-full tw:flex-col";

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
  "attachment-preview-line tw:grid tw:min-h-[1.6em] tw:grid-cols-[4.25rem_minmax(0,1fr)] tw:py-0";

const ATTACHMENT_PREVIEW_LINE_NUMBER_CLASS_NAME =
  "attachment-preview-line-number tw:select-none tw:border-r tw:border-line-soft tw:pr-3 tw:text-right tw:text-ink-muted";

const ATTACHMENT_PREVIEW_LINE_CONTENT_CLASS_NAME =
  "attachment-preview-line-content tw:min-w-0 tw:whitespace-pre-wrap tw:break-words tw:px-3.5";

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
  showLineNumbers?: boolean;
  fullscreenRequest?: number;
  surfaceContext?: {
    chatId: string;
    agentKey?: string;
    teamChat?: boolean;
  };
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
  const detectedKind = getAttachmentPreviewKind({
    name: response.name,
    mimeType: response.mimeType,
  });
  if (detectedKind === "html") {
    return "html";
  }
  if (response.contentKind === "text") {
    return "text";
  }
  return detectedKind;
}

export function resolveWorkspaceHtmlSrcDoc(
  response: AgentFileResponse | null,
): string | null {
  if (
    !response ||
    response.contentKind !== "text" ||
    response.truncated
  ) {
    return null;
  }
  return response.content || "";
}

export const AttachmentPreviewPanel: React.FC<AttachmentPreviewPanelProps> = ({
  preview,
  showLineNumbers = false,
  fullscreenRequest,
  surfaceContext,
}) => {
  const appState = useAppState();
  const chatId = String(surfaceContext?.chatId ?? appState.chatId ?? "").trim();
  const currentChat = appState.chats?.find((chat) => chat.chatId === chatId);
  const teamChat = surfaceContext?.teamChat ?? Boolean(
    currentChat?.owner?.kind === "orchestrated-team"
    || String(currentChat?.teamId || "").trim(),
  );
  const [workspaceFile, setWorkspaceFile] =
    React.useState<AgentFileResponse | null>(null);
  const [textContent, setTextContent] = React.useState("");
  const [textTruncated, setTextTruncated] = React.useState(false);
  const [textLoading, setTextLoading] = React.useState(false);
  const [textError, setTextError] = React.useState("");
  const [mediaError, setMediaError] = React.useState("");
  const textContainerRef = React.useRef<HTMLPreElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const contextTargetId = React.useId();
  const workspaceFileRequest = React.useMemo(
    () => preview.workspaceFile
      ? {
          ...preview.workspaceFile,
          agentKey: String(
            surfaceContext?.agentKey || preview.workspaceFile.agentKey || "",
          ).trim(),
        }
      : undefined,
    [preview.workspaceFile, surfaceContext?.agentKey],
  );
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
  const mediaSource = ["image", "pdf", "html", "audio", "video"].includes(previewKind)
    ? previewUrl
    : "";
  const authenticatedPreview = useAuthenticatedResourceUrl(mediaSource, chatId, { teamChat });
  const mediaPreviewUrl = authenticatedPreview.url;
  const previewName = workspaceFileResponse?.name || preview.name;
  const workspaceHtmlSrcDoc = resolveWorkspaceHtmlSrcDoc(
    workspaceFileResponse,
  );
  const handleDownload = React.useCallback(async () => {
    try {
      await downloadAttachmentPreview(preview, {
        chatId,
        teamChat,
        workspaceFile: workspaceFileRequest,
      });
    } catch (error: unknown) {
      message.error(
        error instanceof Error
          ? error.message
          : t("rightSidebar.preview.error.download"),
      );
    }
  }, [chatId, preview, teamChat, workspaceFileRequest]);
  const contextTarget = React.useMemo(() => ({
    targetId: `preview-resource:${contextTargetId}`,
    kind: "chat-resource" as const,
    name: previewName,
    mediaType: previewKind === "image" ? "image" as const : "file" as const,
    handlers: {
      "download-resource": handleDownload,
    },
  }), [contextTargetId, handleDownload, previewKind, previewName]);
  const contextTargetRef = useDesktopContextMenuTarget<HTMLDivElement>(contextTarget);
  const setPanelElement = React.useCallback((element: HTMLDivElement | null) => {
    panelRef.current = element;
    contextTargetRef(element);
  }, [contextTargetRef]);

  React.useEffect(() => {
    setMediaError("");
  }, [previewKind, previewUrl]);

  React.useEffect(() => {
    if (authenticatedPreview.error) {
      setMediaError(t("rightSidebar.preview.error.loadText"));
    }
  }, [authenticatedPreview.error]);

  React.useEffect(() => {
    setWorkspaceFile(null);

    if (workspaceFileRequest) {
      let disposed = false;
      setTextLoading(true);
      setTextError("");
      setTextContent("");
      setTextTruncated(false);

      void getAgentFile(workspaceFileRequest)
        .then((response) => {
          if (disposed) return;
          const file = response.data;
          setWorkspaceFile(file);
          setTextContent(file.contentKind === "text" ? file.content || "" : "");
          setTextTruncated(file.truncated);
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
      setTextTruncated(false);
      setTextLoading(false);
      setTextError("");
      return;
    }

    const controller = new AbortController();
    setTextLoading(true);
    setTextError("");
    setTextContent("");
    setTextTruncated(false);

    void readArtifactResourceText(preview.url, chatId, controller.signal, teamChat)
      .then((content) => {
        const limitedPreview = limitTextPreview(content);
        setTextContent(limitedPreview.content);
        setTextTruncated(limitedPreview.truncated);
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
  }, [chatId, preview, teamChat, workspaceFileRequest]);

  React.useEffect(() => {
    if (
      fullscreenRequest !== undefined &&
      fullscreenRequest > 0 &&
      panelRef.current
    ) {
      panelRef.current.requestFullscreen().catch(() => {
        // Fullscreen 可能被浏览器拒绝，静默忽略
      });
    }
  }, [fullscreenRequest]);

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

  const targetLine =
    Number.isFinite(preview.line) && Number(preview.line) > 0
      ? Math.floor(Number(preview.line))
      : undefined;
  const textLines = React.useMemo(
    () => buildTextPreviewLines(textContent, targetLine),
    [targetLine, textContent],
  );
  const previewable = isAttachmentPreviewKindSupported(previewKind);

  return (
    <div ref={setPanelElement} className={ATTACHMENT_PREVIEW_PANEL_CLASS_NAME}>
      {previewable ? <div className={ATTACHMENT_PREVIEW_BODY_CLASS_NAME}>
        {previewKind === "image" && mediaPreviewUrl ? (
          <Image
            className="attachment-preview-image"
            src={mediaPreviewUrl}
            alt={previewName}
            onError={() => setMediaError(t("rightSidebar.preview.error.image"))}
          />
        ) : null}

        {previewKind === "pdf" && mediaPreviewUrl ? (
          <iframe
            className={ATTACHMENT_PREVIEW_FRAME_CLASS_NAME}
            src={mediaPreviewUrl}
            title={previewName}
          />
        ) : null}

        {previewKind === "html" ? (
          workspaceFileRequest ? (
            textLoading ? (
              <div className={ATTACHMENT_PREVIEW_STATUS_CLASS_NAME}>
                {t("rightSidebar.preview.text.loading")}
              </div>
            ) : textError ? (
              <div className={ATTACHMENT_PREVIEW_STATUS_CLASS_NAME}>
                {textError}
              </div>
            ) : workspaceFileResponse?.truncated ? (
              <div className={ATTACHMENT_PREVIEW_STATUS_CLASS_NAME}>
                {t("rightSidebar.preview.text.truncated")}
              </div>
            ) : workspaceHtmlSrcDoc !== null ? (
              <iframe
                className={ATTACHMENT_PREVIEW_FRAME_CLASS_NAME}
                srcDoc={workspaceHtmlSrcDoc}
                title={previewName}
                sandbox="allow-forms allow-modals allow-popups allow-scripts"
              />
            ) : (
              <div className={ATTACHMENT_PREVIEW_STATUS_CLASS_NAME}>
                {t("rightSidebar.preview.error.loadText")}
              </div>
            )
          ) : (
            mediaPreviewUrl ? <iframe
              className={ATTACHMENT_PREVIEW_FRAME_CLASS_NAME}
              src={mediaPreviewUrl}
              title={previewName}
              sandbox="allow-forms allow-modals allow-popups allow-scripts"
            /> : null
          )
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
          ) : targetLine || showLineNumbers ? (
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
                  <span className={ATTACHMENT_PREVIEW_LINE_NUMBER_CLASS_NAME} aria-hidden="true">
                    {line.lineNumber}
                  </span>
                  <span className={ATTACHMENT_PREVIEW_LINE_CONTENT_CLASS_NAME}>
                    {line.text || " "}
                  </span>
                </span>
              ))}
            </pre>
          ) : (
            <pre className={ATTACHMENT_PREVIEW_TEXT_CLASS_NAME}>
              {textContent || t("rightSidebar.preview.text.empty")}
            </pre>
          )
        ) : null}

        {previewKind === "audio" && mediaPreviewUrl ? (
          <div className={ATTACHMENT_PREVIEW_MEDIA_SHELL_CLASS_NAME}>
            <audio
              className={ATTACHMENT_PREVIEW_AUDIO_CLASS_NAME}
              src={mediaPreviewUrl}
              controls
              preload="metadata"
              onError={() =>
                setMediaError(t("rightSidebar.preview.error.audio"))
              }
            />
          </div>
        ) : null}

        {previewKind === "video" && mediaPreviewUrl ? (
          <video
            className={ATTACHMENT_PREVIEW_VIDEO_CLASS_NAME}
            src={mediaPreviewUrl}
            controls
            preload="metadata"
            onError={() => setMediaError(t("rightSidebar.preview.error.video"))}
          />
        ) : null}

        {mediaError ? (
          <div className={ATTACHMENT_PREVIEW_STATUS_CLASS_NAME}>
            {mediaError}
          </div>
        ) : null}
      </div> : null}

      {textTruncated && previewKind !== "html" ? (
        <div className={ATTACHMENT_PREVIEW_NOTE_CLASS_NAME}>
          {t("rightSidebar.preview.text.truncated")}
        </div>
      ) : null}
    </div>
  );
};
