import React from "react";
import type {
  MemoryContextPreviewResponse,
  MemoryContextPromptLayer,
  MemoryInfoFilters,
  MemoryMeta,
  MemoryPreferenceMode,
  MemoryPreferenceScopeType,
  MemoryRecordDetail,
  MemoryRecordListItem,
  MemoryScopeDetailMeta,
  MemoryScopeDraftRecord,
  MemoryScopeSaveSummary,
  MemoryScopeSummary,
  MemoryScopeValidationResult,
} from "@/shared/data/memory/memoryTypes";
import { UiButton } from "@/shared/ui/UiButton";
import { UiTag } from "@/shared/ui/UiTag";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { useI18n } from "@/shared/i18n";
import {
  formatMemoryJson,
  formatMemoryTimestamp,
  formatScopeTabLabel,
  normalizeMemoryTagList,
  normalizePreferenceScopeType,
} from "@/features/memory/lib/memoryInfo";
import { toText } from "@/shared/utils/eventUtils";
import {
  PREFERENCE_SCOPE_ORDER,
  PREVIEW_PROMPT_LAYER_ORDER,
  MEMORY_INFO_CARD_CLASS_NAME,
  MEMORY_HEAD_CLASS_NAME,
  MEMORY_SUBTITLE_CLASS_NAME,
  MEMORY_CONSOLE_TABS_CLASS_NAME,
  MEMORY_CONSOLE_PANE_CLASS_NAME,
  MEMORY_INFO_LAYOUT_CLASS_NAME,
  MEMORY_INFO_PANE_CLASS_NAME,
  MEMORY_INFO_PANE_HEADER_CLASS_NAME,
  MEMORY_INFO_PANE_HINT_CLASS_NAME,
  MEMORY_INFO_ACTIONS_CLASS_NAME,
  MEMORY_FILTER_GRID_CLASS_NAME,
  MEMORY_PANE_LIST_FILTER_GRID_CLASS_NAME,
  MEMORY_FIELD_CLASS_NAME,
  MEMORY_PANE_LIST_FIELD_CLASS_NAME,
  MEMORY_FIELD_WIDE_CLASS_NAME,
  MEMORY_INFO_INPUT_CLASS_NAME,
  MEMORY_INFO_SELECT_CLASS_NAME,
  MEMORY_INFO_ERROR_CLASS_NAME,
  COMMAND_EMPTY_STATE_CLASS_NAME,
  COMMAND_DETAIL_LABEL_CLASS_NAME,
  SETTINGS_SEGMENTED_BUTTON_CLASS_NAME,
  MEMORY_INFO_RECORD_LIST_CLASS_NAME,
  MEMORY_INFO_RECORD_ITEM_CLASS_NAME,
  MEMORY_RECORD_HEAD_CLASS_NAME,
  MEMORY_RECORD_META_CLASS_NAME,
  MEMORY_RECORD_SUMMARY_CLASS_NAME,
  MEMORY_DETAIL_STACK_CLASS_NAME,
  MEMORY_DETAIL_TITLE_CLASS_NAME,
  MEMORY_DETAIL_BADGES_CLASS_NAME,
  MEMORY_DETAIL_SUMMARY_CLASS_NAME,
  MEMORY_DETAIL_GRID_CLASS_NAME,
  MEMORY_DETAIL_CARD_CLASS_NAME,
  MEMORY_DETAIL_BLOCK_CLASS_NAME,
  MEMORY_RAW_BLOCK_CLASS_NAME,
  MEMORY_RAW_SUMMARY_CLASS_NAME,
  MEMORY_PREVIEW_LAYOUT_CLASS_NAME,
  MEMORY_PREVIEW_PANE_INPUT_CLASS_NAME,
  MEMORY_PREVIEW_PANE_RESULT_CLASS_NAME,
  MEMORY_PREVIEW_CONTEXT_LIST_CLASS_NAME,
  MEMORY_PREVIEW_CONTEXT_ITEM_CLASS_NAME,
  MEMORY_PREVIEW_TEXTAREA_CLASS_NAME,
  MEMORY_PREVIEW_SUMMARY_GRID_CLASS_NAME,
  MEMORY_PREVIEW_LAYER_TABS_CLASS_NAME,
  MEMORY_PREVIEW_LAYER_TAB_CLASS_NAME,
  MEMORY_PREVIEW_PROMPT_BLOCK_CLASS_NAME,
  MEMORY_PREVIEW_LIST_CLASS_NAME,
  MEMORY_PREVIEW_ITEM_CARD_CLASS_NAME,
  MEMORY_PREVIEW_HEAD_CLASS_NAME,
  MEMORY_PREVIEW_EMPTY_CLASS_NAME,
  MEMORY_PREFERENCE_SCOPE_TABS_CLASS_NAME,
  MEMORY_PREFERENCE_SCOPE_TAB_CLASS_NAME,
  MEMORY_PREFERENCE_LAYOUT_CLASS_NAME,
  MEMORY_PREFERENCE_PANE_LIST_CLASS_NAME,
  MEMORY_PREFERENCE_PANE_DETAIL_CLASS_NAME,
  MEMORY_PREFERENCE_PANE_EDITOR_CLASS_NAME,
  MEMORY_PREFERENCE_MODE_TOGGLE_CLASS_NAME,
  MEMORY_PREFERENCE_FORM_CLASS_NAME,
  MEMORY_PREFERENCE_FORM_GRID_CLASS_NAME,
  MEMORY_PREFERENCE_TEXTAREA_CLASS_NAME,
  MEMORY_PREFERENCE_MARKDOWN_PANEL_CLASS_NAME,
  MEMORY_PREFERENCE_MARKDOWN_CLASS_NAME,
  MEMORY_PREFERENCE_MARKDOWN_HINT_CLASS_NAME,
  MEMORY_PREFERENCE_VALIDATION_CLASS_NAME,
  MEMORY_PREFERENCE_VALIDATION_ITEM_CLASS_BY_KIND,
  MEMORY_PREFERENCE_RECORD_ROW_CLASS_NAME,
  MEMORY_PREFERENCE_RECORD_MAIN_CLASS_NAME,
  MEMORY_PREFERENCE_RECORD_MARKER_CLASS_NAME,
  MEMORY_PREFERENCE_RECORD_BODY_CLASS_NAME,
  MEMORY_PREFERENCE_RECORD_TOPLINE_CLASS_NAME,
  MEMORY_PREFERENCE_RECORD_SUMMARY_CLASS_NAME,
  MEMORY_PREFERENCE_RECORD_META_CLASS_NAME,
  MEMORY_PREFERENCE_RECORD_DELETE_CLASS_NAME,
  MEMORY_INFO_BANNER_CLASS_BY_TONE,
  toneForStatus,
  formatDetailValue,
  mergeMemoryMetaOptions,
  promptToneForLayer,
  formatPreviewLayerLabel,
  renderMemoryDetailRows,
  renderPreferenceInspectorRows,
  buildFallbackScopeSummaries,
  formatValidationFieldLabel,
  formatValidationMessage,
} from "@/features/memory/lib/memoryPanelPresentation";

