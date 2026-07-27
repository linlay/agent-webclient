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
}) => {
  const { t } = useI18n();
  const dispatch = useAppDispatch();
  const attachmentKind = getAttachmentKind(attachment);
  const sourceUrl = getAttachmentUrl(attachment);
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

  const wantsPreview =
    displayMode === "preview" ||
    (displayMode === "auto" && attachmentKind === "image");
  const hasImagePreview = wantsPreview && Boolean(sourceUrl) && !imageFailed;
  const hasInlineThumbnail =
    !hasImagePreview &&
    thumbnailMode === "inline" &&
    attachmentKind === "image" &&
    Boolean(sourceUrl) &&
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
    void downloadResource(downloadUrl, { filename: attachment.name })
      .catch((error: unknown) => {
        console.error("Attachment download failed", error);
      })
      .finally(() => {
        setDownloading(false);
      });
  }, [attachment.name, downloadUrl, downloading]);

  const { rightSidebarOpen, rightSidebarOpenTab } = useAppState();

  const handleActivate = React.useCallback(() => {
    if (!canActivate) {
      return;
    }
    if (preview) {
      if (rightSidebarOpen && rightSidebarOpenTab === "preview") {
        dispatch({ type: "CLOSE_RIGHT_SIDEBAR" });
      } else {
        dispatch({ type: "OPEN_RIGHT_SIDEBAR", tab: "preview", preview });
      }
      return;
    }

    triggerDownload();
  }, [canActivate, dispatch, preview, triggerDownload, rightSidebarOpen, rightSidebarOpenTab]);

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
            src={sourceUrl}
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
                src={sourceUrl}
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
