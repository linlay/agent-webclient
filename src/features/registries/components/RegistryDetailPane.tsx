import { EditMenuButton, focusEditableField } from "@/shared/ui/EditMenuButton";
import { useRef } from "react";
import { Spin } from "antd";
import {
  readToolKind,
  readToolSourceCategory,
  readToolSourceType,
  registryStatusTone,
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
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
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
  "automation-request-box tw:mt-3.5 tw:rounded-control tw:border tw:border-line-soft tw:p-3 registry-summary tw:[&_div]:min-h-[18px] tw:[&_div]:[overflow-wrap:anywhere] tw:[&_div]:text-xs tw:[&_div]:text-ink-2";
const DIAGNOSTICS_CLASS_NAME =
  "automation-request-box tw:mt-3.5 tw:rounded-control tw:border tw:border-line-soft tw:p-3 registry-diagnostics tw:[border-color:color-mix(in_srgb,var(--accent-danger)_28%,var(--line-soft))] tw:bg-[color-mix(in_srgb,var(--accent-danger)_5%,transparent)]";

function formatSize(value: number | undefined): string {
  if (value === undefined || value === null) return "--";
  return value < 1024 ? `${value} B` : `${(value / 1024).toFixed(1)} KB`;
}

export interface RegistryDetailPaneProps {
  detail: AdminRegistryDetailResponse | null;
  detailLoading: boolean;
  dirty: boolean;
  draft: string;
  isToolsTab: boolean;
  newDraft: boolean;
  saving: boolean;
  selectedTool: AdminToolSummary | null;
  theme: ThemeMode;
  validating: boolean;
  onDraftChange: (value: string) => void;
  onRefresh: () => void;
  onSave: () => void;
  onEditConversation?: () => void;
  onValidate: () => void;
}

export function RegistryDetailPane({
  detail,
  detailLoading,
  dirty,
  draft,
  isToolsTab,
  newDraft,
  saving,
  selectedTool,
  theme,
  validating,
  onDraftChange,
  onRefresh,
  onSave,
  onEditConversation,
  onValidate,
}: RegistryDetailPaneProps) {
  const { locale, t } = useI18n();
  const editorRegion = useRef<HTMLDivElement>(null);
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
                  <UiButton size="sm" variant="ghost" onClick={onRefresh}>
                    <MaterialIcon name="refresh" />
                    <span>{t("registryConsole.action.refresh")}</span>
                  </UiButton>
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
                <fieldset className={REQUEST_BOX_CLASS_NAME}>
                  <legend>{t("registryConsole.tools.field.description")}</legend>
                  <div>{selectedTool.description}</div>
                </fieldset>
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
              <div className={DETAIL_ACTIONS_CLASS_NAME}>
                {!newDraft && <EditMenuButton label={t("resourceAssistant.editRegistry")} disabled={saving || detailLoading} onManual={() => focusEditableField(editorRegion.current)} onConversation={onEditConversation} />}
                <UiTag tone={registryStatusTone(detail.status)}>
                  {translateWithFallback(
                    t,
                    `registryConsole.status.${detail.status}`,
                    detail.status,
                  )}
                </UiTag>
                <UiButton
                  size="sm"
                  variant="ghost"
                  onClick={onRefresh}
                  disabled={newDraft || detailLoading}
                >
                  <MaterialIcon name="refresh" />
                  <span>{t("registryConsole.action.refreshFile")}</span>
                </UiButton>
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
              <fieldset className={DIAGNOSTICS_CLASS_NAME}>
                <legend>{t("registryConsole.section.diagnostics")}</legend>
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
              </fieldset>
            ) : null}
            <fieldset className={REQUEST_BOX_CLASS_NAME}>
              <legend>{t("registryConsole.section.summary")}</legend>
              <div>{summaryLine(detail.summary) || "--"}</div>
            </fieldset>
            <div ref={editorRegion} className="field-group registry-editor-field tw:mt-3.5">
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
            <div className="automation-save-actions tw:mt-3 tw:flex tw:flex-wrap tw:items-center tw:gap-2">
              <UiButton
                size="sm"
                variant="ghost"
                onClick={onValidate}
                disabled={validating || saving}
              >
                <MaterialIcon name="rule" />
                <span>{t("registryConsole.action.validate")}</span>
              </UiButton>
              <UiButton
                size="sm"
                variant="primary"
                onClick={onSave}
                disabled={saving || !dirty}
              >
                <MaterialIcon name="save" />
                <span>{t("registryConsole.action.save")}</span>
              </UiButton>
              {dirty ? (
                <span className="registry-dirty tw:text-xs tw:text-ink-muted">
                  {t("registryConsole.message.unsaved")}
                </span>
              ) : null}
            </div>
          </>
        )}
      </Spin>
    </div>
  );
}
