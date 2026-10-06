import { Spin } from "antd";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { useAgentPresetConnectors } from "../hooks/useAgentPresetConnectors";
import { ConnectorIcon } from "./ConnectorIcon";

export function AgentPresetConnectors({ agentKey }: { agentKey: string }) {
  const { t } = useI18n();
  const { items, loading, error, refresh } = useAgentPresetConnectors(agentKey);
  if (!items.length && !loading && !error) return null;
  return <section className="tw:mb-4 tw:flex tw:flex-col tw:gap-2" aria-label={t("agents.connectors.presets.title")}>
    <strong>{t("agents.connectors.presets.title")}</strong>
    {loading && !items.length && <div role="status"><Spin size="small" /></div>}
    {error && <div role="alert" className="tw:flex tw:items-center tw:gap-2">
      <span>{t("agents.connectors.presets.loadFailed")}</span>
      <UiButton size="sm" variant="ghost" disabled={loading} onClick={() => void refresh()}>{t("connectors.action.retry")}</UiButton>
    </div>}
    {!!items.length && <>
      <p className="tw:text-xs tw:text-ink-muted">{t("agents.connectors.presets.hint")}</p>
      <ul className="tw:flex tw:flex-wrap tw:gap-2">
        {items.map(item => <li key={item.id} title={item.description || item.name} className="tw:flex tw:items-center tw:gap-2 tw:rounded-control tw:border tw:border-line-soft tw:px-2 tw:py-1.5">
          <ConnectorIcon item={item} size={18} />
          <span>{item.name}</span>
          <span className="tw:text-xs tw:text-ink-muted">{t("connectors.value.readOnly")}</span>
          <MaterialIcon name="lock" />
        </li>)}
      </ul>
    </>}
  </section>;
}
