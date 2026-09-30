import { useEffect, useRef, useState } from "react";
import { Input, Spin, Switch, message } from "antd";
import type { InputRef } from "antd";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { ApiError, type ConnectorSummary } from "@/shared/data";
import { useConnectorPickerCatalog } from "../hooks/useConnectorPickerCatalog";
import { filterConnectors } from "../lib/connectorCatalog";
import { findConnectorSelectionConflict, connectorSelectionConflictFromError, connectorSelectionConflictNames } from "../lib/connectorSelection";
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
  useEffect(() => {
    const timer = window.setTimeout(() => searchRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, []);
  const items = filterConnectors(catalog.items, search, "all");
  const catalogErrorLabel = catalog.error instanceof ApiError && [401, 403, 404, 405].includes(catalog.error.status || 0)
    ? t(`connectors.auth.error.${catalog.error.status}`) : t("composer.addMenu.connectors.loadFailed");

  return <section className={styles.picker} aria-label={t("composer.addMenu.section.connectors")}>
    {messageContextHolder}
    {selectionErrorText && <div className={styles.selectionError} role="alert">{selectionErrorText}</div>}
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
      {items.map(item => <ConnectorPickerRow key={item.id} item={item}
        selected={selectedIds.includes(item.id)} saving={savingId === item.id} disabled={disabled || !!catalog.error} selectionDisabled={selectionDisabled} onSelectionChange={changeSelection} />)}
    </div>
  </section>;
}

function ConnectorPickerRow({ item, selected, saving, disabled, selectionDisabled, onSelectionChange }: {
  item: ConnectorSummary;
  selected: boolean;
  saving: boolean;
  disabled: boolean;
  selectionDisabled: boolean;
  onSelectionChange: ConnectorPickerProps["onSelectionChange"];
}) {
  const { t } = useI18n();
  return <div className={styles.row}>
    <ConnectorIcon item={item} size={18} className={styles.icon} />
    <span className={styles.name} title={item.description || item.name}>{item.name || item.id}</span>
    <Switch size="small" className={styles.toggle} checked={selected} loading={saving} disabled={disabled || selectionDisabled}
      aria-label={t("composer.addMenu.connectors.select", { name: item.name || item.id })}
      onChange={checked => onSelectionChange(item, checked)} />
  </div>;
}
