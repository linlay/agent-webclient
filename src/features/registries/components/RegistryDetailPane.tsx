import { Spin } from "antd";
import {
  readToolKind,
  readToolSourceCategory,
  readToolSourceType,
  summaryLine,
  toolSourceLabel,
  toolSourceTone,
  translateWithFallback,
} from "@/features/registries/lib/registryConsole";
import type {
  AdminRegistryDetailResponse,
  AdminToolSummary,
} from "@/shared/data";
import { useI18n } from "@/shared/i18n";
import type { ThemeMode } from "@/shared/styles/theme";
import { CodeEditor } from "@/shared/ui/CodeEditor";
import { UiTag } from "@/shared/ui/UiTag";
import { formatEpochMillisLocal } from "@/shared/utils/platformTime";
import styles from "./RegistryConsole.module.css";

const DETAIL_CLASS_NAME =
  "automation-console-detail registry-console-detail tw:min-h-0 tw:min-w-0 tw:overflow-auto";
const DETAIL_HEAD_CLASS_NAME =
  "automation-detail-head tw:mb-3.5 tw:flex tw:items-start tw:justify-between tw:gap-3 tw:[&>div:first-child]:flex tw:[&>div:first-child]:min-w-0 tw:[&>div:first-child]:flex-col tw:[&>div:first-child]:gap-1 tw:[&_strong]:text-sm tw:[&_span]:[overflow-wrap:anywhere] tw:[&_span]:text-[11px] tw:[&_span]:text-ink-muted";
const DETAIL_ACTIONS_CLASS_NAME =
  "automation-detail-actions tw:flex tw:flex-wrap tw:items-center tw:gap-2";
const META_GRID_CLASS_NAME =
  "registry-meta-grid tw:mb-3 tw:grid tw:grid-cols-2 tw:gap-2 tw:text-[11px] tw:text-ink-2 tw:max-[860px]:grid-cols-1 tw:[&>span]:min-w-0 tw:[&>span]:[overflow-wrap:anywhere]";
const REQUEST_BOX_CLASS_NAME =
  "automation-request-box tw:mt-3.5 registry-summary tw:[&>div:last-child]:min-h-[18px] tw:[&>div:last-child]:[overflow-wrap:anywhere] tw:[&>div:last-child]:text-xs tw:[&>div:last-child]:text-ink-2";
const REQUEST_BOX_TITLE_CLASS_NAME =
  "tw:mb-1.5 tw:text-[11px] tw:font-medium tw:text-ink-muted";
const DIAGNOSTICS_CLASS_NAME =
  "automation-request-box tw:mt-3.5 registry-diagnostics tw:bg-[color-mix(in_srgb,var(--accent-danger)_5%,transparent)]";

function formatSize(value: number | undefined): string {
  if (value === undefined || value === null) return "--";
  return value < 1024 ? `${value} B` : `${(value / 1024).toFixed(1)} KB`;
}

export interface RegistryDetailPaneProps {
  detail: AdminRegistryDetailResponse | null;
  detailLoading: boolean;
  dirty?: boolean;
  draft: string;
  isToolsTab: boolean;
  newDraft: boolean;
  saving: boolean;
  selectedTool: AdminToolSummary | null;
  theme: ThemeMode;
  validating?: boolean;
  onDraftChange: (value: string) => void;
  onRefresh?: () => void;
  onSave?: () => void;
  onEditConversation?: () => void;
  onValidate?: () => void;
}

