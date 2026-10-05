import React, { useState } from "react";
import { Modal } from "antd";
import { ConversationMarkdown } from "@/shared/ui/ConversationMarkdown";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { useI18n } from "@/shared/i18n";
import { useMemoryFiles } from "@/features/memory/hooks/useMemoryFiles";
import styles from "./MemoryConsole.module.css";

export function MemoryInfoConsole({ surface = "page", open = true, onClose }: {
  surface?: "page" | "modal";
  open?: boolean;
  onClose?: () => void;
}) {
  const { t } = useI18n();
  const m = useMemoryFiles();
  const [preview, setPreview] = useState(true);
  const close = () => { if (m.canLeave()) onClose?.(); };
  const fileName = m.document?.kind === "daily" ? `${m.document.date}.md`
    : m.document?.kind === "owner" ? "OWNER.md" : "summary.md";
  const body = (
    <section className={styles.console} aria-label={t("memoryFiles.title")}>
      <div className={styles.workbench}>
        <aside className={styles.sidebar}>
          <form className={styles.search} onSubmit={e => { e.preventDefault(); void m.search(); }}>
            <input aria-label={t("memoryFiles.search")} placeholder={t("memoryFiles.search")} value={m.query} onChange={e => m.setQuery(e.target.value)} disabled={m.busy} />
            <button type="submit" aria-label={t("memoryFiles.search")} title={t("memoryFiles.search")} disabled={m.busy || !m.query.trim()}><MaterialIcon name="search" /></button>
          </form>
          <nav className={styles.documents} aria-label={t("memoryFiles.documents")}>
            {(["memory", "owner"] as const).map(kind => (
              <button key={kind} type="button" aria-pressed={m.document?.kind === kind} disabled={m.busy} onClick={() => m.select(kind)}>
                <MaterialIcon name={kind === "memory" ? "psychology" : "person"} />
                <span>{t(`memoryFiles.${kind}`)}</span>
              </button>
            ))}
          </nav>
          <div className={styles.list}>
            {m.matches !== null ? <>
              <div className={styles.listHeading}><strong>{t("memoryFiles.search")}</strong><button disabled={m.busy} onClick={m.clearSearch}>{t("memoryFiles.clearSearch")}</button></div>
              <p>{t("memoryFiles.searchLimit")}</p>
              {m.matches.length === 0 && <p>{t("memoryFiles.noMatches")}</p>}
              {m.matches.map((hit, i) => <button className={styles.result} key={`${hit.kind}:${hit.date}:${hit.line}:${i}`} disabled={m.busy} onClick={() => m.select(hit.kind, hit.date)}>
                <strong>{hit.date || `${hit.kind === "owner" ? "OWNER" : "summary"}.md`} · {hit.line}</strong><span>{hit.text}</span>
              </button>)}
              {m.searchBefore && <button disabled={m.busy} onClick={() => void m.search(m.searchBefore)}>{t("memoryFiles.older")}</button>}
            </> : <>
              <div className={styles.listHeading}><strong>{t("memoryFiles.daily")}</strong><button disabled={m.busy || !m.today} onClick={() => m.select("daily", m.today)}>{t("memoryFiles.today")}</button></div>
              <input type="date" aria-label={t("memoryFiles.chooseDate")} value={m.document?.kind === "daily" ? m.document.date : ""} disabled={m.busy} onChange={e => {
                if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) m.select("daily", e.target.value);
              }} />
              {m.dates.length === 0 && <p>{t("memoryFiles.noDates")}</p>}
              {m.dates.map(date => <button className={styles.date} key={date} aria-pressed={m.document?.kind === "daily" && m.document.date === date} disabled={m.busy} onClick={() => m.select("daily", date)}>{date}</button>)}
              {m.nextBefore && <button disabled={m.busy} onClick={m.moreDates}>{t("memoryFiles.older")}</button>}
            </>}
          </div>
        </aside>
        <div className={styles.editor}>
          <div className={styles.toolbar}>
            <strong className={styles.fileName}>{fileName}</strong>
            <div className={styles.viewMode}>
              <button aria-pressed={preview} disabled={!m.document || m.busy} onClick={() => setPreview(true)}>{t("memoryFiles.preview")}</button>
              <button aria-pressed={!preview} disabled={!m.document || m.busy} onClick={() => setPreview(false)}>{t("memoryFiles.edit")}</button>
            </div>
            <button disabled={!m.document || m.busy} onClick={m.reload} title={t("memoryFiles.reload")} aria-label={t("memoryFiles.reload")}><MaterialIcon name="refresh" /></button>
            <button className={styles.save} disabled={!m.document || m.busy || !m.dirty || m.conflict} onClick={() => void m.save()}>{t("memoryFiles.save")}</button>
          </div>
          {m.error && <div role="alert" className={styles.error}>{m.error}</div>}
          {preview ? <div className={styles.preview}>
            {m.draft ? <ConversationMarkdown content={m.draft} codeComponent={({ children }) => <code>{children}</code>} /> : <p className={styles.empty}>{t(m.busy ? "memoryFiles.loading" : "memoryFiles.empty")}</p>}
          </div> : <textarea aria-label={t("memoryFiles.content")} spellCheck={false} value={m.draft} disabled={!m.document || m.busy} onChange={e => m.setDraft(e.target.value)} />}
          <footer className={styles.footer}>
            <span role="status">{m.busy ? t("memoryFiles.loading") : m.dirty ? t("memoryFiles.unsaved") : m.message}</span>
            <span className={styles.stats}>{t("memoryFiles.stats", { lines: m.draft ? m.draft.split("\n").length : 0, count: m.draft.length })}</span>
            <button className={styles.delete} disabled={!m.document?.exists || m.busy} onClick={() => void m.remove()}>{t("memoryFiles.delete")}</button>
          </footer>
          <details className={styles.help}><summary>{t("memoryFiles.principles")}</summary><p>{t(`memoryFiles.hint.${m.document?.kind || "memory"}`)}</p><p>{t("memoryFiles.rules")}</p></details>
        </div>
      </div>
    </section>
  );
  return surface === "modal" ? <Modal className={styles.modal} centered open={open} onCancel={close} footer={null} width="min(1120px, 94vw)" title={t("memoryFiles.title")}>{body}</Modal> : body;
}
