import React, { useRef, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Radio,
  Select,
} from "antd";
import type { AwaitingSubmitInput } from "@/features/transport/contracts/realtimeTransport";
import { useRunTransport } from "@/features/transport/hooks/useRealtimeTransport";
import type { MailMetadata, MailRecord } from "@/shared/data/api/dto/mailbox";
import { useMailDetail } from "@/features/mailbox/hooks/useMailDetail";
import { AwaitingHtmlContainer } from "@/features/tools/components/AwaitingHtmlContainer";
import type { FormActiveAwaiting } from "@/features/tools/lib/toolsState";
import { toWireAwaitingSubmit } from "@/features/tools/lib/protocol";
import { useI18n } from "@/shared/i18n";
import {
  buildMailFormAwaiting,
  parseMailAskSnapshot,
} from "../lib/mailAskSnapshot";
import { useTimelineInteraction } from "./TimelineInteractionContext";
import { MailBadge } from "./MailBadge";
import styles from "./MailAskCard.module.css";

type Answers = Record<string, unknown>;
type AnswerPayload = {
  params?: Record<string, unknown>[];
  param?: { decision: string; data?: Record<string, unknown> };
};

function MailFormView({
  awaiting,
  submit,
}: {
  awaiting: FormActiveAwaiting;
  submit: (payload: AnswerPayload) => Promise<string | undefined>;
}) {
  const [data, setData] = useState(awaiting);
  return (
    <AwaitingHtmlContainer
      data={data}
      keyboardShortcuts={false}
      onPatch={(patch) => setData((current) => ({ ...current, ...patch }))}
      onSubmit={(payload) => {
        const wire = toWireAwaitingSubmit("form", payload.params);
        return submit("param" in wire ? wire : { params: [] });
      }}
    />
  );
}

export interface MailAskCardProps {
  mailId: string;
  /** Timeline metadata; lets the header name the sender before the body loads. */
  metadata?: MailMetadata;
}

export function MailAskCard({ mailId, metadata }: MailAskCardProps) {
  const { t } = useI18n();
  const { mail, error, refresh } = useMailDetail(mailId);
  if (mail)
    return (
      <MailAskContent
        key={mail.mailId}
        mail={mail}
        loadError={error}
        refresh={refresh}
      />
    );
  if (error) {
    // Keep the sender line when the timeline already named the ask, so a failed
    // detail fetch still says who is waiting on this answer.
    if (!metadata)
      return <Alert type="info" message={t("mailbox.unavailable")} />;
    return (
      <section className={styles.card} aria-label={t("mailbox.kind.ask")}>
        <MailAskHeader mail={metadata} error={t("mailbox.unavailable")} />
      </section>
    );
  }
  if (!metadata) return null;
  return (
    <section className={styles.card} aria-label={t("mailbox.kind.ask")}>
      <MailAskHeader mail={metadata} />
    </section>
  );
}

function mailMetadataFromRecord(mail: MailRecord): MailMetadata {
  return {
    id: mail.mailId,
    kind: mail.kind,
    outcome: mail.outcome,
    fromAgentKey: mail.fromAgentKey,
    fromAgentName: mail.fromAgentName,
    fromChatId: mail.fromChatId,
  };
}

/**
 * The one identity line of an ask: kind · sender (links to the asking Chat) ·
 * outcome, then the mail status once the body is known. The sender link is the
 * only Chat entry point, so callers do not need a second "open worker" link.
 */
function MailAskHeader({
  mail,
  status,
  error,
}: {
  mail: MailMetadata;
  status?: string;
  error?: string;
}) {
  const interaction = useTimelineInteraction();
  const agents = interaction?.agents;
  const chat = mail.fromChatId
    ? { chatId: mail.fromChatId, agentKey: mail.fromAgentKey }
    : undefined;
  const href = chat ? interaction?.getChatHref?.(chat) : undefined;
  return (
    <header className={styles.header}>
      <MailBadge
        mail={mail}
        agents={agents}
        href={href}
        onOpen={
          href && chat && interaction?.openChat
            ? (event) => {
                if (
                  event.button !== 0 ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                )
                  return;
                event.preventDefault();
                interaction.openChat?.(chat);
              }
            : undefined
        }
      />
      {status && <span className={styles.status}>{status}</span>}
      {/* A failed load or submit stays on the identity line instead of adding a block. */}
      {error && (
        <span className={styles.error} role="alert" title={error}>
          {error}
        </span>
      )}
    </header>
  );
}

