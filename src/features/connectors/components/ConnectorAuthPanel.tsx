import { useCallback, useEffect, useRef, useState } from "react";
import { ConnectorAuthBrowser } from "./ConnectorAuthBrowser";
import { ApiError, connectConnector, getConnectorConnection } from "@/shared/data";
import type { ConnectorSummary } from "@/shared/data";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { UiTag } from "@/shared/ui/UiTag";
import { useConnectorAuth, type ConnectorAuthRuntime } from "../hooks/useConnectorAuth";
import { connectorAuthDeadline, isConnectorAuthActive, readConnectorAuthSession, safeConnectorAuthorizationUrl, supportsConnectorAuthCheck, supportsConnectorLogin } from "../lib/connectorAuth";
import { readConnectorConnection } from "../lib/connectorChat";
import type { ConnectorAuthViewStatus } from "../lib/connectorAuth";
import styles from "./ConnectorsConsole.module.css";
import { ConnectorCredentialsDialog } from "./ConnectorCredentialsDialog";

interface Props {
  item: ConnectorSummary;
  disabled?: boolean;
  onConfigure: () => void;
  onCredentialsChange?: () => void;
  onStatusChange?: (id: string, status: ConnectorAuthViewStatus) => void;
  auth?: ConnectorAuthRuntime;
}

export function ConnectorAuthPanel(props: Props) {
  return props.auth ? <ConnectorAuthPanelContent {...props} auth={props.auth} /> : <StandaloneConnectorAuthPanel {...props} />;
}

function StandaloneConnectorAuthPanel(props: Props) {
  const { item, onCredentialsChange, onStatusChange } = props;
  const auth = useConnectorAuth({ id: item.id, mode: item.auth_mode, readOnly: item.builtin === true || item.readOnly === true, onCredentialsChange, onStatusChange });
  return <><ConnectorAuthPanelContent {...props} auth={auth} /><ConnectorAuthBrowser auth={auth} /></>;
}

