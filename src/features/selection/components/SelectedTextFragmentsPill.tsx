import styles from "./SelectedTextFragmentsPill.module.css";
import React, { useMemo } from "react";
import { Input, Popover } from "antd";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { useI18n } from "@/shared/i18n";
import type { SelectedTextFragment } from "@/features/selection/lib/selectedTextReference";

export function removeAllSelectedTextFragments(
  fragments: readonly SelectedTextFragment[],
  onRemove: (referenceId: string) => void,
) {
  for (const fragment of fragments) {
    onRemove(fragment.reference.id);
  }
}


function withModuleClasses(...classNames: string[]): string {
  return [...classNames, ...classNames.map((name) => styles[name]).filter(Boolean)]
    .filter(Boolean).join(" ");
}

export const SelectedTextFragmentsPill: React.FC<{
  fragments: readonly SelectedTextFragment[];
  variant: "annotations" | "segments";
  onRemove?: (referenceId: string) => void;
  onAnnotationChange?: (referenceId: string, annotation: string) => void;
}> = ({ fragments, variant, onRemove, onAnnotationChange }) => {
  const { t } = useI18n();
  const handleDismissAnnotations = React.useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (onRemove) removeAllSelectedTextFragments(fragments, onRemove);
  }, [fragments, onRemove]);
  const content = useMemo(() => (
    <div className={withModuleClasses("selected-text-fragments-popover")}>
      {fragments.map((fragment, index) => (
        <div className={withModuleClasses("selected-text-fragment-row")} key={fragment.reference.id}>
          <div className={withModuleClasses("selected-text-fragment-copy")}>
            <strong>{t("selection.fragment.item", { index: fragment.reference.annotationIndex ?? index + 1 })}</strong>
            <span>{fragment.reference.text}</span>
            {onAnnotationChange ? (
              <label className={styles.annotation}>
                <strong>{t("selection.fragment.annotation")}</strong>
                <Input.TextArea
                  aria-label={t("selection.fragment.annotationFor", { index: fragment.reference.annotationIndex ?? index + 1 })}
                  placeholder={t("selection.fragment.annotationPlaceholder")}
                  value={fragment.reference.annotation || ""}
                  autoSize={{ minRows: 2, maxRows: 6 }}
                  onChange={event => onAnnotationChange(fragment.reference.id, event.target.value)}
                  onKeyDown={event => event.stopPropagation()}
                />
              </label>
            ) : fragment.reference.annotation ? (
              <div className={styles.annotation}>
                <strong>{t("selection.fragment.annotation")}</strong>
                <p>{fragment.reference.annotation}</p>
              </div>
            ) : null}
          </div>
          {onRemove ? (
            <button
              type="button"
              aria-label={t("selection.fragment.remove", { index: fragment.reference.annotationIndex ?? index + 1 })}
              onClick={() => onRemove(fragment.reference.id)}
            >
              <MaterialIcon name="close" />
            </button>
          ) : null}
        </div>
      ))}
    </div>
  ), [fragments, onRemove, onAnnotationChange, t]);

  if (fragments.length === 0) return null;
  const pill = (
    <Popover
      content={content}
      trigger="click"
      placement="topLeft"
      destroyOnHidden
      rootClassName="selected-text-fragments-overlay"
    >
      <button
        type="button"
        className={withModuleClasses("selected-text-fragments-pill", variant === "annotations" && onRemove ? "has-dismiss" : "")}
      >
        <MaterialIcon name="question_answer" />
        <span>{t(
          variant === "annotations"
            ? "selection.fragment.annotations"
            : "selection.fragment.segments",
          { count: fragments.length },
        )}</span>
      </button>
    </Popover>
  );
  if (variant !== "annotations" || !onRemove) return pill;
  return (
    <span className={withModuleClasses("selected-text-fragments-pill-wrap")}>
      {pill}
      <button
        type="button"
        className={withModuleClasses("selected-text-fragments-pill-dismiss")}
        aria-label={t("selection.fragment.removeAnnotations")}
        title={t("selection.fragment.removeAnnotations")}
        onClick={handleDismissAnnotations}
      >
        <MaterialIcon name="close" />
      </button>
    </span>
  );
};
