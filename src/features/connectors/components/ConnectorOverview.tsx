import type { AdminToolSummary, ConnectorSummary } from "@/shared/data";
import { useI18n } from "@/shared/i18n";
import { UiTag } from "@/shared/ui/UiTag";
import styles from "./ConnectorsConsole.module.css";

export function ConnectorTools({ tools }: { tools: AdminToolSummary[] }) {
  return <div className={styles.stack}>{tools.map(tool => <div className={styles.tool} key={tool.key}>
    <strong>{tool.label || tool.name || tool.key}</strong>
    <code>{tool.key}</code>
    {tool.description && <p>{tool.description}</p>}
  </div>)}</div>;
}

export function ConnectorOverview({ item, tools }: { item: ConnectorSummary; tools: AdminToolSummary[] }) {
  const { t, locale } = useI18n();
  const time = (value?: number) => value ? new Date(value).toLocaleString(locale) : "—";
  return <div className={styles.stack}>
    {item.hasCli && <section className={styles.card}>
      <h3>{t("connectors.type.cli")}</h3><p>{t("connectors.overview.cli")}</p>
      <p className={styles.hint}>{t("connectors.field.bin")} · {t(item.hasBin ? "connectors.value.bundled" : "connectors.value.none")}</p>
    </section>}
    {item.hasMcp && <section className={styles.stack}>
      <h3>{t("connectors.section.mcp")}</h3>
      {(item.mcp || []).map(server => {
        const serverTools = tools.filter(tool => tool.serverKey === server.serverKey);
        return <div className={styles.card} key={server.serverKey}>
          <div className={styles.toolbar}>
            <strong>{server.serverKey}</strong>
            <UiTag tone={server.status === "unavailable" ? "danger" : server.status === "ready" ? "accent" : "muted"}>{t(`connectors.sync.${server.status}`)}</UiTag>
            <span className={styles.hint}>{t("connectors.tools.count", { count: server.toolCount })}</span>
          </div>
          <dl className={styles.metadata}>
            <dt>{t("connectors.field.lastAttempt")}</dt><dd>{time(server.lastSyncAttemptAt)}</dd>
            <dt>{t("connectors.field.lastSuccess")}</dt><dd>{time(server.lastSyncSuccessAt)}</dd>
          </dl>
          {server.diagnostic && <p className={styles.error}>{server.diagnostic.message}</p>}
          {server.status === "unavailable" && <p className={styles.hint}>{t(serverTools.length ? "connectors.tools.snapshot" : "connectors.tools.unavailable")}</p>}
          {server.status === "ready" && server.toolCount === 0 && <p className={styles.hint}>{t("connectors.tools.empty")}</p>}
          {server.status === "ready" && server.toolCount > 0 && !serverTools.length && <p className={styles.hint}>{t("connectors.tools.pendingSnapshot")}</p>}
          <ConnectorTools tools={serverTools} />
        </div>;
      })}
    </section>}
    <section className={styles.card}>
      <h3>{t("connectors.section.skills", { count: (item.skills || []).length })}</h3>
      <p className={styles.hint}>{t("connectors.hint.skills")}</p>
      <div className={styles.badges}>{(item.skills || []).length ? item.skills.map(skill => <UiTag key={skill}>{skill}</UiTag>) : <span className={styles.hint}>{t("connectors.value.none")}</span>}</div>
    </section>
  </div>;
}
