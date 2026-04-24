import React from "react";
import { useComposerContext } from "@/features/composer/components/ComposerContext";
import { useI18n } from "@/shared/i18n";

interface ComposerWondersProps {
  sampledWonders: string[];
}

export const ComposerWonders: React.FC<ComposerWondersProps> = ({
  sampledWonders,
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
            <span className="composer-wonder-text">{wonder}</span>
          </button>
        ))}
      </div>
    </section>
  );
};
