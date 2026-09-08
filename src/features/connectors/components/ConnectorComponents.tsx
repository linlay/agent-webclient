import { useState } from "react";
import { Input } from "antd";
import type { AdminToolSummary, ConnectorSummary } from "@/shared/data";
import { useI18n } from "@/shared/i18n";
import { UiTag } from "@/shared/ui/UiTag";
import { connectorToolDisplayName, filterConnectorTools } from "../lib/connectorCatalog";
import styles from "./ConnectorsConsole.module.css";

export function ConnectorTools({ tools }: { tools: AdminToolSummary[] }) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const filtered = filterConnectorTools(tools, search);
  if (!tools.length) return null;
  return <div className={styles.stack}>
    {(tools.length > 8 || search) && <Input size="small" allowClear value={search}
      aria-label={t("connectors.tools.search")} placeholder={t("connectors.tools.search")}
      onChange={event => setSearch(event.target.value)} />}
    {filtered.map(tool => <div className={styles.tool} key={tool.key}>
      <strong>{connectorToolDisplayName(tool)}</strong>
      {tool.description && <p>{tool.description}</p>}
    </div>)}
    {!filtered.length && <p className={styles.hint}>{t("connectors.tools.noResults")}</p>}
  </div>;
}

export function ConnectorComponents({ item, tools }: { item: ConnectorSummary; tools: AdminToolSummary[] }) {
  const { t, locale } = useI18n();
  const time = (value?: number) => value ? new Date(value).toLocaleString(locale) : "—";
  return <div className={styles.stack}>
    {item.hasView && <section className={styles.group}>
      <h3>VIEW</h3>
      {(item.views || []).map(view => <div className={styles.tool} key={view.key}>
        <strong>{view.title || view.key}</strong>
        <p>{view.key} · {view.renderer.toUpperCase()} · {view.usage.join(" / ")}</p>
      </div>)}
    </section>}
    {item.hasCli && <section className={styles.group}>
      <h3>{t("connectors.type.cli")}</h3><p>{t("connectors.overview.cli")}</p>
      <p className={styles.hint}>{t("connectors.field.bin")} · {t(item.hasBin ? "connectors.value.bundled" : "connectors.value.none")}</p>
    </section>}
    {item.hasMcp && <section className={styles.stack}>
      <h3>{t("connectors.section.mcp")}</h3>
      {(item.mcp || []).map(server => {
        const serverTools = tools.filter(tool => tool.serverKey === server.serverKey);
        return <div className={styles.group} key={server.serverKey}>
          <div className={styles.toolbar}>
            <strong>{server.serverKey}</strong>
            <UiTag tone={server.status === "unavailable" ? "danger" : server.status === "ready" ? "accent" : "muted"}>{t(`connectors.sync.${server.status}`)}</UiTag>
            <span className={styles.hint}>{t("connectors.tools.count", { count: server.toolCount })}</span>
          </div>
          {server.status === "unmounted" && <p className={styles.hint}>{t("connectors.sync.unmountedHint")}</p>}
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
  </div>;
}
