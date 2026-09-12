import { useEffect, useRef, useState } from "react";
import { Modal } from "antd";
import { useI18n } from "@/shared/i18n";
import { isAppMode } from "@/shared/utils/routing";
import { CONNECTOR_AUTH_BROWSER_GLOBAL, type ConnectorAuthBrowserBridge } from "@/shared/contracts/generated/agentWebclientBridge";
import { safeConnectorAuthorizationUrl } from "../lib/connectorAuth";
import type { ConnectorAuthRuntime } from "../hooks/useConnectorAuth";
import styles from "./ConnectorAuthBrowser.module.css";

export function ConnectorAuthBrowser({ auth }: { auth: ConnectorAuthRuntime }) {
  const { t } = useI18n();
  const desktop = isAppMode();
  const session = auth.session;
  const requested = !!session?.sessionId && auth.browserSessionId === session.sessionId && session.authBrowser === "embedded";
  const active = requested && (auth.status === "preparing" || auth.status === "pending");
  const url = active ? safeConnectorAuthorizationUrl(session?.authorizationUrl) : null;
  const safeUrl = url?.startsWith("https://") ? url : null;
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(auth); latest.current = auth;
  useEffect(() => { setError(false); }, [session?.sessionId]);
  useEffect(() => {
    if (!desktop || !active || !session) return;
    const bridge = (window as unknown as Record<string, unknown>)[CONNECTOR_AUTH_BROWSER_GLOBAL] as ConnectorAuthBrowserBridge | undefined;
    if (!bridge || bridge.version !== 1 || typeof bridge.open !== "function" || typeof bridge.close !== "function" || typeof bridge.subscribe !== "function") {
      setError(true); return;
    }
    const identity = { connectorId: session.connectorId, sessionId: session.sessionId };
    const unsubscribe = bridge.subscribe(event => {
      if (event.connectorId === identity.connectorId && event.sessionId === identity.sessionId && latest.current.session?.sessionId === identity.sessionId) void latest.current.cancel();
    });
    return () => { unsubscribe(); void bridge.close(identity).catch(() => {}); };
  }, [desktop, active, session?.connectorId, session?.sessionId]);
  useEffect(() => {
    if (!desktop || !active || !safeUrl || !session) return;
    const bridge = (window as unknown as Record<string, unknown>)[CONNECTOR_AUTH_BROWSER_GLOBAL] as ConnectorAuthBrowserBridge | undefined;
    if (!bridge || bridge.version !== 1 || typeof bridge.open !== "function") { setError(true); return; }
    let disposed = false;
    setError(false);
    void bridge.open({ connectorId: session.connectorId, sessionId: session.sessionId }).catch(() => { if (!disposed) setError(true); });
    return () => { disposed = true; };
  }, [desktop, active, session?.connectorId, session?.sessionId, safeUrl, attempt, auth.browserRequestRevision]);
  if (!active) return null;
  return <Modal open={!desktop || error} title={t("connectors.auth.title")} footer={null} width={600}
    maskClosable={false} destroyOnClose onCancel={() => void auth.cancel()}>
    {(error || (url && !safeUrl)) && <p role="alert">{t("connectors.auth.embedFailed")}</p>}
    {!desktop && safeUrl && <iframe key={`${session?.sessionId}:${attempt}`} className={styles.frame} src={safeUrl}
      title={t("connectors.auth.title")} sandbox="allow-scripts allow-forms allow-same-origin" referrerPolicy="no-referrer"
      onError={() => setError(true)} />}
    {!safeUrl && !error && <p role="status">{t("connectors.auth.starting")}</p>}
    <p>{t("connectors.auth.embedHint")}</p>
    <button type="button" onClick={() => { setError(false); setAttempt(value => value + 1); }}>{t("connectors.action.retry")}</button>
  </Modal>;
}
