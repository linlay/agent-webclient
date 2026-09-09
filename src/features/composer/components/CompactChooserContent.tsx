import React, { useId } from "react";
import type { CompactLevel } from "@/shared/data";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import styles from "./CompactChooser.module.css";

export function CompactChooserContent({ onSelect }: {
  onSelect: (level: CompactLevel) => void;
}) {
  const { t } = useI18n();
  const descriptionId = useId();

  return (
    <div className={styles.content}>
      <p className={styles.intro}>{t("contextCompact.chooser.subtitle")}</p>
      <div className={styles.options}>
        {([
          { level: "l1_tools", badge: "L1", key: "tools", label: "topNav.usage.compactTools" },
          { level: "summary", badge: "L2", key: "summary", label: "topNav.usage.compactSummary" },
        ] as const).map(({ level, badge, key, label }) => (
          <button
            key={level}
            type="button"
            className={styles.option}
            aria-label={t(label)}
            aria-describedby={`${descriptionId}-${level}`}
            onClick={() => onSelect(level)}
          >
            <span className={styles.badge} aria-hidden="true">{badge}</span>
            <span className={styles.copy}>
              <span className={styles.optionTitle}>{t(`contextCompact.chooser.${key}.title`)}</span>
              <span className={styles.description} id={`${descriptionId}-${level}`}>
                {t(`contextCompact.chooser.${key}.description`)}
              </span>
            </span>
            <MaterialIcon name="chevron_right" className={styles.arrow} />
          </button>
        ))}
      </div>
      <p className={styles.hint}>{t("contextCompact.chooser.hint")}</p>
    </div>
  );
}