export function RegistryDetailPane({
  detail,
  detailLoading,
  draft,
  isToolsTab,
  newDraft,
  saving,
  selectedTool,
  theme,
  onDraftChange,
}: RegistryDetailPaneProps) {
  const { locale, t } = useI18n();
    const toolKind = selectedTool ? readToolKind(selectedTool) : "";
    const toolSourceType = selectedTool ? readToolSourceType(selectedTool) : "";
    const toolSourceCategory = selectedTool
      ? readToolSourceCategory(selectedTool)
      : "";
    const toolSource = toolSourceLabel(toolSourceCategory, t);

    return (
      <div className={DETAIL_CLASS_NAME}>
        <Spin spinning={detailLoading}>
          {isToolsTab ? (
            !selectedTool ? (
              <div className="command-empty-state">
                {t("registryConsole.tools.detail.empty")}
              </div>
            ) : (
              <>
                <div className={DETAIL_HEAD_CLASS_NAME}>
                  <div>
                    <strong>
                      {selectedTool.name ||
                        selectedTool.label ||
                        selectedTool.key ||
                        "--"}
                    </strong>
                    <span>{selectedTool.key || ""}</span>
                  </div>
                  <div className={DETAIL_ACTIONS_CLASS_NAME}>
                    <UiTag tone={toolSourceTone(toolSourceCategory)}>{toolSource}</UiTag>
                  </div>
                </div>
                <div className={META_GRID_CLASS_NAME}>
                  <span>{t("registryConsole.tools.field.name")}: {selectedTool.name || "--"}</span>
                  <span>{t("registryConsole.tools.field.key")}: {selectedTool.key || "--"}</span>
                  <span>{t("registryConsole.tools.field.kind")}: {toolKind || "--"}</span>
                  <span>{t("registryConsole.tools.field.sourceType")}: {toolSourceType || "--"}</span>
                  <span>{t("registryConsole.tools.field.sourceCategory")}: {toolSource}</span>
                </div>
                {selectedTool.description ? (
                  <div className={REQUEST_BOX_CLASS_NAME}>
                    <div className={REQUEST_BOX_TITLE_CLASS_NAME}>
                      {t("registryConsole.tools.field.description")}
                    </div>
                    <div>{selectedTool.description}</div>
                  </div>
                ) : null}
              </>
            )
          ) : !detail ? (
            <div className="command-empty-state">{t("registryConsole.detail.empty")}</div>
          ) : (
            <>
              <div className={DETAIL_HEAD_CLASS_NAME}>
                <div>
                  <strong>
                    {newDraft
                      ? t("registryConsole.detail.titleCreate")
                      : detail.name || detail.key || detail.file}
                  </strong>
                  <span>{detail.source?.path || `${detail.category}/${detail.file}`}</span>
                </div>
              </div>
              <div className={META_GRID_CLASS_NAME}>
                <span>
                  {t("registryConsole.field.category")}: {translateWithFallback(
                    t,
                    `registryConsole.category.${detail.category}`,
                    detail.category,
                  )}
                </span>
                <span>{t("registryConsole.field.file")}: {detail.file}</span>
                <span>
                  {t("registryConsole.field.updatedAt")}: {formatEpochMillisLocal(
                    detail.updatedAt,
                    locale,
                  )}
                </span>
                <span>{t("registryConsole.field.size")}: {formatSize(detail.size)}</span>
              </div>
              {detail.diagnostics?.length ? (
                <div className={DIAGNOSTICS_CLASS_NAME}>
                  <div className={REQUEST_BOX_TITLE_CLASS_NAME}>
                    {t("registryConsole.section.diagnostics")}
                  </div>
                  {detail.diagnostics.map((item, index) => (
                    <div
                      className="registry-diagnostic-row tw:grid tw:grid-cols-[auto_auto_minmax(0,1fr)] tw:items-center tw:gap-2 tw:py-[5px] tw:text-xs"
                      key={`${item.code}-${index}`}
                    >
                      <UiTag tone={item.severity === "error" ? "danger" : "muted"}>
                        {item.severity}
                      </UiTag>
                      <strong>{item.code}</strong>
                      <span>{item.message}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className={REQUEST_BOX_CLASS_NAME}>
                <div className={REQUEST_BOX_TITLE_CLASS_NAME}>
                  {t("registryConsole.section.summary")}
                </div>
                <div>{summaryLine(detail.summary) || "--"}</div>
              </div>
              <div className="field-group registry-editor-field tw:mt-3.5">
                <span id="registry-yaml-editor-label">{t("registryConsole.editor.label")}</span>
                <div
                  className={styles.yamlEditor}
                  role="group"
                  aria-labelledby="registry-yaml-editor-label"
                >
                  <CodeEditor
                    key={`${detail.category}/${detail.file}`}
                    path={`registry:///${detail.category}/${detail.file}`}
                    language="yaml"
                    theme={theme}
                    value={draft}
                    disabled={saving || detailLoading}
                    onChange={onDraftChange}
                    options={{
                      ariaLabel: t("registryConsole.editor.label"),
                      lineNumbers: "on",
                      lineNumbersMinChars: 3,
                      lineHeight: 20,
                      tabSize: 2,
                      insertSpaces: true,
                      detectIndentation: false,
                      folding: true,
                      guides: { indentation: true, highlightActiveIndentation: true },
                      padding: { top: 12, bottom: 12 },
                    }}
                  />
                </div>
              </div>
            </>
          )}
        </Spin>
      </div>
    );
  }
