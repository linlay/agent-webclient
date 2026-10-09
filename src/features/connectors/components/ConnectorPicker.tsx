import { useEffect, useRef, useState } from "react";
import { Input, Spin, Switch, message } from "antd";
import type { InputRef } from "antd";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { ApiError, type ConnectorOption } from "@/shared/data";
import { useConnectorPickerCatalog } from "../hooks/useConnectorPickerCatalog";
import { filterConnectorOptions, findConnectorSelectionConflict, connectorSelectionConflictFromError, connectorSelectionConflictNames, connectorOptionStatus } from "../lib/connectorSelection";
import { ConnectorIcon } from "./ConnectorIcon";
import { ConnectorChatError } from "../lib/connectorChat";
import styles from "./ConnectorPicker.module.css";

export interface ConnectorPickerProps {
  agentKey: string;
  search: string;
  onSearchChange: (value: string) => void;
  selectedIds: string[];
  availableIds?: string[];
  savingId?: string;
  catalogRevision?: number;
  onSelectionChange: (item: ConnectorOption, selected: boolean) => void;
  disabled?: boolean;
  selectionDisabled?: boolean;
  selectionError?: Error | null;
}

export function ConnectorPicker({ agentKey, search, onSearchChange, selectedIds, availableIds, savingId, catalogRevision, onSelectionChange, disabled = false, selectionDisabled = false, selectionError }: ConnectorPickerProps) {
  const { t } = useI18n();
  const catalog = useConnectorPickerCatalog(agentKey, catalogRevision);
  // Configuration updates preserve ranking; conflicts use saved associations.
  const [mountedIdsAtOpen] = useState(() => new Set(selectedIds));
  const searchRef = useRef<InputRef>(null);
  const [messageApi, messageContextHolder] = message.useMessage();
  const conflict = connectorSelectionConflictFromError(selectionError);
  const selectionErrorText = conflict
    ? t("composer.addMenu.connectors.selectionConflict", connectorSelectionConflictNames(conflict, catalog.items))
    : selectionError instanceof ConnectorChatError && ["configurationRequired", "authorizationRequired"].includes(selectionError.reason)
      ? t("composer.addMenu.connectors.connectionRequired")
    : selectionError instanceof ConnectorChatError ? t(selectionError.message)
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
    if (nextConflict) {
      const text = t("composer.addMenu.connectors.selectionConflict", connectorSelectionConflictNames(nextConflict, catalog.items));
      const disconnected = availableIds ? catalog.items.filter(candidate => nextConflict.conflictingConnectorIds.includes(candidate.id) && !availableIds.includes(candidate.id)) : [];
      void messageApi.error(disconnected.length ? { content: <span>{text}{disconnected.map(candidate =>
        <UiButton key={candidate.id} size="sm" variant="ghost" onClick={() => onSelectionChange(candidate, false)}>
          {t("composer.addMenu.connectors.removeSelection", { name: candidate.name || candidate.id })}
        </UiButton>)}</span>, duration: 8 } : text);
      return;
    }
    onSelectionChange(item, selected);
  };
  useEffect(() => {
    const timer = window.setTimeout(() => searchRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, []);
  const items = filterConnectorOptions(catalog.items, search)
    .sort((a, b) => Number(mountedIdsAtOpen.has(b.id)) - Number(mountedIdsAtOpen.has(a.id)));
  const catalogErrorLabel = catalog.error instanceof ApiError && [401, 403, 404, 405].includes(catalog.error.status || 0)
    ? t(`connectors.auth.error.${catalog.error.status}`) : t("composer.addMenu.connectors.loadFailed");

  return <section className={styles.picker} aria-label={t("composer.addMenu.section.connectors")}>
    {messageContextHolder}
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
        selected={selectedIds.includes(item.id) && (!availableIds || availableIds.includes(item.id))} saving={savingId === item.id} disabled={disabled || !!catalog.error} selectionDisabled={selectionDisabled} onSelectionChange={changeSelection} />)}
    </div>
    {catalog.reloadPending && <div className={styles.notice} role="status">{t("composer.addMenu.connectors.reloadPending")}</div>}
  </section>;
}

function ConnectorPickerRow({ item, selected, saving, disabled, selectionDisabled, onSelectionChange }: {
  item: ConnectorOption;
  selected: boolean;
  saving: boolean;
  disabled: boolean;
  selectionDisabled: boolean;
  onSelectionChange: ConnectorPickerProps["onSelectionChange"];
}) {
  const { t } = useI18n();
  const status = connectorOptionStatus(item);
  return <div className={styles.row}>
    <ConnectorIcon item={item} size={18} className={styles.icon} />
    <div className={styles.details}>
      <span className={styles.name} title={item.name || item.id}>{item.name || item.id}</span>
      {status && <span className={styles.availability} title={t(`composer.addMenu.connectors.status.${status}`)}>{t(`composer.addMenu.connectors.status.${status}`)}</span>}
    </div>
    <Switch size="small" className={styles.toggle} checked={selected} loading={saving} disabled={disabled || selectionDisabled}
      aria-label={t("composer.addMenu.connectors.select", { name: item.name || item.id })}
      onChange={checked => onSelectionChange(item, checked)} />
  </div>;
}
