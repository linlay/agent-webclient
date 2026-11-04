import React from "react";
import { useOpenTarget } from "@/features/surfaces/hooks/useOpenTarget";
import { AttachmentCard } from "@/features/artifacts/components/AttachmentCard";
import { SkillIcon } from "@/features/skills/components/SkillIcon";
import { ReferenceCard } from "@/features/artifacts/components/ReferenceCard";
import type { ComposerAttachment } from "@/features/composer/lib/composerAttachments";
import { getComposerAttachmentSubtitle } from "@/features/composer/lib/composerAttachments";
import { normalizeTimelineAttachments } from "@/features/events/lib/timelineAttachments";
import { resolveSkillIconUrl } from "@/features/skills/lib/skillDisplayName";
import type { AgentSkill } from "@/shared/data/api/dto/agents";
import { useI18n } from "@/shared/i18n";

interface ComposerAttachmentsProps {
  attachmentChatId?: string;
  attachments: ComposerAttachment[];
  /** 当前 Agent 的技能目录，用于解析 skill 引用的自有头像。 */
  skills?: readonly AgentSkill[];
  useUnifiedComposerAttachmentRow: boolean;
  onRemoveAttachment: (attachmentId: string) => void;
  children?: React.ReactNode;
}

const COMPOSER_ATTACHMENTS_CLASS =
  "composer-attachments tw:flex tw:w-full tw:min-w-0 tw:flex-wrap tw:items-stretch tw:gap-[4px]";

export const ComposerAttachments: React.FC<ComposerAttachmentsProps> = ({
  attachmentChatId,
  attachments,
  skills,
  useUnifiedComposerAttachmentRow,
  onRemoveAttachment,
  children,
}) => {
  const { t } = useI18n();
  const openTarget = useOpenTarget();
  const activeSkills = skills ?? [];

  return (
    <div className={COMPOSER_ATTACHMENTS_CLASS} aria-live="polite">
      {attachments.map((attachment) => (
        ["chat","site","skill","kbase"].includes(attachment.type || "") ? (
          <ReferenceCard
            key={attachment.id}
            reference={{
              id: attachment.id.split(":").slice(1).join(":"),
              name: attachment.name,
              type: attachment.type,
              url: attachment.resourceUrl,
            }}
            openTarget={openTarget}
            variant="composer"
            skillIcon={attachment.type === "skill" ? <SkillIcon icon={resolveSkillIconUrl(activeSkills, String((attachment.references[0] as { id?: string } | undefined)?.id || attachment.id.split(":").slice(1).join(":")))} size={20} glyphSize={20} fallback="bolt" /> : undefined}
            onRemove={attachment.id.startsWith("forced:") ? undefined : () => onRemoveAttachment(attachment.id)}
          />
        ) : (
          <AttachmentCard
            key={attachment.id}
            surfaceContext={attachmentChatId ? { chatId: attachmentChatId } : undefined}
            attachment={{
              id: normalizeTimelineAttachments(attachment.references)[0]?.id,
              name: attachment.name,
              size: attachment.size,
              type: attachment.type,
              mimeType: attachment.mimeType,
              url: attachment.resourceUrl,
              previewUrl: attachment.previewUrl,
            }}
            variant="composer"
            status={attachment.status === "staged" ? "ready" : attachment.status}
            displayMode={useUnifiedComposerAttachmentRow ? "file" : "auto"}
            thumbnailMode={
              useUnifiedComposerAttachmentRow ? "inline" : "auto"
            }
            subtitle={getComposerAttachmentSubtitle(
              attachment,
              useUnifiedComposerAttachmentRow,
              t,
            )}
            onRemove={attachment.id.startsWith("forced:") ? undefined : () => onRemoveAttachment(attachment.id)}
            removeLabel={t("composer.attachments.removeFile", {
              name: attachment.name,
            })}
          />
        )
      ))}
      {children}
    </div>
  );
};