export type PreferenceRecordField =
  | "title"
  | "summary"
  | "category"
  | "importance"
  | "confidence"
  | "tags";
export interface MemoryPreferencesPanelProps {
  agentKey: string;
  missingAgent: boolean;
  scopes: MemoryScopeSummary[];
  activeScopeType: string;
  activeScopeKey: string;
  label: string;
  fileName: string;
  meta: MemoryScopeDetailMeta | null;
  memoryMeta: MemoryMeta | null;
  loading: boolean;
  error: string;
  mode: MemoryPreferenceMode;
  markdownDraft: string;
  recordsDraft: MemoryScopeDraftRecord[];
  selectedRecordId: string;
  dirty: boolean;
  saving: boolean;
  saveSummary: MemoryScopeSaveSummary | null;
  validation: MemoryScopeValidationResult | null;
  editorRefs: {
    title: React.RefObject<HTMLInputElement>;
    summary: React.RefObject<HTMLTextAreaElement>;
    category: React.RefObject<HTMLSelectElement>;
    importance: React.RefObject<HTMLInputElement>;
    confidence: React.RefObject<HTMLInputElement>;
    tags: React.RefObject<HTMLInputElement>;
    markdown: React.RefObject<HTMLTextAreaElement>;
  };
  onScopeSelect: (scopeType: MemoryPreferenceScopeType) => void;
  onModeChange: (mode: MemoryPreferenceMode) => void;
  onMarkdownChange: (value: string) => void;
  onRecordFieldChange: (field: PreferenceRecordField, value: string) => void;
  onSelectRecord: (id: string) => void;
  onNewRecord: () => void;
  onDeleteRecord: (id: string) => void;
  onValidate: () => void;
  onSave: () => void;
}


