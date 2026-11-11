import React from "react";
import type { TimelineAttachment } from "@/features/timeline/lib/timelineState";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import type { MaterialIconName } from "@/shared/ui/MaterialIcon";
import { useI18n } from "@/shared/i18n";
import type { OpenTargetIntent } from "@/features/surfaces/lib/openTarget";
import attachmentStyles from "./AttachmentCard.module.css";
import styles from "./ReferenceCard.module.css";

interface ReferenceCardProps {
  reference: TimelineAttachment;
  variant: "composer" | "timeline";
  /** Host-rendered authenticated skill avatar; absent in read-only exports. */
  skillIcon?: React.ReactNode;
  onRemove?: () => void;
  openTarget?: (target: OpenTargetIntent) => void;
}

function referenceIcon(type: string): MaterialIconName {
  return type === "chat" ? "question_answer" : type === "kbase" ? "book_2" : "open_in_new";
}

function withModuleClasses(...classNames: string[]): string {
  return [
    ...classNames,
    ...classNames.flatMap((className) => [attachmentStyles[className], styles[className]]).filter(Boolean),
  ].filter(Boolean).join(" ");
}

export const ReferenceCard: React.FC<ReferenceCardProps> = ({
  reference,
  variant,
  skillIcon,
  onRemove,
  openTarget,
}) => {
  const { t } = useI18n();
  const type = reference.type || "site";
  const subtitle =
    type === "chat"
      ? t("composer.reference.kind.chat")
      : type === "skill" ? t("agents.interaction.skills") : type === "kbase" ? t("kbase.title") : t("composer.reference.kind.site");
  const skillId = type === "skill" ? String(reference.id || "").trim() : "";
  const canOpenSkill = Boolean(skillId && openTarget);
  const semanticClasses = [
    "attachment-card",
    `attachment-card-${variant}`,
    "is-file",
    "context-reference-card",
    "is-" + type,
    ...(canOpenSkill ? ["is-interactive"] : []),
  ];
  const classes = withModuleClasses(...semanticClasses);

  const handleOpenSkill = () => {
    if (!canOpenSkill || !openTarget) return;
    openTarget({
      version: 1,
      kind: "skill",
      id: skillId,
      label: reference.name,
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!canOpenSkill || event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleOpenSkill();
    }
  };

  return (
    <div
      className={classes}
      data-reference-type={type}
      title={type === "chat" ? t("composer.reference.chatPointer") : canOpenSkill ? t("composer.reference.skillDetail") : undefined}
      role={canOpenSkill ? "button" : undefined}
      tabIndex={canOpenSkill ? 0 : undefined}
      aria-label={canOpenSkill ? `${t("composer.reference.skillDetail")} ${reference.name}` : undefined}
      onClick={canOpenSkill ? handleOpenSkill : undefined}
      onKeyDown={canOpenSkill ? handleKeyDown : undefined}
    >
      <div className={withModuleClasses("attachment-card-file-shell")}>
        <span className={withModuleClasses("context-reference-card-icon")} aria-hidden="true">
          {type === "skill" ? (
            skillIcon ?? <MaterialIcon name="bolt" style={{ fontSize: 20 }} />
          ) : (
            <MaterialIcon name={referenceIcon(type)} style={{ fontSize: 20 }} />
          )}
        </span>
        <span className={withModuleClasses("attachment-card-file-copy")}>
          <span className={withModuleClasses("attachment-card-title")} title={reference.name}>
            <span className={withModuleClasses("attachment-card-name")}>{reference.name}</span>
          </span>
          <span className={withModuleClasses("attachment-card-subtitle")} title={subtitle}>{subtitle}</span>
        </span>
      </div>
      {onRemove ? (
        <button
          type="button"
          className={withModuleClasses("attachment-card-remove")}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRemove();
          }}
          aria-label={t("attachments.remove", {
            name: reference.name,
          })}
          title={t("attachments.removeTitle")}
        >
          <MaterialIcon name="close" />
        </button>
      ) : null}
    </div>
  );
};
