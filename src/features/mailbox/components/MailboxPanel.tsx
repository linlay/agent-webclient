import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Drawer, Empty, Input, Modal, Select, Space, Spin, Tag } from "antd";
import type { MailKind, MailRecord, MailStatus } from "@/shared/data/api/dto/mailbox";
import { getMails, actOnMail } from "@/shared/data/api/requests/mailbox";
import { useI18n } from "@/shared/i18n";
import { canActOnMail, mailBody, mailEvidenceKey } from "../lib/mailPresentation";
import styles from "./MailboxPanel.module.css";

const kinds: MailKind[] = ["letter", "reply", "notify", "ask"];
const statuses: MailStatus[] = ["suspended", "queued", "inflight", "delivered", "done", "failed", "discarded", "withdrawn", "accepting"];
const pageSize = 50;
export function MailboxPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, locale } = useI18n();
  const [rows, setRows] = useState<MailRecord[]>([]);
  const [kind, setKind] = useState<MailKind>();
  const [status, setStatus] = useState<MailStatus>();
  const [agentKey, setAgentKey] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [confirmation, setConfirmation] = useState<{ mail: MailRecord; action: "redeliver" | "discard" }>();
  const sequence = useRef(0);
  const abort = useRef<AbortController>();
  const refresh = useCallback(async () => {
    abort.current?.abort();
    const controller = new AbortController(); abort.current = controller;
    const current = ++sequence.current;
    setLoading(true); setError("");
    try {
      const response = await getMails({ kind, status, agentKey: agentKey.trim(), limit: pageSize, offset: page * pageSize }, controller.signal);
      if (sequence.current === current) setRows(response.data?.mails || []);
    } catch (err) {
      if (!controller.signal.aborted && sequence.current === current) setError(err instanceof Error ? err.message : String(err));
    } finally { if (sequence.current === current) setLoading(false); }
  }, [kind, status, agentKey, page]);
  useEffect(() => {
    if (!open) return;
    void refresh();
    const update = () => { void refresh(); };
    window.addEventListener("agent:mail-updated", update);
    return () => { ++sequence.current; abort.current?.abort(); window.removeEventListener("agent:mail-updated", update); };
  }, [open, refresh]);
  const confirm = async () => {
    if (!confirmation || pending) return;
    setPending(true); setError("");
    try {
      await actOnMail({ mailId: confirmation.mail.mailId, action: confirmation.action });
      setConfirmation(undefined); await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setPending(false); }
  };
  return <Drawer title={t("mailbox.title")} open={open} onClose={onClose} width={660}>
    <div className={styles.filters}>
      <Input aria-label={t("mailbox.agent")} placeholder={t("mailbox.agent")} value={agentKey} onChange={e => { setAgentKey(e.target.value); setPage(0); }} allowClear />
      <Select aria-label={t("mailbox.kind")} placeholder={t("mailbox.kind")} value={kind} onChange={value => { setKind(value); setPage(0); }} allowClear options={kinds.map(value => ({ value, label: t(`mailbox.kind.${value}`) }))} />
      <Select aria-label={t("mailbox.status")} placeholder={t("mailbox.status")} value={status} onChange={value => { setStatus(value); setPage(0); }} allowClear options={statuses.map(value => ({ value, label: t(`mailbox.status.${value}`) }))} />
      <Button onClick={() => void refresh()} disabled={loading}>{t("mailbox.refresh")}</Button>
    </div>
    {error && <Alert type="error" message={error} showIcon />}
    <Spin spinning={loading}>
      {!rows.length && !loading ? <Empty description={t("mailbox.empty")} /> : <div className={styles.list}>
        {rows.map(mail => <article key={mail.mailId} className={styles.mail} data-mail-kind={mail.kind}>
          <div className={styles.heading}><Space wrap><Tag>{t(`mailbox.kind.${mail.kind}`)}</Tag><Tag color={mail.status === "suspended" ? "orange" : undefined}>{t(`mailbox.status.${mail.status}`)}</Tag>{mail.outcome && <span>{t(`mailbox.outcome.${mail.outcome}`)}</span>}</Space><time>{new Date(mail.createdAt).toLocaleString(locale)}</time></div>
          <div className={styles.address}><a href={`/?${new URLSearchParams({ chatId: mail.fromChatId })}`}>{mail.fromAgentKey}</a><span>→</span><a href={`/?${new URLSearchParams({ chatId: mail.toChatId })}`}>{mail.toAgentKey}</a></div>
          <code className={styles.identity}>{mail.mailId}</code>
          {mail.purgedAt ? <p>{t("mailbox.purged")}</p> : <pre className={styles.message}>{mailBody(mail)}</pre>}
          {mail.files?.map(file => <div key={file.path} className={styles.attachment}>{t("mailbox.attachment", { name: file.name, path: file.path })}</div>)}
          {mail.error?.message && <Alert type="error" message={mail.error.message} />}
          {mail.status === "suspended" && <Alert type="warning" showIcon message={t(mailEvidenceKey(mail))} description={t("mailbox.access", { level: mail.accessLevel || "default" })} />}
          {canActOnMail(mail) && <Space><Button onClick={() => setConfirmation({ mail, action: "redeliver" })}>{t("mailbox.redeliver")}</Button><Button danger onClick={() => setConfirmation({ mail, action: "discard" })}>{t("mailbox.discard")}</Button></Space>}
        </article>)}
      </div>}
    </Spin>
    <Space className={styles.pagination}><Button disabled={loading || page === 0} onClick={() => setPage(value => value - 1)}>{t("mailbox.previous")}</Button><Button disabled={loading || rows.length < pageSize} onClick={() => setPage(value => value + 1)}>{t("mailbox.next")}</Button></Space>
    <Modal open={Boolean(confirmation)} title={t(confirmation?.action === "discard" ? "mailbox.discard" : "mailbox.redeliver")} onCancel={() => !pending && setConfirmation(undefined)} onOk={() => void confirm()} confirmLoading={pending} okText={t("mailbox.confirm")} cancelText={t("mailbox.cancel")}>
      {confirmation && <><p>{t(confirmation.action === "discard" ? "mailbox.discardWarning" : mailEvidenceKey(confirmation.mail))}</p><p>{t("mailbox.access", { level: confirmation.mail.accessLevel || "default" })}</p></>}
      {error && <Alert type="error" message={error} />}
    </Modal>
  </Drawer>;
}
