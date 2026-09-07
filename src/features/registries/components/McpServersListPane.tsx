import { Spin } from "antd";
import {
  filterMcpToolsForServer,
  mcpServerItemKey,
  mcpServerKey,
  registryText,
} from "@/features/registries/lib/mcpRegistry";
import {
  mcpServerCardSecondaryKey,
  mcpServerCardTitle,
  readMcpToolSyncStatus,
  resolveMcpServerDisplayStatus,
  statusTone,
  syncStatusTone,
} from "@/features/registries/lib/mcpServerConsole";
import type { AdminRegistryListItem, AdminToolSummary } from "@/shared/data";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { SearchFilterBar } from "@/shared/ui/SearchFilterBar";
import { UiButton } from "@/shared/ui/UiButton";
import { UiTag } from "@/shared/ui/UiTag";

const LIST_CLASS_NAME =
  "automation-console-list tw:flex tw:min-h-0 tw:min-w-0 tw:flex-col tw:gap-2 tw:overflow-hidden tw:max-[860px]:max-h-[360px]";
const TOOLBAR_CLASS_NAME =
  "automation-console-toolbar registry-console-toolbar tw:grid tw:grid-cols-[minmax(0,1fr)_auto_auto] tw:items-center tw:gap-2";
const LIST_ITEM_SHELL_CLASS_NAME =
  "mcp-server-list-item-shell tw:grid tw:w-full tw:min-w-0 tw:grid-cols-[minmax(0,1fr)_auto] tw:items-stretch tw:overflow-hidden tw:rounded-control tw:border tw:border-transparent tw:bg-transparent tw:text-left tw:text-ink-1 tw:transition-colors tw:hover:[border-color:color-mix(in_srgb,var(--accent-soft)_58%,var(--line-soft))] tw:hover:bg-bg-hover tw:focus-visible:[border-color:color-mix(in_srgb,var(--accent-soft)_58%,var(--line-soft))] tw:focus-visible:outline-none tw:[&.is-active]:[border-color:color-mix(in_srgb,var(--accent-soft)_58%,var(--line-soft))] tw:[&.is-active]:bg-bg-hover";
const LIST_ITEM_CLASS_NAME =
  "automation-list-item tw:flex tw:w-full tw:min-w-0 tw:flex-col tw:gap-[3px] tw:rounded-control tw:border tw:border-transparent tw:bg-transparent tw:px-2.5 tw:py-2 tw:text-left tw:text-ink-1 tw:hover:[border-color:color-mix(in_srgb,var(--accent-soft)_58%,var(--line-soft))] tw:hover:bg-bg-hover tw:[&.is-active]:[border-color:color-mix(in_srgb,var(--accent-soft)_58%,var(--line-soft))] tw:[&.is-active]:bg-bg-hover";
const TITLE_CLASS_NAME =
  "automation-list-item-title tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-[13px] tw:font-bold";
const META_CLASS_NAME =
  "registry-list-meta-text tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-[11px] tw:text-ink-muted";

export interface McpServersListPaneProps {
  deleting: boolean;
  filteredItems: AdminRegistryListItem[];
  items: AdminRegistryListItem[];
  loading: boolean;
  mcpTools: AdminToolSummary[];
  searchText: string;
  selectedItemKey: string;
  showUnassigned: boolean;
  unassignedCount: number;
  onRefresh: () => void;
  onSearchChange: (value: string) => void;
  onSelect: (item: AdminRegistryListItem) => void;
  onSelectUnassigned: () => void;
  onStartNew: () => void;
  saving: boolean;
}

