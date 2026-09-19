import React, { useEffect, useRef } from "react";
import type { InputRef } from "antd";
import { Input } from "antd";
import { useI18n } from "@/shared/i18n";
import { UiButton } from "@/shared/ui/UiButton";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import styles from "./TimelineTextSearchBar.module.css";

export interface TimelineTextSearchBarProps {
  open: boolean;
  onOpen: () => void;
  expandable: boolean;
  ariaShortcut: string;
  shortcutLabel: string;
  query: string;
  onQueryChange: (value: string) => void;
  total: number;
  activeIndex: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

export const TimelineTextSearchBar: React.FC<TimelineTextSearchBarProps> = ({
  open,
  onOpen,
  expandable,
  ariaShortcut,
  shortcutLabel,
  query,
  onQueryChange,
  total,
  activeIndex,
  onPrev,
  onNext,
  onClose,
}) => {
  const { t } = useI18n();
  const hasMatches = total > 0;
  const inputRef = useRef<InputRef>(null);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  const close = () => {
    inputRef.current?.blur();
    onClose();
  };

  return (
    <div
      className={[
        styles.bar,
        expandable ? styles.expandable : "",
        open ? styles.open : "",
      ].filter(Boolean).join(" ")}
      onBlur={(event) => {
        if (
          expandable && !query &&
          !event.currentTarget.contains(event.relatedTarget as Node | null)
        ) onClose();
      }}
    >
      <Input
        className={styles.input}
        size="small"
        variant="borderless"
        ref={inputRef}
        onFocus={onOpen}
        aria-label={t("timeline.textSearch.open")}
        aria-keyshortcuts={ariaShortcut}
        title={`${t("timeline.textSearch.open")} (${shortcutLabel})`}
        value={query}
        placeholder={t(open ? "timeline.textSearch.placeholder" : "timeline.textSearch.placeholderCompact")}
        prefix={<MaterialIcon name="search" />}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            close();
          } else if (event.key === "Enter") {
            event.preventDefault();
            if (event.shiftKey) onPrev();
            else onNext();
          }
        }}
      />
      {open && (
        <>
          <span className={styles.count}>
            {hasMatches && `${activeIndex + 1} / ${total}`}
          </span>
          <UiButton
            variant="ghost"
            size="sm"
            iconOnly
            className="ui-icon-hover-20"
            disabled={!hasMatches}
            title={t("timeline.textSearch.previous")}
            aria-label={t("timeline.textSearch.previous")}
            onClick={onPrev}
          >
            <MaterialIcon name="keyboard_arrow_up" />
          </UiButton>
          <UiButton
            variant="ghost"
            size="sm"
            iconOnly
            className="ui-icon-hover-20"
            disabled={!hasMatches}
            title={t("timeline.textSearch.next")}
            aria-label={t("timeline.textSearch.next")}
            onClick={onNext}
          >
            <MaterialIcon name="keyboard_arrow_down" />
          </UiButton>
          <UiButton
            variant="ghost"
            size="sm"
            iconOnly
            className="ui-icon-hover-20"
            title={t("timeline.textSearch.close")}
            aria-label={t("timeline.textSearch.close")}
            onClick={close}
          >
            <MaterialIcon name="close" />
          </UiButton>
        </>
      )}
    </div>
  );
};
