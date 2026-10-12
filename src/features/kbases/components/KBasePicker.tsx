import React, { useEffect, useRef, useState } from "react";
import { Input, Spin } from "antd";
import type { InputRef } from "antd";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import pickerTypography from "@/shared/ui/PickerTypography.module.css";
import type { KBaseCatalog } from "../hooks/useKBaseOptions";
import type { SelectedKBase } from "../lib/kbasesState";
import { MAX_KBASE_REFERENCES, normalizeKbaseIds } from "../lib/kbaseSelection";
import styles from "./KBasePicker.module.css";

export function KBasePicker({ catalog, selected, onChange, disabled: selectionDisabled = false }: {
  disabled?: boolean;
  catalog: KBaseCatalog;
  selected: SelectedKBase[];
  onChange: (items: SelectedKBase[]) => void;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const searchRef = useRef<InputRef>(null);
  useEffect(() => { catalog.refresh(); }, [catalog.refresh]);
  useEffect(() => {
    const timer = window.setTimeout(() => searchRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, []);
  const keyword = search.trim().toLowerCase();
  const selectedIds = new Set(normalizeKbaseIds(selected.map(item => item.id)));
  const atLimit = selectedIds.size >= MAX_KBASE_REFERENCES;
  const limitText = t("kbase.selectionLimit", { count: MAX_KBASE_REFERENCES });
  const libraries = (catalog.data?.libraries || []).filter(item =>
    [item.name, item.id, item.description, ...item.collections.flatMap(c => [c.name, c.description])]
      .filter(Boolean).join(" ").toLowerCase().includes(keyword));
  const error = catalog.error?.startsWith("kbase.") ? t(catalog.error) : catalog.error;

  return <section className={styles.picker} aria-label={t("kbase.title")}>
    <Input ref={searchRef} className={`${styles.search} ${pickerTypography.search}`} variant="filled" prefix={<MaterialIcon name="search" />}
      aria-label={t("kbase.search")} placeholder={t("kbase.search")} value={search}
      onChange={event => setSearch(event.target.value)} allowClear />
    <div className={styles.list} aria-busy={catalog.status === "loading"}>
      {catalog.status === "loading" && <div className={styles.status} role="status"><Spin size="small" />{t("composer.addMenu.loading")}</div>}
      {catalog.status === "error" && <div className={styles.status} role="alert">
        <span>{error}</span><UiButton variant="ghost" size="sm" onClick={catalog.refresh}>{t("kbase.retry")}</UiButton>
      </div>}
      {catalog.status === "success" && !catalog.data?.capability.available && <div className={styles.status} role="status" title={catalog.data?.capability.reason}>{t("kbase.noCapability")}</div>}
      {catalog.status === "success" && catalog.data?.capability.available && <>
        {!libraries.length && <div className={styles.status} role="status">{t(keyword ? "composer.addMenu.empty" : "kbase.empty")}</div>}
        {libraries.map(item => {
          const isSelected = selectedIds.has(item.id);
          const description = item.description || item.collections.map(c => c.description || c.name).join(" · ");
          const availability = !item.readable ? item.unavailableReason || t("kbase.unreadable")
            : [item.indexing ? t("kbase.indexing") : "", item.degraded ? t("kbase.degraded") : ""].filter(Boolean).join(" · ");
          const disabled = selectionDisabled || !item.readable || (atLimit && !isSelected);
          const title = [item.name, description, availability, atLimit && !isSelected ? limitText : ""].filter(Boolean).join("\n");
          return <button type="button" className={styles.row} key={item.id} title={title} aria-label={item.name}
            aria-pressed={isSelected} disabled={disabled}
            onClick={() => onChange(isSelected ? selected.filter(library => library.id !== item.id) : [...selected, { id: item.id, name: item.name }])}>
            <MaterialIcon name="book_2" className={styles.icon} />
            <span className={styles.copy}><strong className={pickerTypography.name}>{item.name}</strong>{description && <span className={pickerTypography.description}>{description}</span>}</span>
          </button>;
        })}
      </>}
    </div>
    <span className={styles.visuallyHidden} role="status">{atLimit ? limitText : ""}</span>
  </section>;
}
