import { Spin } from "antd";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import type { useAgentConnectorCapabilities } from "../hooks/useAgentConnectorCapabilities";
import { ConnectorIcon } from "./ConnectorIcon";
import { ConnectorTools } from "./ConnectorComponents";
import styles from "./AgentConnectorCapabilities.module.css";

type Props = ReturnType<typeof useAgentConnectorCapabilities>;
export function AgentConnectorCapabilities({ items, loading, error, refresh, reloadPending }: Props) {
  const { t } = useI18n();
  return <section className={styles.section} aria-label={t("agents.connectors.title")}>
    <div className={styles.heading}><h4>{t("agents.connectors.title")}</h4><span>{items.length}</span></div>
    <p className={styles.hint}>{t("agents.connectors.hint")}</p>
    {loading && <div role="status"><Spin size="small" /></div>}
    {error && <div role="alert" className={styles.heading}>
      <span>{t("agents.connectors.loadFailed")}</span>
      <UiButton size="sm" variant="ghost" disabled={loading} onClick={() => void refresh()}>{t("connectors.action.retry")}</UiButton>
    </div>}
    {reloadPending && <p role="status" className={styles.hint}>{t("agents.connectors.pending")}</p>}
    {!items.length && !loading && !error && <p className={styles.hint}>{t("agents.connectors.empty")}</p>}
    <div className={styles.list}>{items.map(item => <details key={item.id} className={styles.card}>
      <summary className={styles.summary}>
        <ConnectorIcon item={item} size={22} />
        <span className={styles.copy}><strong>{item.name}</strong><span>{item.description || item.id}</span></span>
        <span className={styles.meta}>
          {item.preset && <span><MaterialIcon name="lock" />{t("agentConsole.tools.preset")}</span>}
          <span>{t(item.active ? "agents.connectors.active" : "agents.connectors.inactive")}</span>
          <span>{item.tools.length ? t("connectors.tools.count", { count: item.tools.length }) : item.connector?.hasCli ? "CLI" : item.connector?.hasView ? "VIEW" : item.connector?.hasMcp ? "MCP" : t("connectors.tools.count", { count: 0 })}</span>
        </span>
        <MaterialIcon name="expand_more" className={styles.chevron} />
      </summary>
      <div className={styles.content}>
        <p className={styles.hint}>{item.id}{item.preset ? ` · ${t("agents.connectors.presets.hint")}` : ""}</p>
        {item.missing && <p role="status">{t("agents.connectors.missing")}</p>}
        <ConnectorTools tools={item.tools} />
        {item.connector?.hasCli && <p className={styles.hint}>{t("connectors.overview.cli")}</p>}
        {item.connector?.hasView && <p className={styles.hint}>{t("agents.connectors.views", { count: item.connector.views?.length || 0 })}</p>}
        {!!item.connector?.skills.length && <p className={styles.hint}>{t("agentConsole.field.skills")}: {item.connector.skills.join(", ")}</p>}
        {item.connector?.mcp?.map(server => <p key={server.serverKey} className={styles.hint}>
          {t(`connectors.sync.${server.status}`)} · {t("connectors.tools.count", { count: server.toolCount })}
          {server.diagnostic && ` · ${server.diagnostic.message}`}
        </p>)}
        {!item.tools.length && !item.missing && <p className={styles.hint}>{t("agents.connectors.noTools")}</p>}
      </div>
    </details>)}</div>
  </section>;
}
