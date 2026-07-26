import React from "react";
import { AttachmentCard } from "@/features/artifacts/components/AttachmentCard";
import { ReferenceCard } from "@/features/artifacts/components/ReferenceCard";
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

const COMPOSER_ATTACHMENTS_VIEWPORT_CLASS =
  "composer-attachments-viewport tw:w-full tw:min-w-0 tw:overflow-x-auto tw:overflow-y-hidden tw:[-ms-overflow-style:none] tw:[scrollbar-width:none] tw:[&::-webkit-scrollbar]:hidden";
const COMPOSER_ATTACHMENTS_CLASS =
  "composer-attachments tw:flex tw:w-max tw:min-w-full tw:flex-nowrap tw:items-stretch tw:gap-2.5";
const COMPOSER_ATTACHMENTS_SHELL_CLASS =
  "composer-attachments-shell tw:relative";
const COMPOSER_ATTACHMENTS_SHELL_STATE_CLASS = {
  default: "",
  scrollable: "is-scrollable tw:px-[30px]",
} as const;
const COMPOSER_ATTACHMENTS_NAV_CLASS =
  "composer-attachments-nav tw:absolute tw:top-1/2 tw:z-[2] tw:grid tw:h-6 tw:w-6 tw:-translate-y-1/2 tw:place-items-center tw:rounded-lg tw:border tw:border-[color-mix(in_srgb,var(--line-soft)_88%,transparent)] tw:bg-[color-mix(in_srgb,rgba(255,255,255,.96)_96%,var(--bg-elev-2))] tw:p-0 tw:text-ink-muted tw:shadow-[0_4px_10px_rgba(17,39,76,0.08)] tw:hover:bg-[color-mix(in_srgb,#fff_96%,var(--bg-elev-2))] tw:hover:text-ink-1 tw:disabled:cursor-default tw:disabled:opacity-35 tw:disabled:shadow-none tw:[&_.material-icon]:text-base";
const COMPOSER_ATTACHMENTS_NAV_SIDE_CLASS = {
  left: "is-left tw:left-0",
  right: "is-right tw:right-0",
} as const;

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
        className={COMPOSER_ATTACHMENTS_VIEWPORT_CLASS}
        aria-live="polite"
      >
        <div className={COMPOSER_ATTACHMENTS_CLASS}>
          {attachments.map((attachment) => (
            attachment.type === "chat" || attachment.type === "site" ? (
              <ReferenceCard
                key={attachment.id}
                reference={{
                  id: attachment.id.split(":").slice(1).join(":"),
                  name: attachment.name,
                  type: attachment.type,
                  url: attachment.resourceUrl,
                }}
                variant="composer"
                density={useUnifiedComposerAttachmentRow ? "compact" : "default"}
                onRemove={() => onRemoveAttachment(attachment.id)}
              />
            ) : (
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
                  t,
                )}
                onRemove={() => onRemoveAttachment(attachment.id)}
                removeLabel={t("composer.attachments.removeFile", {
                  name: attachment.name,
                })}
              />
            )
          ))}
        </div>
      </div>
      {attachments.length > 0 && (
        <div
          className={`${COMPOSER_ATTACHMENTS_SHELL_CLASS} ${hasComposerAttachmentOverflow ? COMPOSER_ATTACHMENTS_SHELL_STATE_CLASS.scrollable : COMPOSER_ATTACHMENTS_SHELL_STATE_CLASS.default}`.trim()}
        >
          {hasComposerAttachmentOverflow && (
            <button
              type="button"
              className={`${COMPOSER_ATTACHMENTS_NAV_CLASS} ${COMPOSER_ATTACHMENTS_NAV_SIDE_CLASS.left}`}
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
              className={`${COMPOSER_ATTACHMENTS_NAV_CLASS} ${COMPOSER_ATTACHMENTS_NAV_SIDE_CLASS.right}`}
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
