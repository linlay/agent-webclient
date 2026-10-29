import React from "react";
import type { TimelineAttachment } from "@/features/timeline/lib/timelineState";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import type { MaterialIconName } from "@/shared/ui/MaterialIcon";
import { useI18n } from "@/shared/i18n";
import type { OpenTargetIntent } from "@/features/surfaces/lib/openTarget";
import styles from "./ReferenceCard.module.css";

interface ReferenceCardProps {
  reference: TimelineAttachment;
  variant: "composer" | "timeline";
  density?: "default" | "compact";
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
    ...classNames.map((className) => styles[className]).filter(Boolean),
  ].filter(Boolean).join(" ");
}

export const ReferenceCard: React.FC<ReferenceCardProps> = ({
  reference,
  variant,
  density = "default",
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
    "context-reference-card",
    `context-reference-card-${variant}`,
    `context-reference-card-${density}`,
    "is-" + type,
    ...(canOpenSkill ? ["is-openable"] : []),
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
      <span className={withModuleClasses("context-reference-card-icon")} aria-hidden="true">
        {type === "skill" ? (
          skillIcon ?? <MaterialIcon name="build" style={{ width: 34, height: 34, fontSize: 19 }} />
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
