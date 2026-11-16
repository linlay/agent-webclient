import { useId } from "react";
import type { CompactLevel } from "@/shared/data";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon, type MaterialIconName } from "@/shared/ui/MaterialIcon";
import styles from "./CompactChooser.module.css";

const OPTIONS: ReadonlyArray<{
  level: CompactLevel;
  badge: string;
  icon: MaterialIconName;
  key: "tools" | "summary";
  label: string;
}> = [
  { level: "l1_tools", badge: "L1", icon: "build", key: "tools", label: "topNav.usage.compactTools" },
  { level: "summary", badge: "L2", icon: "subject", key: "summary", label: "topNav.usage.compactSummary" },
];

export function CompactChooserContent({ onSelect }: {
  onSelect: (level: CompactLevel) => void;
}) {
  const { t } = useI18n();
  const descriptionId = useId();

  return (
    <div className={styles.content}>
      <p className={styles.intro}>{t("contextCompact.chooser.subtitle")}</p>
      <div className={styles.options}>
        {OPTIONS.map(({ level, badge, icon, key, label }) => (
          <button
            key={level}
            type="button"
            className={styles.option}
            aria-label={t(label)}
            aria-describedby={`${descriptionId}-${level}`}
            onClick={() => onSelect(level)}
          >
            <span className={styles.icon} aria-hidden="true">
              <MaterialIcon name={icon} />
            </span>
            <span className={styles.copy}>
              <span className={styles.titleRow}>
                <span className={styles.optionTitle}>{t(`contextCompact.chooser.${key}.title`)}</span>
                <span className={styles.badge} aria-hidden="true">{badge}</span>
              </span>
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
