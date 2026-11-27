import { useEffect, useId, useRef, useState } from "react";
import { Input, Spin, Switch, message } from "antd";
import type { InputRef } from "antd";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import pickerTypography from "@/shared/ui/PickerTypography.module.css";
import { ApiError, type ConnectorOption } from "@/shared/data";
import { useConnectorPickerCatalog } from "../hooks/useConnectorPickerCatalog";
import { filterConnectorOptions, findConnectorSelectionConflict, connectorSelectionConflictFromError, connectorSelectionConflictNames, connectorOptionStatus, orderConnectorsBuiltinLast } from "../lib/connectorSelection";
import { ConnectorIcon } from "./ConnectorIcon";
import { ConnectorChatError } from "../lib/connectorChat";
import { isMobilePath } from "@/shared/utils/mobileRoutes";
import styles from "./ConnectorPicker.module.css";

export interface ConnectorPickerProps {
  agentKey: string;
  search: string;
  onSearchChange: (value: string) => void;
  selectedIds: string[];
  savingId?: string;
  catalogRevision?: number;
  onSelectionChange: (item: ConnectorOption, selected: boolean) => void;
  disabled?: boolean;
  selectionDisabled?: boolean;
  selectionError?: Error | null;
}

export function ConnectorPicker({ agentKey, search, onSearchChange, selectedIds, savingId, catalogRevision, onSelectionChange, disabled = false, selectionDisabled = false, selectionError }: ConnectorPickerProps) {
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
    if (disabled || selectionDisabled || savingId || (selected && catalog.error)) return;
    const nextConflict = selected ? findConnectorSelectionConflict(item, selectedIds, catalog.items) : null;
    if (nextConflict) {
      const text = t("composer.addMenu.connectors.selectionConflict", connectorSelectionConflictNames(nextConflict, catalog.items));
      const disconnected = catalog.items.filter(candidate => nextConflict.conflictingConnectorIds.includes(candidate.id)
        && ["account_not_connected", "account_disconnected", "authorization_invalid"].includes(connectorOptionStatus(candidate) || ""));
      void messageApi.error(disconnected.length ? { content: <span>{text}{disconnected.map(candidate =>
        <UiButton key={candidate.id} size="sm" variant="ghost" onClick={() => onSelectionChange(candidate, false)}>
          {t("composer.addMenu.connectors.removeSelection", { name: candidate.name || candidate.id })}
        </UiButton>)}</span>, duration: 8 } : text);
      return;
    }
    onSelectionChange(item, selected);
  };
  useEffect(() => {
    // /mobile 的 BottomSheet 由用户点按后再聚焦，打开面板时不弹出软键盘。
    if (isMobilePath(typeof window === "undefined" ? undefined : window.location?.pathname)) return;
    const timer = window.setTimeout(() => searchRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, []);
  // 内置始终沉底；各组内仍按打开时的已挂载状态排序，切换开关不跳行。
  const items = orderConnectorsBuiltinLast(filterConnectorOptions(catalog.items, search)
    .sort((a, b) => Number(mountedIdsAtOpen.has(b.id)) - Number(mountedIdsAtOpen.has(a.id))));
  const catalogErrorLabel = catalog.error instanceof ApiError && [401, 403, 404, 405].includes(catalog.error.status || 0)
    ? t(`connectors.auth.error.${catalog.error.status}`) : t("composer.addMenu.connectors.loadFailed");

  return <section className={styles.picker} aria-label={t("composer.addMenu.section.connectors")}>
    {messageContextHolder}
    <Input ref={searchRef} className={`${styles.search} ${pickerTypography.search}`} variant="filled" prefix={<MaterialIcon name="search" />} value={search}
      aria-label={t("composer.addMenu.connectors.search")} placeholder={t("composer.addMenu.connectors.search")}
      onChange={event => onSearchChange(event.target.value)} />
    <div className={styles.list} aria-busy={catalog.loading}>
      {catalog.loading && !catalog.items.length && <div className={styles.status} role="status"><Spin size="small" />{t("composer.addMenu.loading")}</div>}
      {catalog.error && <div className={styles.status} role="alert">
        <span>{catalogErrorLabel}</span>
        <UiButton size="sm" variant="ghost" disabled={catalog.loading} onClick={() => void catalog.refresh()}>{t("connectors.action.retry")}</UiButton>
      </div>}
      {!catalog.loading && !catalog.error && !items.length && <div className={styles.status} role="status">{t(catalog.items.length ? "composer.addMenu.empty" : "composer.addMenu.connectors.empty")}</div>}
      {items.map(item => {
        const selected = selectedIds.includes(item.id);
        return <ConnectorPickerRow key={item.id} item={item} selected={selected} saving={savingId === item.id}
          catalogError={!!catalog.error} disabled={disabled || (!selected && !!catalog.error)} selectionDisabled={selectionDisabled}
          selectionBlocked={!!savingId} onSelectionChange={changeSelection} />;
      })}
    </div>
    {catalog.reloadPending && <div className={styles.notice} role="status">{t("composer.addMenu.connectors.reloadPending")}</div>}
  </section>;
}

function ConnectorPickerRow({ item, selected, saving, catalogError, disabled, selectionDisabled, selectionBlocked, onSelectionChange }: {
  item: ConnectorOption;
  selected: boolean;
  saving: boolean;
  catalogError: boolean;
  disabled: boolean;
  selectionDisabled: boolean;
  selectionBlocked: boolean;
  onSelectionChange: ConnectorPickerProps["onSelectionChange"];
}) {
  const { t } = useI18n();
  const status = catalogError ? "status_unknown" : connectorOptionStatus(item);
  const warning = !catalogError && item.availability?.state === "unavailable";
  const pending = !catalogError && selected && item.active === false;
  const descriptionId = useId();
  // Keep unrelated switches visually stable while serializing pointer/keyboard changes.
  return <div className={styles.row}
    onClickCapture={event => { if (selectionBlocked) event.stopPropagation(); }}
    onKeyDownCapture={event => {
      if (selectionBlocked && ["ArrowLeft", "ArrowRight", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }}>
    <ConnectorIcon item={item} size={18} className={styles.icon} />
    <div className={styles.details}>
      <span className={`${styles.name} ${pickerTypography.name}`} title={item.name || item.id}>{item.name || item.id}</span>
      {(pending || status) && <span id={descriptionId}>
        {pending && <span className={`${styles.availability} ${pickerTypography.description}`}>
          {t("composer.addMenu.connectors.status.mount_pending")}
        </span>}
        {status && <span className={`${styles.availability} ${pickerTypography.description}${warning ? ` ${styles.warning}` : ""}`}>
          {warning && <MaterialIcon name="warning" />}
          {t(`composer.addMenu.connectors.status.${status}`)}
        </span>}
      </span>}
    </div>
    <Switch size="small" className={styles.toggle} checked={selected} loading={saving} disabled={disabled || selectionDisabled}
      aria-disabled={disabled || selectionDisabled || selectionBlocked}
      aria-label={t("composer.addMenu.connectors.select", { name: item.name || item.id })}
      aria-describedby={pending || status ? descriptionId : undefined}
      onChange={checked => onSelectionChange(item, checked)} />
  </div>;
}
