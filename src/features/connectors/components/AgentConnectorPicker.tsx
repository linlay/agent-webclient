import { Spin } from "antd";
import { useI18n } from "@/shared/i18n";
import { UiButton } from "@/shared/ui/UiButton";
import { useAgentConnectors } from "../hooks/useAgentConnectors";
import { ConnectorPicker } from "./ConnectorPicker";
import styles from "./ConnectorPicker.module.css";

export function AgentConnectorPicker({ agentKey, search, onSearchChange, disabled }: {
  agentKey: string;
  search: string;
  onSearchChange: (value: string) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const selection = useAgentConnectors(agentKey);
  const error = selection.loadError || selection.saveError;
  return <div>
    {!agentKey ? <div className={styles.status}>{t("composer.addMenu.connectors.noAgent")}</div>
      : !selection.data && !error && <div className={styles.status} role="status"><Spin size="small" />{t("composer.addMenu.loading")}</div>}
    {selection.data && <ConnectorPicker search={search} onSearchChange={onSearchChange}
      selectedIds={selection.data.connectorIds} savingId={selection.savingId}
      onSelectionChange={(item, selected) => void selection.setSelected(item.id, selected)}
      disabled={disabled} selectionDisabled={!!selection.loadError || !!selection.savingId} />}
    {error && <div className={styles.status} role="alert">
      <span>{t(selection.loadError ? "composer.addMenu.connectors.configLoadFailed" : "composer.addMenu.connectors.saveFailed")}{error.message ? `：${error.message}` : ""}</span>
      {selection.loadError && <UiButton size="sm" variant="ghost" disabled={selection.loading} onClick={() => void selection.refresh()}>{t("connectors.action.retry")}</UiButton>}
    </div>}
    {selection.data?.reloadPending && <div className={styles.notice} role="status">{t("composer.addMenu.connectors.reloadPending")}</div>}
  </div>;
}