export function McpServersListPane(props: McpServersListPaneProps) {
  const { t } = useI18n();
  return (
    <section className={LIST_CLASS_NAME} aria-label={t("mcpServers.list.ariaLabel")}>
      <div className={TOOLBAR_CLASS_NAME}>
        <SearchFilterBar
          searchText={props.searchText}
          onSearchChange={props.onSearchChange}
          searchPlaceholder={t("mcpServers.searchPlaceholder")}
          filters={[]}
        />
        <UiButton
          size="sm"
          variant="ghost"
          iconOnly
          aria-label={t("mcpServers.action.refresh")}
          disabled={props.loading || props.saving || props.deleting}
          onClick={props.onRefresh}
        >
          <MaterialIcon name="refresh" />
        </UiButton>
        <UiButton
          size="sm"
          variant="primary"
          iconOnly
          aria-label={t("mcpServers.action.new")}
          disabled={props.deleting}
          onClick={props.onStartNew}
        >
          <MaterialIcon name="add" />
        </UiButton>
      </div>
      <div className="automation-console-count tw:text-xs tw:text-ink-muted">
        {t("mcpServers.list.count", { count: props.items.length })}
      </div>
      <div className="automation-console-list-scroll tw:min-h-0 tw:flex-auto tw:overflow-auto tw:pr-0.5">
        <Spin spinning={props.loading}>
          {props.filteredItems.length === 0 ? (
            <div className="command-empty-state">
              {t("mcpServers.list.empty")}
              <UiButton size="sm" variant="primary" onClick={props.onStartNew}>
                {t("mcpServers.action.create")}
              </UiButton>
            </div>
          ) : (
            <div className="automation-list-items tw:flex tw:flex-col tw:gap-1.5">
              {props.filteredItems.map((item) => {
                const itemKey = mcpServerItemKey(item);
                const serverKey = mcpServerKey(item);
                const secondaryServerKey = mcpServerCardSecondaryKey(item);
                const displayStatus = resolveMcpServerDisplayStatus(
                  item.status,
                  readMcpToolSyncStatus(item.summary),
                );
                return (
                  <button
                    type="button"
                    className={`${LIST_ITEM_SHELL_CLASS_NAME} ${!props.showUnassigned && props.selectedItemKey === itemKey ? "is-active" : ""}`}
                    key={itemKey}
                    onClick={() => props.onSelect(item)}
                  >
                    <span className="tw:flex tw:min-w-0 tw:flex-col tw:gap-[3px] tw:px-2.5 tw:py-2">
                      <strong className={TITLE_CLASS_NAME}>
                        {mcpServerCardTitle(item)}
                      </strong>
                      {secondaryServerKey ? (
                        <span className={META_CLASS_NAME}>{secondaryServerKey}</span>
                      ) : null}
                      <span className={META_CLASS_NAME}>
                        {registryText(item.summary?.baseUrl) || "--"}
                      </span>
                    </span>
                    <span className="mcp-server-list-item-aside tw:flex tw:min-w-[72px] tw:flex-col tw:items-end tw:justify-between tw:gap-2 tw:py-2 tw:pr-2">
                      <UiTag
                        tone={
                          displayStatus.kind === "sync"
                            ? syncStatusTone(displayStatus.status)
                            : statusTone(displayStatus.status)
                        }
                      >
                        {displayStatus.kind === "sync"
                          ? t(`mcpServers.syncStatus.${displayStatus.status}`)
                          : t(`registryConsole.status.${displayStatus.status}`)}
                      </UiTag>
                      <span className="mcp-server-list-item-tools tw:whitespace-nowrap tw:text-[11px] tw:text-ink-muted">
                        {t("mcpServers.tools.count", {
                          count: filterMcpToolsForServer(
                            props.mcpTools,
                            serverKey,
                          ).length,
                        })}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Spin>
      </div>
      <div className="mcp-unassigned-entry tw:mt-1 tw:border-t tw:border-line-soft tw:pt-2">
        <button
          type="button"
          className={`${LIST_ITEM_CLASS_NAME} ${props.showUnassigned ? "is-active" : ""}`}
          onClick={props.onSelectUnassigned}
        >
          <span className="automation-list-item-head tw:flex tw:min-w-0 tw:items-center tw:justify-between tw:gap-2">
            <strong className={TITLE_CLASS_NAME}>
              {t("mcpServers.unassigned.title")}
            </strong>
            <UiTag tone={props.unassignedCount > 0 ? "danger" : "muted"}>
              {props.unassignedCount}
            </UiTag>
          </span>
          <span className={META_CLASS_NAME}>
            {t("mcpServers.unassigned.subtitle")}
          </span>
        </button>
      </div>
    </section>
  );
}
