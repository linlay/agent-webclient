import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input, Spin, Switch, message } from "antd";
import type { InputRef } from "antd";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { ApiError, type ConnectorSummary } from "@/shared/data";
import { useConnectorPickerCatalog } from "../hooks/useConnectorPickerCatalog";
import type { ConnectorAuthRuntime } from "../hooks/useConnectorAuth";
import { createConnectorAuthChecks } from "../lib/connectorAuthChecks";
import { filterConnectors } from "../lib/connectorCatalog";
import { findConnectorSelectionConflict, connectorSelectionConflictFromError, connectorSelectionConflictNames } from "../lib/connectorSelection";
import { safeConnectorAuthorizationUrl, supportsConnectorLogin } from "../lib/connectorAuth";
import { openConnectorConfiguration } from "../lib/connectorConfiguration";
import { ConnectorCredentialsDialog } from "./ConnectorCredentialsDialog";
import { ConnectorAuthObserver, connectorAuthIdentity } from "./ConnectorAuthObserver";
import { ConnectorIcon } from "./ConnectorIcon";
import styles from "./ConnectorPicker.module.css";

export interface ConnectorPickerProps {
  search: string;
  onSearchChange: (value: string) => void;
  selectedIds: string[];
  savingId?: string;
  onSelectionChange: (item: ConnectorSummary, selected: boolean) => void;
  disabled?: boolean;
  selectionDisabled?: boolean;
  selectionError?: Error | null;
}

