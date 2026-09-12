import { useCallback, useEffect, useRef, useState } from "react";
import { Input, Spin, Switch } from "antd";
import type { InputRef } from "antd";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { ApiError, type ConnectorSummary } from "@/shared/data";
import { useConnectorPickerCatalog } from "../hooks/useConnectorPickerCatalog";
import type { ConnectorAuthRuntime } from "../hooks/useConnectorAuth";
import { createConnectorAuthChecks } from "../lib/connectorAuthChecks";
import { filterConnectors } from "../lib/connectorCatalog";
import { safeConnectorAuthorizationUrl } from "../lib/connectorAuth";
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
}

export function ConnectorPicker({ search, onSearchChange, selectedIds, savingId, onSelectionChange, disabled = false, selectionDisabled = false }: ConnectorPickerProps) {
  const { t } = useI18n();
  const catalog = useConnectorPickerCatalog();
  const searchRef = useRef<InputRef>(null);
  const [checks] = useState(createConnectorAuthChecks);
  const [authRuntimes, setAuthRuntimes] = useState<Record<string, ConnectorAuthRuntime>>({});
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
    {catalog.items.map(item => <ConnectorAuthObserver key={connectorAuthIdentity(item)} item={item} checks={checks} onChange={onAuthChange} onCredentialsChange={catalog.refresh} />)}
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
      {items.map(item => <ConnectorPickerRow key={item.id} item={item} auth={authRuntimes[connectorAuthIdentity(item)]}
        selected={selectedIds.includes(item.id)} saving={savingId === item.id} disabled={disabled || !!catalog.error} selectionDisabled={selectionDisabled} onSelectionChange={onSelectionChange}
        onPrioritize={() => checks.prioritize(item.id)} />)}
    </div>
  </section>;
}

function ConnectorPickerRow({ item, auth, selected, saving, disabled, selectionDisabled, onSelectionChange, onPrioritize }: {
  item: ConnectorSummary;
  auth?: ConnectorAuthRuntime;
  selected: boolean;
  saving: boolean;
  disabled: boolean;
  selectionDisabled: boolean;
  onSelectionChange: ConnectorPickerProps["onSelectionChange"];
  onPrioritize: () => void;
}) {
  const { t } = useI18n();
  const status = auth?.operation === "start" ? "preparing" : auth?.status || "unknown";
  const connecting = status === "preparing" || status === "pending";
  const available = item.auth_mode == null || item.auth_mode === "none" || item.auth_mode === "token" || item.auth_mode === "oneid-token"
    || status === "authorized" || status === "not_required";
  const readOnly = item.builtin === true || item.readOnly === true;
  const url = status === "pending" ? safeConnectorAuthorizationUrl(auth?.session?.authorizationUrl) : null;
  const actionDisabled = disabled || readOnly || !!auth?.operation;
  const authorizationAction = connecting ? <span className={styles.connecting} role="status"><MaterialIcon name="progress_activity" className={styles.spinner} aria-hidden="true" />{t("composer.addMenu.connectors.connecting")}</span>
    : status === "unknown" && !auth?.error ? <span className={styles.connecting} role="status"><MaterialIcon name="progress_activity" className={styles.spinner} aria-hidden="true" />{t("connectors.auth.checking")}</span>
      : <UiButton className={styles.connect} size="sm" variant="ghost" disabled={actionDisabled}
        aria-label={t("composer.addMenu.connectors.connectNamed", { name: item.name || item.id })}
        onClick={() => { onPrioritize(); void (auth?.error ? auth.refresh() : auth?.start()); }}>
        <MaterialIcon name={auth?.error ? "refresh" : "sync_alt"} />{t(auth?.error ? "connectors.action.retry" : "composer.addMenu.connectors.connect")}
      </UiButton>;
  return <div className={styles.rowGroup}>
    <div className={styles.row}>
      <ConnectorIcon item={item} size={18} className={styles.icon} />
      <span className={styles.name} title={item.description || item.name}>{item.name || item.id}</span>
      {selected || available ? <Switch size="small" className={styles.toggle} checked={selected} loading={saving} disabled={disabled || selectionDisabled}
        aria-label={t("composer.addMenu.connectors.select", { name: item.name || item.id })}
        onChange={checked => onSelectionChange(item, checked)} /> : authorizationAction}
    </div>
    {selected && !available && <div className={styles.authAction}>{authorizationAction}</div>}
    {url && (auth?.session?.authBrowser === "embedded" ? <UiButton size="sm" onClick={auth.openBrowser}>{t("connectors.auth.open")}</UiButton> : <a className={styles.authorization} href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"><MaterialIcon name="open_in_new" />{t("connectors.auth.open")}</a>)}
    {auth?.error && <p className={styles.error} role="alert">{t("connectors.auth.checkFailed")}</p>}
    {!auth?.error && ["failed", "expired", "setup_required"].includes(status) && <p className={styles.hint}>{t(`connectors.auth.description.${status}`)}</p>}
  </div>;
}
