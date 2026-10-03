import React, { useState } from "react";
import { Modal } from "antd";
import { ConversationMarkdown } from "@/shared/ui/ConversationMarkdown";
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
    const [preview, setPreview] = useState(false);
    const close = () => { if (m.canLeave())
        onClose?.(); };
    const body = <section className={styles.console} aria-label={t("memoryFiles.title")}>
  <header><div><h2>{t("memoryFiles.title")}</h2><p>{t("memoryFiles.subtitle")}</p></div></header>
  <nav className={styles.tabs} aria-label={t("memoryFiles.documents")}>
   {(["memory", "owner", "daily"] as const).map(kind => <button key={kind} type="button" aria-pressed={m.document?.kind === kind} disabled={m.busy || kind === "daily" && !m.today} onClick={() => m.select(kind, kind === "daily" ? m.today : "")}>{t(`memoryFiles.${kind}`)}</button>)}
  </nav>
  <div className={styles.workbench}>
   <aside className={styles.sidebar}>
    <form onSubmit={e => { e.preventDefault(); void m.search(); }}><input aria-label={t("memoryFiles.search")} placeholder={t("memoryFiles.search")} value={m.query} onChange={e => m.setQuery(e.target.value)} disabled={m.busy}/><button disabled={m.busy || !m.query.trim()}>{t("memoryFiles.search")}</button></form>
    {m.matches !== null ? <><button onClick={m.clearSearch} disabled={m.busy}>{t("memoryFiles.clearSearch")}</button><p>{t("memoryFiles.searchLimit")}</p>{m.matches.length === 0 && <p>{t("memoryFiles.noMatches")}</p>}{m.matches.map((hit, i) => <button className={styles.result} key={`${hit.kind}:${hit.date}:${hit.line}:${i}`} disabled={m.busy} onClick={() => m.select(hit.kind, hit.date)}><strong>{hit.date || `${hit.kind === 'owner' ? 'OWNER' : 'memory'}.md`} · {hit.line}</strong><span>{hit.text}</span></button>)}{m.searchBefore && <button disabled={m.busy} onClick={() => void m.search(m.searchBefore)}>{t("memoryFiles.older")}</button>}</> : <>
    <h3>{t("memoryFiles.daily")}</h3><button disabled={m.busy || !m.today} onClick={() => m.select("daily", m.today)}>{t("memoryFiles.today")}</button>
    <input type="date" aria-label={t("memoryFiles.chooseDate")} disabled={m.busy} onChange={e => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value))
            m.select("daily", e.target.value); }}/>
    {m.dates.length === 0 && <p>{t("memoryFiles.noDates")}</p>}{m.dates.map(date => <button key={date} aria-pressed={m.document?.kind === "daily" && m.document.date === date} disabled={m.busy} onClick={() => m.select("daily", date)}>{date}</button>)}
    {m.nextBefore && <button disabled={m.busy} onClick={m.moreDates}>{t("memoryFiles.older")}</button>}</>}
   </aside>
   <div className={styles.editor}>
    <div className={styles.toolbar}><strong>{m.document?.kind === "daily" ? `${m.document.date}.md` : m.document?.kind === "owner" ? "OWNER.md" : "memory.md"}</strong><span role="status">{m.busy ? t("memoryFiles.loading") : m.dirty ? t("memoryFiles.unsaved") : m.message}</span>
     <button disabled={!m.document || m.busy} onClick={() => setPreview(!preview)}>{t(preview ? "memoryFiles.edit" : "memoryFiles.preview")}</button>
     <button disabled={!m.document || m.busy} onClick={m.reload}>{t("memoryFiles.reload")}</button>
     <button disabled={!m.document || m.busy || !m.dirty || m.conflict} onClick={() => void m.save()}>{t("memoryFiles.save")}</button>
     <button disabled={!m.document?.exists || m.busy} onClick={() => void m.remove()}>{t("memoryFiles.delete")}</button>
    </div>
    {m.error && <div role="alert" className={styles.error}>{m.error}</div>}
    <p>{t(`memoryFiles.hint.${m.document?.kind || "memory"}`)}</p>
    {preview ? <div className={styles.preview}><ConversationMarkdown content={m.draft} codeComponent={({ children }) => <code>{children}</code>}/></div> : <textarea aria-label={t("memoryFiles.content")} spellCheck={false} value={m.draft} disabled={!m.document || m.busy} onChange={e => m.setDraft(e.target.value)}/>}
    <details><summary>{t("memoryFiles.principles")}</summary><p>{t("memoryFiles.rules")}</p></details>
   </div>
  </div>
 </section>;
    return surface === "modal" ? <Modal open={open} onCancel={close} footer={null} width="90vw" title={t("memoryFiles.title")}>{body}</Modal> : body;
}