function ConnectorAuthPanelContent({ item, disabled, onConfigure, onCredentialsChange, auth }: Props & { auth: ConnectorAuthRuntime }) {
  const { t, locale } = useI18n();
  const readOnly = item.builtin === true || item.readOnly === true;
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [confirmingConnection, setConfirmingConnection] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [connectionError, setConnectionError] = useState(false);
  const connectionScope = useRef<AbortController | null>(null);
  const connectionCheck = useRef<AbortController | null>(null);
  useEffect(() => () => { connectionScope.current?.abort(); connectionScope.current = null; connectionCheck.current?.abort(); connectionCheck.current = null; }, [item.id]);
  const checkable = supportsConnectorAuthCheck(item.auth_mode);
  const interactive = supportsConnectorLogin(item.auth_mode) && auth.status !== "delegated";
  const active = isConnectorAuthActive(auth.session);
  const busy = !!auth.operation || disabled;
  const status = auth.operation === "start" ? "preparing" : auth.status;
  const url = status === "pending" && !busy ? safeConnectorAuthorizationUrl(auth.session?.authorizationUrl) : null;
  const deadline = connectorAuthDeadline(auth.session);
  const confirmable = status === "delegated" || item.auth_mode === "oneid-token" && status === "authorized";
  const refreshConnection = useCallback(async () => {
    if (!confirmable) return;
    connectionCheck.current?.abort();
    const controller = new AbortController(); connectionCheck.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await getConnectorConnection(item.id, controller.signal);
      if (connectionCheck.current !== controller || controller.signal.aborted) return;
      setConfigured(readConnectorConnection(response.data, item.id).configured);
    } catch {
      if (connectionCheck.current === controller) setConfigured(null);
    } finally { window.clearTimeout(timeout); if (connectionCheck.current === controller) connectionCheck.current = null; }
  }, [item.id, confirmable]);
  useEffect(() => {
    if (!auth.checking) void refreshConnection();
    const onVisible = () => { if (document.visibilityState === "visible") void refreshConnection(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { document.removeEventListener("visibilitychange", onVisible); connectionCheck.current?.abort(); connectionCheck.current = null; };
  }, [refreshConnection, item, auth.session, auth.checking]);
  const errorText = auth.error instanceof ApiError && [401, 403, 404, 405].includes(auth.error.status || 0)
    ? t(`connectors.auth.error.${auth.error.status}`)
    : auth.error?.message.startsWith("connectors.auth.error.") || auth.error?.message.startsWith("connectors.chat.") ? t(auth.error.message) : auth.error?.message;

  return <section className={styles.group} aria-label={t("connectors.auth.title")}>
    <div className={styles.toolbar}>
      <h3>{t("connectors.auth.title")}</h3>
      <UiTag role="status" tone={status === "authorized" ? "accent" : ["failed", "expired"].includes(status) || auth.error ? "danger" : "muted"}>{t(status === "unknown" ? auth.error ? "connectors.auth.checkFailed" : "connectors.auth.checking" : `connectors.auth.status.${status}`)}</UiTag>
    </div>
    <p>{t(item.auth_mode === "token" ? "connectors.auth.token" : status === "unknown" ? auth.error ? "connectors.auth.checkFailedHint" : "connectors.auth.checkingHint" : item.auth_mode === "oneid-token" ? "connectors.auth.oneid" : `connectors.auth.description.${status}`)}</p>
    {item.hasNative && <p className={styles.hint}>{t("connectors.native.hint")}</p>}
    {(auth.session?.pendingVerification || status === "pending_verification") && <p className={styles.notice} role="status">{t("connectors.credentials.pending")}</p>}
    {checkable && <>
      {interactive && <p className={styles.hint}>{t("connectors.auth.shared")}</p>}
      {(item.auth_mode === "oauth" || item.auth_mode === "mcp") && <p className={styles.notice}>{t("connectors.auth.localCallback")}</p>}
      {item.hasMcp && <p className={styles.hint}>{t("connectors.auth.mcpAvailability")}</p>}
      {item.auth_mode !== "token" && auth.session?.message && ["failed", "setup_required", "canceled", "expired"].includes(status) && <p className={styles.hint}>{auth.session.message}</p>}
      {errorText && <div className={styles.error} role="alert">{t("connectors.auth.error.prefix")} {item.auth_mode === "token" ? t("connectors.credentials.checkFailed") : errorText}</div>}
      {status === "pending" && auth.session?.authorizationUrl && !safeConnectorAuthorizationUrl(auth.session.authorizationUrl) && <p className={styles.error} role="alert">{t("connectors.auth.error.url")}</p>}
      {active && deadline !== null && status !== "expired" && <p className={styles.hint}>{t("connectors.auth.expires", { time: new Date(deadline).toLocaleString(locale) })}</p>}
      {url && <div className={styles.stack}>
        <div className={styles.authActions}>
          {auth.session?.authBrowser === "embedded" ? <UiButton size="sm" variant="primary" onClick={auth.openBrowser}>{t("connectors.auth.open")}</UiButton> : <a className="ui-btn ui-btn-primary ui-btn-sm" href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"><MaterialIcon name="open_in_new" />{t("connectors.auth.open")}</a>}
        </div>
        <p className={styles.hint}>{t(auth.session?.authBrowser === "embedded" ? "connectors.auth.embedHint" : "connectors.auth.openHint")}</p>
      </div>}
      <div className={styles.authActions}>
        {interactive && !readOnly && !active && ["unauthorized", "setup_required", "failed", "canceled", "expired"].includes(status) && <UiButton size="sm" variant="primary" disabled={busy} loading={auth.operation === "start"} onClick={() => void auth.start()}>{t(["failed", "canceled", "expired"].includes(status) ? "connectors.auth.retry" : "connectors.auth.login")}</UiButton>}
        {interactive && !readOnly && active && status === "expired" && <UiButton size="sm" variant="primary" disabled={busy} onClick={() => void auth.start()}>{t("connectors.auth.retry")}</UiButton>}
        {auth.operation === "start" && <UiButton size="sm" loading disabled>{t("connectors.auth.starting")}</UiButton>}
        {auth.preparingDependency && <UiButton size="sm" disabled={disabled || auth.operation === "cancel"} onClick={() => void auth.cancel()}>{t("connectors.auth.cancelPreparation")}</UiButton>}
        {interactive && !readOnly && active && <UiButton size="sm" disabled={busy} loading={auth.operation === "cancel"} onClick={() => void auth.cancel()}>{t("connectors.auth.cancel")}</UiButton>}
        {interactive && !readOnly && status === "authorized" && !confirmLogout && <UiButton size="sm" disabled={busy} onClick={() => setConfirmLogout(true)}>{t("connectors.auth.logout")}</UiButton>}
        <UiButton size="sm" variant="ghost" disabled={busy || auth.checking} onClick={() => void auth.refresh()}>{t(auth.checking ? "connectors.auth.checking" : "connectors.auth.refresh")}</UiButton>
      </div>
      {confirmable && configured !== true && <div className={styles.authActions}>
        <UiButton size="sm" loading={confirmingConnection} disabled={busy || confirmingConnection} onClick={() => {
          if (connectionScope.current) return;
          connectionCheck.current?.abort(); connectionCheck.current = null;
          const controller = new AbortController(); connectionScope.current = controller; setConfirmingConnection(true); setConnectionError(false);
          const timeout = window.setTimeout(() => controller.abort(), 20_000);
          void connectConnector(item.id, controller.signal).then(response => {
            if (connectionScope.current !== controller || controller.signal.aborted) return;
            const confirmed = readConnectorAuthSession(response.data, item.id);
            if (!["authorized", "delegated"].includes(confirmed.status)) throw new Error("Connection was not confirmed");
            onCredentialsChange?.(); void auth.refresh(); void refreshConnection();
          }).catch(() => { if (connectionScope.current === controller) setConnectionError(true); }).finally(() => {
            window.clearTimeout(timeout);
            if (connectionScope.current === controller) { connectionScope.current = null; setConfirmingConnection(false); }
          });
        }}>{t("connectors.auth.confirmConnection")}</UiButton>
      </div>}
      {connectionError && <p className={styles.error} role="alert">{t("connectors.chat.configurationRequired")}</p>}
      {interactive && confirmLogout && status === "authorized" && <div className={styles.notice}>
        <p>{t("connectors.auth.logoutConfirm")}</p>
        <div className={styles.actions}>
          <UiButton size="sm" variant="danger" disabled={busy} loading={auth.operation === "logout"} onClick={() => { setConfirmLogout(false); void auth.logout(); }}>{t("connectors.auth.logoutConfirmAction")}</UiButton>
          <UiButton size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmLogout(false)}>{t("connectors.auth.keepLogin")}</UiButton>
        </div>
      </div>}
    </>}
    {item.auth_mode === "token" && <div><UiButton size="sm" disabled={disabled} onClick={() => setCredentialsOpen(true)}>{t("connectors.credentials.configure")}</UiButton></div>}
    {credentialsOpen && <ConnectorCredentialsDialog key={`${item.id}/${item.version}`} item={item} onClose={() => setCredentialsOpen(false)} onSaved={() => { onCredentialsChange?.(); void auth.refresh(); }} />}
  </section>;
}
