import { useEffect, useRef, useState } from "react";
import { Input, Modal } from "antd";
import { checkConnectorConnection, getConnectorConnection, prepareConnector, saveConnectorCredentials, type ConnectorSummary } from "@/shared/data";
import { useI18n } from "@/shared/i18n";
import { UiButton } from "@/shared/ui/UiButton";
import { confirmCredentialState, connectorTokenSchema, credentialStateCheckRequired, initialConnectorCredentials, requireCredentialStateCheck, validatedConnectorCredentials } from "../lib/connectorCredentials";
import { readConnectorAuthSession } from "../lib/connectorAuth";
import { ConnectorChatError, ensureConnectorPrepared, waitForConnectorPoll } from "../lib/connectorChat";
import styles from "./ConnectorsConsole.module.css";

export function ConnectorCredentialsDialog({ item, onClose, onSaved }: {
  item: ConnectorSummary;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const schema = connectorTokenSchema(item);
  const [values, setValues] = useState<Record<string, string>>(() => schema ? initialConnectorCredentials(schema) : {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [needsCheck, setNeedsCheck] = useState(() => !!credentialStateCheckRequired(item.id));
  const scope = useRef<{ id: string; controller?: AbortController; locked: boolean } | null>(null);
  useEffect(() => {
    const current = { id: item.id, locked: false, controller: undefined as AbortController | undefined };
    scope.current = current;
    setValues(schema ? initialConnectorCredentials(schema) : {});
    const reason = credentialStateCheckRequired(item.id);
    setError(reason === "unknown" ? "connectors.credentials.unknownResult" : "");
    setNotice(reason === "pending" ? "connectors.credentials.pending" : "");
    setBusy(false); setNeedsCheck(!!reason);
    return () => { current.controller?.abort(); if (scope.current === current) scope.current = null; };
  }, [item.id]);

  const close = () => {
    scope.current?.controller?.abort();
    scope.current = null;
    setValues({});
    onClose();
  };
  const perform = async (check: boolean) => {
    const current = scope.current;
    if (!current || current.id !== item.id || current.locked || !schema) return;
    const credentials = check ? null : validatedConnectorCredentials(schema, values);
    if (!check && (!credentials || needsCheck)) { setError("connectors.credentials.invalid"); return; }
    current.locked = true;
    const controller = new AbortController();
    current.controller = controller;
    const timeout = window.setTimeout(() => controller.abort(), check ? 20_000 : 90_000);
    let writeStarted = false;
    setBusy(true); setError(""); setNotice("");
    // Erase the form before awaiting the write. It is never copied to app state,
    // localStorage, URLs, package JSON, or debug request frames.
    if (!check) setValues({});
    try {
      if (check) {
        await checkConnectorConnection(item.id, controller.signal);
        const response = await getConnectorConnection(item.id, controller.signal);
        if (scope.current !== current || controller.signal.aborted) return;
        const auth = readConnectorAuthSession(response.data.authentication, item.id);
        setNotice(auth.pendingVerification || auth.status === "pending_verification" ? "connectors.credentials.pending" : "connectors.credentials.checked");
        if (auth.pendingVerification || auth.status === "pending_verification") requireCredentialStateCheck(item.id, "pending");
        else confirmCredentialState(item.id);
        setNeedsCheck(auth.pendingVerification === true || auth.status === "pending_verification");
        onSaved();
      } else {
        await ensureConnectorPrepared(item, {
          readConnection: async () => (await getConnectorConnection(item.id, controller.signal)).data,
          prepare: async () => (await prepareConnector(item.id, controller.signal)).data,
          wait: () => waitForConnectorPoll(controller.signal), now: Date.now, onPhase: () => setNotice("connectors.chat.phase.preparing"),
          assertCurrent: () => { if (scope.current !== current || controller.signal.aborted) throw new DOMException("Aborted", "AbortError"); },
        });
        if (scope.current !== current || controller.signal.aborted) return;
        writeStarted = true;
        requireCredentialStateCheck(item.id);
        const response = await saveConnectorCredentials(item.id, credentials!, controller.signal);
        if (scope.current !== current || controller.signal.aborted) return;
        const auth = readConnectorAuthSession(response.data, item.id);
        // A successful candidate can still be awaiting verification. Existing
        // active credentials remain a separate server fact.
        setValues({});
        onSaved();
        if (auth.pendingVerification || auth.status === "pending_verification") {
          requireCredentialStateCheck(item.id, "pending");
          setNotice("connectors.credentials.pending"); setNeedsCheck(true);
        } else { confirmCredentialState(item.id); close(); }
      }
    } catch (cause) {
      if (scope.current !== current) return;
      // Do not retain or render errors which may echo private credential values.
      setError(check ? "connectors.credentials.checkFailed" : writeStarted ? "connectors.credentials.unknownResult" : cause instanceof ConnectorChatError ? cause.message : "connectors.chat.preparationFailed");
      if (writeStarted) setNeedsCheck(true);
    } finally {
      window.clearTimeout(timeout);
      if (scope.current === current) { current.locked = false; current.controller = undefined; setBusy(false); }
    }
  };
  return <Modal open title={schema?.title || t("connectors.credentials.title", { name: item.name || item.id })}
    destroyOnHidden footer={null} onCancel={close}>
    <div className={styles.stack}>
      <p>{schema?.description || t("connectors.credentials.hint")}</p>
      {!schema && <p className={styles.error} role="alert">{t("connectors.credentials.schemaInvalid")}</p>}
      {schema?.fields.map(field => <label key={field.key} className={styles.credentialField}>
        <span>{field.label}{field.required ? " *" : ""}</span>
        {field.type === "password" ? <Input.Password aria-label={field.label} value={values[field.key] || ""}
          disabled={busy || needsCheck} autoComplete="new-password" visibilityToggle={false} placeholder={field.placeholder}
          onChange={event => setValues(previous => ({ ...previous, [field.key]: event.target.value }))} />
          : <Input aria-label={field.label} value={values[field.key] || ""} disabled={busy || needsCheck} autoComplete="off"
            placeholder={field.placeholder} onChange={event => setValues(previous => ({ ...previous, [field.key]: event.target.value }))} />}
        {field.description && <span className={styles.hint}>{field.description}</span>}
      </label>)}
      {schema?.docUrl && <a href={schema.docUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{schema.docLabel || t("connectors.credentials.documentation")}</a>}
      {error && <p className={styles.error} role="alert">{t(error)}</p>}
      {notice && <p className={styles.notice} role="status">{t(notice)}</p>}
      <div className={styles.actions}>
        <UiButton variant="primary" loading={busy} disabled={!schema || needsCheck || !validatedConnectorCredentials(schema, values)} onClick={() => void perform(false)}>{t("connectors.credentials.save")}</UiButton>
        {needsCheck && <UiButton disabled={busy} onClick={() => void perform(true)}>{t("connectors.auth.refresh")}</UiButton>}
        <UiButton variant="ghost" onClick={close}>{t("connectors.import.cancel")}</UiButton>
      </div>
    </div>
  </Modal>;
}
