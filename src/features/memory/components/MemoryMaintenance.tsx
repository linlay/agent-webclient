import React, { useState } from "react";
import { useI18n } from "@/shared/i18n";
import { useMemoryMaintenance } from "@/features/memory/hooks/useMemoryMaintenance";
import styles from "./MemoryConsole.module.css";

export function MemoryMaintenance({ today, onReload }: { today: string; onReload: () => void }) {
    const { t } = useI18n();
    const m = useMemoryMaintenance();
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [includeArchived, setIncludeArchived] = useState(false);
    const job = m.status?.manual;
    const invalid = !startDate || !endDate || startDate > endDate || (!!today && endDate > today);
    return <details className={styles.maintenance} open>
        <summary>{t("memoryMaintenance.title")}</summary>
        <p>{t("memoryMaintenance.hint", { timezone: m.status?.timezone || "—" })}</p>
        <div className={styles.maintenanceConfig}>
            <span>{t("memoryMaintenance.model", { model: m.status?.modelKey || t("memoryMaintenance.defaultModel") })}</span>
            <span>{m.status ? t(m.status.automatic ? "memoryMaintenance.automaticOn" : "memoryMaintenance.automaticOff", { seconds: m.status.pollIntervalSeconds }) : t("memoryFiles.loading")}</span>
            {m.status && !m.status.enabled && <span>{t("memoryMaintenance.disabled")}</span>}
        </div>
        <form className={styles.rangeForm} onSubmit={e => { e.preventDefault(); if (!invalid && !m.active && !m.submitting && m.status?.enabled) void m.start({ startDate, endDate, includeArchived }); }}>
            <label>{t("memoryMaintenance.start")}<input type="date" required max={endDate || today || undefined} value={startDate} onChange={e => setStartDate(e.target.value)} disabled={m.active || m.submitting} /></label>
            <label>{t("memoryMaintenance.end")}<input type="date" required min={startDate || undefined} max={today || undefined} value={endDate} onChange={e => setEndDate(e.target.value)} disabled={m.active || m.submitting} /></label>
            <label className={styles.archiveOption}><input type="checkbox" checked={includeArchived} onChange={e => setIncludeArchived(e.target.checked)} disabled={m.active || m.submitting} />{t("memoryMaintenance.archive")}</label>
            <button type="submit" disabled={invalid || m.active || m.submitting || !m.status?.enabled}>{t("memoryMaintenance.startAction")}</button>
            {m.manualActive && <button type="button" disabled={m.submitting || job?.state === "canceling"} onClick={() => void m.cancel()}>{t("memoryMaintenance.cancel")}</button>}
        </form>
        {(m.status?.state === "running" || m.status?.state === "queued") && <p role="status">{t("memoryMaintenance.incrementalRunning")}</p>}
        {job && <div role="status" className={styles.jobStatus}>
            <strong>{t(`memoryMaintenance.state.${job.state}`)} · {job.startDate} — {job.endDate}</strong>
            <p>{t("memoryMaintenance.progress", { chats: job.scannedChats, runs: job.selectedRuns, processed: job.processedBatches, reused: job.reusedBatches, skipped: job.skippedRuns, empty: job.emptyRuns })}</p>
            {job.newFacts !== undefined && <p>{t("memoryMaintenance.facts", { count: job.newFacts })}</p>}
            {job.state === "completed" && <p>{t("memoryMaintenance.completedHint")}</p>}
            {!m.manualActive && <button type="button" onClick={onReload}>{t("memoryMaintenance.readResults")}</button>}
            {job.state === "failed" && !m.active && <button type="button" disabled={m.submitting || !m.status?.enabled} onClick={() => void m.start({ startDate: job.startDate, endDate: job.endDate, includeArchived: job.includeArchived })}>{t("memoryMaintenance.retry")}</button>}
            {job.error && <p role="alert">{job.error}</p>}
        </div>}
        {(m.error || m.status?.error) && <p role="alert">{m.error || m.status?.error}</p>}
    </details>;
}
