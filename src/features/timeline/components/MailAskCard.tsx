import React, { useState } from "react";
import { Alert, Button, Checkbox, Form, Input, InputNumber, Select } from "antd";
import { submitMailAsk, type MailAskSubmission } from "@/shared/data/api/requests/mailbox";
import { useMailDetail } from "@/features/mailbox/hooks/useMailDetail";
import { useI18n } from "@/shared/i18n";
import { parseMailAskSnapshot } from "../lib/mailAskSnapshot";

type Answers = Record<string, unknown>;
type AnswerPayload = Pick<MailAskSubmission, "params" | "param">;

export function MailAskCard({ mailId }: {mailId: string}) {
  const { t } = useI18n();
  const {mail, error: loadError, refresh} = useMailDetail(mailId);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!mail) return loadError ? <Alert type="info" message={t("mailbox.unavailable")} /> : null;
  const snapshot = parseMailAskSnapshot(mail.message);
  if (!snapshot) return null;
  const active = ["accepting", "queued", "inflight", "delivered"].includes(mail.status);

  const submit = async (payload: AnswerPayload) => {
    if (!mail.awaitingId || busy) return;
    setBusy(true);
    setError("");
    try {
      await submitMailAsk({...payload, runId: mail.fromRunId, agentKey: mail.fromAgentKey, awaitingId: mail.awaitingId});
      await refresh();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };
  const submitQuestions = (values: Answers) => {
    const params = snapshot.questions.map(q => ({id: q.id,
      ...(Array.isArray(values[q.id]) ? {answers: values[q.id]} : {answer: values[q.id]})}));
    void submit({params});
  };
  const submitApprovals = (values: Answers) => {
    void submit({params: snapshot.approvals.map(a => ({id: a.id, decision: values[a.id]}))});
  };
  const submitForm = (values: Answers) => {void submit({param: {decision: "approve", data: values}});};

  return <section className={active ? "tw:rounded tw:border tw:border-accent tw:p-3" : "tw:rounded tw:border tw:p-3 tw:opacity-50"}
    aria-label={t("mailbox.kind.ask")}>
    <strong>{mail.fromAgentName || mail.fromAgentKey} · {t(`mailbox.status.${mail.status}`)}</strong>
    <p><a href={`/?${new URLSearchParams({chatId: mail.fromChatId})}`}>{t("mailbox.openWorker")}</a></p>
    {(error || loadError) && <Alert type="error" message={error || loadError} />}
    {!active && <div>
      {snapshot.questions.map(q => <p key={q.id}>{q.question}</p>)}
      {snapshot.approvals.map(a => <p key={a.id}>{a.toolName}: {a.command || a.description}</p>)}
      {snapshot.fields.map(f => <p key={f.name}>{f.label || f.name}</p>)}
    </div>}
    {active && mail.awaitingMode === "question" && <Form<Answers> disabled={busy} onFinish={submitQuestions}>
      {snapshot.questions.map(q => <Form.Item key={q.id} name={q.id} label={q.question} rules={[{required: true}]}>
        {q.options?.length ? <Select mode={q.type === "multi-select" ? "multiple" : undefined}
          options={q.options.map(o => ({label: o.label, value: o.value || o.label}))} /> :
          q.type === "number" ? <InputNumber /> : <Input />}
      </Form.Item>)}
      <Button htmlType="submit" loading={busy}>{t("mailbox.confirm")}</Button>
    </Form>}
    {active && mail.awaitingMode === "approval" && <Form<Answers> disabled={busy} onFinish={submitApprovals}>
      {snapshot.approvals.map(a => {
        const options = [...(a.options?.length ? a.options : [{decision: "approve"}]), {decision: "reject"}]
          .filter((option, index, all) => all.findIndex(value => value.decision === option.decision) === index)
          .map(option => ({value: option.decision, label: "label" in option ? option.label : option.decision}));
        return <Form.Item key={a.id} name={a.id}
          label={<span>{a.toolName}<pre>{a.command || a.description}</pre></span>} rules={[{required: true}]}>
          <Select options={options} />
        </Form.Item>;
      })}
      <Button htmlType="submit" loading={busy}>{t("mailbox.confirm")}</Button>
    </Form>}
    {active && mail.awaitingMode === "form" && <Form<Answers> disabled={busy} onFinish={submitForm}>
      {snapshot.fields.map(field => <Form.Item key={field.name} name={field.name} label={field.label || field.name}
        valuePropName={field.type === "boolean" ? "checked" : "value"} rules={[{required: field.required}]}>
        {field.options?.length ? <Select mode={field.multiple ? "multiple" : undefined}
          options={field.options.map(value => ({value, label: value}))} /> :
          field.type === "boolean" ? <Checkbox /> : field.type === "number" ? <InputNumber /> :
          field.type === "password" ? <Input.Password /> : <Input />}
      </Form.Item>)}
      <Button htmlType="submit" loading={busy}>{t("mailbox.confirm")}</Button>
      <Button disabled={busy} onClick={() => {void submit({param: {decision: "reject"}});}}>{t("mailbox.reject")}</Button>
    </Form>}
  </section>;
}
