import { useCallback, useState } from "react";
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
import { ConnectorAuthPanel } from "./ConnectorAuthPanel";
import { supportsConnectorLogin } from "../lib/connectorAuth";
import type { ConnectorAuthViewStatus } from "../lib/connectorAuth";
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
  const [showUnassigned, setShowUnassigned] = useState(false);
  const [authStatuses, setAuthStatuses] = useState<Record<string, ConnectorAuthViewStatus>>({});
  const onAuthStatusChange = useCallback((id: string, status: ConnectorAuthViewStatus) => {
    setAuthStatuses(previous => previous[id] === status ? previous : { ...previous, [id]: status });
  }, []);
  const importer = useConnectorImport({
    onImport: runtime.importArchive,
    onImported: () => {
      setSearch("");
      setFilter("all");
      setShowUnassigned(false);
    },
  });
  const busy = runtime.saving || runtime.importing;
  const items = filterConnectors(runtime.items, search, filter);
  const selected = runtime.selected;
  const view = runtime.file === "connector.json" ? "overview" : "config";
  const componentFiles = selected ? connectorFiles(selected).filter(file => file !== "connector.json") : [];
  const selectConfig = () => {
    const next = componentFiles.find(file => file === runtime.file) || componentFiles[0];
    if (next) runtime.selectFile(next);
  };
  const tools = selected ? toolsForConnector(runtime.tools, selected) : [];
  const unassigned = unassignedConnectorTools(runtime.tools, runtime.items);

  return <div className={`management-page-console ${styles.console}`}>
    <ConnectorImportModal runtime={importer} />
    {importer.message && <p role="status" className={styles.notice}>{importer.message}</p>}
    {runtime.catalogError && <div role="alert" className={styles.error}>{runtime.catalogErrorStatus === 401 ? t("connectors.auth.error.401") : runtime.catalogError}<UiButton size="sm" variant="ghost" onClick={() => void runtime.refreshCatalog()}>{t("connectors.action.retry")}</UiButton></div>}
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
        <p className={styles.hint}>{runtime.catalogError && !runtime.items.length ? t("connectors.list.unavailable") : t("connectors.list.count", { count: runtime.items.length })}</p>
        <div className={styles.listScroll}>
          <Spin spinning={runtime.loading}>
            {items.map(item => <button type="button" className={styles.listItem} aria-current={!showUnassigned && selected?.id === item.id ? "true" : undefined} disabled={busy} key={item.id} onClick={() => { setShowUnassigned(false); runtime.selectConnector(item.id); }}>
              <strong>{item.name}</strong><code>{item.id}</code>
              {item.description && <span className={styles.description}>{item.description}</span>}
              <span className={styles.badges}>
                {item.hasCli && <UiTag>{t("connectors.type.cli")}</UiTag>}{item.hasMcp && <UiTag tone="accent">{t("connectors.type.mcp")}</UiTag>}
                <span className={styles.hint}>{t("connectors.version", { version: item.version })}</span>
                {item.builtin && <UiTag tone="muted">{t("connectors.value.builtin")}</UiTag>}
                {supportsConnectorLogin(item.auth_mode) && authStatuses[item.id] && <UiTag tone={authStatuses[item.id] === "authorized" ? "accent" : "muted"}>{t(`connectors.auth.status.${authStatuses[item.id]}`)}</UiTag>}
                {(item.mcp || []).some(server => server.status === "unavailable") && <UiTag tone="danger">{t("connectors.sync.unavailable")}</UiTag>}
              </span>
            </button>)}
            {!items.length && !runtime.loading && !runtime.catalogError && <p className={styles.empty}>{t("connectors.list.empty")}</p>}
          </Spin>
        </div>
        {unassigned.length > 0 && <button type="button" className={styles.listItem} aria-current={showUnassigned ? "true" : undefined} onClick={() => setShowUnassigned(true)}>{t("connectors.tools.unassigned", { count: unassigned.length })}</button>}
        <p className={styles.hint}>{t("connectors.hint.installed")}</p>
      </aside>
      <section className={styles.detail}>
        {showUnassigned ? <><h2>{t("connectors.tools.unassigned", { count: unassigned.length })}</h2><p className={styles.hint}>{runtime.catalogError ? t("connectors.list.unavailable") : t("connectors.tools.unassignedHint")}</p><ConnectorTools tools={unassigned} /></> : !selected ? <p className={styles.empty}>{runtime.catalogError ? t("connectors.list.unavailable") : routeId && !runtime.loading ? t("connectors.detail.notFound", { id: routeId }) : t("connectors.detail.empty")}</p> : <>
          <nav className={styles.tabs} aria-label={t("connectors.section.label")}>
            <button type="button" aria-current={view === "overview" ? "page" : undefined} disabled={busy} onClick={() => runtime.selectFile("connector.json")}>{t("connectors.section.overview")}{view === "overview" && runtime.dirty ? " •" : ""}</button>
            {componentFiles.length > 0 && <button type="button" aria-current={view === "config" ? "page" : undefined} disabled={busy} onClick={selectConfig}>{t("connectors.section.config")}{view === "config" && runtime.dirty ? " •" : ""}</button>}
          </nav>
          {view === "overview" && <ConnectorAuthPanel key={`${selected.id}/${selected.auth_mode}`} item={selected} disabled={busy} onConfigure={selectConfig} onStatusChange={onAuthStatusChange} onCredentialsChange={() => void runtime.refreshCatalog()} />}
          <section className={view === "overview" ? styles.card : styles.stack} aria-label={t(view === "overview" ? "connectors.section.basics" : "connectors.section.config")}>
            {runtime.readOnly && <p className={styles.notice}>{t("connectors.hint.readOnly")}</p>}
            {view === "config" && componentFiles.length > 1 && <div className={styles.files} aria-label={t("connectors.field.file")}>
              {componentFiles.map(file => <button type="button" key={file} disabled={busy} aria-pressed={runtime.file === file} onClick={() => runtime.selectFile(file)}>{file}</button>)}
            </div>}
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
          </section>
          {view === "overview" && <ConnectorOverview item={selected} tools={tools} />}
        </>}
      </section>
    </div>
  </div>;
}
