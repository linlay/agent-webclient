import type { AdminToolSummary } from "@/shared/data";
import {
  readToolMcpServerKey,
  type UnassignedMcpTool,
} from "@/features/registries/lib/mcpRegistry";
import type { McpToolSyncStatus } from "@/features/registries/lib/mcpServerConsole";
import { useI18n } from "@/shared/i18n";
import { SearchFilterBar } from "@/shared/ui/SearchFilterBar";
import { UiTag } from "@/shared/ui/UiTag";

const TOOL_ROW_CLASS_NAME =
  "mcp-tool-row tw:rounded-[var(--radius-sm)] tw:border tw:border-line-soft tw:bg-bg-base tw:px-2.5 tw:py-2.5";
const MESSAGE_CLASS_NAME =
  "registry-console-message tw:rounded-control tw:border tw:border-line-soft tw:bg-bg-hover tw:px-2.5 tw:py-2 tw:text-xs tw:text-ink-1";
const ERROR_CLASS_NAME =
  "automation-console-error tw:flex tw:items-center tw:justify-between tw:gap-3 tw:rounded-control tw:border tw:px-2.5 tw:py-2 tw:text-xs tw:text-accent-danger tw:[border-color:color-mix(in_srgb,var(--accent-danger)_42%,var(--line-soft))]";

export function McpToolRow({
  tool,
  unassigned,
}: {
  tool: AdminToolSummary;
  unassigned?: UnassignedMcpTool;
}) {
  const { t } = useI18n();
  return (
    <div className={TOOL_ROW_CLASS_NAME}>
      <div className="tw:flex tw:min-w-0 tw:items-start tw:justify-between tw:gap-2.5">
        <div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-0.5 tw:[&>strong]:[overflow-wrap:anywhere] tw:[&>strong]:text-xs tw:[&>span]:[overflow-wrap:anywhere] tw:[&>span]:text-[11px] tw:[&>span]:text-ink-muted">
          <strong>{tool.name || tool.label || tool.key || "--"}</strong>
          <span>{tool.key || "--"}</span>
        </div>
        <div className="tw:flex tw:flex-wrap tw:items-center tw:justify-end tw:gap-1.5">
          {tool.kind ? <UiTag tone="muted">{tool.kind}</UiTag> : null}
          {unassigned ? (
            <UiTag tone="danger">
              {t(`mcpServers.unassigned.reason.${unassigned.reason}`)}
            </UiTag>
          ) : null}
        </div>
      </div>
      {tool.description ? (
        <p className="tw:mb-0 tw:mt-1.5 tw:[overflow-wrap:anywhere] tw:text-[11px] tw:leading-[1.45] tw:text-ink-muted">
          {tool.description}
        </p>
      ) : null}
      {unassigned?.reason === "unknown-server-key" ? (
        <p className="tw:mb-0 tw:mt-1.5 tw:[overflow-wrap:anywhere] tw:text-[11px] tw:leading-[1.45] tw:text-ink-muted">
          {t("mcpServers.unassigned.serverKey", {
            serverKey: readToolMcpServerKey(tool),
          })}
        </p>
      ) : null}
    </div>
  );
}

export function McpUnassignedToolsPanel({
  items,
  searchText,
  total,
  onSearchChange,
}: {
  items: UnassignedMcpTool[];
  searchText: string;
  total: number;
  onSearchChange: (value: string) => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <div className="automation-detail-head tw:mb-3.5 tw:flex tw:items-start tw:justify-between tw:gap-3 tw:[&>div:first-child]:flex tw:[&>div:first-child]:min-w-0 tw:[&>div:first-child]:flex-col tw:[&>div:first-child]:gap-1 tw:[&_strong]:text-sm tw:[&_span]:[overflow-wrap:anywhere] tw:[&_span]:text-[11px] tw:[&_span]:text-ink-muted">
        <div>
          <strong>{t("mcpServers.unassigned.title")}</strong>
          <span>{t("mcpServers.unassigned.detail")}</span>
        </div>
        <UiTag tone={total > 0 ? "danger" : "muted"}>{total}</UiTag>
      </div>
      <SearchFilterBar
        searchText={searchText}
        onSearchChange={onSearchChange}
        searchPlaceholder={t("mcpServers.tools.searchPlaceholder")}
        filters={[]}
      />
      <div className="tw:mt-3">
        {items.length > 0 ? (
          <div className="mcp-tool-list tw:flex tw:flex-col tw:gap-2">
            {items.map((item) => (
              <McpToolRow
                key={item.tool.key || item.tool.name}
                tool={item.tool}
                unassigned={item}
              />
            ))}
          </div>
        ) : (
          <div className="command-empty-state">
            {t("mcpServers.unassigned.empty")}
          </div>
        )}
      </div>
    </>
  );
}

export function McpAssignedToolsPanel({
  expectedCount,
  items,
  searchText,
  syncDiagnostic,
  syncStatus,
  total,
  onSearchChange,
}: {
  expectedCount?: number;
  items: AdminToolSummary[];
  searchText: string;
  syncDiagnostic: { code: string; message: string } | null;
  syncStatus: McpToolSyncStatus;
  total: number;
  onSearchChange: (value: string) => void;
}) {
  const { t } = useI18n();
  return (
    <>
      {syncStatus === "pending" || syncStatus === "syncing" ? (
        <div className={`${MESSAGE_CLASS_NAME} tw:mb-3`}>
          {t("mcpServers.tools.syncing")}
        </div>
      ) : null}
      {syncStatus === "unavailable" ? (
        <div className={`${ERROR_CLASS_NAME} tw:mb-3`}>
          <span>
            {syncDiagnostic
              ? `${syncDiagnostic.code}: ${syncDiagnostic.message}`
              : t("mcpServers.tools.unavailable")}
            {total > 0
              ? ` · ${t("mcpServers.tools.lastKnownSnapshot")}`
              : ""}
          </span>
        </div>
      ) : null}
      <SearchFilterBar
        searchText={searchText}
        onSearchChange={onSearchChange}
        searchPlaceholder={t("mcpServers.tools.searchPlaceholder")}
        filters={[]}
      />
      <div className="tw:mt-3">
        {items.length > 0 ? (
          <div className="mcp-tool-list tw:flex tw:flex-col tw:gap-2">
            {items.map((tool) => (
              <McpToolRow key={tool.key || tool.name} tool={tool} />
            ))}
          </div>
        ) : (
          <div className="command-empty-state">
            {syncStatus === "pending" || syncStatus === "syncing"
              ? t("mcpServers.tools.syncing")
              : syncStatus === "unavailable"
                ? t("mcpServers.tools.unavailableEmpty")
                : syncStatus === "disabled"
                  ? t("mcpServers.tools.disabled")
                  : expectedCount && expectedCount > 0
                    ? t("mcpServers.tools.emptyMissingAssignment")
                    : t("mcpServers.tools.emptyReady")}
          </div>
        )}
      </div>
    </>
  );
}
