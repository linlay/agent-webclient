import React from "react";
import { AttachmentCard } from "@/features/artifacts/components/AttachmentCard";
import type { ComposerAttachment } from "@/features/composer/lib/composerAttachments";
import { getComposerAttachmentSubtitle } from "@/features/composer/lib/composerAttachments";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";

interface ComposerAttachmentsProps {
  attachments: ComposerAttachment[];
  attachmentViewportRef: React.RefObject<HTMLDivElement>;
  useUnifiedComposerAttachmentRow: boolean;
  hasComposerAttachmentOverflow: boolean;
  attachmentScrollState: {
    canScrollLeft: boolean;
    canScrollRight: boolean;
  };
  onRemoveAttachment: (attachmentId: string) => void;
  onScroll: (direction: "left" | "right") => void;
}

export const ComposerAttachments: React.FC<ComposerAttachmentsProps> = ({
  attachments,
  attachmentViewportRef,
  useUnifiedComposerAttachmentRow,
  hasComposerAttachmentOverflow,
  attachmentScrollState,
  onRemoveAttachment,
  onScroll,
}) => {
  const { t } = useI18n();

  return (
    <>
      <div
        ref={attachmentViewportRef}
        className="composer-attachments-viewport"
        aria-live="polite"
      >
        <div className="composer-attachments">
          {attachments.map((attachment) => (
            <AttachmentCard
              key={attachment.id}
              attachment={{
                name: attachment.name,
                size: attachment.size,
                type: attachment.type,
                mimeType: attachment.mimeType,
                url: attachment.resourceUrl,
                previewUrl: attachment.previewUrl,
              }}
              variant="composer"
              status={attachment.status}
              displayMode={useUnifiedComposerAttachmentRow ? "file" : "auto"}
              thumbnailMode={
                useUnifiedComposerAttachmentRow ? "inline" : "auto"
              }
              subtitle={getComposerAttachmentSubtitle(
                attachment,
                useUnifiedComposerAttachmentRow,
              )}
              onRemove={() => onRemoveAttachment(attachment.id)}
              removeLabel={t("composer.attachments.removeFile", {
                name: attachment.name,
              })}
            />
          ))}
        </div>
      </div>
      {attachments.length > 0 && (
        <div
          className={`composer-attachments-shell ${hasComposerAttachmentOverflow ? "is-scrollable" : ""}`.trim()}
        >
          {hasComposerAttachmentOverflow && (
            <button
              type="button"
              className="composer-attachments-nav is-left"
              onClick={() => onScroll("left")}
              disabled={!attachmentScrollState.canScrollLeft}
              aria-label={t("composer.attachments.viewLeft")}
              title={t("composer.attachments.viewLeft")}
            >
              <MaterialIcon name="chevron_left" />
            </button>
          )}
          {hasComposerAttachmentOverflow && (
            <button
              type="button"
              className="composer-attachments-nav is-right"
              onClick={() => onScroll("right")}
              disabled={!attachmentScrollState.canScrollRight}
              aria-label={t("composer.attachments.viewRight")}
              title={t("composer.attachments.viewRight")}
            >
              <MaterialIcon name="chevron_right" />
            </button>
          )}
        </div>
      )}
    </>
  );
};
