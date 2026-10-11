import React, { useState } from "react";
import { useI18n } from "@/shared/i18n";
import type { SelectedKBase } from "../lib/kbasesState";
import styles from "./KBasePicker.module.css";
export function KBaseSelectionTags({selected, invalidIds = [], boundLibrary, onChange}: {selected: SelectedKBase[]; invalidIds?: string[]; boundLibrary?: SelectedKBase; onChange: (items: SelectedKBase[]) => void}) {
 const {t} = useI18n();
 const [expanded, setExpanded] = useState(false);
 if (!selected.length && !boundLibrary) return null;
 return <div className={styles.tags} aria-label={t("kbase.title")}>
  {boundLibrary && <span className={styles.bound} title={t("kbase.bound")}><span>{t("kbase.bound")} · {boundLibrary.name}</span></span>}
  {(expanded ? selected : selected.slice(0, 3)).map(item => <span key={item.id} className={styles.tag} data-invalid={invalidIds.includes(item.id) || undefined} title={invalidIds.includes(item.id) ? t("kbase.selectionUnavailable") : t("kbase.required")}>
   <span>{item.name}</span><button type="button" aria-label={t("kbase.remove", {name: item.name})} onClick={() => onChange(selected.filter(library => library.id !== item.id))}>×</button>
  </span>)}
  {selected.length > 3 && <button type="button" onClick={() => setExpanded(value => !value)}>{expanded ? t("kbase.collapse") : `+${selected.length - 3}`}</button>}
  {selected.length > 0 && <button type="button" onClick={() => onChange([])}>{t("kbase.clear")}</button>}
 </div>;
}
