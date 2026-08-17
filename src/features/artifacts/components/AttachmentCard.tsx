import React from "react";
import { useAppState } from "@/app/state/AppContext";
import { buildAttachmentPreviewState } from "@/features/artifacts/lib/attachmentPreview";
import { downloadArtifactResource } from "@/features/artifacts/lib/artifactResourceRuntime";
import {
  type AttachmentLike,
  getAttachmentDownloadUrl,
  getAttachmentKind,
  getAttachmentUrl,
} from "@/features/artifacts/lib/attachmentUtils";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { FileIcon } from "@/shared/components/file-icon";
import { useI18n } from "@/shared/i18n";
import { useAuthenticatedResourceUrl } from "@/shared/ui/useAuthenticatedResourceUrl";
import { useDesktopContextMenuTarget } from "@/shared/data/desktop/desktopContextMenu";
import { useOpenTarget } from "@/features/surfaces/openTarget";

interface AttachmentCardData extends AttachmentLike {
  name: string;
}

interface AttachmentCardProps {
  attachment: AttachmentCardData;
  artifactId?: string;
  variant: "composer" | "timeline";
  status?: "uploading" | "ready" | "error";
  displayMode?: "auto" | "file" | "preview";
  density?: "default" | "compact";
  thumbnailMode?: "auto" | "icon" | "inline";
  subtitle?: string;
  trailingNode?: React.ReactNode;
  onRemove?: () => void;
  removeLabel?: string;
  style?: React.CSSProperties;
  /** 点击激活行为：toggle 为切换侧边栏开关，alwaysOpen 始终打开预览 */
  activateMode?: "toggle" | "alwaysOpen";
}

export const AttachmentCard: React.FC<AttachmentCardProps> = ({
  attachment,
  artifactId,
  variant,
  status,
  displayMode = "auto",
  density = "default",
  thumbnailMode = "auto",
  subtitle = "",
  trailingNode,
  onRemove,
  removeLabel,
  style,
  activateMode = "toggle",
}) => {
  const { t } = useI18n();
  const openTarget = useOpenTarget();
  const appState = useAppState();
  const currentChat = appState.chats?.find((chat) => chat.chatId === appState.chatId);
  const teamChat = Boolean(
    currentChat?.owner?.kind === "orchestrated-team"
    || String(currentChat?.teamId || "").trim(),
  );
  const attachmentKind = getAttachmentKind(attachment);
  const sourceUrl = getAttachmentUrl(attachment);
  const authenticatedSource = useAuthenticatedResourceUrl(sourceUrl, appState.chatId, { teamChat });
  const downloadUrl = getAttachmentDownloadUrl(attachment);
  const preview = React.useMemo(
    () => buildAttachmentPreviewState(attachment),
    [attachment],
  );
  const [imageFailed, setImageFailed] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);
  const contextTargetId = React.useId();

  React.useEffect(() => {
    setImageFailed(false);
  }, [sourceUrl]);

  React.useEffect(() => {
    if (authenticatedSource.error) {
      setImageFailed(true);
    }
  }, [authenticatedSource.error]);

  const wantsPreview =
    displayMode === "preview" ||
    (displayMode === "auto" && attachmentKind === "image");
  const hasImagePreview = wantsPreview && Boolean(authenticatedSource.url) && !imageFailed;
  const hasInlineThumbnail =
    !hasImagePreview &&
    thumbnailMode === "inline" &&
    attachmentKind === "image" &&
    Boolean(authenticatedSource.url) &&
    !imageFailed;
  const canActivate =
    Boolean(sourceUrl) &&
    status !== "uploading" &&
    status !== "error" &&
    !downloading;
  const classes = [
    "attachment-card",
    `attachment-card-${variant}`,
    `attachment-card-${density}`,
    hasImagePreview ? "is-image" : "is-file",
    canActivate ? "is-interactive" : "",
    status ? `is-${status}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const triggerDownload = React.useCallback(() => {
    if (!downloadUrl || downloading) {
      return;
    }

    setDownloading(true);
    void downloadArtifactResource(downloadUrl, attachment.name, appState.chatId, undefined, teamChat)
      .catch((error: unknown) => {
        console.error("Attachment download failed", error);
      })
      .finally(() => {
        setDownloading(false);
      });
  }, [appState.chatId, attachment.name, downloadUrl, downloading, teamChat]);

  const handleActivate = React.useCallback(() => {
    if (!canActivate) {
      return;
    }
    if (preview) {
      openTarget({
        version: 1,
        kind: "artifact",
        artifactId,
        chatId: appState.chatId,
        runId: appState.runId || undefined,
        preview,
        toggle: activateMode === "toggle",
      });
      return;
    }

    triggerDownload();
  }, [activateMode, appState.chatId, appState.runId, artifactId, canActivate, openTarget, preview, triggerDownload]);

  const contextTarget = React.useMemo(() => ({
    targetId: `attachment:${contextTargetId}`,
    kind: "chat-resource" as const,
    name: attachment.name,
    mediaType: attachmentKind === "image" ? "image" as const : "file" as const,
    handlers: {
      ...(canActivate && preview ? { "preview-resource": handleActivate } : {}),
      ...(downloadUrl ? { "download-resource": triggerDownload } : {}),
    },
  }), [attachment.name, attachmentKind, canActivate, contextTargetId, downloadUrl, handleActivate, preview, triggerDownload]);
  const contextTargetRef = useDesktopContextMenuTarget<HTMLDivElement>(contextTarget);

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!canActivate) {
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleActivate();
      }
    },
    [canActivate, handleActivate],
  );

  return (
    <div
      ref={contextTargetRef}
      className={classes}
      data-attachment-kind={attachmentKind}
      role={canActivate ? "button" : undefined}
      tabIndex={canActivate ? 0 : undefined}
      onClick={canActivate ? handleActivate : undefined}
      onKeyDown={canActivate ? handleKeyDown : undefined}
      style={style}
    >
      {hasImagePreview ? (
        <div className="attachment-card-image-shell">
          <img
            className="attachment-card-image"
            src={authenticatedSource.url}
            alt={attachment.name}
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
          {subtitle ? (
            <span className="attachment-card-image-badge">{subtitle}</span>
          ) : null}
        </div>
      ) : (
        <div className="attachment-card-file-shell">
          {hasInlineThumbnail ? (
            <span className="attachment-card-file-icon is-thumbnail">
              <img
                className="attachment-card-file-thumb"
                src={authenticatedSource.url}
                alt={attachment.name}
                loading="lazy"
                onError={() => setImageFailed(true)}
              />
            </span>
          ) : (
            <FileIcon filename={attachment.name} />
          )}
          <span className="attachment-card-file-copy">
            <span className="attachment-card-title" title={attachment.name}>
              {attachment.name}
            </span>
            {subtitle ? (
              <span className="attachment-card-subtitle" title={subtitle}>
                {subtitle}
              </span>
            ) : null}
          </span>
          {trailingNode ? (
            <span className="attachment-card-trailing">{trailingNode}</span>
          ) : null}
        </div>
      )}
      {onRemove ? (
        <button
          type="button"
          className="attachment-card-remove"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRemove();
          }}
          aria-label={removeLabel || t("attachments.remove", { name: attachment.name })}
          title={t("attachments.removeTitle")}
        >
          <MaterialIcon name="close" />
        </button>
      ) : null}
    </div>
  );
};