export const MemoryPreferencesPanelView: React.FC<MemoryPreferencesPanelProps> = ({
  agentKey,
  missingAgent,
  scopes,
  activeScopeType,
  activeScopeKey,
  label,
  fileName,
  meta,
  memoryMeta,
  loading,
  error,
  mode,
  markdownDraft,
  recordsDraft,
  selectedRecordId,
  dirty,
  saving,
  saveSummary,
  validation,
  editorRefs,
  onScopeSelect,
  onModeChange,
  onMarkdownChange,
  onRecordFieldChange,
  onSelectRecord,
  onNewRecord,
  onDeleteRecord,
  onValidate,
  onSave,
}) => {
  const { t } = useI18n();
  const selectedDraft =
    recordsDraft.find((record) => record.clientId === selectedRecordId) || null;
  const availableScopes =
    scopes.length > 0 ? scopes : buildFallbackScopeSummaries(t);
  const validationFailedMessage = t("memoryPreferences.notice.validationFailed");
  const shouldHideDuplicateValidationError =
    mode === "markdown" &&
    Boolean(validation && !validation.valid) &&
    error === validationFailedMessage;
  const showMarkdownModeHint = mode === "markdown";
  const categoryOptions = mergeMemoryMetaOptions(
    memoryMeta?.categories,
    ["general", "preference", "constraint", "workflow", "decision", "bugfix"],
  );

  return (
    <div className={MEMORY_CONSOLE_PANE_CLASS_NAME}>
      <div className={MEMORY_PREFERENCE_SCOPE_TABS_CLASS_NAME}>
        {PREFERENCE_SCOPE_ORDER.map((scopeType) => {
          const summary =
            availableScopes.find(
              (item) => normalizePreferenceScopeType(item.scopeType) === scopeType,
            ) || null;
          const tabLabel = summary
            ? formatScopeTabLabel(summary)
            : t(`memoryPreferences.scope.${scopeType}`);
          return (
            <UiButton
              key={scopeType}
              variant="ghost"
              size="sm"
              className={`${MEMORY_PREFERENCE_SCOPE_TAB_CLASS_NAME} ${scopeType === normalizePreferenceScopeType(activeScopeType) ? "is-active" : ""}`}
              active={scopeType === normalizePreferenceScopeType(activeScopeType)}
              onClick={() => onScopeSelect(scopeType)}
            >
              {tabLabel}
            </UiButton>
          );
        })}
      </div>

      <div className={MEMORY_PREFERENCE_LAYOUT_CLASS_NAME}>
        <section className={MEMORY_PREFERENCE_PANE_LIST_CLASS_NAME}>
          <div className={MEMORY_INFO_PANE_HEADER_CLASS_NAME}>
            <div>
              <strong>{t("memoryPreferences.panel.records")}</strong>
              <p className={MEMORY_INFO_PANE_HINT_CLASS_NAME}>
                {meta
                  ? t("memoryPreferences.meta", {
                      count: meta.recordCount,
                      editable: meta.editable
                        ? t("memoryPreferences.editable.yes")
                        : t("memoryPreferences.editable.no"),
                    })
                  : t("memoryPreferences.metaEmpty")}
              </p>
            </div>
            <UiButton variant="secondary" size="sm" onClick={onNewRecord}>
              {t("memoryPreferences.actions.new")}
            </UiButton>
          </div>

          {missingAgent ? (
            <div className={COMMAND_EMPTY_STATE_CLASS_NAME}>
              {t("memoryPreferences.empty.noAgent")}
            </div>
          ) : loading && recordsDraft.length === 0 ? (
            <div className={COMMAND_EMPTY_STATE_CLASS_NAME}>
              {t("memoryPreferences.loading.scope")}
            </div>
          ) : recordsDraft.length === 0 ? (
            <div className={COMMAND_EMPTY_STATE_CLASS_NAME}>
              {t("memoryPreferences.empty.noPreference")}
            </div>
          ) : (
            <div className={MEMORY_INFO_RECORD_LIST_CLASS_NAME}>
              {recordsDraft.map((record) => (
                <div
                  key={record.clientId}
                  className={`${MEMORY_PREFERENCE_RECORD_ROW_CLASS_NAME} ${record.clientId === selectedRecordId ? "is-selected" : ""}`.trim()}
                >
                  <button
                    type="button"
                    className={MEMORY_PREFERENCE_RECORD_MAIN_CLASS_NAME}
                    onClick={() => onSelectRecord(record.clientId)}
                  >
                    <span
                      className={MEMORY_PREFERENCE_RECORD_MARKER_CLASS_NAME}
                      aria-hidden="true"
                    />
                    <div className={MEMORY_PREFERENCE_RECORD_BODY_CLASS_NAME}>
                      <div className={MEMORY_PREFERENCE_RECORD_TOPLINE_CLASS_NAME}>
                        <strong>
                          {toText(record.title) || t("memoryPreferences.newRecord")}
                        </strong>
                        <span>{formatMemoryTimestamp(record.updatedAt)}</span>
                      </div>
                      <div className={MEMORY_PREFERENCE_RECORD_SUMMARY_CLASS_NAME}>
                        {toText(record.summary) ||
                          t("memoryInfo.empty.noSummary")}
                      </div>
                      <div className={MEMORY_PREFERENCE_RECORD_META_CLASS_NAME}>
                        <UiTag tone="muted">{record.category || "general"}</UiTag>
                        <UiTag tone="accent">
                          {t("memoryInfo.labels.importanceShort", {
                            value: record.importance,
                          })}
                        </UiTag>
                      </div>
                    </div>
                  </button>
                  <UiButton
                    variant="ghost"
                    size="sm"
                    className={MEMORY_PREFERENCE_RECORD_DELETE_CLASS_NAME}
                    onClick={() => onDeleteRecord(record.clientId)}
                  >
                    {t("memoryPreferences.actions.delete")}
                  </UiButton>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={MEMORY_PREFERENCE_PANE_DETAIL_CLASS_NAME}>
          <div className={MEMORY_INFO_PANE_HEADER_CLASS_NAME}>
            <div>
              <strong>{t("memoryPreferences.panel.detail")}</strong>
              <p className={MEMORY_INFO_PANE_HINT_CLASS_NAME}>
                {t("memoryPreferences.panel.detailHint")}
              </p>
            </div>
          </div>

          {!selectedDraft ? (
            <div className={COMMAND_EMPTY_STATE_CLASS_NAME}>
              {t("memoryPreferences.empty.unselected")}
            </div>
          ) : (
            <div className={MEMORY_DETAIL_STACK_CLASS_NAME}>
              <div className={MEMORY_DETAIL_TITLE_CLASS_NAME}>
                <h4>{toText(selectedDraft.title) || t("memoryPreferences.newRecord")}</h4>
                <div className={MEMORY_DETAIL_BADGES_CLASS_NAME}>
                  <UiTag tone={toneForStatus(selectedDraft.status || "active")}>
                    {selectedDraft.status || "active"}
                  </UiTag>
                  <UiTag tone="muted">
                    {selectedDraft.scopeType || activeScopeType}
                  </UiTag>
                </div>
              </div>

              <div className={MEMORY_DETAIL_SUMMARY_CLASS_NAME}>
                {toText(selectedDraft.summary) || t("memoryInfo.empty.noSummary")}
              </div>

              <div className={MEMORY_DETAIL_GRID_CLASS_NAME}>
                {renderPreferenceInspectorRows(
                  t,
                  selectedDraft,
                  activeScopeType,
                  activeScopeKey,
                ).map(([labelValue, value]) => (
                  <div className={MEMORY_DETAIL_CARD_CLASS_NAME} key={String(labelValue)}>
                    <span className={COMMAND_DETAIL_LABEL_CLASS_NAME}>{labelValue}</span>
                    <strong>{formatDetailValue(value)}</strong>
                  </div>
                ))}
              </div>

              {normalizeMemoryTagList(selectedDraft.tags).length > 0 ? (
                <div className={MEMORY_DETAIL_BLOCK_CLASS_NAME}>
                  <span className={COMMAND_DETAIL_LABEL_CLASS_NAME}>
                    {t("memoryPreferences.field.tags")}
                  </span>
                  <div className={MEMORY_RECORD_META_CLASS_NAME}>
                    {normalizeMemoryTagList(selectedDraft.tags).map((tag) => (
                      <UiTag key={`${selectedDraft.clientId}-${tag}`} tone="default">
                        #{tag}
                      </UiTag>
                    ))}
                  </div>
                </div>
              ) : null}

              <details className={MEMORY_RAW_BLOCK_CLASS_NAME}>
                <summary className={MEMORY_RAW_SUMMARY_CLASS_NAME}>
                  <MaterialIcon name="code" />
                  <span>{t("memoryPreferences.rawJson")}</span>
                </summary>
                <pre>{formatMemoryJson(selectedDraft)}</pre>
              </details>
            </div>
          )}
        </section>

        <section className={MEMORY_PREFERENCE_PANE_EDITOR_CLASS_NAME}>
          <div className={MEMORY_INFO_PANE_HEADER_CLASS_NAME}>
            <div>
              <strong>{t("memoryPreferences.panel.editor")}</strong>
              <p className={MEMORY_INFO_PANE_HINT_CLASS_NAME}>
                {t("memoryPreferences.currentScope", {
                  label,
                  fileName,
                })}
              </p>
              {agentKey ? (
                <p className={MEMORY_INFO_PANE_HINT_CLASS_NAME}>
                  {t("memoryInfo.currentAgent", { agentKey })}
                </p>
              ) : null}
            </div>
            <div className={MEMORY_INFO_ACTIONS_CLASS_NAME}>
              {mode === "markdown" ? (
                <UiButton variant="ghost" size="sm" onClick={onValidate}>
                  {t("memoryPreferences.actions.validate")}
                </UiButton>
              ) : null}
              <UiButton
                variant="secondary"
                size="sm"
                loading={saving}
                onClick={onSave}
              >
                {t("memoryPreferences.actions.save")}
              </UiButton>
            </div>
          </div>

          <div className={MEMORY_PREFERENCE_MODE_TOGGLE_CLASS_NAME}>
            <UiButton
              variant="ghost"
              size="sm"
              className={SETTINGS_SEGMENTED_BUTTON_CLASS_NAME}
              active={mode === "records"}
              onClick={() => onModeChange("records")}
            >
              {t("memoryPreferences.mode.records")}
            </UiButton>
            <UiButton
              variant="ghost"
              size="sm"
              className={SETTINGS_SEGMENTED_BUTTON_CLASS_NAME}
              active={mode === "markdown"}
              onClick={() => onModeChange("markdown")}
            >
              {t("memoryPreferences.mode.markdown")}
            </UiButton>
          </div>

          {missingAgent ? (
            <div className={COMMAND_EMPTY_STATE_CLASS_NAME}>
              {t("memoryPreferences.empty.noAgent")}
            </div>
          ) : loading ? (
            <div className={COMMAND_EMPTY_STATE_CLASS_NAME}>
              {t("memoryPreferences.loading.scope")}
            </div>
          ) : null}

          {error && !shouldHideDuplicateValidationError ? (
            <div className={MEMORY_INFO_ERROR_CLASS_NAME}>{error}</div>
          ) : null}
          {dirty ? (
            <div className={MEMORY_INFO_BANNER_CLASS_BY_TONE.warning}>
              {t("memoryPreferences.notice.unsaved")}
            </div>
          ) : null}
          {saveSummary ? (
            <div className={MEMORY_INFO_BANNER_CLASS_BY_TONE.success}>
              {t("memoryPreferences.saveSummary", {
                created: saveSummary.created,
                updated: saveSummary.updated,
                archived: saveSummary.archived,
                unchanged: saveSummary.unchanged,
              })}
            </div>
          ) : null}
          {mode === "markdown" && validation && !validation.valid ? (
            <div className={MEMORY_INFO_BANNER_CLASS_BY_TONE.danger}>
              {validationFailedMessage}
            </div>
          ) : null}

          {mode === "records" ? (
            !selectedDraft ? (
              <div className={COMMAND_EMPTY_STATE_CLASS_NAME}>
                {t("memoryPreferences.empty.unselected")}
              </div>
            ) : (
              <div className={MEMORY_PREFERENCE_FORM_CLASS_NAME}>
                <label className={MEMORY_FIELD_CLASS_NAME}>
                  <span>{t("memoryPreferences.field.title")}</span>
                  <input
                    className={MEMORY_INFO_INPUT_CLASS_NAME}
                    ref={editorRefs.title}
                    value={selectedDraft.title}
                    onChange={(event) =>
                      onRecordFieldChange("title", event.currentTarget.value)
                    }
                  />
                </label>
                <label className={MEMORY_FIELD_CLASS_NAME}>
                  <span>{t("memoryPreferences.field.summary")}</span>
                  <textarea
                    className={MEMORY_PREFERENCE_TEXTAREA_CLASS_NAME}
                    ref={editorRefs.summary}
                    value={selectedDraft.summary}
                    onChange={(event) =>
                      onRecordFieldChange("summary", event.currentTarget.value)
                    }
                  />
                </label>
                <div className={MEMORY_PREFERENCE_FORM_GRID_CLASS_NAME}>
                  <label className={MEMORY_FIELD_CLASS_NAME}>
                    <span>{t("memoryPreferences.field.category")}</span>
                    <select
                      className={MEMORY_INFO_SELECT_CLASS_NAME}
                      ref={editorRefs.category}
                      value={selectedDraft.category}
                      onChange={(event) =>
                        onRecordFieldChange("category", event.currentTarget.value)
                      }
                    >
                      {categoryOptions.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={MEMORY_FIELD_CLASS_NAME}>
                    <span>{t("memoryPreferences.field.importance")}</span>
                    <input
                      className={MEMORY_INFO_INPUT_CLASS_NAME}
                      inputMode="numeric"
                      ref={editorRefs.importance}
                      value={String(selectedDraft.importance ?? "")}
                      onChange={(event) =>
                        onRecordFieldChange(
                          "importance",
                          event.currentTarget.value,
                        )
                      }
                    />
                  </label>
                  <label className={MEMORY_FIELD_CLASS_NAME}>
                    <span>{t("memoryPreferences.field.confidence")}</span>
                    <input
                      className={MEMORY_INFO_INPUT_CLASS_NAME}
                      inputMode="decimal"
                      ref={editorRefs.confidence}
                      value={String(selectedDraft.confidence ?? "")}
                      onChange={(event) =>
                        onRecordFieldChange(
                          "confidence",
                          event.currentTarget.value,
                        )
                      }
                    />
                  </label>
                  <label className={MEMORY_FIELD_CLASS_NAME}>
                    <span>{t("memoryPreferences.field.tags")}</span>
                    <input
                      className={MEMORY_INFO_INPUT_CLASS_NAME}
                      ref={editorRefs.tags}
                      value={normalizeMemoryTagList(selectedDraft.tags).join(",")}
                      onChange={(event) =>
                        onRecordFieldChange("tags", event.currentTarget.value)
                      }
                    />
                  </label>
                </div>
              </div>
            )
          ) : (
            <div className={MEMORY_PREFERENCE_MARKDOWN_PANEL_CLASS_NAME}>
              {showMarkdownModeHint ? (
                <div className={MEMORY_PREFERENCE_MARKDOWN_HINT_CLASS_NAME}>
                  <p>{t("memoryPreferences.markdown.hint")}</p>
                  <UiButton
                    variant="ghost"
                    size="sm"
                    onClick={() => onModeChange("records")}
                  >
                    {t("memoryPreferences.markdown.switchToRecords")}
                  </UiButton>
                </div>
              ) : null}
              <textarea
                className={MEMORY_PREFERENCE_MARKDOWN_CLASS_NAME}
                ref={editorRefs.markdown}
                value={markdownDraft}
                onChange={(event) => onMarkdownChange(event.currentTarget.value)}
              />
              {validation &&
              ((validation.errors?.length ?? 0) > 0 ||
                (validation.warnings?.length ?? 0) > 0) ? (
                <div className={MEMORY_PREFERENCE_VALIDATION_CLASS_NAME}>
                  {(validation.errors || []).map((issue, index) => (
                    <div
                      className={MEMORY_PREFERENCE_VALIDATION_ITEM_CLASS_BY_KIND.error}
                      key={`error-${issue.line}-${index}`}
                    >
                      {t("memoryPreferences.validation.error", {
                        line: issue.line,
                        field: formatValidationFieldLabel(t, issue.field),
                        message: formatValidationMessage(t, issue),
                      })}
                    </div>
                  ))}
                  {(validation.warnings || []).map((issue, index) => (
                    <div
                      className={MEMORY_PREFERENCE_VALIDATION_ITEM_CLASS_BY_KIND.warning}
                      key={`warning-${issue.line}-${index}`}
                    >
                      {t("memoryPreferences.validation.warning", {
                        line: issue.line,
                        field: formatValidationFieldLabel(t, issue.field),
                        message: formatValidationMessage(t, issue),
                      })}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};


export const MemoryPreferencesPanel = MemoryPreferencesPanelView;
