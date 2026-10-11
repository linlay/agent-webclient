import React, { useEffect, useState } from "react";
import { Checkbox, Input } from "antd";
import { useI18n } from "@/shared/i18n";
import type { KBaseCatalog } from "../hooks/useKBaseOptions";
import type { SelectedKBase } from "../lib/kbasesState";
import { UiButton } from "@/shared/ui/UiButton";
import styles from "./KBasePicker.module.css";
export function KBasePicker({catalog, selected, onChange}: {catalog: KBaseCatalog; selected: SelectedKBase[]; onChange: (items: SelectedKBase[]) => void}) {
 const {t} = useI18n();
 const [search, setSearch] = useState("");
 useEffect(() => { catalog.refresh(); }, [catalog.refresh]);
 const keyword = search.trim().toLowerCase();
 const libraries = (catalog.data?.libraries || []).filter(item => [item.name, item.id, item.description, ...item.collections.flatMap(c => [c.name, c.description])].filter(Boolean).join(" ").toLowerCase().includes(keyword));
 const error = catalog.error?.startsWith("kbase.") ? t(catalog.error) : catalog.error;
 return <div className={styles.picker}>
  <div className={styles.header}><strong>{t("kbase.title")}</strong><span>{t("kbase.selected", {count: selected.length})}</span></div>
  <Input aria-label={t("kbase.search")} placeholder={t("kbase.search")} value={search} onChange={event => setSearch(event.target.value)} allowClear />
  {catalog.status === "loading" && <p role="status">{t("composer.addMenu.loading")}</p>}
  {catalog.status === "error" && <div role="alert"><p>{error}</p><UiButton variant="ghost" size="sm" onClick={catalog.refresh}>{t("kbase.retry")}</UiButton></div>}
  {catalog.status === "success" && !catalog.data?.capability.available && <p role="status">{catalog.data?.capability.reason || t("kbase.noCapability")}</p>}
  {catalog.status === "success" && catalog.data?.capability.available && <div className={styles.list}>
   {!libraries.length && <p role="status">{t(keyword ? "composer.addMenu.empty" : "kbase.empty")}</p>}
   {libraries.map(item => <Checkbox className={styles.row} key={item.id} title={item.unavailableReason} aria-label={item.name} checked={selected.some(library => library.id === item.id)} disabled={!item.readable} onChange={event => onChange(event.target.checked ? [...selected, {id: item.id, name: item.name}] : selected.filter(library => library.id !== item.id))}>
    <span className={styles.copy}><strong>{item.name}</strong><span>{item.description || item.collections.map(c => c.description || c.name).join(" · ")}</span>
     <small>{!item.readable ? (item.unavailableReason === item.description ? "" : item.unavailableReason || t("kbase.unreadable")) : [item.indexing ? t("kbase.indexing") : "", item.degraded ? t("kbase.degraded") : ""].filter(Boolean).join(" · ")}</small>
    </span>
   </Checkbox>)}
  </div>}
  <div className={styles.footer}><span>{t("kbase.nextQuery")}</span><UiButton variant="ghost" size="sm" disabled={!selected.length} onClick={() => onChange([])}>{t("kbase.clear")}</UiButton></div>
 </div>;
}
