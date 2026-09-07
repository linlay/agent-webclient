import { useState } from "react";
import { Input, Spin } from "antd";
import type { ConnectorType } from "@/shared/data";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { UiTag } from "@/shared/ui/UiTag";
import { useConnectorsRuntime } from "@/features/connectors/hooks/useConnectorsRuntime";
import { useConnectorImport } from "@/features/connectors/hooks/useConnectorImport";
import { connectorFiles, filterConnectors, toolsForConnector, unassignedConnectorTools } from "@/features/connectors/lib/connectorCatalog";
import { ConnectorConfigEditor } from "./ConnectorConfigEditor";
import { ConnectorOverview, ConnectorTools } from "./ConnectorOverview";
import { ConnectorImportModal } from "./ConnectorImportModal";
import styles from "./ConnectorsConsole.module.css";

export interface ConnectorsConsoleProps {
  routeId: string;
  onRouteIdChange: (id: string) => void;
}

export function ConnectorsConsole({ routeId, onRouteIdChange }: ConnectorsConsoleProps) {
  const { t } = useI18n();
  const runtime = useConnectorsRuntime(routeId, onRouteIdChange);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ConnectorType | "all">("all");
  const [view, setView] = useState<"overview" | "config">("overview");
  const [showUnassigned, setShowUnassigned] = useState(false);
  const importer = useConnectorImport({
    onImport: runtime.importArchive,
    onImported: () => {
      setSearch("");
      setFilter("all");
      setView("overview");
      setShowUnassigned(false);
    },
  });
  const busy = runtime.saving || runtime.importing;
  const items = filterConnectors(runtime.items, search, filter);
  const selected = runtime.selected;
  const tools = selected ? toolsForConnector(runtime.tools, selected) : [];
  const unassigned = unassignedConnectorTools(runtime.tools, runtime.items);

  return <div className={`management-page-console ${styles.console}`}>
    <ConnectorImportModal runtime={importer} />
    {importer.message && <p role="status" className={styles.notice}>{importer.message}</p>}
    {runtime.catalogError && <div role="alert" className={styles.error}>{runtime.catalogError}<UiButton size="sm" variant="ghost" onClick={() => void runtime.refreshCatalog()}>{t("connectors.action.retry")}</UiButton></div>}
    <div className={styles.body}>
      <aside className={styles.list} aria-label={t("connectors.list.label")}>
        <div className={styles.toolbar}>
          <h2>{t("settingsMenu.connectors")}</h2>
          <UiButton size="sm" variant="primary" disabled={busy || runtime.detailLoading} onClick={importer.show}><MaterialIcon name="folder_zip" />{t("connectors.import.action")}</UiButton>
          <UiButton size="sm" variant="ghost" iconOnly aria-label={t("connectors.action.refresh")} disabled={runtime.loading || busy} onClick={() => void runtime.refreshCatalog()}><MaterialIcon name="refresh" /></UiButton>
        </div>
        <Input aria-label={t("connectors.search")} placeholder={t("connectors.search")} value={search} onChange={event => setSearch(event.target.value)} prefix={<MaterialIcon name="search" />} />
        <div className={styles.filters} aria-label={t("connectors.filter.label")}>
          {(["all", "cli", "mcp"] as const).map(type => <button type="button" key={type} aria-pressed={filter === type} onClick={() => setFilter(type)}>{type === "all" ? t("connectors.filter.all") : type.toUpperCase()}</button>)}
        </div>
        <p className={styles.hint}>{t("connectors.list.count", { count: runtime.items.length })}</p>
        <div className={styles.listScroll}>
          <Spin spinning={runtime.loading}>
            {items.map(item => <button type="button" className={styles.listItem} aria-current={!showUnassigned && selected?.id === item.id ? "true" : undefined} disabled={busy} key={item.id} onClick={() => { setShowUnassigned(false); runtime.selectConnector(item.id); }}>
              <strong>{item.name}</strong><code>{item.id}</code>
              {item.description && <span className={styles.description}>{item.description}</span>}
              <span className={styles.badges}>
                {item.hasCli && <UiTag>{t("connectors.type.cli")}</UiTag>}{item.hasMcp && <UiTag tone="accent">{t("connectors.type.mcp")}</UiTag>}
                <span className={styles.hint}>{t("connectors.version", { version: item.version })}</span>
                {item.builtin && <UiTag tone="muted">{t("connectors.value.builtin")}</UiTag>}
                {(item.mcp || []).some(server => server.status === "unavailable") && <UiTag tone="danger">{t("connectors.sync.unavailable")}</UiTag>}
              </span>
            </button>)}
            {!items.length && !runtime.loading && <p className={styles.empty}>{t("connectors.list.empty")}</p>}
          </Spin>
        </div>
        {unassigned.length > 0 && <button type="button" className={styles.listItem} aria-current={showUnassigned ? "true" : undefined} onClick={() => setShowUnassigned(true)}>{t("connectors.tools.unassigned", { count: unassigned.length })}</button>}
        <p className={styles.hint}>{t("connectors.hint.installed")}</p>
      </aside>
      <section className={styles.detail}>
        {showUnassigned ? <><h2>{t("connectors.tools.unassigned", { count: unassigned.length })}</h2><p className={styles.hint}>{t("connectors.tools.unassignedHint")}</p><ConnectorTools tools={unassigned} /></> : !selected ? <p className={styles.empty}>{routeId && !runtime.loading ? t("connectors.detail.notFound", { id: routeId }) : t("connectors.detail.empty")}</p> : <>
          <header className={styles.header}>
            <div><h2>{selected.name}</h2><code>{selected.id}</code>{selected.description && <p>{selected.description}</p>}</div>
            <div className={styles.badges}>{selected.hasCli && <UiTag>{t("connectors.type.cli")}</UiTag>}{selected.hasMcp && <UiTag tone="accent">{t("connectors.type.mcp")}</UiTag>}<UiTag>{t("connectors.version", { version: selected.version })}</UiTag></div>
          </header>
          <nav className={styles.tabs} aria-label={t("connectors.section.label")}>
            {(["overview", "config"] as const).map(tab => <button type="button" aria-current={view === tab ? "page" : undefined} onClick={() => setView(tab)} key={tab}>{t(`connectors.section.${tab}`)}{tab === "config" && runtime.dirty ? " •" : ""}</button>)}
          </nav>
          {view === "overview" ? <ConnectorOverview item={selected} tools={tools} /> : <>
            {runtime.readOnly && <p className={styles.notice}>{t("connectors.hint.readOnly")}</p>}
            <div className={styles.files} aria-label={t("connectors.field.file")}>
              {connectorFiles(selected).map(file => <button type="button" key={file} disabled={busy} aria-pressed={runtime.file === file} onClick={() => runtime.selectFile(file)}>{file}</button>)}
            </div>
            {runtime.error && <div className={styles.error} role="alert">{runtime.error}</div>}
            {runtime.message && <p className={styles.notice} role="status">{runtime.message}</p>}
            <Spin spinning={runtime.detailLoading}>
              {runtime.detail && runtime.detail.id === selected.id && runtime.detail.file === runtime.file && <ConnectorConfigEditor key={`${selected.id}/${runtime.file}`} file={runtime.file} draft={runtime.draft} disabled={busy} readOnly={runtime.readOnly} onChange={runtime.updateDraft} />}
            </Spin>
            <footer className={styles.actions}>
              {!runtime.readOnly && <UiButton variant="primary" size="sm" loading={runtime.saving} disabled={busy || !runtime.dirty || runtime.detailLoading || !runtime.detail?.sha256} onClick={() => void runtime.save()}>{t("connectors.action.save")}</UiButton>}
              <UiButton variant="ghost" size="sm" disabled={busy || runtime.detailLoading} onClick={runtime.reload}>{t("connectors.action.reload")}</UiButton>
              {runtime.dirty && <span className={styles.hint}>{t("connectors.config.dirty")}</span>}
            </footer>
          </>}
        </>}
      </section>
    </div>
  </div>;
}
