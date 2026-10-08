import React, { useId, useState } from "react";
import { Alert, Checkbox, Input, Modal } from "antd";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { useMemoryMaintenance } from "@/features/memory/hooks/useMemoryMaintenance";
import styles from "./MemoryConsole.module.css";

export function MemoryMaintenance({ today, onReload }: { today: string; onReload: () => boolean }) {
  const { t } = useI18n();
  const m = useMemoryMaintenance();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const job = m.status?.manual;
  const invalid = !startDate || !endDate || startDate > endDate || (!!today && endDate > today);
  const openDialog = () => {
    if (!startDate && !endDate && today) { setStartDate(today); setEndDate(today); }
    setOpen(true);
  };
  const stateKey = job ? `memoryMaintenance.state.${job.state}` : "memoryMaintenance.state.running";
  return <>
    <UiButton size="sm" variant="secondary" onClick={openDialog}>
      <MaterialIcon name={m.error || job?.state === "failed" ? "error" : "refresh"} className={m.active ? styles.spinning : undefined} />
      {t(m.active ? "memoryMaintenance.runningAction" : "memoryMaintenance.title")}
    </UiButton>
    <Modal title={t("memoryMaintenance.title")} open={open} onCancel={() => setOpen(false)} width={480} className={styles.maintenanceModal} footer={<div className={styles.dialogActions}>
      {m.manualActive && <UiButton size="sm" variant="secondary" disabled={m.submitting || job?.state === "canceling"} onClick={() => void m.cancel()}>{t("memoryMaintenance.cancel")}</UiButton>}
      <UiButton size="sm" variant="ghost" onClick={() => setOpen(false)}>{t("memoryMaintenance.close")}</UiButton>
      <UiButton size="sm" variant="primary" type="submit" form={formId} disabled={invalid || m.active || !m.status?.enabled} loading={m.submitting}>{t("memoryMaintenance.startAction")}</UiButton>
    </div>}>
      <p className={styles.dialogHint}>{t("memoryMaintenance.hint")}</p>
      <form id={formId} className={styles.rangeForm} onSubmit={e => {
        e.preventDefault();
        if (!invalid && !m.active && !m.submitting && m.status?.enabled) void m.start({ startDate, endDate, includeArchived });
      }}>
        <div className={styles.rangeDates}>
          <label>{t("memoryMaintenance.start")}<Input type="date" aria-label={t("memoryMaintenance.start")} required max={endDate || today || undefined} value={startDate} onChange={e => setStartDate(e.target.value)} disabled={m.active || m.submitting} /></label>
          <label>{t("memoryMaintenance.end")}<Input type="date" aria-label={t("memoryMaintenance.end")} required min={startDate || undefined} max={today || undefined} value={endDate} onChange={e => setEndDate(e.target.value)} disabled={m.active || m.submitting} /></label>
        </div>
        <div className={styles.rangeTimezone}>{m.status?.timezone || t("memoryFiles.loading")}</div>
        <Checkbox checked={includeArchived} onChange={e => setIncludeArchived(e.target.checked)} disabled={m.active || m.submitting}>{t("memoryMaintenance.archive")}</Checkbox>
      </form>
      {m.status && !m.status.enabled && <Alert type="warning" showIcon message={t("memoryMaintenance.disabled")} />}
      {(m.status?.state === "running" || m.status?.state === "queued") && <p role="status" className={styles.dialogHint}>{t("memoryMaintenance.incrementalRunning")}</p>}
      {job && <div className={styles.jobStatus}>
        <div role="status" className={styles.jobHeading}><strong>{t(stateKey)}</strong><span>{job.startDate} — {job.endDate}</span></div>
        {job.newFacts !== undefined && <p>{t("memoryMaintenance.facts", { count: job.newFacts })}</p>}
        {!m.manualActive && <UiButton size="sm" variant="ghost" onClick={() => { if (onReload()) setOpen(false); }}>{t("memoryMaintenance.readResults")}</UiButton>}
        <details className={styles.taskDetails}><summary>{t("memoryMaintenance.details")}</summary><p>{t("memoryMaintenance.progress", { chats: job.scannedChats, runs: job.selectedRuns, processed: job.processedBatches, reused: job.reusedBatches, skipped: job.skippedRuns, empty: job.emptyRuns })}</p></details>
        {job.state === "failed" && !m.active && <UiButton size="sm" variant="ghost" disabled={m.submitting || !m.status?.enabled} onClick={() => void m.start({ startDate: job.startDate, endDate: job.endDate, includeArchived: job.includeArchived })}>{t("memoryMaintenance.retry")}</UiButton>}
        {job.error && <Alert type="error" showIcon message={job.error} />}
      </div>}
      {(m.error || m.status?.error) && <Alert type="error" showIcon message={m.error || m.status?.error} />}
    </Modal>
  </>;
}
