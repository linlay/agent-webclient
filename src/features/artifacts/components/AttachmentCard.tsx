import React from "react";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import { downloadResource } from "@/shared/data";
import { buildAttachmentPreviewState } from "@/features/artifacts/lib/attachmentPreview";
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

interface AttachmentCardData extends AttachmentLike {
  name: string;
}

interface AttachmentCardProps {
  attachment: AttachmentCardData;
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
  const dispatch = useAppDispatch();
  const appState = useAppState();
  const attachmentKind = getAttachmentKind(attachment);
  const sourceUrl = getAttachmentUrl(attachment);
  const authenticatedSource = useAuthenticatedResourceUrl(sourceUrl, appState.chatId);
  const downloadUrl = getAttachmentDownloadUrl(attachment);
  const preview = React.useMemo(
    () => buildAttachmentPreviewState(attachment),
    [attachment],
  );
  const [imageFailed, setImageFailed] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);

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
    void downloadResource(downloadUrl, { filename: attachment.name, chatId: appState.chatId })
      .catch((error: unknown) => {
        console.error("Attachment download failed", error);
      })
      .finally(() => {
        setDownloading(false);
      });
  }, [appState.chatId, attachment.name, downloadUrl, downloading]);

  const { rightSidebarOpen, rightSidebarOpenTab, attachmentPreview, activeAttachmentPreviewUrl } = appState;

  const handleActivate = React.useCallback(() => {
    if (!canActivate) {
      return;
    }
    if (preview) {
      const isActive =
        rightSidebarOpen &&
        rightSidebarOpenTab === "preview" &&
        activeAttachmentPreviewUrl === preview.url;

      if (activateMode === "toggle" && isActive) {
        dispatch({ type: "CLOSE_RIGHT_SIDEBAR" });
      } else if (attachmentPreview.some(p => p.url === preview.url)) {
        dispatch({
          type: "OPEN_RIGHT_SIDEBAR",
          tab: "preview",
          activeAttachmentPreviewUrl: preview.url,
        });
      } else {
        dispatch({ type: "OPEN_RIGHT_SIDEBAR", tab: "preview", preview });
      }
      return;
    }

    triggerDownload();
  }, [canActivate, dispatch, preview, triggerDownload, activateMode, rightSidebarOpen, rightSidebarOpenTab, activeAttachmentPreviewUrl, attachmentPreview]);

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