export function ConnectorPicker({ search, onSearchChange, selectedIds, savingId, onSelectionChange, disabled = false, selectionDisabled = false, selectionError }: ConnectorPickerProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const catalog = useConnectorPickerCatalog();
  const searchRef = useRef<InputRef>(null);
  const [messageApi, messageContextHolder] = message.useMessage();
  const [attemptedId, setAttemptedId] = useState("");
  const attemptedItem = catalog.items.find(item => item.id === attemptedId);
  const localConflict = attemptedItem && !selectedIds.includes(attemptedId)
    ? findConnectorSelectionConflict(attemptedItem, selectedIds, catalog.items) : null;
  const serverConflict = connectorSelectionConflictFromError(selectionError);
  const conflict = localConflict || serverConflict;
  const selectionErrorText = conflict
    ? t("composer.addMenu.connectors.selectionConflict", connectorSelectionConflictNames(conflict, catalog.items))
    : selectionError ? `${t("composer.addMenu.connectors.saveFailed")}: ${selectionError.message}` : "";
  const reportedError = useRef<Error | null>(null);
  useEffect(() => {
    if (selectionError && reportedError.current !== selectionError) {
      void messageApi.error(selectionErrorText);
    }
    reportedError.current = selectionError || null;
  }, [selectionError, selectionErrorText, messageApi]);
  const changeSelection: ConnectorPickerProps["onSelectionChange"] = (item, selected) => {
    const nextConflict = selected ? findConnectorSelectionConflict(item, selectedIds, catalog.items) : null;
    setAttemptedId(nextConflict ? item.id : "");
    if (nextConflict) {
      void messageApi.error(t("composer.addMenu.connectors.selectionConflict", connectorSelectionConflictNames(nextConflict, catalog.items)));
      return;
    }
    onSelectionChange(item, selected);
  };
  const [checks] = useState(createConnectorAuthChecks);
  const [authRuntimes, setAuthRuntimes] = useState<Record<string, ConnectorAuthRuntime>>({});
  const [credentialsItem, setCredentialsItem] = useState<ConnectorSummary | null>(null);
  const [configurationError, setConfigurationError] = useState(false);
  const openingConfiguration = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const configure = async (item: ConnectorSummary) => {
    if (item.auth_mode === "token") { setCredentialsItem(item); return; }
    if (openingConfiguration.current) return;
    openingConfiguration.current = true; setConfigurationError(false);
    try { await openConnectorConfiguration(item.id, navigate); }
    catch { if (mounted.current) setConfigurationError(true); }
    finally { openingConfiguration.current = false; }
  };
  const onAuthChange = useCallback((identity: string, auth: ConnectorAuthRuntime | null) => {
    setAuthRuntimes(previous => {
      if (previous[identity] === auth || (!auth && !previous[identity])) return previous;
      const next = { ...previous };
      if (auth) next[identity] = auth; else delete next[identity];
      return next;
    });
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => searchRef.current?.focus(), 50);
    return () => { window.clearTimeout(timer); checks.cancelAll(); };
  }, [checks]);
  const items = filterConnectors(catalog.items, search, "all");
  const catalogErrorLabel = catalog.error instanceof ApiError && [401, 403, 404, 405].includes(catalog.error.status || 0)
    ? t(`connectors.auth.error.${catalog.error.status}`) : t("composer.addMenu.connectors.loadFailed");

  return <section className={styles.picker} aria-label={t("composer.addMenu.section.connectors")}>
    {messageContextHolder}
    {selectionErrorText && <div className={styles.selectionError} role="alert">{selectionErrorText}</div>}
    {configurationError && <div className={styles.selectionError} role="alert">{t("connectors.configuration.openFailed")}</div>}
    {credentialsItem && <ConnectorCredentialsDialog key={`${credentialsItem.id}/${credentialsItem.version}`} item={credentialsItem} onClose={() => setCredentialsItem(null)} onSaved={() => {
      void authRuntimes[connectorAuthIdentity(credentialsItem)]?.refresh(); void catalog.refresh();
    }} />}
    {catalog.items.filter(item => selectedIds.includes(item.id)).map(item => <ConnectorAuthObserver pollInactive={false} key={connectorAuthIdentity(item)} item={item} checks={checks} onChange={onAuthChange} onCredentialsChange={catalog.refresh} />)}
    <Input ref={searchRef} className={styles.search} variant="filled" prefix={<MaterialIcon name="search" />} value={search}
      aria-label={t("composer.addMenu.connectors.search")} placeholder={t("composer.addMenu.connectors.search")}
      onChange={event => onSearchChange(event.target.value)} />
    <div className={styles.list} aria-busy={catalog.loading}>
      {catalog.loading && !catalog.items.length && <div className={styles.status} role="status"><Spin size="small" />{t("composer.addMenu.loading")}</div>}
      {catalog.error && <div className={styles.status} role="alert">
        <span>{catalogErrorLabel}</span>
        <UiButton size="sm" variant="ghost" disabled={catalog.loading} onClick={() => void catalog.refresh()}>{t("connectors.action.retry")}</UiButton>
      </div>}
      {!catalog.loading && !catalog.error && !items.length && <div className={styles.status} role="status">{t(catalog.items.length ? "composer.addMenu.empty" : "composer.addMenu.connectors.empty")}</div>}
      {items.map(item => <ConnectorPickerRow key={item.id} item={item} auth={selectedIds.includes(item.id) ? authRuntimes[connectorAuthIdentity(item)] : undefined}
        selected={selectedIds.includes(item.id)} saving={savingId === item.id} disabled={disabled || !!catalog.error} selectionDisabled={selectionDisabled} onSelectionChange={changeSelection}
        onPrioritize={() => checks.prioritize(item.id)} onConfigure={() => void configure(item)} />)}
    </div>
  </section>;
}

