import type { EventDetailLevel } from "@/shared/data/eventDetailLevel";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import styles from "./CompactChooser.module.css";

const LEVELS: EventDetailLevel[] = ["full", "summary"];

export function DetailChooserContent({ current, onSelect }: {
  current: EventDetailLevel;
  onSelect: (level: EventDetailLevel) => void;
}) {
  const { t } = useI18n();

  return (
    <div className={styles.content}>
      <p className={styles.intro}>{t("detailChooser.subtitle")}</p>
      <div className={styles.options}>
        {LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            className={styles.option}
            aria-pressed={level === current}
            onClick={() => onSelect(level)}
          >
            <span className={styles.copy}>
              <span className={styles.optionTitle}>
                {t(`agents.interaction.defaultDetail.${level}`)}
                {level === current ? ` · ${t("detailChooser.current")}` : ""}
              </span>
              <span className={styles.description}>{t(`detailChooser.${level}.description`)}</span>
            </span>
            <MaterialIcon name="chevron_right" className={styles.arrow} />
          </button>
        ))}
      </div>
    </div>
  );
}