function MailAskContent({
  mail,
  loadError,
  refresh,
}: {
  mail: MailRecord;
  loadError: string;
  refresh: () => Promise<void>;
}) {
  const { t } = useI18n();
  const runs = useRunTransport();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const submitting = useRef(false);
  const snapshot = parseMailAskSnapshot(mail.message);
  const active =
    !submitted &&
    ["accepting", "queued", "inflight", "delivered"].includes(mail.status);
  const nativeForm = snapshot && buildMailFormAwaiting(mail, snapshot);
  const singleApproval =
    mail.awaitingMode === "approval" && snapshot?.approvals.length === 1
      ? snapshot.approvals[0]
      : undefined;
  const singleField =
    mail.awaitingMode === "form" &&
    !nativeForm &&
    mail.awaitingSource === "tool_approval" &&
    snapshot?.fields.length === 1 &&
    snapshot.fields[0].options?.length &&
    !snapshot.fields[0].multiple
      ? snapshot.fields[0]
      : undefined;
  const canSubmit = Boolean(
    mail.awaitingId && mail.fromRunId && mail.fromAgentKey,
  );
  const disabled = busy || !canSubmit;
  const formFeedback = {
    onFinishFailed: () => setError(t("mailbox.ask.required")),
    onValuesChange: () => setError(""),
  };
  const required = { required: true, message: t("mailbox.ask.required") };
  const decisionLabel = (decision: string, label?: string) =>
    label ||
    (decision === "approve"
      ? t("approvalDialog.option.approve")
      : decision === "approve_rule_run"
        ? t("approvalDialog.option.approveRuleRun")
        : decision === "reject"
          ? t("approvalDialog.option.reject")
          : decision);
  const submit = async (
    payload: AnswerPayload,
  ): Promise<string | undefined> => {
    if (!active || !canSubmit || submitting.current)
      return t("mailbox.unavailable");
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      // Run control goes through the shared transport; Desktop rejects it over plain HTTP.
      await runs.submitAwaiting({
        ...(payload as Pick<AwaitingSubmitInput, "params" | "param">),
        runId: mail.fromRunId,
        owner: { kind: "agent", agentKey: mail.fromAgentKey },
        awaitingId: mail.awaitingId!,
      });
      setSubmitted(true);
      // A failed refresh must not make an accepted answer actionable again.
      await refresh().catch(() => undefined);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      return message;
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  const status =
    submitted &&
    ["accepting", "queued", "inflight", "delivered"].includes(mail.status)
      ? t("mailbox.ask.submitted")
      : t(`mailbox.status.${mail.status}`);

  return (
    <section
      className={styles.card}
      data-resolved={!active || undefined}
      aria-label={t("mailbox.kind.ask")}
    >
      <MailAskHeader
        mail={mailMetadataFromRecord(mail)}
        status={status}
        error={error || loadError || undefined}
      />
      {active && (!snapshot || !canSubmit) && (
        <Alert
          className={styles.notice}
          type="info"
          message={t("mailbox.unavailable")}
        />
      )}
      {active && snapshot && canSubmit && (
        <div className={styles.content}>
          {singleApproval ? (
            <div className={styles.operation}>
              {singleApproval.toolName && (
                <strong>{singleApproval.toolName}</strong>
              )}
              <pre className={styles.command}>
                {singleApproval.command || singleApproval.description}
              </pre>
              <div className={styles.actions}>
                {[
                  ...(singleApproval.options?.length
                    ? singleApproval.options
                    : [{ decision: "approve" }]),
                  { decision: "reject" },
                ]
                  .filter(
                    (option, index, all) =>
                      all.findIndex(
                        (value) => value.decision === option.decision,
                      ) === index,
                  )
                  .map((option) => (
                    <Button
                      key={option.decision}
                      disabled={disabled}
                      danger={option.decision === "reject"}
                      onClick={() =>
                        void submit({
                          params: [
                            {
                              id: singleApproval.id,
                              decision: option.decision,
                            },
                          ],
                        })
                      }
                    >
                      {decisionLabel(option.decision, option.label)}
                    </Button>
                  ))}
              </div>
            </div>
          ) : singleField ? (
            <div className={styles.operation}>
              <pre className={styles.command}>
                {singleField.label || t("mailbox.ask.field", { number: 1 })}
              </pre>
              <div className={styles.actions}>
                {singleField.options!.map((value) => (
                  <Button
                    key={value}
                    disabled={disabled}
                    danger={value === "reject"}
                    onClick={() =>
                      void submit({
                        param: {
                          decision: "approve",
                          data: { [singleField.name]: value },
                        },
                      })
                    }
                  >
                    {decisionLabel(value)}
                  </Button>
                ))}
              </div>
            </div>
          ) : mail.awaitingMode === "form" && nativeForm ? (
            <MailFormView
              key={nativeForm.key}
              awaiting={nativeForm}
              submit={submit}
            />
          ) : (
            <>
              {mail.awaitingMode === "question" && (
                <Form<Answers>
                  {...formFeedback}
                  layout="vertical"
                  disabled={disabled}
                  onFinish={(values) =>
                    void submit({
                      params: snapshot.questions.map((q) => ({
                        id: q.id,
                        ...(Array.isArray(values[q.id])
                          ? { answers: values[q.id] }
                          : { answer: values[q.id] }),
                      })),
                    })
                  }
                >
                  {snapshot.questions.map((q) => (
                    <Form.Item
                      key={q.id}
                      name={q.id}
                      label={q.question}
                      rules={[required]}
                    >
                      {q.options?.length ? (
                        <Select
                          mode={
                            q.type === "multi-select" ? "multiple" : undefined
                          }
                          options={q.options.map((o) => ({
                            label: o.label,
                            value: o.value ?? o.label,
                          }))}
                        />
                      ) : q.type === "number" ? (
                        <InputNumber />
                      ) : (
                        <Input />
                      )}
                    </Form.Item>
                  ))}
                  <Button
                    htmlType="submit"
                    loading={busy}
                    disabled={disabled || !snapshot.questions.length}
                  >
                    {t("mailbox.confirm")}
                  </Button>
                </Form>
              )}
              {mail.awaitingMode === "approval" && (
                <Form<Answers>
                  {...formFeedback}
                  layout="vertical"
                  disabled={disabled}
                  onFinish={(values) =>
                    void submit({
                      params: snapshot.approvals.map((a) => ({
                        id: a.id,
                        decision: values[a.id],
                      })),
                    })
                  }
                >
                  {snapshot.approvals.map((a) => {
                    const options = [
                      ...(a.options?.length
                        ? a.options
                        : [{ decision: "approve" }]),
                      { decision: "reject" },
                    ].filter(
                      (option, index, all) =>
                        all.findIndex(
                          (value) => value.decision === option.decision,
                        ) === index,
                    );
                    return (
                      <div className={styles.operation} key={a.id}>
                        {a.toolName && <strong>{a.toolName}</strong>}
                        {(a.command || a.description) && (
                          <pre className={styles.command}>
                            {a.command || a.description}
                          </pre>
                        )}
                        <Form.Item name={a.id} rules={[required]}>
                          <Radio.Group
                            aria-label={t("mailbox.ask.decision")}
                            className={styles.choices}
                            options={options.map((option) => ({
                              value: option.decision,
                              label: decisionLabel(
                                option.decision,
                                option.label,
                              ),
                            }))}
                          />
                        </Form.Item>
                      </div>
                    );
                  })}
                  <Button
                    htmlType="submit"
                    loading={busy}
                    disabled={disabled || !snapshot.approvals.length}
                  >
                    {t("mailbox.confirm")}
                  </Button>
                </Form>
              )}
              {mail.awaitingMode === "form" && (
                <Form<Answers>
                  {...formFeedback}
                  layout="vertical"
                  disabled={disabled}
                  onFinish={(values) =>
                    void submit({
                      param: { decision: "approve", data: values },
                    })
                  }
                >
                  {snapshot.fields.map((field, index) => (
                    <div key={field.name} className={styles.operation}>
                      {mail.awaitingSource === "tool_approval" ? (
                        <pre className={styles.command}>
                          {field.label ||
                            t("mailbox.ask.field", { number: index + 1 })}
                        </pre>
                      ) : (
                        <div className={styles.fieldLabel}>
                          {field.label ||
                            t("mailbox.ask.field", { number: index + 1 })}
                        </div>
                      )}
                      <Form.Item
                        name={field.name}
                        valuePropName={
                          field.type === "boolean" ? "checked" : "value"
                        }
                        rules={field.required ? [required] : []}
                      >
                        {field.options?.length ? (
                          mail.awaitingSource === "tool_approval" &&
                          !field.multiple ? (
                            <Radio.Group
                              aria-label={t("mailbox.ask.decision")}
                              className={styles.choices}
                              options={field.options.map((value) => ({
                                value,
                                label: decisionLabel(value),
                              }))}
                            />
                          ) : (
                            <Select
                              mode={field.multiple ? "multiple" : undefined}
                              options={field.options.map((value) => ({
                                value,
                                label: value,
                              }))}
                            />
                          )
                        ) : field.type === "boolean" ? (
                          <Checkbox />
                        ) : field.type === "number" ? (
                          <InputNumber />
                        ) : field.type === "password" ? (
                          <Input.Password />
                        ) : (
                          <Input />
                        )}
                      </Form.Item>
                    </div>
                  ))}
                  <div className={styles.actions}>
                    <Button
                      htmlType="submit"
                      loading={busy}
                      disabled={disabled}
                    >
                      {t("mailbox.confirm")}
                    </Button>
                    <Button
                      disabled={disabled}
                      onClick={() =>
                        void submit({ param: { decision: "reject" } })
                      }
                    >
                      {t("mailbox.reject")}
                    </Button>
                  </div>
                </Form>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
