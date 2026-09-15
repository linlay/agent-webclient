import React from "react";
import { Input } from "antd";
import { useI18n } from "@/shared/i18n";
import { UiButton } from "@/shared/ui/UiButton";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import styles from "./TimelineTextSearchBar.module.css";

export interface TimelineTextSearchBarProps {
  query: string;
  onQueryChange: (value: string) => void;
  total: number;
  activeIndex: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

export const TimelineTextSearchBar: React.FC<TimelineTextSearchBarProps> = ({
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

  return (
    <div className={styles.bar}>
      <Input
        className={styles.input}
        size="small"
        allowClear
        autoFocus
        value={query}
        placeholder={t("timeline.textSearch.placeholder")}
        prefix={<MaterialIcon name="search" />}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          } else if (event.key === "Enter") {
            event.preventDefault();
            if (event.shiftKey) onPrev();
            else onNext();
          }
        }}
      />
      <span className={styles.count}>
        {hasMatches
          ? `${activeIndex + 1} / ${total}`
          : t("timeline.textSearch.noResults")}
      </span>
      <UiButton
        variant="ghost"
        size="sm"
        iconOnly
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
        title={t("timeline.textSearch.close")}
        aria-label={t("timeline.textSearch.close")}
        onClick={onClose}
      >
        <MaterialIcon name="close" />
      </UiButton>
    </div>
  );
};
