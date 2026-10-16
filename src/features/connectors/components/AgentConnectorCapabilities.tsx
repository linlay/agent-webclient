import { useId, useState } from "react";
import { Input, Popover, Spin } from "antd";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import type { useAgentConnectorCapabilities } from "../hooks/useAgentConnectorCapabilities";
import { projectAgentConnectorDraft } from "../lib/agentConnectorCapabilities";
import { connectorsRoutePath } from "../lib/connectorCatalog";
import { filterConnectorOptions, findConnectorSelectionConflict, connectorSelectionConflictNames } from "../lib/connectorSelection";
import { ConnectorIcon } from "./ConnectorIcon";
import { ConnectorTools } from "./ConnectorComponents";
import styles from "./AgentConnectorCapabilities.module.css";

type Props = ReturnType<typeof useAgentConnectorCapabilities> & {
  agentKey?: string;
  selectedIds?: string[];
  savedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  disabled?: boolean;
};
export function AgentConnectorCapabilities({ items, catalog = [], ready, loading, error, refresh, reloadPending,
  agentKey = "", selectedIds = [], savedIds = [], onSelectionChange, disabled = false }: Props) {
  const { t } = useI18n();
  const managerId = useId();
  const [managerOpen, setManagerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectionError, setSelectionError] = useState("");
  const editable = !!onSelectionChange;
  const displayItems = editable ? projectAgentConnectorDraft(agentKey, items, catalog, savedIds, selectedIds) : items;
  const presetIds = items.filter(item => item.preset).map(item => item.id);
  const options = [...catalog, ...displayItems.filter(item => !catalog.some(option => option.id === item.id)
    && (item.preset || savedIds.includes(item.id) || selectedIds.includes(item.id)))];
  const selected = (id: string) => presetIds.includes(id) || selectedIds.includes(id);
  const filteredOptions = filterConnectorOptions(options, search).sort((a, b) => Number(selected(b.id)) - Number(selected(a.id)) || a.name.localeCompare(b.name));
  const changeSelection = (id: string, enabled: boolean) => {
    if (!onSelectionChange || disabled || !ready || presetIds.includes(id)) return;
    const item = options.find(option => option.id === id);
    const conflict = enabled && item ? findConnectorSelectionConflict(item, [...selectedIds, ...presetIds], options) : null;
    if (conflict) {
      setSelectionError(t("composer.addMenu.connectors.selectionConflict", connectorSelectionConflictNames(conflict, options)));
      return;
    }
    setSelectionError("");
    onSelectionChange(enabled ? [...new Set([...selectedIds, id])] : selectedIds.filter(value => value !== id));
  };
  const manager = editable ? <div id={managerId} className={styles.manager} role="group" aria-label={t("agents.connectors.manage")}>
    <Input aria-label={t("agents.connectors.search")} placeholder={t("agents.connectors.search")}
      prefix={<MaterialIcon name="search" />} value={search} onChange={event => setSearch(event.target.value)} />
    <p className={styles.hint}>{t("agents.connectors.editHint")}</p>
    <div className={styles.options}>
      {!filteredOptions.length && <p className={styles.hint}>{t("agents.connectors.noMatches")}</p>}
      {filteredOptions.map(item => <label key={item.id} className={styles.option}>
        <input type="checkbox" checked={selected(item.id)} disabled={disabled || !ready || presetIds.includes(item.id)}
          onChange={event => changeSelection(item.id, event.target.checked)} />
        <ConnectorIcon item={item} size={22} />
        <span className={styles.copy}><strong>{item.name}</strong><span>{item.description || item.id}</span></span>
        {presetIds.includes(item.id) && <span className={styles.meta}><MaterialIcon name="lock" />{t("agentConsole.tools.preset")}</span>}
      </label>)}
    </div>
    {selectionError && <p role="alert" className={styles.hint}>{selectionError}</p>}
    <a href={connectorsRoutePath("", typeof window === "undefined" ? "" : window.location.search)} target="_blank" rel="noopener noreferrer">{t("agents.connectors.openCenter")} ↗</a>
  </div> : null;
  return <section className={styles.section} aria-label={t("agents.connectors.title")}>
    <div className={styles.heading}><h4>{t("agents.connectors.title")}</h4><span>{displayItems.length}</span>
      {editable && <Popover content={manager} open={managerOpen} onOpenChange={open => { setManagerOpen(open); setSelectionError(""); }} trigger="click" placement="bottomRight">
        <UiButton className={styles.manage} size="sm" variant="ghost" disabled={disabled || !ready}
          aria-expanded={managerOpen} aria-controls={managerId}><MaterialIcon name="tune" />{t("agents.connectors.manage")}</UiButton>
      </Popover>}
    </div>
    <p className={styles.hint}>{t(editable ? "agents.connectors.editHint" : "agents.connectors.hint")}</p>
    {loading && <div role="status"><Spin size="small" /></div>}
    {error && <div role="alert" className={styles.heading}>
      <span>{t("agents.connectors.loadFailed")}</span>
      <UiButton size="sm" variant="ghost" disabled={loading} onClick={() => void refresh(true)}>{t("connectors.action.retry")}</UiButton>
    </div>}
    {reloadPending && <p role="status" className={styles.hint}>{t("agents.connectors.pending")}</p>}
    {!displayItems.length && !loading && !error && <div className={styles.heading}><p className={styles.hint}>{t("agents.connectors.empty")}</p>
      {editable && <UiButton size="sm" variant="ghost" disabled={disabled || !ready} onClick={() => setManagerOpen(true)}><MaterialIcon name="add" />{t("agents.connectors.add")}</UiButton>}
    </div>}
    {selectionError && !managerOpen && <p role="alert" className={styles.hint}>{selectionError}</p>}
    <div className={styles.list}>{displayItems.map(item => <div key={item.id} className={styles.card}>
      <details className={styles.details}>
      <summary className={`${styles.summary} ${editable && !item.preset && (selectedIds.includes(item.id) || item.draftChange === "remove") ? styles.withAction : ""}`}>
        <ConnectorIcon item={item} size={22} />
        <span className={styles.copy}><strong>{item.name}</strong><span>{item.description || item.id}</span></span>
        <span className={styles.meta}>
          {item.preset && <span><MaterialIcon name="lock" />{t("agentConsole.tools.preset")}</span>}
          {item.draftChange && <span>{t(item.draftChange === "add" ? "agents.connectors.draftAdded" : "agents.connectors.draftRemoved")}</span>}
          <span>{t(item.pendingRemoval ? "agents.connectors.pendingRemoval" : item.active ? "agents.connectors.active" : "agents.connectors.inactive")}</span>
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
    </details>
    {editable && !item.preset && (selectedIds.includes(item.id) || item.draftChange === "remove") &&
      <UiButton className={styles.remove} size="sm" variant="ghost" disabled={disabled || !ready}
        aria-label={t(item.draftChange === "remove" ? "agents.connectors.restoreNamed" : "agents.connectors.removeNamed", { name: item.name })}
        onClick={() => changeSelection(item.id, item.draftChange === "remove")}>
        {t(item.draftChange === "remove" ? "agents.connectors.restore" : "agents.connectors.remove")}
      </UiButton>}
    </div>)}</div>
  </section>;
}
