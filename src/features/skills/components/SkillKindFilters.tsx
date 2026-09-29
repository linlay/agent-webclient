import React from "react";
import { useI18n } from "@/shared/i18n";
import type { SkillKindFilter } from "../lib/skillCatalogView";
import styles from "./SkillKindFilters.module.css";

export function SkillKindFilters({ value, onChange, packageCount, standaloneCount }: {
  value: SkillKindFilter;
  onChange: (value: SkillKindFilter) => void;
  packageCount: number;
  standaloneCount: number;
}) {
  const { t } = useI18n();
  const filters = [
    { kind: "package", label: t("packageComposer.packages"), count: packageCount },
    { kind: "standalone", label: t("packageComposer.standalone"), count: standaloneCount },
  ] as const;
  return <div role="group" aria-label={t("skillCatalog.kindFilter")} className={styles.filters}>
    {filters.map(({ kind, label, count }) => <button key={kind} type="button"
      className={styles.filter} data-skill-kind={kind} aria-pressed={value === kind} aria-label={label}
      onClick={() => onChange(value === kind ? null : kind)}>
      <span>{label}</span><span className={styles.count} aria-hidden="true">{count}</span>
    </button>)}
  </div>;
}
