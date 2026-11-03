import React, { useEffect, useRef, useState } from "react";
import { Button, Input, Modal, Select, Spin, Typography } from "antd";
import { ApiError, createRequestId } from "@/shared/data/api/http";
import { executeAgent } from "@/shared/data/api/requests/execute";
import { uploadFile, extractUploadChatId, extractUploadReferences } from "@/shared/data/api/requests/uploads";
import type { ExecuteFile, ExecuteRequest, ExecuteResult } from "@/shared/data/api/dto/execute";
import { useI18n } from "@/shared/i18n";
import { buildExecuteRequest, parseExecuteReferences, ExecuteValidationError } from "../lib/executeForm";
import { getExecuteExamples } from "../lib/executeExamples";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import styles from "./ExecuteAgentModal.module.css";

export function ExecuteAgentModal({ agentKey, agentName, defaultAccessLevel = "ask_for_approval", onClose }: { agentKey: string; agentName?: string; defaultAccessLevel?: Exclude<ExecuteRequest["accessLevel"], "default">; onClose: () => void }) {
  const { t, locale } = useI18n();
  const examples = getExecuteExamples(t);
  const [exampleId, setExampleId] = useState<string>();
  const [message, setMessage] = useState("");
  const [input, setInput] = useState("{}");
  const [schema, setSchema] = useState(JSON.stringify({ type: "object" }, null, 2));
  const [accessLevel, setAccessLevel] = useState<ExecuteRequest["accessLevel"]>("default");
  const [files, setFiles] = useState<ExecuteFile[]>([]);
  const [requestChatId, setRequestChatId] = useState("");
  const [references, setReferences] = useState("");
  const [uploading, setUploading] = useState(false);
  const uploadInput = useRef<HTMLInputElement | null>(null);
  const [running, setRunning] = useState(false);
  const busy = running || uploading;
  const [result, setResult] = useState<ExecuteResult | null>(null);
  const [error, setError] = useState("");
  const [chatId, setChatId] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => { controller.current?.abort(); controller.current = null; }, []);

  const run = async () => {
    if (controller.current) return;
    setError(""); setResult(null); setChatId(requestChatId.trim());
    let request: ExecuteRequest;
    try {
      request = buildExecuteRequest({ agentKey, message, input, schema, accessLevel, files, chatId: requestChatId, references });
    } catch (e) {
      setError(e instanceof ExecuteValidationError ? t(`execute.validation.${e.field}`) : String(e));
      return;
    }
    const active = new AbortController();
    controller.current = active;
    setRunning(true);
    try {
      const response = await executeAgent({ ...request, requestId: createRequestId("execute") }, files, active.signal);
      if (controller.current !== active) return;
      setResult(response.data); setChatId(response.data.chatId);
    } catch (e) {
      if (controller.current !== active) return;
      if (active.signal.aborted) { setError(t("execute.cancelled")); }
      else {
        setError(e instanceof Error ? e.message : String(e));
        if (e instanceof ApiError && e.data && typeof e.data === "object" && "chatId" in e.data && typeof e.data.chatId === "string") setChatId(e.data.chatId);
      }
    } finally {
      if (controller.current === active) { controller.current = null; setRunning(false); }
    }
  };
  const uploadReferences = async (selected: File[]) => {
    if (!selected.length || controller.current || files.length) return;
    let appended: unknown[];
    try { appended = parseExecuteReferences(references); }
    catch { setError(t("execute.validation.references")); return; }
    const active = new AbortController();
    controller.current = active;
    setUploading(true); setError("");
    let currentChatId = requestChatId.trim();
    try {
      for (const file of selected) {
        const response = await uploadFile({ file, chatId: currentChatId || undefined, signal: active.signal });
        if (controller.current !== active || active.signal.aborted) return;
        currentChatId = extractUploadChatId(response.data);
        if (!currentChatId) throw new Error(t("execute.uploadFailed"));
        appended = [...appended, ...extractUploadReferences(response.data)];
        setRequestChatId(currentChatId);
        setReferences(JSON.stringify(appended, null, 2));
      }
    } catch (e) {
      if (controller.current === active && !active.signal.aborted) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (controller.current === active) { controller.current = null; setUploading(false); }
    }
  };
  const close = () => { controller.current?.abort(); onClose(); };

  const statusKey = uploading ? "execute.uploading" : running ? "execute.running" : error ? "execute.error" : result
    ? result.status === "success" ? "execute.success" : "execute.failure"
    : "execute.idle";

  return <Modal
    open
    title={<div className={styles.title}>{t("execute.title")}<span>{agentName || agentKey}</span></div>}
    width={1180}
    className={styles.modal}
    onCancel={close}
    closable={!busy}
    keyboard={!busy}
    maskClosable={false}
    footer={
      <div className={styles.footer}>
        <Button size="small" onClick={close}>{t(running ? "execute.stopClose" : "execute.close")}</Button>
      </div>
    }
  >
    <div className={styles.workspace}>
      <section className={styles.editor} aria-label={t("execute.requestPanel")}>
        <div className={styles.panelHeader}>
          <h3>{t("execute.requestPanel")}</h3>
          <Select
            className={styles.exampleSelect}
            size="small"
            aria-label={t("execute.examples.select")}
            placeholder={t("execute.examples.select")}
            value={exampleId}
            disabled={busy}
            virtual={false}
            onChange={id => {
              const example = examples.find(item => item.id === id);
              if (!example) return;
              setExampleId(id);
              const { message, input, outputSchema } = example.request;
              setMessage(message);
              setInput(JSON.stringify(input, null, 2));
              setSchema(JSON.stringify(outputSchema, null, 2));
              setFiles([]); setRequestChatId(""); setReferences("");
              setResult(null); setError(""); setChatId("");
            }}
            options={examples.map(example => ({ value: example.id, label: example.label, title: example.description }))}
            optionRender={option => <div className={styles.exampleOption}>
              <span>{option.label}</span>
              <small>{option.data.title}</small>
            </div>}
          />
        </div>
        <div className={styles.fields}>
          <label className={styles.field}>
            <span>{t("execute.message")}</span>
            <Input.TextArea size="small" placeholder={t("execute.messagePlaceholder")} value={message} onChange={e => setMessage(e.target.value)} rows={2} disabled={busy} />
          </label>
          <label className={styles.field}>
            <span>{t("execute.input")}<small>{t("execute.format.json")}</small></span>
            <Input.TextArea size="small" className={styles.json} value={input} onChange={e => setInput(e.target.value)} rows={5} disabled={busy} spellCheck={false} />
          </label>
          <label className={styles.field}>
            <span>{t("execute.schema")}<small>{t("execute.format.schema")}</small></span>
            <Input.TextArea size="small" className={styles.json} value={schema} onChange={e => setSchema(e.target.value)} rows={7} disabled={busy} spellCheck={false} />
          </label>
          <details className={styles.settings}>
            <summary>{t("execute.settings")}</summary>
            <div className={styles.settingsBody}>
              <label className={styles.field}><span>{t("execute.files")}</span>
                <input type="file" multiple disabled={busy || !!requestChatId.trim() || !!references.trim()} onChange={e => {
                  setFiles(Array.from(e.target.files || []).map((file, i) => ({ field: `file_${i + 1}`, file })));
                  e.target.value = "";
                }} />
              </label>
              <p className={styles.note}>{t("execute.fileHint")}</p>
              {!!files.length && <div className={styles.files}>
                {files.map(({ field, file }) => <Typography.Text key={field} code>{field}: {file.name}</Typography.Text>)}
                <Button size="small" disabled={busy} onClick={() => setFiles([])}>{t("execute.clearFiles")}</Button>
              </div>}
              <label className={styles.field}><span>{t("execute.chatId")}</span>
                <Input size="small" value={requestChatId} onChange={e => setRequestChatId(e.target.value)} disabled={busy || !!files.length} />
              </label>
              <label className={styles.field}><span>{t("execute.references")}<small>{t("execute.format.json")}</small></span>
                <Input.TextArea size="small" className={styles.json} value={references} onChange={e => setReferences(e.target.value)} rows={5} disabled={busy || !!files.length} spellCheck={false} />
              </label>
              <div className={styles.files}>
                <input ref={uploadInput} type="file" multiple hidden aria-label={t("execute.uploadReferences")} disabled={busy || !!files.length} onChange={e => {
                  const selected = Array.from(e.target.files || []);
                  e.target.value = "";
                  void uploadReferences(selected);
                }} />
                <Button size="small" disabled={busy || !!files.length} onClick={() => uploadInput.current?.click()}>{t("execute.uploadReferences")}</Button>
                <Button size="small" disabled={busy} onClick={() => { setRequestChatId(""); setReferences(""); }}>{t("execute.clearReferences")}</Button>
              </div>
              <label className={styles.field}><span>{t("execute.access")}</span>
                <Select size="small" value={accessLevel === "default" ? defaultAccessLevel : accessLevel} disabled={busy} onChange={setAccessLevel} options={[
                  { value: "ask_for_approval", label: t("execute.access.ask_for_approval") },
                  { value: "auto_approve", label: t("execute.access.auto") },
                  { value: "full_access", label: t("execute.access.full") },
                ]} />
              </label>
            </div>
          </details>
        </div>
      </section>
      <div className={styles.executionRail} role="group" aria-label={t("execute.executionActions")}>
        {running
          ? <Button className={styles.runAction} danger onClick={() => controller.current?.abort()}>
              <MaterialIcon name="close" /><span className={styles.runLabel} lang={locale}>{t("execute.cancel")}</span>
            </Button>
          : <Button className={styles.runAction} type="primary" disabled={uploading} onClick={() => void run()}>
              <MaterialIcon name="play_circle" /><span className={styles.runLabel} lang={locale}>{t("execute.run")}</span>
            </Button>}
      </div>
      <section className={styles.output} aria-label={t("execute.resultPanel")}>
        <div className={styles.panelHeader}>
          <h3>{t("execute.resultPanel")}</h3>
          <span role="status" className={`${styles.status} ${error || result?.status === "failure" ? styles.failed : result ? styles.succeeded : ""}`}>
            {running && <Spin size="small" />}{t(statusKey)}
          </span>
        </div>
        <div className={styles.resultBody}>
          {!running && !result && !error && <div className={styles.empty}>
            <MaterialIcon name="subject" className={styles.emptyIcon} />
            <span>{t("execute.empty")}</span>
          </div>}
          {running && <div className={styles.empty}><Spin /></div>}
          {!!error && <div role="alert" className={styles.error}>{error}</div>}
          {result?.status === "failure" && <div className={styles.error}>{result.reason}</div>}
          {result?.status === "success" && <pre className={`${styles.result} ${styles.json}`}>{JSON.stringify(result.output, null, 2)}</pre>}
          {result && <details className={styles.raw}>
            <summary>{t("execute.raw")}</summary>
            <pre className={`${styles.result} ${styles.json}`}>{JSON.stringify(result, null, 2)}</pre>
          </details>}
        </div>
        {chatId && <div className={styles.resultFooter}>
          <Typography.Link href={`/agent/${encodeURIComponent(agentKey)}?chatId=${encodeURIComponent(chatId)}`} target="_blank" rel="noopener noreferrer">{t("execute.chat")}</Typography.Link>
        </div>}
      </section>
    </div>
  </Modal>;
}
