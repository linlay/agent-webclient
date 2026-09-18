import React from "react";
import { useI18n } from "@/shared/i18n";
import { UiButton } from "@/shared/ui/UiButton";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { isMacPlatform } from "@/features/timeline/lib/timelineTextSearch";
import { TimelineTextSearchBar } from "@/features/timeline/components/TimelineTextSearchBar";
import { useTimelineTextSearch } from "@/features/timeline/components/TimelineTextSearchProvider";

export interface TimelineTextSearchControlProps {
  buttonClassName?: string;
}

export const TimelineTextSearchControl: React.FC<
  TimelineTextSearchControlProps
> = ({ buttonClassName }) => {
  const { t } = useI18n();
  const search = useTimelineTextSearch();

  if (!search || search.searchableNodeIds.size === 0) return null;

  const isMac = isMacPlatform();
  const shortcutLabel = isMac ? "⌘F" : "Ctrl+F";
  const ariaShortcut = isMac ? "Meta+F" : "Control+F";

  if (!search.open) {
    return (
      <UiButton
        className={buttonClassName}
        variant="ghost"
        size="sm"
        iconOnly
        aria-label={t("timeline.textSearch.open")}
        aria-keyshortcuts={ariaShortcut}
        title={`${t("timeline.textSearch.open")} (${shortcutLabel})`}
        onClick={search.openSearch}
      >
        <MaterialIcon name="search" />
      </UiButton>
    );
  }

  return (
    <TimelineTextSearchBar
      query={search.query}
      onQueryChange={search.setQuery}
      total={search.total}
      activeIndex={search.activeIndex}
      onPrev={search.goPrev}
      onNext={search.goNext}
      onClose={search.closeSearch}
    />
  );
};
