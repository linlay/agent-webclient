import { useState } from "react";
import { ApiError } from "@/shared/data";
import type { ConnectorSummary } from "@/shared/data";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { UiTag } from "@/shared/ui/UiTag";
import { useConnectorAuth } from "../hooks/useConnectorAuth";
import { connectorAuthDeadline, isConnectorAuthActive, safeConnectorAuthorizationUrl, supportsConnectorLogin } from "../lib/connectorAuth";
import type { ConnectorAuthViewStatus } from "../lib/connectorAuth";
import styles from "./ConnectorsConsole.module.css";

interface Props {
  item: ConnectorSummary;
  disabled?: boolean;
  onConfigure: () => void;
  onCredentialsChange: () => void;
  onStatusChange: (id: string, status: ConnectorAuthViewStatus) => void;
}

export function ConnectorAuthPanel({ item, disabled, onConfigure, onCredentialsChange, onStatusChange }: Props) {
  const { t, locale } = useI18n();
  const readOnly = item.builtin === true || item.readOnly === true;
  const auth = useConnectorAuth({ id: item.id, mode: item.auth_mode, readOnly, onCredentialsChange, onStatusChange });
  const [confirmLogout, setConfirmLogout] = useState(false);
  const interactive = supportsConnectorLogin(item.auth_mode);
  const active = isConnectorAuthActive(auth.session);
  const busy = !!auth.operation || disabled;
  const status = auth.operation === "start" ? "preparing" : auth.status;
  const url = status === "pending" && !busy ? safeConnectorAuthorizationUrl(auth.session?.authorizationUrl) : null;
  const deadline = connectorAuthDeadline(auth.session);
  const errorText = auth.error instanceof ApiError && [401, 403, 404, 405].includes(auth.error.status || 0)
    ? t(`connectors.auth.error.${auth.error.status}`)
    : auth.error?.message.startsWith("connectors.auth.error.") ? t(auth.error.message) : auth.error?.message;

  return <section className={styles.card} aria-label={t("connectors.auth.title")}>
    <div className={styles.toolbar}>
      <h3>{t("connectors.auth.title")}</h3>
      {item.auth_mode !== "token" && <UiTag role="status" tone={status === "authorized" ? "accent" : ["failed", "expired"].includes(status) ? "danger" : "muted"}>{t(`connectors.auth.status.${status}`)}</UiTag>}
    </div>
    <p>{t(item.auth_mode === "token" ? "connectors.auth.token" : `connectors.auth.description.${status}`)}</p>
    {interactive && <>
      <p className={styles.hint}>{t("connectors.auth.shared")}</p>
      {(item.auth_mode === "oauth" || item.auth_mode === "mcp") && <p className={styles.notice}>{t("connectors.auth.localCallback")}</p>}
      {item.hasMcp && <p className={styles.hint}>{t("connectors.auth.mcpAvailability")}</p>}
      {auth.session?.message && ["failed", "setup_required", "canceled", "expired"].includes(status) && <p className={styles.hint}>{auth.session.message}</p>}
      {errorText && <div className={styles.error} role="alert">{t("connectors.auth.error.prefix")} {errorText}</div>}
      {status === "pending" && auth.session?.authorizationUrl && !safeConnectorAuthorizationUrl(auth.session.authorizationUrl) && <p className={styles.error} role="alert">{t("connectors.auth.error.url")}</p>}
      {active && deadline !== null && status !== "expired" && <p className={styles.hint}>{t("connectors.auth.expires", { time: new Date(deadline).toLocaleString(locale) })}</p>}
      {url && <div className={styles.stack}>
        <div className={styles.authActions}>
          <a className="ui-btn ui-btn-primary ui-btn-sm" href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"><MaterialIcon name="open_in_new" />{t("connectors.auth.open")}</a>
        </div>
        <p className={styles.hint}>{t("connectors.auth.openHint")}</p>
      </div>}
      <div className={styles.authActions}>
        {!readOnly && !active && ["unauthorized", "setup_required", "failed", "canceled", "expired"].includes(status) && <UiButton size="sm" variant="primary" disabled={busy} loading={auth.operation === "start"} onClick={() => void auth.start()}>{t(["failed", "canceled", "expired"].includes(status) ? "connectors.auth.retry" : "connectors.auth.login")}</UiButton>}
        {!readOnly && active && status === "expired" && <UiButton size="sm" variant="primary" disabled={busy} onClick={() => void auth.start()}>{t("connectors.auth.retry")}</UiButton>}
        {auth.operation === "start" && <UiButton size="sm" loading disabled>{t("connectors.auth.starting")}</UiButton>}
        {!readOnly && active && <UiButton size="sm" disabled={busy} loading={auth.operation === "cancel"} onClick={() => void auth.cancel()}>{t("connectors.auth.cancel")}</UiButton>}
        {!readOnly && status === "authorized" && !confirmLogout && <UiButton size="sm" disabled={busy} onClick={() => setConfirmLogout(true)}>{t("connectors.auth.logout")}</UiButton>}
        <UiButton size="sm" variant="ghost" disabled={busy || auth.checking} onClick={() => void auth.refresh()}>{t(auth.checking ? "connectors.auth.checking" : "connectors.auth.refresh")}</UiButton>
      </div>
      {confirmLogout && status === "authorized" && <div className={styles.notice}>
        <p>{t("connectors.auth.logoutConfirm")}</p>
        <div className={styles.actions}>
          <UiButton size="sm" variant="danger" disabled={busy} loading={auth.operation === "logout"} onClick={() => { setConfirmLogout(false); void auth.logout(); }}>{t("connectors.auth.logoutConfirmAction")}</UiButton>
          <UiButton size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmLogout(false)}>{t("connectors.auth.keepLogin")}</UiButton>
        </div>
      </div>}
    </>}
    {item.auth_mode === "token" && <div><UiButton size="sm" disabled={disabled} onClick={onConfigure}>{t("connectors.section.config")}</UiButton></div>}
  </section>;
}
