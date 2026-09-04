import type { AdminRegistryDetailResponse, AdminToolSummary } from "@/shared/data";
import {
  McpFormSection,
  MCP_SERVER_FORM_SECTION_IDS,
  type McpServerFormSectionId,
} from "@/features/registries/components/McpServerFormFields";
import { McpAssignedToolsPanel } from "@/features/registries/components/McpToolOwnershipPanel";
import {
  readMcpSyncDiagnostic,
  readMcpToolSyncStatus,
  summaryLine,
  summaryNumber,
} from "@/features/registries/lib/mcpServerConsole";
import { registryText } from "@/features/registries/lib/mcpRegistry";
import { useI18n } from "@/shared/i18n";
import { UiTag } from "@/shared/ui/UiTag";
import { formatEpochMillisLocal } from "@/shared/utils/platformTime";

const SECTION_CLASS_NAME =
  "automation-request-box tw:mt-3.5 tw:rounded-control tw:border tw:border-line-soft tw:p-3 tw:[&_legend]:px-1.5 tw:[&_legend]:text-[11px] tw:[&_legend]:font-bold tw:[&_legend]:text-ink-muted";

export function McpServerStatusOverview({
  activeSectionId,
  detail,
  resolvedEndpoint,
  selectedTools,
  toolSearchText,
  visibleSelectedTools,
  onToolSearchChange,
}: {
  activeSectionId: McpServerFormSectionId;
  detail: AdminRegistryDetailResponse;
  resolvedEndpoint: string;
  selectedTools: AdminToolSummary[];
  toolSearchText: string;
  visibleSelectedTools: AdminToolSummary[];
  onToolSearchChange: (value: string) => void;
}) {
  const { locale, t } = useI18n();
  const expectedToolCount = summaryNumber(detail.summary, "toolCount");
  const syncStatus = readMcpToolSyncStatus(detail.summary);
  const syncDiagnostic = readMcpSyncDiagnostic(detail.summary);
  const lastSyncAttemptAt = summaryNumber(detail.summary, "lastSyncAttemptAt");
  const lastSyncSuccessAt = summaryNumber(detail.summary, "lastSyncSuccessAt");

  return (
    <>
      <McpFormSection
        active={activeSectionId === MCP_SERVER_FORM_SECTION_IDS[3]}
        id={MCP_SERVER_FORM_SECTION_IDS[3]}
        icon="assignment"
        title={t("mcpServers.section.overview")}
      >
        <div className="registry-meta-grid tw:mb-3 tw:grid tw:grid-cols-2 tw:gap-2 tw:text-[11px] tw:text-ink-muted tw:max-[860px]:grid-cols-1 tw:[&>span]:min-w-0 tw:[&>span]:[overflow-wrap:anywhere]">
          <span>
            {t("mcpServers.field.baseUrl")}: {resolvedEndpoint || registryText(detail.summary?.baseUrl) || "--"}
          </span>
          <span>{t("mcpServers.field.file")}: {detail.file}</span>
          <span>
            {t("mcpServers.field.updatedAt")}: {formatEpochMillisLocal(detail.updatedAt, locale)}
          </span>
          <span>
            {t("mcpServers.field.toolSync")}: {t(`mcpServers.syncStatus.${syncStatus}`)} · {selectedTools.length}
            {expectedToolCount === undefined ? "" : ` / ${expectedToolCount}`}
          </span>
          {lastSyncAttemptAt !== undefined ? (
            <span>
              {t("mcpServers.field.lastSyncAttempt")}: {formatEpochMillisLocal(lastSyncAttemptAt, locale)}
            </span>
          ) : null}
          {lastSyncSuccessAt !== undefined ? (
            <span>
              {t("mcpServers.field.lastSyncSuccess")}: {formatEpochMillisLocal(lastSyncSuccessAt, locale)}
            </span>
          ) : null}
        </div>
        <fieldset className={SECTION_CLASS_NAME}>
          <legend>{t("mcpServers.section.diagnostics")}</legend>
          {detail.diagnostics?.length ? (
            detail.diagnostics.map((diagnostic, index) => (
              <div
                className="tw:grid tw:grid-cols-[auto_auto_minmax(0,1fr)] tw:items-center tw:gap-2 tw:py-1.5 tw:text-xs"
                key={`${diagnostic.code}-${index}`}
              >
                <UiTag
                  tone={diagnostic.severity === "error" ? "danger" : "muted"}
                >
                  {diagnostic.severity}
                </UiTag>
                <strong>{diagnostic.code}</strong>
                <span>{diagnostic.message}</span>
              </div>
            ))
          ) : (
            <div className="tw:text-xs tw:text-ink-muted">
              {t("mcpServers.diagnostics.ready")}
            </div>
          )}
        </fieldset>
        <fieldset className={SECTION_CLASS_NAME}>
          <legend>{t("mcpServers.section.summary")}</legend>
          <div className="tw:text-xs tw:text-ink-2">
            {summaryLine(detail.summary) || "--"}
          </div>
        </fieldset>
      </McpFormSection>

      <McpFormSection
        active={activeSectionId === MCP_SERVER_FORM_SECTION_IDS[4]}
        id={MCP_SERVER_FORM_SECTION_IDS[4]}
        icon="bolt"
        title={t("mcpServers.section.toolsCount", {
          count: selectedTools.length,
        })}
      >
        <McpAssignedToolsPanel
          expectedCount={expectedToolCount}
          items={visibleSelectedTools}
          searchText={toolSearchText}
          syncDiagnostic={syncDiagnostic}
          syncStatus={syncStatus}
          total={selectedTools.length}
          onSearchChange={onToolSearchChange}
        />
      </McpFormSection>
    </>
  );
}
