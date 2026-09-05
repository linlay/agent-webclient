import React from "react";
import type { TimelineAttachment } from "@/features/timeline/lib/timelineState";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import type { MaterialIconName } from "@/shared/ui/MaterialIcon";
import { useI18n } from "@/shared/i18n";
import styles from "./ReferenceCard.module.css";

interface ReferenceCardProps {
  reference: TimelineAttachment;
  variant: "composer" | "timeline";
  density?: "default" | "compact";
  onRemove?: () => void;
}

function referenceIcon(type: string): MaterialIconName {
  return type === "chat" ? "question_answer" : "open_in_new";
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
  onRemove,
}) => {
  const { t } = useI18n();
  const type = reference.type === "chat" ? "chat" : "site";
  const subtitle =
    type === "chat"
      ? t("composer.reference.kind.chat")
      : t("composer.reference.kind.site");
  const semanticClasses = [
    "context-reference-card",
    `context-reference-card-${variant}`,
    `context-reference-card-${density}`,
    `is-${type}`,
  ];
  const classes = withModuleClasses(...semanticClasses);

  return (
    <div className={classes} data-reference-type={type}>
      <span className={withModuleClasses("context-reference-card-icon")} aria-hidden="true">
        <MaterialIcon name={referenceIcon(type)} />
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
          onClick={onRemove}
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
