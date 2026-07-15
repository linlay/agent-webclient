import React from "react";
import { useComposerContext } from "@/features/composer/components/ComposerContext";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { Typography } from "antd";
import { UiButton } from "@/shared/ui/UiButton";

interface ComposerWondersProps {
  sampledWonders: string[];
  allWonders: string[];
  onReshuffle: () => void;
}

const COMPOSER_WONDERS_CLASS =
  "composer-wonders tw:flex tw:flex-col tw:gap-2.5 tw:overflow-auto";
const COMPOSER_WONDERS_HEADER_CLASS =
  "composer-wonders-header tw:flex tw:items-center tw:gap-2.5 tw:px-1 tw:py-0";
const COMPOSER_WONDERS_KICKER_CLASS =
  "composer-wonders-kicker tw:text-[11px] tw:font-bold tw:uppercase tw:tracking-[0.16em] tw:text-accent-electric-strong";
const COMPOSER_WONDERS_TITLE_CLASS =
  "composer-wonders-title tw:text-[13px] tw:text-ink-2 tw:flex-1";
const COMPOSER_WONDERS_GRID_CLASS =
  "composer-wonders-grid tw:grid tw:grid-cols-3 tw:gap-2.5 tw:overflow-auto";
const COMPOSER_WONDER_CARD_CLASS =
  "composer-wonder-card tw:flex tw:flex-col tw:items-start tw:gap-2 tw:bg-transparent tw:px-[15px] tw:py-3.5 tw:text-left tw:shadow-elevated tw:transition-[transform,border-color,box-shadow] tw:duration-[180ms] tw:ease-in-out tw:hover:border-[color-mix(in_srgb,var(--accent-electric)_42%,var(--line-soft))] tw:hover:shadow-[var(--shadow-soft),0_0_0_3px_color-mix(in_srgb,var(--accent-soft)_72%,transparent)] tw:hover:outline-none tw:focus-visible:-translate-y-px tw:focus-visible:border-[color-mix(in_srgb,var(--accent-electric)_42%,var(--line-soft))] tw:focus-visible:shadow-[var(--shadow-soft),0_0_0_3px_color-mix(in_srgb,var(--accent-soft)_72%,transparent)] tw:focus-visible:outline-none";
const COMPOSER_WONDER_INDEX_CLASS =
  "composer-wonder-index tw:text-[11px] tw:font-semibold tw:text-ink-muted";
const COMPOSER_WONDER_TEXT_CLASS = "composer-wonder-text tw:text-[13px]";

export const ComposerWonders: React.FC<ComposerWondersProps> = ({
  sampledWonders,
  allWonders,
  onReshuffle,
}) => {
  const { t } = useI18n();
  const { applyComposerDraft } = useComposerContext();

  if (sampledWonders.length === 0) {
    return null;
  }

  return (
    <section
      className={COMPOSER_WONDERS_CLASS}
      aria-label={t("composer.wonders.ariaLabel")}
    >
      <div className={COMPOSER_WONDERS_HEADER_CLASS}>
        <div className={COMPOSER_WONDERS_KICKER_CLASS}>
          {t("composer.wonders.kicker")}
        </div>
        <div className={COMPOSER_WONDERS_TITLE_CLASS}>
          {t("composer.wonders.title")}
        </div>
        {allWonders.length > 0 && (
          <UiButton
            size="sm"
            variant="ghost"
            className="ui-icon-hover-24"
            iconOnly
            onClick={onReshuffle}
          >
            <MaterialIcon name="refresh" />
          </UiButton>
        )}
      </div>
      <div className={COMPOSER_WONDERS_GRID_CLASS}>
        {sampledWonders.map((wonder, index) => (
          <button
            key={`${index}:${wonder}`}
            type="button"
            className={COMPOSER_WONDER_CARD_CLASS}
            onClick={() => applyComposerDraft(wonder)}
          >
            <span className={COMPOSER_WONDER_INDEX_CLASS}>
              {t("composer.wonders.itemLabel", { index: index + 1 })}
            </span>
            <Typography.Paragraph ellipsis={{ rows: 3, tooltip: wonder }}>
              <span className={COMPOSER_WONDER_TEXT_CLASS}>{wonder}</span>
            </Typography.Paragraph>
          </button>
        ))}
      </div>
    </section>
  );
};
