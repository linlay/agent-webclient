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
  const error = selection.loadError;
  return <div>
    {!agentKey ? <div className={styles.status}>{t("composer.addMenu.connectors.noAgent")}</div>
      : !selection.data && !error && <div className={styles.status} role="status"><Spin size="small" />{t("composer.addMenu.loading")}</div>}
    {error && <div className={styles.status} role="alert">
      <span>{t("composer.addMenu.connectors.configLoadFailed")}{error.message ? `：${error.message}` : ""}</span>
      {selection.loadError && <UiButton size="sm" variant="ghost" disabled={selection.loading} onClick={() => void selection.refresh()}>{t("connectors.action.retry")}</UiButton>}
    </div>}
    {selection.data && <ConnectorPicker search={search} onSearchChange={onSearchChange}
      selectedIds={selection.data.connectorIds} presetIds={selection.data.presetConnectorIds} savingId={selection.savingId}
      onSelectionChange={(item, selected) => void selection.setSelected(item.id, selected)}
      selectionError={selection.saveError}
      disabled={disabled} selectionDisabled={!!selection.loadError || !!selection.savingId} />}
    {selection.data?.reloadPending && <div className={styles.notice} role="status">{t("composer.addMenu.connectors.reloadPending")}</div>}
  </div>;
}