function ConnectorPickerRow({ item, auth, selected, saving, disabled, selectionDisabled, onSelectionChange, onPrioritize, onConfigure }: {
  item: ConnectorSummary;
  auth?: ConnectorAuthRuntime;
  selected: boolean;
  saving: boolean;
  disabled: boolean;
  selectionDisabled: boolean;
  onSelectionChange: ConnectorPickerProps["onSelectionChange"];
  onPrioritize: () => void;
  onConfigure: () => void;
}) {
  const { t } = useI18n();
  const status = auth?.operation === "start" ? "preparing" : auth?.status || "unknown";
  const connecting = status === "preparing" || status === "pending";
  const available = item.auth_mode === "no_auth" || item.auth_mode === "none"
    || status === "authorized" || status === "configured" || status === "not_required";
  const interactive = supportsConnectorLogin(item.auth_mode) && status !== "delegated";
  const readOnly = item.builtin === true || item.readOnly === true;
  const url = status === "pending" ? safeConnectorAuthorizationUrl(auth?.session?.authorizationUrl) : null;
  const actionDisabled = disabled || readOnly || !!auth?.operation;
  const authorizationAction = connecting ? <span className={styles.connecting} role="status"><MaterialIcon name="progress_activity" className={styles.spinner} aria-hidden="true" />{t("composer.addMenu.connectors.connecting")}</span>
    : status === "unknown" && !auth?.error && (!auth || auth.checking) ? <span className={styles.connecting} role="status"><MaterialIcon name="progress_activity" className={styles.spinner} aria-hidden="true" />{t("connectors.auth.checking")}</span>
      : <UiButton className={styles.connect} size="sm" variant="ghost" disabled={actionDisabled}
        aria-label={t("composer.addMenu.connectors.connectNamed", { name: item.name || item.id })}
        onClick={() => { onPrioritize(); void (auth?.error || status === "unknown" ? auth?.refresh() : auth?.start()); }}>
        <MaterialIcon name={auth?.error || status === "unknown" ? "refresh" : "sync_alt"} />{t(auth?.error || status === "unknown" ? "connectors.action.retry" : "composer.addMenu.connectors.connect")}
      </UiButton>;
  return <div className={styles.rowGroup}>
    <div className={styles.row}>
      <ConnectorIcon item={item} size={18} className={styles.icon} />
      <span className={styles.name} title={item.description || item.name}>{item.name || item.id}</span>
      <Switch size="small" className={styles.toggle} checked={selected} loading={saving} disabled={disabled || selectionDisabled}
        aria-label={t("composer.addMenu.connectors.select", { name: item.name || item.id })}
        onChange={checked => onSelectionChange(item, checked)} />
    </div>
    {selected && !available && interactive && <div className={styles.authAction}>{authorizationAction}</div>}
    {selected && auth?.preparingDependency && <div className={styles.authAction}><UiButton size="sm" variant="ghost" disabled={disabled || auth.operation === "cancel"} onClick={() => void auth.cancel()}>{t("connectors.auth.cancelPreparation")}</UiButton></div>}
    {selected && item.auth_mode === "token" && <div className={styles.authAction}><UiButton size="sm" variant="ghost" disabled={disabled} onClick={onConfigure}>{t("connectors.credentials.configure")}</UiButton></div>}
    {selected && !available && item.auth_mode !== "token" && !connecting && <div className={styles.authAction}><UiButton size="sm" variant="ghost" disabled={disabled} onClick={onConfigure}>{t("connectors.configuration.open")}</UiButton></div>}
    {selected && item.auth_mode === "oneid-token" && !available && <p className={styles.hint}>{t("connectors.auth.oneid")}</p>}
    {selected && status === "delegated" && <p className={styles.hint}>{t("connectors.auth.description.delegated")}</p>}
    {selected && (auth?.session?.pendingVerification || status === "pending_verification") && <p className={styles.hint}>{t("connectors.credentials.pending")}</p>}
    {url && (auth?.session?.authBrowser === "embedded" ? <UiButton size="sm" onClick={auth.openBrowser}>{t("connectors.auth.open")}</UiButton> : <a className={styles.authorization} href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"><MaterialIcon name="open_in_new" />{t("connectors.auth.open")}</a>)}
    {auth?.error && <p className={styles.error} role="alert">{t("connectors.auth.checkFailed")}</p>}
    {!auth?.error && ["failed", "expired", "setup_required"].includes(status) && <p className={styles.hint}>{t(`connectors.auth.description.${status}`)}</p>}
  </div>;
}
