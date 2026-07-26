import React from "react";
import type { TimelineAttachment } from "@/app/state/types";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import type { MaterialIconName } from "@/shared/ui/MaterialIcon";
import { useI18n } from "@/shared/i18n";

interface ReferenceCardProps {
  reference: TimelineAttachment;
  variant: "composer" | "timeline";
  density?: "default" | "compact";
  onRemove?: () => void;
}

function referenceIcon(type: string): MaterialIconName {
  return type === "chat" ? "question_answer" : "open_in_new";
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
  const classes = [
    "context-reference-card",
    `context-reference-card-${variant}`,
    `context-reference-card-${density}`,
    `is-${type}`,
  ].join(" ");

  return (
    <div className={classes} data-reference-type={type}>
      <span className="context-reference-card-icon" aria-hidden="true">
        <MaterialIcon name={referenceIcon(type)} />
      </span>
      <span className="context-reference-card-copy">
        <span className="context-reference-card-title" title={reference.name}>
          {reference.name}
        </span>
        <span className="context-reference-card-subtitle">{subtitle}</span>
      </span>
      {onRemove ? (
        <button
          type="button"
          className="context-reference-card-remove"
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
