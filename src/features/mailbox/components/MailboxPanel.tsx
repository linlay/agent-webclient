import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Drawer, Empty, Input, Modal, Select, Space, Spin, Tag, Tabs, Tooltip } from "antd";
import type { MailKind, MailRecord, MailStatus } from "@/shared/data/api/dto/mailbox";
import { getMailDetail, actOnMail } from "@/shared/data/api/requests/mailbox";
import { useI18n } from "@/shared/i18n";
import { canActOnMail, mailBody, mailEvidenceKey } from "../lib/mailPresentation";
import { loadMailboxPage, type MailboxFolder } from "../lib/loadMailboxPage";
import styles from "./MailboxPanel.module.css";

const kinds: MailKind[] = ["letter", "reply", "notify", "ask"];
const statuses: MailStatus[] = ["suspended", "queued", "inflight", "delivered", "done", "failed", "discarded", "withdrawn", "accepting"];
const pageSize = 50;
export function MailboxPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, locale } = useI18n();
  const [box, setBox] = useState<MailboxFolder>("inbox");
  const [rows, setRows] = useState<MailRecord[]>([]);
  const [detail, setDetail] = useState<MailRecord>();
  const [total, setTotal] = useState(0);
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
      const response = await loadMailboxPage(box, { kind, status, agentKey: agentKey.trim() }, page * pageSize, pageSize, controller.signal);
      if (sequence.current === current) {setRows(response.mails);setTotal(response.total); }
    } catch (err) {
      if (!controller.signal.aborted && sequence.current === current) setError(err instanceof Error ? err.message : String(err));
    } finally { if (sequence.current === current) setLoading(false); }
  }, [box, kind, status, agentKey, page]);
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
  const openDetail = (mail: MailRecord) => {
    setDetail(mail);
    void getMailDetail(mail.mailId).then(response => setDetail(current => current?.mailId === mail.mailId ? response.data : current)).catch(err => setError(String(err)));
  };
  return <Drawer title={<Tabs className={styles.tabs} activeKey={box} onChange={value => { setBox(value as MailboxFolder); setStatus(undefined); setPage(0); }} items={["inbox", "trash"].map(key => ({ key, label: t(`mailbox.box.${key}`) }))} />} open={open} onClose={onClose} width={660}>
    <div className={styles.toolbar}>
    <details className={styles.filterDisclosure}><summary>{t("mailbox.filters")}</summary><div className={styles.filters}>
      <Input aria-label={t("mailbox.agent")} placeholder={t("mailbox.agent")} value={agentKey} onChange={e => { setAgentKey(e.target.value); setPage(0); }} allowClear />
      <Select aria-label={t("mailbox.kind")} placeholder={t("mailbox.kind")} value={kind} onChange={value => { setKind(value); setPage(0); }} allowClear options={kinds.map(value => ({ value, label: t(`mailbox.kind.${value}`) }))} />
      <Select aria-label={t("mailbox.status")} placeholder={t("mailbox.status")} value={status} onChange={value => { setStatus(value); setPage(0); }} allowClear options={statuses.map(value => ({ value, label: t(`mailbox.status.${value}`) }))} />
    </div></details>
      <Button size="small" onClick={() => void refresh()} disabled={loading}>{t("mailbox.refresh")}</Button>
    </div>
    {error && <Alert type="error" message={error} showIcon />}
    <Spin spinning={loading}>
      {!rows.length && !loading ? <Empty description={t("mailbox.empty")} /> : <div className={styles.list}>
        {rows.map(mail => <article key={mail.mailId} className={styles.mail} data-mail-kind={mail.kind}>
          <div className={styles.heading}>
            <Tooltip title={mail.mailId}><button className={styles.kind} onClick={() => openDetail(mail)} aria-label={t("mailbox.details")}>{t(`mailbox.kind.${mail.kind}`)}</button></Tooltip>
            <time dateTime={new Date(mail.createdAt).toISOString()}>{new Date(mail.createdAt).toLocaleString(locale)}</time>
            <Tag className={styles.status} color={mail.status === "suspended" ? "orange" : mail.status === "failed" ? "error" : undefined}>{t(`mailbox.status.${mail.status}`)}</Tag>
          </div>
          <div className={styles.address}>{mail.originType === "user" ? <span>{t("mailbox.user")}</span> : <a href={`/?${new URLSearchParams({ chatId: mail.fromChatId })}`}>{mail.fromAgentName || mail.fromAgentKey}</a>}<span>→</span><a href={`/?${new URLSearchParams({ chatId: mail.toChatId })}`}>{mail.toAgentKey}</a></div>
          <button className={styles.preview} onClick={() => openDetail(mail)} aria-label={t("mailbox.details")}>{mail.purgedAt ? t("mailbox.purged") : mailBody(mail)}</button>
          {box === "inbox" && canActOnMail(mail) && <Space><Button size="small" onClick={() => setConfirmation({ mail, action: "redeliver" })}>{t("mailbox.redeliver")}</Button><Button size="small" danger onClick={() => setConfirmation({ mail, action: "discard" })}>{t("mailbox.discard")}</Button></Space>}
        </article>)}
      </div>}
    </Spin>
    {(total > pageSize || page > 0) && <Space className={styles.pagination}><Button disabled={loading || page === 0} onClick={() => setPage(value => value - 1)}>{t("mailbox.previous")}</Button><Button disabled={loading || (page+1)*pageSize >= total} onClick={() => setPage(value => value + 1)}>{t("mailbox.next")}</Button></Space>}
    <Drawer open={Boolean(detail)} onClose={()=>setDetail(undefined)} title={<Tooltip title={detail?.mailId}><span>{t("mailbox.details")}</span></Tooltip>}>
      {detail && <Space direction="vertical" className={styles.detail}>
        <span>{detail.originType === "user" ? t("mailbox.user") : detail.fromAgentName || detail.fromAgentKey} → {detail.toAgentKey}</span>
        <span>{new Date(detail.createdAt).toLocaleString(locale)} · {t(`mailbox.status.${detail.status}`)}{detail.outcome ? ` · ${t(`mailbox.outcome.${detail.outcome}`)}` : ""}</span>
        <pre className={styles.message}>{detail.purgedAt ? t("mailbox.purged") : mailBody(detail)}</pre>
        {detail.files?.map(file=><p className={styles.attachment} key={file.path}>{t("mailbox.attachment",{name:file.name,path:file.path})}</p>)}
        {detail.error?.message && <Alert type="error" message={detail.error.message} />}
        {detail.status === "suspended" && <Alert type="warning" showIcon message={t(mailEvidenceKey(detail))} description={t("mailbox.access", { level: detail.accessLevel || "default" })} />}
      </Space>}
    </Drawer>
    <Modal open={Boolean(confirmation)} title={t(confirmation?.action === "discard" ? "mailbox.discard" : "mailbox.redeliver")} onCancel={() => !pending && setConfirmation(undefined)} onOk={() => void confirm()} confirmLoading={pending} okText={t("mailbox.confirm")} cancelText={t("mailbox.cancel")}>
      {confirmation && <><p>{t(confirmation.action === "discard" ? "mailbox.discardWarning" : mailEvidenceKey(confirmation.mail))}</p><p>{t("mailbox.access", { level: confirmation.mail.accessLevel || "default" })}</p></>}
      {error && <Alert type="error" message={error} />}
    </Modal>
  </Drawer>;
}
