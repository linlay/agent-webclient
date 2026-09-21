import styles from "./SelectedTextFragmentsPill.module.css";
import React, { useMemo } from "react";
import { Popover } from "antd";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { useI18n } from "@/shared/i18n";
import type { SelectedTextFragment } from "@/features/selection/lib/selectedTextReference";
import { locateSelectedTextReference } from "@/shared/data/desktop/selectedTextLocate";

export function removeAllSelectedTextFragments(
  fragments: readonly SelectedTextFragment[],
  onRemove: (referenceId: string) => void,
) {
  for (const fragment of fragments) {
    onRemove(fragment.reference.id);
  }
}

function withModuleClasses(...classNames: string[]): string {
  return [
    ...classNames,
    ...classNames.map((name) => styles[name]).filter(Boolean),
  ]
    .filter(Boolean)
    .join(" ");
}

export const SelectedTextFragmentsPill: React.FC<{
  fragments: readonly SelectedTextFragment[];
  variant: "annotations" | "segments";
  onRemove?: (referenceId: string) => void;
  /**
   * 已发出的引用只是一份记录：时间线里的用户消息关掉定位，列表继续可读，
   * 但每行不再冒充"点了就跳回原文"的按钮。
   */
  locatable?: boolean;
}> = ({ fragments, variant, onRemove, locatable = true }) => {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const handleDismissAnnotations = React.useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (onRemove) removeAllSelectedTextFragments(fragments, onRemove);
    },
    [fragments, onRemove],
  );
  // 点一条引用就回到它的批注：持有锚点的批注层会认领这次请求并触发高亮；
  // 如果这条引用被折叠面板藏了起来，先让时间线展开面板，再等标记回来。
  const handleLocate = React.useCallback((fragment: SelectedTextFragment) => {
    setOpen(false);
    locateSelectedTextReference(fragment.reference.id, fragment.targetId);
  }, []);
  const content = useMemo(
    () => (
      <div className={withModuleClasses("selected-text-fragments-popover")}>
        {fragments.map((fragment, index) => {
          const label = fragment.reference.annotationIndex ?? index + 1;
          // 定位收在同一处行属性里：不可定位时整行退回普通展示，连 role / title 都不再声明。
          const locateProps: React.HTMLAttributes<HTMLDivElement> = locatable
            ? {
                role: "button",
                tabIndex: 0,
                "aria-label": t("selection.fragment.locate", { index: label }),
                title: t("selection.fragment.locate", { index: label }),
                onClick: () => handleLocate(fragment),
                onKeyDown: (event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  handleLocate(fragment);
                },
              }
            : {};
          return (
            <div
              className={withModuleClasses(
                "selected-text-fragment-row",
                locatable ? "" : "selected-text-fragment-row-static",
              )}
              key={fragment.reference.id}
              {...locateProps}
            >
              <span
                className={withModuleClasses("selected-text-fragment-index")}
                aria-hidden="true"
              >
                {label}.
              </span>
              <div className={withModuleClasses("selected-text-fragment-text")}>
                <span
                  className={withModuleClasses("selected-text-fragment-label")}
                >
                  {t("selection.fragment.item")}
                </span>
                <span>{fragment.reference.text}</span>
                {fragment.reference.annotation ? (
                  <>
                    <span
                      className={withModuleClasses(
                        "selected-text-fragment-label",
                      )}
                    >
                      {t("selection.fragment.annotation")}
                    </span>
                    <span>{fragment.reference.annotation}</span>
                  </>
                ) : null}
              </div>
              {onRemove ? (
                <button
                  type="button"
                  aria-label={t("selection.fragment.remove", { index: label })}
                  className={withModuleClasses("selected-text-fragment-remove")}
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemove(fragment.reference.id);
                  }}
                >
                  <MaterialIcon name="delete" />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    ),
    [fragments, locatable, onRemove, handleLocate, t],
  );

  if (fragments.length === 0) return null;
  const pill = (
    <Popover
      content={content}
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="topLeft"
      destroyOnHidden
      arrow={false}
      rootClassName="selected-text-fragments-overlay"
      styles={{
        body: {
          padding: 4,
        },
      }}
    >
      <button
        type="button"
        className={withModuleClasses(
          "selected-text-fragments-pill",
          variant === "annotations" && onRemove ? "has-dismiss" : "",
        )}
      >
        <MaterialIcon name="question_answer" />
        <span>
          {t(
            variant === "annotations"
              ? "selection.fragment.annotations"
              : "selection.fragment.segments",
            { count: fragments.length },
          )}
        </span>
      </button>
    </Popover>
  );
  if (variant !== "annotations" || !onRemove) return pill;
  return (
    <span className={withModuleClasses("selected-text-fragments-pill-wrap")}>
      {pill}
      <div
        className={withModuleClasses(
          "selected-text-fragments-pill-dismiss-wrap",
        )}
      >
        <button
          type="button"
          className={withModuleClasses("selected-text-fragments-pill-dismiss")}
          aria-label={t("selection.fragment.removeAnnotations")}
          title={t("selection.fragment.removeAnnotations")}
          onClick={handleDismissAnnotations}
        >
          <MaterialIcon name="close" />
        </button>
      </div>
    </span>
  );
};
