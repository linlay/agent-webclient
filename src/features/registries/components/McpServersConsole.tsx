import { useMemo, useRef, useState } from "react";
import { McpServerEditorPane } from "@/features/registries/components/McpServerEditorPane";
import { McpServersListPane } from "@/features/registries/components/McpServersListPane";
import { useMcpCatalogRuntime } from "@/features/registries/hooks/useMcpCatalogRuntime";
import { useMcpServerEditorRuntime } from "@/features/registries/hooks/useMcpServerEditorRuntime";
import {
  collectUnassignedMcpTools,
  filterMcpServerItems,
  filterMcpToolsBySearch,
  filterMcpToolsForServer,
  isMcpTool,
  mcpServerKey,
} from "@/features/registries/lib/mcpRegistry";
import { useI18n } from "@/shared/i18n";
import { UiButton } from "@/shared/ui/UiButton";
import "./RegistryConsole.module.css";

const CONSOLE_CLASS_NAME =
  "management-page-console automation-console registry-console mcp-servers-console tw:overflow-hidden";
const BODY_CLASS_NAME =
  "automation-console-body tw:grid tw:min-h-0 tw:flex-auto tw:gap-4 tw:overflow-hidden tw:max-[860px]:overflow-auto";
const ERROR_CLASS_NAME =
  "automation-console-error tw:flex tw:items-center tw:justify-between tw:gap-3 tw:rounded-control tw:border tw:px-2.5 tw:py-2 tw:text-xs tw:text-accent-danger tw:[border-color:color-mix(in_srgb,var(--accent-danger)_42%,var(--line-soft))]";
const MESSAGE_CLASS_NAME =
  "registry-console-message tw:rounded-control tw:border tw:border-line-soft tw:bg-bg-hover tw:px-2.5 tw:py-2 tw:text-xs tw:text-ink-1";

export interface McpServersConsoleProps {
  routeServerKey: string;
  onRouteServerKeyChange: (serverKey: string) => void;
}

export function McpServersConsole({
  routeServerKey,
  onRouteServerKeyChange,
}: McpServersConsoleProps) {
  const { t } = useI18n();
  const refreshBlockedRef = useRef(false);
  const catalog = useMcpCatalogRuntime({ refreshBlockedRef });
  const editor = useMcpServerEditorRuntime({
    catalog,
    onRouteServerKeyChange,
    routeServerKey,
  });
  const [searchText, setSearchText] = useState("");
  refreshBlockedRef.current =
    catalog.loading || editor.detailLoading || editor.saving || editor.deleting;

  const mcpTools = useMemo(
    () => catalog.tools.filter(isMcpTool),
    [catalog.tools],
  );
  const filteredItems = useMemo(
    () => filterMcpServerItems(catalog.items, searchText),
    [catalog.items, searchText],
  );
  const unassignedTools = useMemo(
    () => collectUnassignedMcpTools(mcpTools, catalog.items),
    [catalog.items, mcpTools],
  );
  const selectedServerKey = editor.detail
    ? mcpServerKey(editor.detail)
    : "";
  const selectedTools = useMemo(
    () => filterMcpToolsForServer(mcpTools, selectedServerKey),
    [mcpTools, selectedServerKey],
  );
  const visibleSelectedTools = useMemo(
    () => filterMcpToolsBySearch(selectedTools, editor.toolSearchText),
    [editor.toolSearchText, selectedTools],
  );
  const visibleUnassignedTools = useMemo(() => {
    const visibleKeys = new Set(
      filterMcpToolsBySearch(
        unassignedTools.map((item) => item.tool),
        editor.toolSearchText,
      ).map((tool) => tool.key),
    );
    return unassignedTools.filter((item) => visibleKeys.has(item.tool.key));
  }, [editor.toolSearchText, unassignedTools]);
  const error = editor.error || catalog.error;

  return (
    <div className={CONSOLE_CLASS_NAME}>
      {error ? (
        <div className={ERROR_CLASS_NAME}>
          <span>{error}</span>
          <UiButton size="sm" variant="ghost" onClick={editor.refreshPage}>
            {t("mcpServers.action.retry")}
          </UiButton>
        </div>
      ) : null}
      {editor.message && !error ? (
        <div className={MESSAGE_CLASS_NAME}>{editor.message}</div>
      ) : null}
      <div className={BODY_CLASS_NAME}>
        <McpServersListPane
          deleting={editor.deleting}
          filteredItems={filteredItems}
          items={catalog.items}
          loading={catalog.loading}
          mcpTools={mcpTools}
          saving={editor.saving}
          searchText={searchText}
          selectedItemKey={editor.selectedItemKey}
          showUnassigned={editor.showUnassigned}
          unassignedCount={unassignedTools.length}
          onRefresh={editor.refreshPage}
          onSearchChange={setSearchText}
          onSelect={editor.selectServer}
          onSelectUnassigned={editor.selectUnassigned}
          onStartNew={editor.startNew}
        />
        <McpServerEditorPane
          routeServerKey={routeServerKey}
          runtime={editor}
          selectedTools={selectedTools}
          unassignedTools={unassignedTools}
          visibleSelectedTools={visibleSelectedTools}
          visibleUnassignedTools={visibleUnassignedTools}
        />
      </div>
    </div>
  );
}
