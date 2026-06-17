import React from "react";
import { useComposerContext } from "@/features/composer/components/ComposerContext";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { Typography } from "antd";

interface ComposerWondersProps {
  sampledWonders: string[];
  allWonders: string[];
  onReshuffle: () => void;
}

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
      className="composer-wonders"
      aria-label={t("composer.wonders.ariaLabel")}
    >
      <div className="composer-wonders-header">
        <div className="composer-wonders-kicker">
          {t("composer.wonders.kicker")}
        </div>
        <div className="composer-wonders-title">
          {t("composer.wonders.title")}
        </div>
        {allWonders.length > 0 && (
          <button
            type="button"
            className="composer-wonders-shuffle"
            onClick={onReshuffle}
            aria-label={t("composer.wonders.shuffleAriaLabel")}
            title={t("composer.wonders.shuffle")}
          >
            <MaterialIcon name="refresh" />
          </button>
        )}
      </div>
      <div className="composer-wonders-grid">
        {sampledWonders.map((wonder, index) => (
          <button
            key={`${index}:${wonder}`}
            type="button"
            className="composer-wonder-card"
            onClick={() => applyComposerDraft(wonder)}
          >
            <span className="composer-wonder-index">
              {t("composer.wonders.itemLabel", { index: index + 1 })}
            </span>
            <Typography.Paragraph ellipsis={{ rows: 3, tooltip: wonder }}>
              <span className="composer-wonder-text">{wonder}</span>
            </Typography.Paragraph>
          </button>
        ))}
      </div>
    </section>
  );
};
