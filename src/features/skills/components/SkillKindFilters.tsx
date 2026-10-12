import React, { useState } from "react";
import { Dropdown } from "antd";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import type { SkillKindFilter } from "../lib/skillCatalogView";
import styles from "./SkillKindFilters.module.css";

export function SkillKindFilters({ value, onChange, packageCount, standaloneCount }: {
  value: SkillKindFilter;
  onChange: (value: SkillKindFilter) => void;
  packageCount: number;
  standaloneCount: number;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const filters = [
    { kind: "all", label: t("skillCatalog.all"), count: packageCount + standaloneCount },
    { kind: "package", label: t("packageComposer.packages"), count: packageCount },
    { kind: "standalone", label: t("packageComposer.standalone"), count: standaloneCount },
  ] as const;
  return <Dropdown trigger={["click"]} open={open} onOpenChange={setOpen}
    menu={{
      selectable: true,
      selectedKeys: [value ?? "all"],
      onClick: ({ key }) => {
        onChange(key === "all" ? null : key as SkillKindFilter);
        setOpen(false);
      },
      items: filters.map(({ kind, label, count }) => ({
        key: kind,
        label: <span className={styles.option} data-skill-kind={kind}>
          <span>{label}</span><span className={styles.count}>{count}</span>
        </span>,
      })),
    }}>
    <button type="button" className={styles.trigger} data-active={value !== null}
      aria-label={t("skillCatalog.kindFilter")} title={t("skillCatalog.kindFilter")}
      aria-haspopup="menu" aria-expanded={open}>
      <MaterialIcon name="filter_list" />
    </button>
  </Dropdown>;
}
