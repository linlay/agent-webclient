import React, { useRef, useState } from "react";
import { Alert, Empty, Spin } from "antd";
import { t } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { SearchFilterBar } from "@/shared/ui/SearchFilterBar";
import { ModalTitleBar } from "@/shared/ui/ModalTitleBar";
import { UiButton } from "@/shared/ui/UiButton";
import { usePanelResize } from "@/shared/ui/usePanelResize";
import type { KnowledgeBase } from "@/shared/data/api/dto/kbases";
import { useKBases } from "../hooks/useKBases";
import { libraryCollections } from "../lib/documentSource";
import { KnowledgeWorkspace } from "./KnowledgeWorkspace";
import { KBaseEditor } from "./KBaseEditor";
import { KBaseStateTag } from "./KBaseStateTag";
import styles from "./KBasesConsole.module.css";

interface KBasesConsoleProps {
  embedded?: boolean;
  onClose?: () => void;
  titleBarVariant?: "default" | "drawer";
}

export function KBasesConsole({ embedded = false, onClose, titleBarVariant = "default" }: KBasesConsoleProps = {}) {
  const { items, loading, error, reload } = useKBases();
  const [selected, select] = useState("");
  const [filter, setFilter] = useState("");
  const [editor, setEditor] = useState<KnowledgeBase | "new" | null>(null);
  const [listWidth, setListWidth] = useState(260);
  const resizeStart = useRef(listWidth);
  const { handlePointerDown } = usePanelResize({
    axis: "horizontal",
    onResizeStart: () => { resizeStart.current = listWidth; },
    onResize: delta => setListWidth(Math.max(220, Math.min(420, resizeStart.current + delta))),
  });
  const active = items.find(item => item.id === selected) || items[0];
  const search = filter.trim().toLowerCase();
  const visible = items.filter(item => `${item.name} ${item.description} ${libraryCollections(item).map(c => c.name).join(" ")}`.toLowerCase().includes(search));

  return <div className={`${styles.root} ${embedded ? styles.embedded : ""}`}>
    {embedded && <ModalTitleBar title={t("settingsMenu.knowledgeBase")} variant={titleBarVariant} onClose={() => onClose?.()} />}
    <div className={styles.layout} style={{ "--kbase-list-width": `${listWidth}px` } as React.CSSProperties}>
      <aside className={styles.sidebar}>
        <div className={styles.listToolbar}>
          <SearchFilterBar searchText={filter} onSearchChange={setFilter} searchPlaceholder={t("kbases.filter")} searchAriaLabel={t("kbases.filter")} filters={[]} />
          <UiButton size="sm" variant="ghost" iconOnly loading={loading} aria-label={t("kbases.reload")} title={t("kbases.reload")} onClick={() => void reload()}><MaterialIcon name="refresh" /></UiButton>
          <UiButton size="sm" variant="primary" iconOnly aria-label={t("kbases.create")} title={t("kbases.create")} onClick={() => setEditor("new")}><MaterialIcon name="add" /></UiButton>
        </div>
        <div className={styles.listCount}>{t("kbases.libraryCount", { count: visible.length })}</div>
        {error && <Alert type="error" showIcon message={error} action={<UiButton size="mini" variant="ghost" onClick={() => void reload()}>{t("kbases.reload")}</UiButton>} />}
        <div className={styles.listScroll}>
          <Spin spinning={loading}>
            {visible.length === 0 && !loading ? <div className={styles.listEmpty}>{t(items.length ? "kbases.noLibraries" : "kbases.empty")}{!items.length && <UiButton size="sm" variant="primary" onClick={() => setEditor("new")}>{t("kbases.create")}</UiButton>}</div> : visible.map(item => <button type="button" className={`${styles.library} ${active?.id === item.id ? styles.selected : ""}`} key={item.id} aria-pressed={active?.id === item.id} onClick={() => select(item.id)}>
              <MaterialIcon name="database" className={styles.libraryIcon} />
              <span className={styles.libraryCopy}>
                <span className={styles.itemHeading}><strong>{item.name}</strong><KBaseStateTag state={item.state} /></span>
                <span className={styles.itemDescription} title={item.description}>{item.description || t("kbases.collectionTotal", { count: libraryCollections(item).length })}</span>
              </span>
            </button>)}
          </Spin>
        </div>
        <div className={styles.resizeHandle} role="separator" tabIndex={0} aria-label={t("kbases.resizeList")} aria-orientation="vertical" aria-valuemin={220} aria-valuemax={420} aria-valuenow={listWidth} onPointerDown={handlePointerDown} onKeyDown={event => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); setListWidth(value => Math.max(220, Math.min(420, value + (event.key === "ArrowRight" ? 10 : -10)))); }
        }} />
      </aside>
      <section className={styles.detail}>
        {active ? <KnowledgeWorkspace key={`${active.id}:${active.indexedAt}`} library={active} onEdit={() => setEditor(active)} onChanged={reload} onDeleted={() => select("")} /> : !loading && <div className={styles.emptyDetail}><Empty description={t("kbases.select")} /><UiButton size="sm" variant="primary" onClick={() => setEditor("new")}>{t("kbases.create")}</UiButton></div>}
      </section>
    </div>
    {editor && <KBaseEditor library={editor} onClose={() => setEditor(null)} onSaved={async item => { select(item.id); await reload(); }} />}
  </div>;
}
