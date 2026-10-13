import React from "react";
import type { TimelineAttachment } from "@/features/timeline/lib/timelineState";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import type { MaterialIconName } from "@/shared/ui/MaterialIcon";
import { SkillIcon } from "@/features/skills/components/SkillIcon";
import { useI18n } from "@/shared/i18n";
import { useOpenTarget } from "@/features/surfaces/hooks/useOpenTarget";
import styles from "./ReferenceCard.module.css";

interface ReferenceCardProps {
  reference: TimelineAttachment;
  variant: "composer" | "timeline";
  density?: "default" | "compact";
  /** Skill 引用的自有头像地址；仅在 type 为 skill 时生效，缺省回退通用技能图标。 */
  skillIcon?: string;
  onRemove?: () => void;
}

function referenceIcon(type: string): MaterialIconName {
  return type === "chat" ? "question_answer" : type === "kbase" ? "book_2" : "open_in_new";
}

function withModuleClasses(...classNames: string[]): string {
  return [
    ...classNames,
    ...classNames.map((className) => styles[className]).filter(Boolean),
  ].filter(Boolean).join(" ");
}

export const ReferenceCard: React.FC<ReferenceCardProps> = ({
  reference,
  variant,
  density = "default",
  skillIcon,
  onRemove,
}) => {
  const { t } = useI18n();
  const openTarget = useOpenTarget();
  const type = reference.type || "site";
  const subtitle =
    type === "chat"
      ? t("composer.reference.kind.chat")
      : type === "skill" ? t("agents.interaction.skills") : type === "kbase" ? t("kbase.title") : t("composer.reference.kind.site");
  const avatarIcon = String(skillIcon || "").trim();
  const skillId = type === "skill" ? String(reference.id || "").trim() : "";
  const canOpenSkill = Boolean(skillId);
  const semanticClasses = [
    "context-reference-card",
    `context-reference-card-${variant}`,
    `context-reference-card-${density}`,
    "is-" + type,
    ...(canOpenSkill ? ["is-openable"] : []),
  ];
  const classes = withModuleClasses(...semanticClasses);

  const handleOpenSkill = () => {
    if (!canOpenSkill) return;
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
      <span className={withModuleClasses("context-reference-card-icon")} aria-hidden="true">
        {type === "skill" ? (
          <SkillIcon icon={avatarIcon} size={34} glyphSize={19} fallback="build" />
        ) : (
          <MaterialIcon name={referenceIcon(type)} />
        )}
      </span>
      <span className={withModuleClasses("context-reference-card-copy")}>
        <span className={withModuleClasses("context-reference-card-title")} title={reference.name}>
          {reference.name}
        </span>
        <span className={withModuleClasses("context-reference-card-subtitle")}>{subtitle}</span>
      </span>
      {onRemove ? (
        <button
          type="button"
          className={withModuleClasses("context-reference-card-remove")}
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          aria-label={t("composer.reference.remove", {
            name: reference.name,
          })}
          title={t("composer.reference.remove", {
            name: reference.name,
          })}
        >
          <MaterialIcon name="close" />
        </button>
      ) : null}
    </div>
  );
};
