import React, { useRef, useState } from "react";
import { Alert, Modal, Popover, Tabs } from "antd";
import { ConversationMarkdown } from "@/shared/ui/ConversationMarkdown";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { SearchFilterBar } from "@/shared/ui/SearchFilterBar";
import { UiButton } from "@/shared/ui/UiButton";
import { usePanelResize } from "@/shared/ui/usePanelResize";
import { useI18n } from "@/shared/i18n";
import { useMemoryFiles } from "@/features/memory/hooks/useMemoryFiles";
import { MemoryMaintenance } from "./MemoryMaintenance";
import styles from "./MemoryConsole.module.css";

export function MemoryInfoConsole({ surface = "page", open = true, onClose }: {
  surface?: "page" | "modal";
  open?: boolean;
  onClose?: () => void;
}) {
  const { t } = useI18n();
  const m = useMemoryFiles();
  const [preview, setPreview] = useState(true);
  const [help, setHelp] = useState(false);
  const [datePicker, setDatePicker] = useState(false);
  const [listWidth, setListWidth] = useState(260);
  const resizeStart = useRef(listWidth);
  const { handlePointerDown } = usePanelResize({
    axis: "horizontal",
    onResizeStart: () => { resizeStart.current = listWidth; },
    onResize: delta => setListWidth(Math.max(220, Math.min(420, resizeStart.current + delta))),
  });
  const close = () => { if (m.canLeave()) onClose?.(); };
  const fileName = m.document?.kind === "daily" ? `${m.document.date}.md`
    : m.document?.kind === "owner" ? "OWNER.md" : "summary.md";
  const renderDocument = (showPreview: boolean) => <div className={styles.documentPane}>
    <div className={styles.documentHeading}><strong>{fileName}</strong>{m.dirty && <span>{t("memoryFiles.unsaved")}</span>}</div>
    {m.error && <Alert className={styles.error} type="error" showIcon message={m.error} />}
    {showPreview ? <div className={styles.preview}>
      {m.draft ? <ConversationMarkdown content={m.draft} codeComponent={({ children }) => <code>{children}</code>} /> : <p className={styles.empty}>{t(m.busy ? "memoryFiles.loading" : "memoryFiles.empty")}</p>}
    </div> : <textarea aria-label={t("memoryFiles.content")} spellCheck={false} value={m.draft} disabled={!m.document || m.busy} onChange={e => m.setDraft(e.target.value)} />}
    <footer className={styles.footer}>
      <span role="status">{m.busy ? t("memoryFiles.loading") : m.dirty ? t("memoryFiles.unsaved") : m.message}</span>
      <span className={styles.stats}>{t("memoryFiles.stats", { lines: m.draft ? m.draft.split("\n").length : 0, count: m.draft.length })}</span>
      <UiButton size="mini" variant="ghost" iconOnly className={styles.delete} disabled={!m.document?.exists || m.busy} title={t("memoryFiles.delete")} aria-label={t("memoryFiles.delete")} onClick={() => void m.remove()}><MaterialIcon name="delete" /></UiButton>
    </footer>
  </div>;
  const body = (
    <section className={styles.console} aria-label={t("memoryFiles.title")}>
      <div className={styles.workbench} style={{ "--memory-list-width": `${listWidth}px` } as React.CSSProperties}>
        <aside className={styles.sidebar}>
          <form className={styles.listToolbar} onSubmit={e => { e.preventDefault(); void m.search(); }}>
            <SearchFilterBar searchText={m.query} onSearchChange={m.setQuery} searchAriaLabel={t("memoryFiles.search")} searchPlaceholder={t("memoryFiles.searchPlaceholder")} filters={[]} />
            <UiButton size="sm" variant="ghost" iconOnly loading={m.busy} onClick={m.reload} title={t("memoryFiles.reload")} aria-label={t("memoryFiles.reload")}><MaterialIcon name="refresh" /></UiButton>
          </form>
          <nav className={styles.documents} aria-label={t("memoryFiles.documents")}>
            <div className={styles.listHeading}>{t("memoryFiles.documents")}</div>
            {(["memory", "owner"] as const).map(kind => (
              <button className={`${styles.fileRow} ${m.document?.kind === kind ? styles.selected : ""}`} key={kind} type="button" aria-pressed={m.document?.kind === kind} disabled={m.busy} onClick={() => m.select(kind)}>
                <MaterialIcon className={styles.fileIcon} name={kind === "memory" ? "psychology" : "person"} />
                <span className={styles.fileCopy}><strong>{t(`memoryFiles.${kind}`)}</strong><span>{kind === "memory" ? "summary.md" : "OWNER.md"}</span></span>
              </button>
            ))}
          </nav>
          <div className={styles.list}>
            {m.matches !== null ? <>
              <div className={styles.listHeading}><span>{t("memoryFiles.searchResults", { count: m.matches.length })}</span><UiButton size="mini" variant="ghost" iconOnly disabled={m.busy} onClick={m.clearSearch} title={t("memoryFiles.clearSearch")} aria-label={t("memoryFiles.clearSearch")}><MaterialIcon name="close" /></UiButton></div>
              {m.matches.length === 0 && <p className={styles.listEmpty}>{t("memoryFiles.noMatches")}</p>}
              {m.matches.map((hit, i) => <button type="button" className={styles.result} key={`${hit.kind}:${hit.date}:${hit.line}:${i}`} disabled={m.busy} onClick={() => m.select(hit.kind, hit.date)}>
                <strong>{hit.date ? `${hit.date}.md` : `${hit.kind === "owner" ? "OWNER" : "summary"}.md`}<span className={styles.lineNumber}>:{hit.line}</span></strong><span>{hit.text}</span>
              </button>)}
              {m.searchBefore && <UiButton size="sm" variant="ghost" disabled={m.busy} onClick={() => void m.search(m.searchBefore)}>{t("memoryFiles.older")}</UiButton>}
            </> : <>
              <div className={styles.listHeading}><span>{t("memoryFiles.daily")}</span><div className={styles.dateActions}>
                <UiButton size="mini" variant="ghost" disabled={m.busy || !m.today} onClick={() => m.select("daily", m.today)}>{t("memoryFiles.today")}</UiButton>
                <Popover trigger="click" open={datePicker} onOpenChange={setDatePicker} content={<label className={styles.datePicker}>{t("memoryFiles.chooseDate")}<input type="date" aria-label={t("memoryFiles.chooseDate")} value={m.document?.kind === "daily" ? m.document.date : ""} disabled={m.busy} onChange={e => {
                  if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) { m.select("daily", e.target.value); setDatePicker(false); }
                }} /></label>}>
                  <UiButton size="mini" variant="ghost" iconOnly disabled={m.busy} title={t("memoryFiles.chooseDate")} aria-label={t("memoryFiles.chooseDate")}><MaterialIcon name="calendar_month" /></UiButton>
                </Popover>
              </div>
              </div>
              {m.dates.length === 0 && <p className={styles.listEmpty}>{t("memoryFiles.noDates")}</p>}
              {m.dates.map(date => <button type="button" className={`${styles.fileRow} ${styles.date} ${m.document?.kind === "daily" && m.document.date === date ? styles.selected : ""}`} key={date} aria-pressed={m.document?.kind === "daily" && m.document.date === date} disabled={m.busy} onClick={() => m.select("daily", date)}><MaterialIcon name="description" /><span>{date}</span></button>)}
              {m.nextBefore && <UiButton size="sm" variant="ghost" disabled={m.busy} onClick={m.moreDates}>{t("memoryFiles.older")}</UiButton>}
            </>}
          </div>
          <div className={styles.resizeHandle} role="separator" tabIndex={0} aria-label={t("memoryFiles.resizeList")} aria-orientation="vertical" aria-valuemin={220} aria-valuemax={420} aria-valuenow={listWidth} onPointerDown={handlePointerDown} onKeyDown={event => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); setListWidth(value => Math.max(220, Math.min(420, value + (event.key === "ArrowRight" ? 10 : -10)))); }
          }} />
        </aside>
        <div className={styles.editor}>
          <Tabs className={styles.viewTabs} destroyOnHidden activeKey={preview ? "preview" : "edit"} onChange={key => setPreview(key === "preview")} items={[
            { key: "preview", label: t("memoryFiles.preview"), disabled: !m.document || m.busy, children: renderDocument(true) },
            { key: "edit", label: t("memoryFiles.edit"), disabled: !m.document || m.busy, children: renderDocument(false) },
          ]} renderTabBar={(props, DefaultTabBar) => <div className={styles.toolbar}>
            <DefaultTabBar {...props} />
            <div className={styles.actions}>
              <MemoryMaintenance today={m.today} onReload={m.reload} />
              {(!preview || m.dirty) && <UiButton size="sm" variant="primary" disabled={!m.document || !m.dirty || m.conflict} loading={m.busy} onClick={() => void m.save()}>{t("memoryFiles.save")}</UiButton>}
              <UiButton size="sm" variant="ghost" iconOnly title={t("memoryFiles.principles")} aria-label={t("memoryFiles.principles")} onClick={() => setHelp(true)}><MaterialIcon name="info" /></UiButton>
            </div>
          </div>} />

        </div>
      </div>
      <Modal open={help} onCancel={() => setHelp(false)} footer={null} title={t("memoryFiles.principles")} width={480}><div><p>{t(`memoryFiles.hint.${m.document?.kind || "memory"}`)}</p><p>{t("memoryFiles.rules")}</p></div></Modal>
    </section>
  );
  return surface === "modal" ? <Modal className={styles.modal} centered open={open} onCancel={close} footer={null} width="min(1120px, 94vw)" title={t("memoryFiles.title")}>{body}</Modal> : body;
}
