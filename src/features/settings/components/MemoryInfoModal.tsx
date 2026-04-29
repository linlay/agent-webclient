import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import {
  getMemoryMeta,
  getMemoryRecord,
  getMemoryRecords,
  getMemoryScope,
  getMemoryScopes,
  previewMemoryContext,
  saveMemoryScope,
  validateMemoryScope,
} from "@/shared/api/apiClient";
import type {
  MemoryConsoleTab,
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
} from "@/shared/api/memoryTypes";
import { UiButton } from "@/shared/ui/UiButton";
import { UiTag } from "@/shared/ui/UiTag";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { useI18n } from "@/shared/i18n";
import {
  createMemoryPreferenceDraftRecord,
  formatMemoryJson,
  formatMemoryTimestamp,
  formatScopeTabLabel,
  hydratePreferenceDrafts,
  normalizeMemoryTagList,
  normalizePreferenceScopeType,
  preferredScopeTypeFromSummaries,
  resolveMemoryAgentContext,
  syncSelectedPreferenceDraftFromLiveValues,
  toScopeRecordInputs,
} from "@/features/settings/lib/memoryInfo";
import { toText } from "@/shared/utils/eventUtils";

type MemoryInfoFilterField = keyof MemoryInfoFilters;
type PreferenceRecordField =
  | "title"
  | "summary"
  | "category"
  | "importance"
  | "confidence"
  | "tags";

type Translator = (key: string, vars?: Record<string, unknown>) => string;

interface MemoryRecordsPanelProps {
  agentKey: string;
  loading: boolean;
  error: string;
  memoryMeta: MemoryMeta | null;
  records: MemoryRecordListItem[];
  selectedRecordId: string;
  detail: MemoryRecordDetail | null;
  detailLoading: boolean;
  detailError: string;
  filters: MemoryInfoFilters;
  missingAgent: boolean;
  onQuery: () => void;
  onRefresh: () => void;
  onSelectRecord: (id: string) => void;
  onFilterChange: (field: MemoryInfoFilterField, value: string) => void;
}

interface MemoryPreferencesPanelProps {
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

interface MemoryPreviewPanelProps {
  agentKey: string;
  chatId: string;
  teamId: string;
  draft: string;
  loading: boolean;
  error: string;
  result: MemoryContextPreviewResponse | null;
  promptLayer: MemoryContextPromptLayer;
  onDraftChange: (value: string) => void;
  onPromptLayerChange: (layer: MemoryContextPromptLayer) => void;
  onPreview: () => void;
}

export interface MemoryInfoModalViewProps {
  open: boolean;
  title: string;
  subtitle: string;
  activeTab: MemoryConsoleTab;
  onTabChange: (tab: MemoryConsoleTab) => void;
  onClose: () => void;
  recordsPanel: MemoryRecordsPanelProps;
  preferencesPanel: MemoryPreferencesPanelProps;
  previewPanel: MemoryPreviewPanelProps;
}

const PREFERENCE_SCOPE_ORDER: MemoryPreferenceScopeType[] = [
  "user",
  "agent",
  "team",
  "global",
];
const PREVIEW_PROMPT_LAYER_ORDER: MemoryContextPromptLayer[] = [
  "stable",
  "session",
  "observation",
];

function toneForStatus(
  status: string,
): "default" | "accent" | "muted" | "danger" {
  switch (toText(status).toLowerCase()) {
    case "active":
      return "accent";
    case "archived":
    case "superseded":
      return "muted";
    case "contested":
      return "danger";
    default:
      return "default";
  }
}

function formatDetailValue(value: unknown): string {
  if (value === null || value === undefined) return "--";
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return toText(value) || "--";
}

function mergeMemoryMetaOptions(
  preferred: string[] | undefined,
  fallback: string[],
  extras: Array<string | undefined>,
): string[] {
  return Array.from(
    new Set([...(preferred && preferred.length > 0 ? preferred : fallback), ...extras]
      .map((value) => toText(value))
      .filter(Boolean)),
  );
}

function promptToneForLayer(
  layer: string,
): "default" | "accent" | "muted" | "danger" {
  switch (toText(layer).toLowerCase()) {
    case "stable":
      return "accent";
    case "session":
      return "default";
    case "observation":
      return "muted";
    default:
      return "default";
  }
}

function formatPreviewLayerLabel(t: Translator, layer: string): string {
  const normalized = toText(layer).trim().toLowerCase();
  if (
    normalized === "stable" ||
    normalized === "session" ||
    normalized === "observation"
  ) {
    return t(`memoryPreview.layer.${normalized}`);
  }
  return layer || "--";
}

function renderMemoryDetailRows(t: Translator, detail: MemoryRecordDetail) {
  const record = detail.record;
  return [
    [t("memoryInfo.field.id"), record.id],
    [t("memoryInfo.field.sourceTable"), detail.sourceTable],
    [t("memoryInfo.field.kind"), record.kind],
    [t("memoryInfo.field.scopeType"), record.scopeType],
    [t("memoryInfo.field.scopeKey"), record.scopeKey],
    [t("memoryInfo.field.status"), record.status],
    [t("memoryInfo.field.category"), record.category],
    [t("memoryInfo.field.importance"), record.importance],
    [t("memoryInfo.field.confidence"), record.confidence],
    [t("memoryInfo.field.agentKey"), record.agentKey],
    [t("memoryInfo.field.chatId"), record.chatId],
    [t("memoryInfo.field.sourceType"), record.sourceType],
    [t("memoryInfo.field.refId"), record.refId],
    [t("memoryInfo.field.createdAt"), formatMemoryTimestamp(record.createdAt)],
    [t("memoryInfo.field.updatedAt"), formatMemoryTimestamp(record.updatedAt)],
    [
      t("memoryInfo.field.embedding"),
      detail.embedding.hasEmbedding
        ? detail.embedding.model
          ? `${t("memoryInfo.embedding.enabled")} · ${detail.embedding.model}`
          : t("memoryInfo.embedding.enabled")
        : t("memoryInfo.embedding.disabled"),
    ],
  ];
}

function renderPreferenceInspectorRows(
  t: Translator,
  draft: MemoryScopeDraftRecord,
  scopeType: string,
  scopeKey: string,
) {
  return [
    [t("memoryPreferences.field.id"), draft.id || t("memoryPreferences.newRecord")],
    [t("memoryPreferences.field.scopeType"), draft.scopeType || scopeType],
    [t("memoryPreferences.field.scopeKey"), draft.scopeKey || scopeKey],
    [t("memoryPreferences.field.status"), draft.status || "active"],
    [t("memoryPreferences.field.category"), draft.category],
    [t("memoryPreferences.field.importance"), draft.importance],
    [t("memoryPreferences.field.confidence"), draft.confidence],
    [t("memoryPreferences.field.createdAt"), formatMemoryTimestamp(draft.createdAt)],
    [t("memoryPreferences.field.updatedAt"), formatMemoryTimestamp(draft.updatedAt)],
  ];
}

function buildFallbackScopeSummaries(t: Translator): MemoryScopeSummary[] {
  return [
    {
      scopeType: "user",
      scopeKey: "",
      label: t("memoryPreferences.scope.user"),
      fileName: "USER.md",
      recordCount: 0,
      updatedAt: 0,
    },
    {
      scopeType: "agent",
      scopeKey: "",
      label: t("memoryPreferences.scope.agent"),
      fileName: "AGENT.md",
      recordCount: 0,
      updatedAt: 0,
    },
    {
      scopeType: "team",
      scopeKey: "",
      label: t("memoryPreferences.scope.team"),
      fileName: "TEAM.md",
      recordCount: 0,
      updatedAt: 0,
    },
    {
      scopeType: "global",
      scopeKey: "",
      label: t("memoryPreferences.scope.global"),
      fileName: "GLOBAL.md",
      recordCount: 0,
      updatedAt: 0,
    },
  ];
}

function formatValidationFieldLabel(t: Translator, field: string): string {
  const normalized = toText(field).trim().toLowerCase();
  if (!normalized) {
    return t("memoryPreferences.validation.field.unknown");
  }
  if (normalized === "field" || normalized === "entry") {
    return t(`memoryPreferences.validation.field.${normalized}`);
  }
  return field;
}

function formatValidationMessage(
  t: Translator,
  issue: { message?: string | null },
): string {
  const message = toText(issue.message);
  if (message === "expected 'key: value'") {
    return t("memoryPreferences.validation.expectedKeyValue");
  }
  return message || t("memoryPreferences.validation.unknown");
}

const MemoryRecordsPanelView: React.FC<MemoryRecordsPanelProps> = ({
  agentKey,
  loading,
  error,
  memoryMeta,
  records,
  selectedRecordId,
  detail,
  detailLoading,
  detailError,
  filters,
  missingAgent,
  onQuery,
  onRefresh,
  onSelectRecord,
  onFilterChange,
}) => {
  const { t } = useI18n();
  const kindOptions = mergeMemoryMetaOptions(
    memoryMeta?.types,
    ["fact", "observation"],
    [filters.kind, ...records.map((record) => toText(record.kind))],
  );
  const scopeTypeOptions = mergeMemoryMetaOptions(
    memoryMeta?.scopeTypes,
    ["user", "agent", "team", "chat", "global"],
    [filters.scopeType, ...records.map((record) => toText(record.scopeType))],
  );
  const statusOptions = mergeMemoryMetaOptions(
    memoryMeta?.statuses,
    ["active", "open", "superseded", "archived", "contested"],
    [filters.status, ...records.map((record) => toText(record.status))],
  );
  const categoryOptions = mergeMemoryMetaOptions(
    memoryMeta?.categories,
    ["general", "remember", "identity", "work_rules", "bugfix"],
    [filters.category, ...records.map((record) => toText(record.category))],
  );

  return (
    <div className="memory-console-pane">
      <div className="memory-info-layout">
        <section className="memory-info-pane memory-info-pane-list">
          <div className="memory-info-pane-header">
            <div>
              <strong>{t("memoryInfo.panel.records")}</strong>
              {agentKey ? (
                <p className="memory-info-pane-hint">
                  {t("memoryInfo.currentAgent", { agentKey })}
                </p>
              ) : null}
            </div>
            <div className="memory-info-actions">
              <UiButton variant="secondary" size="sm" onClick={onQuery}>
                {t("memoryInfo.actions.query")}
              </UiButton>
              <UiButton variant="ghost" size="sm" onClick={onRefresh}>
                {t("memoryInfo.actions.refresh")}
              </UiButton>
            </div>
          </div>

          <div className="memory-info-filter-grid">
            <label className="memory-info-field memory-info-field-wide">
              <span>{t("memoryInfo.filters.keyword")}</span>
              <input
                className="memory-info-input"
                value={filters.keyword}
                onChange={(event) =>
                  onFilterChange("keyword", event.currentTarget.value)
                }
                placeholder={t("memoryInfo.filters.keywordPlaceholder")}
              />
            </label>
            <label className="memory-info-field">
              <span>{t("memoryInfo.filters.kind")}</span>
              <select
                className="memory-info-select"
                value={filters.kind}
                onChange={(event) =>
                  onFilterChange("kind", event.currentTarget.value)
                }
              >
                <option value="">{t("memoryInfo.filters.any")}</option>
                {kindOptions.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
            </label>
            <label className="memory-info-field">
              <span>{t("memoryInfo.filters.scopeType")}</span>
              <select
                className="memory-info-select"
                value={filters.scopeType}
                onChange={(event) =>
                  onFilterChange("scopeType", event.currentTarget.value)
                }
              >
                <option value="">{t("memoryInfo.filters.any")}</option>
                {scopeTypeOptions.map((scopeType) => (
                  <option key={scopeType} value={scopeType}>
                    {scopeType}
                  </option>
                ))}
              </select>
            </label>
            <label className="memory-info-field">
              <span>{t("memoryInfo.filters.status")}</span>
              <select
                className="memory-info-select"
                value={filters.status}
                onChange={(event) =>
                  onFilterChange("status", event.currentTarget.value)
                }
              >
                <option value="">{t("memoryInfo.filters.any")}</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label className="memory-info-field">
              <span>{t("memoryInfo.filters.category")}</span>
              <select
                className="memory-info-select"
                value={filters.category}
                onChange={(event) =>
                  onFilterChange("category", event.currentTarget.value)
                }
              >
                <option value="">{t("memoryInfo.filters.any")}</option>
                {categoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error ? <div className="memory-info-error">{error}</div> : null}

          <div className="memory-info-record-list">
            {missingAgent ? (
              <div className="command-empty-state">
                {t("memoryInfo.empty.noAgent")}
              </div>
            ) : loading && records.length === 0 ? (
              <div className="command-empty-state">
                {t("memoryInfo.loading.records")}
              </div>
            ) : records.length === 0 ? (
              <div className="command-empty-state">
                {t("memoryInfo.empty.noRecords")}
              </div>
            ) : (
              records.map((record) => {
                return (
                  <button
                    key={record.id}
                    type="button"
                    className={`memory-info-record-item ${record.id === selectedRecordId ? "is-selected" : ""}`.trim()}
                    onClick={() => onSelectRecord(record.id)}
                  >
                    <div className="memory-info-record-head">
                      <strong>{toText(record.title) || record.id}</strong>
                      <span>{formatMemoryTimestamp(record.updatedAt)}</span>
                    </div>
                    <div className="memory-info-record-meta">
                      {record.kind ? <UiTag>{record.kind}</UiTag> : null}
                      {record.scopeType ? (
                        <UiTag tone="muted">{record.scopeType}</UiTag>
                      ) : null}
                      {record.status ? (
                        <UiTag tone={toneForStatus(record.status)}>
                          {record.status}
                        </UiTag>
                      ) : null}
                      {record.category ? (
                        <UiTag tone="muted">{record.category}</UiTag>
                      ) : null}
                      {typeof record.importance === "number" ? (
                        <UiTag tone="accent">
                          {t("memoryInfo.labels.importanceShort", {
                            value: record.importance,
                          })}
                        </UiTag>
                      ) : null}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className="memory-info-pane memory-info-pane-detail">
          <div className="memory-info-pane-header">
            <div>
              <strong>{t("memoryInfo.panel.detail")}</strong>
              <p className="memory-info-pane-hint">
                {t("memoryInfo.panel.detailHint")}
              </p>
            </div>
          </div>

          {missingAgent ? (
            <div className="command-empty-state">
              {t("memoryInfo.empty.noAgent")}
            </div>
          ) : detailLoading && !detail ? (
            <div className="command-empty-state">
              {t("memoryInfo.loading.detail")}
            </div>
          ) : detailError ? (
            <div className="memory-info-error">{detailError}</div>
          ) : !detail ? (
            <div className="command-empty-state">
              {t("memoryInfo.empty.unselected")}
            </div>
          ) : (
            <div className="memory-info-detail-stack">
              <div className="memory-info-detail-title">
                <h4>{toText(detail.record.title) || detail.record.id}</h4>
                <div className="memory-info-detail-badges">
                  {detail.record.kind ? (
                    <UiTag>{detail.record.kind}</UiTag>
                  ) : null}
                  {detail.record.status ? (
                    <UiTag tone={toneForStatus(detail.record.status)}>
                      {detail.record.status}
                    </UiTag>
                  ) : null}
                  {detail.record.scopeType ? (
                    <UiTag tone="muted">{detail.record.scopeType}</UiTag>
                  ) : null}
                </div>
              </div>

              <div className="memory-info-detail-summary">
                {toText(detail.record.summary) ||
                  t("memoryInfo.empty.noSummary")}
              </div>

              <div className="memory-info-detail-grid">
                {renderMemoryDetailRows(t, detail).map(([label, value]) => (
                  <div className="memory-info-detail-card" key={label}>
                    <span className="command-detail-label">{label}</span>
                    <strong>{formatDetailValue(value)}</strong>
                  </div>
                ))}
              </div>

              {normalizeMemoryTagList(detail.record.tags).length > 0 ? (
                <div className="memory-info-detail-block">
                  <span className="command-detail-label">
                    {t("memoryInfo.field.tags")}
                  </span>
                  <div className="memory-info-record-tags">
                    {normalizeMemoryTagList(detail.record.tags).map((tag) => (
                      <UiTag key={`${detail.id}-${tag}`} tone="default">
                        #{tag}
                      </UiTag>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="memory-info-detail-block">
                <span className="command-detail-label">
                  {t("memoryInfo.field.summary")}
                </span>
                <div className="memory-info-detail-content">
                  {toText(detail.record.summary) || "--"}
                </div>
              </div>

              <details className="memory-info-detail-block memory-info-raw-block">
                <summary className="memory-info-raw-summary">
                  <MaterialIcon name="code" />
                  <span>{t("memoryInfo.rawJson")}</span>
                </summary>
                <pre>
                  {formatMemoryJson({
                    record: detail.record,
                    rawFields: detail.rawFields || {},
                    embedding: detail.embedding,
                  })}
                </pre>
              </details>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

const MemoryPreferencesPanelView: React.FC<MemoryPreferencesPanelProps> = ({
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
    [
      selectedDraft?.category,
      ...recordsDraft.map((record) => toText(record.category)),
    ],
  );

  return (
    <div className="memory-console-pane">
      <div className="memory-preference-scope-tabs">
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
              className={`memory-preference-scope-tab ${scopeType === normalizePreferenceScopeType(activeScopeType) ? "is-active" : ""}`}
              active={scopeType === normalizePreferenceScopeType(activeScopeType)}
              onClick={() => onScopeSelect(scopeType)}
            >
              {tabLabel}
            </UiButton>
          );
        })}
      </div>

      <div className="memory-preference-layout">
        <section className="memory-info-pane memory-preference-pane memory-preference-pane-list">
          <div className="memory-info-pane-header">
            <div>
              <strong>{t("memoryPreferences.panel.records")}</strong>
              <p className="memory-info-pane-hint">
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
            <div className="command-empty-state">
              {t("memoryPreferences.empty.noAgent")}
            </div>
          ) : loading && recordsDraft.length === 0 ? (
            <div className="command-empty-state">
              {t("memoryPreferences.loading.scope")}
            </div>
          ) : recordsDraft.length === 0 ? (
            <div className="command-empty-state">
              {t("memoryPreferences.empty.noPreference")}
            </div>
          ) : (
            <div className="memory-info-record-list">
              {recordsDraft.map((record) => (
                <div
                  key={record.clientId}
                  className={`memory-preference-record-row ${record.clientId === selectedRecordId ? "is-selected" : ""}`.trim()}
                >
                  <button
                    type="button"
                    className="memory-preference-record-main"
                    onClick={() => onSelectRecord(record.clientId)}
                  >
                    <span
                      className="memory-preference-record-marker"
                      aria-hidden="true"
                    />
                    <div className="memory-preference-record-body">
                      <div className="memory-preference-record-topline">
                        <strong>
                          {toText(record.title) || t("memoryPreferences.newRecord")}
                        </strong>
                        <span>{formatMemoryTimestamp(record.updatedAt)}</span>
                      </div>
                      <div className="memory-info-record-summary">
                        {toText(record.summary) ||
                          t("memoryInfo.empty.noSummary")}
                      </div>
                      <div className="memory-info-record-meta">
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
                    className="memory-preference-record-delete"
                    onClick={() => onDeleteRecord(record.clientId)}
                  >
                    {t("memoryPreferences.actions.delete")}
                  </UiButton>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="memory-info-pane memory-preference-pane memory-preference-pane-detail">
          <div className="memory-info-pane-header">
            <div>
              <strong>{t("memoryPreferences.panel.detail")}</strong>
              <p className="memory-info-pane-hint">
                {t("memoryPreferences.panel.detailHint")}
              </p>
            </div>
          </div>

          {!selectedDraft ? (
            <div className="command-empty-state">
              {t("memoryPreferences.empty.unselected")}
            </div>
          ) : (
            <div className="memory-info-detail-stack">
              <div className="memory-info-detail-title">
                <h4>{toText(selectedDraft.title) || t("memoryPreferences.newRecord")}</h4>
                <div className="memory-info-detail-badges">
                  <UiTag tone={toneForStatus(selectedDraft.status || "active")}>
                    {selectedDraft.status || "active"}
                  </UiTag>
                  <UiTag tone="muted">
                    {selectedDraft.scopeType || activeScopeType}
                  </UiTag>
                </div>
              </div>

              <div className="memory-info-detail-summary">
                {toText(selectedDraft.summary) || t("memoryInfo.empty.noSummary")}
              </div>

              <div className="memory-info-detail-grid">
                {renderPreferenceInspectorRows(
                  t,
                  selectedDraft,
                  activeScopeType,
                  activeScopeKey,
                ).map(([labelValue, value]) => (
                  <div className="memory-info-detail-card" key={String(labelValue)}>
                    <span className="command-detail-label">{labelValue}</span>
                    <strong>{formatDetailValue(value)}</strong>
                  </div>
                ))}
              </div>

              {normalizeMemoryTagList(selectedDraft.tags).length > 0 ? (
                <div className="memory-info-detail-block">
                  <span className="command-detail-label">
                    {t("memoryPreferences.field.tags")}
                  </span>
                  <div className="memory-info-record-tags">
                    {normalizeMemoryTagList(selectedDraft.tags).map((tag) => (
                      <UiTag key={`${selectedDraft.clientId}-${tag}`} tone="default">
                        #{tag}
                      </UiTag>
                    ))}
                  </div>
                </div>
              ) : null}

              <details className="memory-info-detail-block memory-info-raw-block">
                <summary className="memory-info-raw-summary">
                  <MaterialIcon name="code" />
                  <span>{t("memoryPreferences.rawJson")}</span>
                </summary>
                <pre>{formatMemoryJson(selectedDraft)}</pre>
              </details>
            </div>
          )}
        </section>

        <section className="memory-info-pane memory-preference-pane memory-preference-pane-editor">
          <div className="memory-info-pane-header">
            <div>
              <strong>{t("memoryPreferences.panel.editor")}</strong>
              <p className="memory-info-pane-hint">
                {t("memoryPreferences.currentScope", {
                  label,
                  fileName,
                })}
              </p>
              {agentKey ? (
                <p className="memory-info-pane-hint">
                  {t("memoryInfo.currentAgent", { agentKey })}
                </p>
              ) : null}
            </div>
            <div className="memory-info-actions">
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

          <div className="memory-preference-mode-toggle settings-segmented">
            <UiButton
              variant="ghost"
              size="sm"
              className={`settings-segmented-btn ${mode === "records" ? "is-active" : ""}`}
              active={mode === "records"}
              onClick={() => onModeChange("records")}
            >
              {t("memoryPreferences.mode.records")}
            </UiButton>
            <UiButton
              variant="ghost"
              size="sm"
              className={`settings-segmented-btn ${mode === "markdown" ? "is-active" : ""}`}
              active={mode === "markdown"}
              onClick={() => onModeChange("markdown")}
            >
              {t("memoryPreferences.mode.markdown")}
            </UiButton>
          </div>

          {missingAgent ? (
            <div className="command-empty-state">
              {t("memoryPreferences.empty.noAgent")}
            </div>
          ) : loading ? (
            <div className="command-empty-state">
              {t("memoryPreferences.loading.scope")}
            </div>
          ) : null}

          {error && !shouldHideDuplicateValidationError ? (
            <div className="memory-info-error">{error}</div>
          ) : null}
          {dirty ? (
            <div className="memory-info-banner memory-info-banner-warning">
              {t("memoryPreferences.notice.unsaved")}
            </div>
          ) : null}
          {saveSummary ? (
            <div className="memory-info-banner memory-info-banner-success">
              {t("memoryPreferences.saveSummary", {
                created: saveSummary.created,
                updated: saveSummary.updated,
                archived: saveSummary.archived,
                unchanged: saveSummary.unchanged,
              })}
            </div>
          ) : null}
          {mode === "markdown" && validation && !validation.valid ? (
            <div className="memory-info-banner memory-info-banner-danger">
              {validationFailedMessage}
            </div>
          ) : null}

          {mode === "records" ? (
            !selectedDraft ? (
              <div className="command-empty-state">
                {t("memoryPreferences.empty.unselected")}
              </div>
            ) : (
              <div className="memory-preference-form">
                <label className="memory-info-field">
                  <span>{t("memoryPreferences.field.title")}</span>
                  <input
                    className="memory-info-input"
                    ref={editorRefs.title}
                    value={selectedDraft.title}
                    onChange={(event) =>
                      onRecordFieldChange("title", event.currentTarget.value)
                    }
                  />
                </label>
                <label className="memory-info-field">
                  <span>{t("memoryPreferences.field.summary")}</span>
                  <textarea
                    className="settings-textarea memory-preference-textarea"
                    ref={editorRefs.summary}
                    value={selectedDraft.summary}
                    onChange={(event) =>
                      onRecordFieldChange("summary", event.currentTarget.value)
                    }
                  />
                </label>
                <div className="memory-preference-form-grid">
                  <label className="memory-info-field">
                    <span>{t("memoryPreferences.field.category")}</span>
                    <select
                      className="memory-info-select"
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
                  <label className="memory-info-field">
                    <span>{t("memoryPreferences.field.importance")}</span>
                    <input
                      className="memory-info-input"
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
                  <label className="memory-info-field">
                    <span>{t("memoryPreferences.field.confidence")}</span>
                    <input
                      className="memory-info-input"
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
                  <label className="memory-info-field">
                    <span>{t("memoryPreferences.field.tags")}</span>
                    <input
                      className="memory-info-input"
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
            <div className="memory-preference-markdown-panel">
              {showMarkdownModeHint ? (
                <div className="memory-preference-markdown-hint">
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
                className="settings-textarea memory-preference-markdown"
                ref={editorRefs.markdown}
                value={markdownDraft}
                onChange={(event) => onMarkdownChange(event.currentTarget.value)}
              />
              {validation &&
              ((validation.errors?.length ?? 0) > 0 ||
                (validation.warnings?.length ?? 0) > 0) ? (
                <div className="memory-preference-validation">
                  {(validation.errors || []).map((issue, index) => (
                    <div
                      className="memory-preference-validation-item is-error"
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
                      className="memory-preference-validation-item is-warning"
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

const MemoryPreviewPanelView: React.FC<MemoryPreviewPanelProps> = ({
  agentKey,
  chatId,
  teamId,
  draft,
  loading,
  error,
  result,
  promptLayer,
  onDraftChange,
  onPromptLayerChange,
  onPreview,
}) => {
  const { t } = useI18n();
  const hasChat = Boolean(toText(chatId));
  const hasDraft = Boolean(toText(draft));
  const activePrompt = result
    ? result.prompts?.[promptLayer] || ""
    : "";
  const previewLayers = Array.isArray(result?.layers) ? result.layers : [];
  const decisions = Array.isArray(result?.decisions) ? result.decisions : [];

  return (
    <div className="memory-console-pane">
      <div className="memory-preview-layout">
        <section className="memory-info-pane memory-preview-pane memory-preview-pane-input">
          <div className="memory-info-pane-header">
            <div>
              <strong>{t("memoryPreview.panel.input")}</strong>
              <p className="memory-info-pane-hint">
                {t("memoryPreview.panel.inputHint")}
              </p>
            </div>
          </div>

          <div className="memory-preview-context-list">
            <div className="memory-preview-context-item">
              <span>{t("memoryPreview.context.chatId")}</span>
              <strong>{chatId || "--"}</strong>
            </div>
            <div className="memory-preview-context-item">
              <span>{t("memoryPreview.context.agentKey")}</span>
              <strong>{agentKey || "--"}</strong>
            </div>
            <div className="memory-preview-context-item">
              <span>{t("memoryPreview.context.teamId")}</span>
              <strong>{teamId || "--"}</strong>
            </div>
          </div>

          <label className="memory-info-field">
            <span>{t("memoryPreview.field.message")}</span>
            <textarea
              className="settings-textarea memory-preview-textarea"
              value={draft}
              onChange={(event) => onDraftChange(event.currentTarget.value)}
              placeholder={t("memoryPreview.field.messagePlaceholder")}
            />
          </label>

          <div className="memory-info-actions">
            <UiButton
              variant="secondary"
              size="sm"
              loading={loading}
              disabled={!hasChat || !hasDraft}
              onClick={onPreview}
            >
              {t("memoryPreview.actions.preview")}
            </UiButton>
          </div>

          {!hasChat ? (
            <div className="command-empty-state">
              {t("memoryPreview.empty.noChat")}
            </div>
          ) : null}
          {hasChat && !hasDraft ? (
            <div className="command-empty-state">
              {t("memoryPreview.empty.noMessage")}
            </div>
          ) : null}
          {error ? <div className="memory-info-error">{error}</div> : null}

          {result ? (
            <div className="memory-preview-summary-grid">
              <div className="memory-info-detail-card">
                <span className="command-detail-label">
                  {formatPreviewLayerLabel(t, "stable")}
                </span>
                <strong>
                  {t("memoryPreview.summary.selection", {
                    selected:
                      result.summary.selectedCounts?.stable ??
                      result.summary.stableCount,
                    candidate:
                      result.summary.candidateCounts?.stable ??
                      result.summary.stableCount,
                  })}
                </strong>
                <small>
                  {t("memoryPreview.summary.chars", {
                    count: result.summary.stableChars,
                  })}
                </small>
              </div>
              <div className="memory-info-detail-card">
                <span className="command-detail-label">
                  {formatPreviewLayerLabel(t, "session")}
                </span>
                <strong>
                  {t("memoryPreview.summary.selection", {
                    selected:
                      result.summary.selectedCounts?.session ??
                      result.summary.sessionCount,
                    candidate:
                      result.summary.candidateCounts?.session ??
                      result.summary.sessionCount,
                  })}
                </strong>
                <small>
                  {t("memoryPreview.summary.chars", {
                    count: result.summary.sessionChars,
                  })}
                </small>
              </div>
              <div className="memory-info-detail-card">
                <span className="command-detail-label">
                  {formatPreviewLayerLabel(t, "observation")}
                </span>
                <strong>
                  {t("memoryPreview.summary.selection", {
                    selected:
                      result.summary.selectedCounts?.observation ??
                      result.summary.observationCount,
                    candidate:
                      result.summary.candidateCounts?.observation ??
                      result.summary.observationCount,
                  })}
                </strong>
                <small>
                  {t("memoryPreview.summary.chars", {
                    count: result.summary.observationChars,
                  })}
                </small>
              </div>
              <div className="memory-info-detail-card">
                <span className="command-detail-label">
                  {t("memoryPreview.summary.stopReason")}
                </span>
                <strong>{result.summary.stopReason || "--"}</strong>
              </div>
              <div className="memory-info-detail-card">
                <span className="command-detail-label">
                  {t("memoryPreview.summary.snapshotId")}
                </span>
                <strong>{result.summary.snapshotId || "--"}</strong>
              </div>
            </div>
          ) : null}
        </section>

        <section className="memory-info-pane memory-preview-pane memory-preview-pane-result">
          <div className="memory-info-pane-header">
            <div>
              <strong>{t("memoryPreview.panel.prompt")}</strong>
              <p className="memory-info-pane-hint">
                {t("memoryPreview.panel.promptHint")}
              </p>
            </div>
          </div>

          <div className="memory-preview-layer-tabs">
            {PREVIEW_PROMPT_LAYER_ORDER.map((layer) => (
              <UiButton
                key={layer}
                variant="ghost"
                size="sm"
                className={`memory-preview-layer-tab ${promptLayer === layer ? "is-active" : ""}`}
                active={promptLayer === layer}
                onClick={() => onPromptLayerChange(layer)}
              >
                {formatPreviewLayerLabel(t, layer)}
              </UiButton>
            ))}
          </div>

          {!hasChat ? (
            <div className="command-empty-state">
              {t("memoryPreview.empty.noChat")}
            </div>
          ) : loading && !result ? (
            <div className="command-empty-state">
              {t("memoryPreview.loading.preview")}
            </div>
          ) : !hasDraft ? (
            <div className="command-empty-state">
              {t("memoryPreview.empty.noMessage")}
            </div>
          ) : result && !result.enabled ? (
            <div className="command-empty-state">
              {t("memoryPreview.empty.disabled")}
            </div>
          ) : !result ? (
            <div className="command-empty-state">
              {t("memoryPreview.empty.noResult")}
            </div>
          ) : (
            <div className="memory-info-detail-stack">
              <div className="memory-preview-prompt-block">
                <span className="command-detail-label">
                  {formatPreviewLayerLabel(t, promptLayer)}
                </span>
                <pre>{activePrompt || t("memoryPreview.empty.noPrompt")}</pre>
              </div>

              <div className="memory-info-detail-block">
                <span className="command-detail-label">
                  {t("memoryPreview.section.selectedMemory")}
                </span>
                <div className="memory-preview-layer-list">
                  {previewLayers.map((layer) => (
                    <div className="memory-preview-layer-block" key={layer.layer}>
                      <div className="memory-preview-layer-head">
                        <UiTag tone={promptToneForLayer(layer.layer)}>
                          {formatPreviewLayerLabel(t, layer.layer)}
                        </UiTag>
                        <span>
                          {t("memoryPreview.summary.selection", {
                            selected: layer.selectedCount,
                            candidate: layer.candidateCount,
                          })}
                          {" · "}
                          {t("memoryPreview.summary.chars", {
                            count: layer.chars,
                          })}
                        </span>
                      </div>
                      {layer.items.length === 0 ? (
                        <div className="memory-preview-layer-empty">
                          {t("memoryPreview.empty.noItems")}
                        </div>
                      ) : (
                        <div className="memory-preview-item-list">
                          {layer.items.map((item) => (
                            <div
                              className="memory-preview-item"
                              key={`${layer.layer}-${item.id}-${item.order}`}
                            >
                              <div className="memory-preview-item-head">
                                <strong>{toText(item.title) || item.id}</strong>
                                <span>#{item.order}</span>
                              </div>
                              <div className="memory-info-record-meta">
                                <UiTag>{item.kind || "--"}</UiTag>
                                <UiTag tone="muted">
                                  {item.scopeType || "--"}
                                </UiTag>
                                <UiTag tone="muted">
                                  {item.category || "--"}
                                </UiTag>
                                <UiTag tone={toneForStatus(item.status)}>
                                  {item.status || "--"}
                                </UiTag>
                              </div>
                              <div className="memory-info-record-summary">
                                {toText(item.summary) ||
                                  t("memoryInfo.empty.noSummary")}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="memory-info-detail-block">
                <span className="command-detail-label">
                  {t("memoryPreview.section.decisions")}
                </span>
                {decisions.length === 0 ? (
                  <div className="memory-preview-layer-empty">
                    {t("memoryPreview.empty.noDecisions")}
                  </div>
                ) : (
                  <div className="memory-preview-decision-list">
                    {decisions.map((decision, index) => (
                      <div
                        className="memory-preview-decision-item"
                        key={`${decision.layer}-${decision.reason}-${index}`}
                      >
                        <div className="memory-preview-decision-head">
                          <UiTag tone={promptToneForLayer(decision.layer)}>
                            {formatPreviewLayerLabel(t, decision.layer)}
                          </UiTag>
                          <strong>{decision.reason || "--"}</strong>
                        </div>
                        <div className="memory-info-detail-content">
                          {Array.isArray(decision.itemIds) &&
                          decision.itemIds.length > 0
                            ? decision.itemIds.join(", ")
                            : "--"}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export const MemoryInfoModalView: React.FC<MemoryInfoModalViewProps> = ({
  open,
  title,
  subtitle,
  activeTab,
  onTabChange,
  onClose,
  recordsPanel,
  preferencesPanel,
  previewPanel,
}) => {
  const { t } = useI18n();

  if (!open) {
    return null;
  }

  return (
    <div
      className="modal"
      id="memory-info-modal"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="modal-card memory-info-card"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
        tabIndex={-1}
      >
        <div className="settings-head memory-info-head">
          <div>
            <h3>{title}</h3>
            <p className="memory-info-subtitle">{subtitle}</p>
          </div>
          <UiButton variant="ghost" size="sm" onClick={onClose}>
            {t("memoryInfo.actions.close")}
          </UiButton>
        </div>

        <div className="memory-console-tabs settings-segmented">
          <UiButton
            variant="ghost"
            size="sm"
            className={`settings-segmented-btn ${activeTab === "preferences" ? "is-active" : ""}`}
            active={activeTab === "preferences"}
            onClick={() => onTabChange("preferences")}
          >
            {t("memoryPreferences.tab")}
          </UiButton>
          <UiButton
            variant="ghost"
            size="sm"
            className={`settings-segmented-btn ${activeTab === "preview" ? "is-active" : ""}`}
            active={activeTab === "preview"}
            onClick={() => onTabChange("preview")}
          >
            {t("memoryPreview.tab")}
          </UiButton>
          <UiButton
            variant="ghost"
            size="sm"
            className={`settings-segmented-btn ${activeTab === "records" ? "is-active" : ""}`}
            active={activeTab === "records"}
            onClick={() => onTabChange("records")}
          >
            {t("memoryInfo.tab")}
          </UiButton>
        </div>

        {activeTab === "preferences" ? (
          <MemoryPreferencesPanelView {...preferencesPanel} />
        ) : activeTab === "preview" ? (
          <MemoryPreviewPanelView {...previewPanel} />
        ) : (
          <MemoryRecordsPanelView {...recordsPanel} />
        )}
      </div>
    </div>
  );
};

function createEmptyPreferenceStateUpdates() {
  return {
    memoryPreferenceScopes: [],
    memoryPreferenceActiveScopeType: "agent",
    memoryPreferenceActiveScopeKey: "",
    memoryPreferenceLabel: "AGENT",
    memoryPreferenceFileName: "AGENT.md",
    memoryPreferenceMeta: null,
    memoryPreferenceLoading: false,
    memoryPreferenceError: "",
    memoryPreferenceMarkdownDraft: "",
    memoryPreferenceRecordsDraft: [],
    memoryPreferenceSelectedRecordId: "",
    memoryPreferenceDirty: false,
    memoryPreferenceSaving: false,
    memoryPreferenceSaveSummary: null,
    memoryPreferenceValidation: null,
  };
}

export const MemoryInfoModal: React.FC = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { t } = useI18n();
  const listRequestSeqRef = useRef(0);
  const detailRequestSeqRef = useRef(0);
  const preferenceScopesSeqRef = useRef(0);
  const preferenceScopeSeqRef = useRef(0);
  const metaLoadAttemptedRef = useRef(false);
  const previewAutoTriggeredRef = useRef(false);
  const recordsLoadSignatureRef = useRef("");
  const preferencesLoadSignatureRef = useRef("");
  const preferenceTitleInputRef = useRef<HTMLInputElement>(null);
  const preferenceSummaryTextareaRef = useRef<HTMLTextAreaElement>(null);
  const preferenceCategoryInputRef = useRef<HTMLSelectElement>(null);
  const preferenceImportanceInputRef = useRef<HTMLInputElement>(null);
  const preferenceConfidenceInputRef = useRef<HTMLInputElement>(null);
  const preferenceTagsInputRef = useRef<HTMLInputElement>(null);
  const preferenceMarkdownTextareaRef = useRef<HTMLTextAreaElement>(null);
  const agentContext = useMemo(
    () =>
      resolveMemoryAgentContext({
        agents: state.agents,
        teams: state.teams,
        chats: state.chats,
        chatId: state.chatId,
        chatAgentById: state.chatAgentById,
        workerSelectionKey: state.workerSelectionKey,
        workerIndexByKey: state.workerIndexByKey,
        workerRows: state.workerRows,
        workerRelatedChats: state.workerRelatedChats,
      }),
    [
      state.agents,
      state.teams,
      state.chats,
      state.chatId,
      state.chatAgentById,
      state.workerSelectionKey,
      state.workerIndexByKey,
      state.workerRows,
      state.workerRelatedChats,
    ],
  );
  const currentChat = useMemo(
    () =>
      state.chats.find((chat) => toText(chat.chatId) === toText(state.chatId)) ||
      null,
    [state.chatId, state.chats],
  );
  const currentTeamId = toText(currentChat?.teamId);

  const closeModal = useCallback(() => {
    dispatch({ type: "SET_MEMORY_INFO_OPEN", open: false });
  }, [dispatch]);

  const updateFilter = useCallback(
    (field: MemoryInfoFilterField, value: string) => {
      const nextValue =
        field === "limit"
          ? Math.max(1, Math.min(100, Number.parseInt(value || "20", 10) || 20))
          : value;
      dispatch({
        type: "SET_MEMORY_INFO_FILTERS",
        filters: { [field]: nextValue },
      });
    },
    [dispatch],
  );

  const loadMemoryMeta = useCallback(async () => {
    if (state.memoryMeta || metaLoadAttemptedRef.current) {
      return;
    }
    metaLoadAttemptedRef.current = true;
    try {
      const response = await getMemoryMeta();
      dispatch({ type: "SET_MEMORY_META", meta: response.data });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      dispatch({
        type: "APPEND_DEBUG",
        line: `[memory meta] ${message}`,
      });
    }
  }, [dispatch, state.memoryMeta]);

  const runMemoryPreview = useCallback(
    async (messageOverride?: string) => {
      const chatId = toText(state.chatId);
      const message = toText(
        messageOverride !== undefined
          ? messageOverride
          : state.memoryPreviewDraft,
      );
      if (!chatId || !message) {
        return;
      }
      dispatch({
        type: "BATCH_UPDATE",
        updates: {
          memoryPreviewLoading: true,
          memoryPreviewError: "",
          memoryPreviewResult: null,
        },
      });
      try {
        const response = await previewMemoryContext({ chatId, message });
        dispatch({
          type: "BATCH_UPDATE",
          updates: {
            memoryPreviewLoading: false,
            memoryPreviewError: "",
            memoryPreviewResult: response.data,
          },
        });
      } catch (error) {
        const messageText =
          error instanceof Error ? error.message : String(error);
        dispatch({
          type: "BATCH_UPDATE",
          updates: {
            memoryPreviewLoading: false,
            memoryPreviewError: t("memoryPreview.errors.load", {
              detail: messageText,
            }),
            memoryPreviewResult: null,
          },
        });
      }
    },
    [dispatch, state.chatId, state.memoryPreviewDraft, t],
  );

  const loadDetail = useCallback(
    async (id: string, agentKeyOverride?: string) => {
      const agentKey = toText(agentKeyOverride) || agentContext.agentKey;
      if (!id) {
        dispatch({ type: "SET_MEMORY_INFO_DETAIL", detail: null });
        dispatch({ type: "SET_MEMORY_INFO_DETAIL_ERROR", error: "" });
        dispatch({ type: "SET_MEMORY_INFO_DETAIL_LOADING", loading: false });
        return;
      }

      const seq = ++detailRequestSeqRef.current;
      dispatch({ type: "SET_MEMORY_INFO_DETAIL_LOADING", loading: true });
      dispatch({ type: "SET_MEMORY_INFO_DETAIL_ERROR", error: "" });

      try {
        let response: Awaited<ReturnType<typeof getMemoryRecord>>;
        try {
          response = await getMemoryRecord(agentKey || undefined, id);
        } catch (error) {
          if (!agentKey) {
            throw error;
          }
          response = await getMemoryRecord(undefined, id);
        }
        if (seq !== detailRequestSeqRef.current) return;
        dispatch({ type: "SET_MEMORY_INFO_DETAIL", detail: response.data });
      } catch (error) {
        if (seq !== detailRequestSeqRef.current) return;
        const message = error instanceof Error ? error.message : String(error);
        dispatch({
          type: "SET_MEMORY_INFO_DETAIL_ERROR",
          error: t("memoryInfo.errors.loadDetail", { detail: message }),
        });
        dispatch({ type: "SET_MEMORY_INFO_DETAIL", detail: null });
      } finally {
        if (seq === detailRequestSeqRef.current) {
          dispatch({ type: "SET_MEMORY_INFO_DETAIL_LOADING", loading: false });
        }
      }
    },
    [agentContext.agentKey, dispatch, t],
  );

  const loadRecords = useCallback(async () => {
    const seq = ++listRequestSeqRef.current;
    dispatch({ type: "SET_MEMORY_INFO_LOADING", loading: true });
    dispatch({ type: "SET_MEMORY_INFO_ERROR", error: "" });

    try {
      const baseRequest = {
        keyword: state.memoryInfoFilters.keyword,
        kind: state.memoryInfoFilters.kind,
        scopeType: state.memoryInfoFilters.scopeType,
        status: state.memoryInfoFilters.status,
        category: state.memoryInfoFilters.category,
        limit: state.memoryInfoFilters.limit,
      };
      const hasExplicitFilter = Boolean(
        toText(baseRequest.keyword) ||
          toText(baseRequest.kind) ||
          toText(baseRequest.scopeType) ||
          toText(baseRequest.status) ||
          toText(baseRequest.category),
      );
      let response = await getMemoryRecords({
        agentKey: agentContext.agentKey || undefined,
        ...baseRequest,
      });
      if (
        agentContext.agentKey &&
        !hasExplicitFilter &&
        (!Array.isArray(response.data?.results) ||
          response.data.results.length === 0)
      ) {
        response = await getMemoryRecords(baseRequest);
      }
      if (seq !== listRequestSeqRef.current) return;
      const records = Array.isArray(response.data?.results)
        ? response.data.results
        : [];
      const nextSelectedRecordId = records.some(
        (item) => item.id === state.memoryInfoSelectedRecordId,
      )
        ? state.memoryInfoSelectedRecordId
        : records[0]?.id || "";
      const nextSelectedRecord = records.find(
        (item) => item.id === nextSelectedRecordId,
      );

      dispatch({
        type: "SET_MEMORY_INFO_RECORDS",
        records,
        nextCursor: response.data?.nextCursor || "",
        selectedRecordId: nextSelectedRecordId,
      });

      if (!nextSelectedRecordId) {
        dispatch({ type: "SET_MEMORY_INFO_DETAIL", detail: null });
        dispatch({ type: "SET_MEMORY_INFO_DETAIL_ERROR", error: "" });
        dispatch({ type: "SET_MEMORY_INFO_DETAIL_LOADING", loading: false });
        return;
      }

      if (
        state.memoryInfoDetail?.id !== nextSelectedRecordId ||
        detailRequestSeqRef.current === 0
      ) {
        void loadDetail(
          nextSelectedRecordId,
          nextSelectedRecord?.agentKey || agentContext.agentKey || undefined,
        );
      }
    } catch (error) {
      if (seq !== listRequestSeqRef.current) return;
      const message = error instanceof Error ? error.message : String(error);
      dispatch({
        type: "SET_MEMORY_INFO_ERROR",
        error: t("memoryInfo.errors.loadRecords", { detail: message }),
      });
      dispatch({
        type: "SET_MEMORY_INFO_RECORDS",
        records: [],
        nextCursor: "",
        selectedRecordId: "",
      });
      dispatch({ type: "SET_MEMORY_INFO_DETAIL", detail: null });
    } finally {
      if (seq === listRequestSeqRef.current) {
        dispatch({ type: "SET_MEMORY_INFO_LOADING", loading: false });
      }
    }
  }, [
    agentContext.agentKey,
    dispatch,
    loadDetail,
    state.memoryInfoDetail?.id,
    state.memoryInfoFilters.category,
    state.memoryInfoFilters.keyword,
    state.memoryInfoFilters.kind,
    state.memoryInfoFilters.limit,
    state.memoryInfoFilters.scopeType,
    state.memoryInfoFilters.status,
    state.memoryInfoSelectedRecordId,
    t,
  ]);

  const loadPreferenceScope = useCallback(
    async (
      scopeType: MemoryPreferenceScopeType,
      scopeKey?: string,
      options: {
        preserveSaveSummary?: boolean;
        preserveValidation?: boolean;
      } = {},
    ) => {
      if (!agentContext.agentKey) {
        dispatch({
          type: "BATCH_UPDATE",
          updates: createEmptyPreferenceStateUpdates(),
        });
        return;
      }

      const seq = ++preferenceScopeSeqRef.current;
      dispatch({
        type: "BATCH_UPDATE",
        updates: {
          memoryPreferenceLoading: true,
          memoryPreferenceError: "",
          ...(options.preserveSaveSummary
            ? {}
            : { memoryPreferenceSaveSummary: null }),
          ...(options.preserveValidation
            ? {}
            : { memoryPreferenceValidation: null }),
        },
      });

      try {
        const response = await getMemoryScope(
          agentContext.agentKey,
          scopeType,
          scopeKey,
        );
        if (seq !== preferenceScopeSeqRef.current) return;
        const detail = response.data;
        const drafts = hydratePreferenceDrafts(detail.records || []);
        dispatch({
          type: "BATCH_UPDATE",
          updates: {
            memoryPreferenceActiveScopeType:
              normalizePreferenceScopeType(detail.scopeType),
            memoryPreferenceActiveScopeKey: detail.scopeKey,
            memoryPreferenceLabel: detail.label,
            memoryPreferenceFileName: detail.fileName,
            memoryPreferenceMeta: detail.meta,
            memoryPreferenceMarkdownDraft: detail.markdown,
            memoryPreferenceRecordsDraft: drafts,
            memoryPreferenceSelectedRecordId: drafts[0]?.clientId || "",
            memoryPreferenceDirty: false,
            memoryPreferenceLoading: false,
            memoryPreferenceError: "",
          },
        });
      } catch (error) {
        if (seq !== preferenceScopeSeqRef.current) return;
        const message = error instanceof Error ? error.message : String(error);
        dispatch({
          type: "BATCH_UPDATE",
          updates: {
            memoryPreferenceLoading: false,
            memoryPreferenceError: t("memoryPreferences.errors.loadScope", {
              detail: message,
            }),
          },
        });
      }
    },
    [agentContext.agentKey, dispatch, t],
  );

  const loadPreferenceScopes = useCallback(
    async (preferredScopeType?: MemoryPreferenceScopeType) => {
      if (!agentContext.agentKey) {
        dispatch({
          type: "BATCH_UPDATE",
          updates: createEmptyPreferenceStateUpdates(),
        });
        return;
      }

      const seq = ++preferenceScopesSeqRef.current;
      dispatch({
        type: "BATCH_UPDATE",
        updates: {
          memoryPreferenceLoading: true,
          memoryPreferenceError: "",
          memoryPreferenceSaveSummary: null,
          memoryPreferenceValidation: null,
        },
      });

      try {
        const response = await getMemoryScopes(agentContext.agentKey);
        if (seq !== preferenceScopesSeqRef.current) return;
        const scopes = Array.isArray(response.data?.scopes)
          ? response.data.scopes
          : [];
        const targetScopeType =
          preferredScopeType || preferredScopeTypeFromSummaries(scopes);
        dispatch({ type: "SET_MEMORY_PREFERENCE_SCOPES", scopes });
        const matchedScope =
          scopes.find(
            (scope) =>
              normalizePreferenceScopeType(scope.scopeType) === targetScopeType,
          ) || null;
        await loadPreferenceScope(targetScopeType, matchedScope?.scopeKey);
      } catch (error) {
        if (seq !== preferenceScopesSeqRef.current) return;
        const message = error instanceof Error ? error.message : String(error);
        dispatch({
          type: "BATCH_UPDATE",
          updates: {
            memoryPreferenceLoading: false,
            memoryPreferenceError: t("memoryPreferences.errors.loadScopes", {
              detail: message,
            }),
          },
        });
      }
    },
    [agentContext.agentKey, dispatch, loadPreferenceScope, t],
  );

  const handlePreferenceScopeSelect = useCallback(
    (scopeType: MemoryPreferenceScopeType) => {
      if (state.memoryPreferenceDirty) {
        dispatch({
          type: "SET_MEMORY_PREFERENCE_ERROR",
          error: t("memoryPreferences.notice.unsaved"),
        });
        return;
      }
      const matchedScope =
        state.memoryPreferenceScopes.find(
          (scope) => normalizePreferenceScopeType(scope.scopeType) === scopeType,
        ) || null;
      void loadPreferenceScope(scopeType, matchedScope?.scopeKey);
    },
    [
      dispatch,
      loadPreferenceScope,
      state.memoryPreferenceDirty,
      state.memoryPreferenceScopes,
      t,
    ],
  );

  const handlePreferenceModeChange = useCallback(
    (mode: MemoryPreferenceMode) => {
      dispatch({ type: "SET_MEMORY_PREFERENCE_MODE", mode });
      dispatch({ type: "SET_MEMORY_PREFERENCE_ERROR", error: "" });
      dispatch({ type: "SET_MEMORY_PREFERENCE_VALIDATION", validation: null });
    },
    [dispatch],
  );

  const handlePreferenceMarkdownChange = useCallback(
    (markdown: string) => {
      dispatch({
        type: "BATCH_UPDATE",
        updates: {
          memoryPreferenceMarkdownDraft: markdown,
          memoryPreferenceDirty: true,
          memoryPreferenceError: "",
          memoryPreferenceSaveSummary: null,
          memoryPreferenceValidation: null,
        },
      });
    },
    [dispatch],
  );

  const handlePreferenceRecordFieldChange = useCallback(
    (field: PreferenceRecordField, value: string) => {
      const selectedId = state.memoryPreferenceSelectedRecordId;
      if (!selectedId) return;
      const nextRecords = state.memoryPreferenceRecordsDraft.map((record) => {
        if (record.clientId !== selectedId) {
          return record;
        }
        switch (field) {
          case "importance":
            return {
              ...record,
              importance: Number.parseInt(value || "0", 10) || 0,
            };
          case "confidence":
            return {
              ...record,
              confidence: Number.parseFloat(value || "0") || 0,
            };
          case "tags":
            return {
              ...record,
              tags: value
                .split(/[,\n\uFF0C]/)
                .map((item) => toText(item))
                .filter(Boolean),
            };
          default:
            return {
              ...record,
              [field]: value,
            };
        }
      });
      dispatch({
        type: "BATCH_UPDATE",
        updates: {
          memoryPreferenceRecordsDraft: nextRecords,
          memoryPreferenceDirty: true,
          memoryPreferenceError: "",
          memoryPreferenceSaveSummary: null,
        },
      });
    },
    [dispatch, state.memoryPreferenceRecordsDraft, state.memoryPreferenceSelectedRecordId],
  );

  const handlePreferenceNewRecord = useCallback(() => {
    const draft = createMemoryPreferenceDraftRecord({
      category: "general",
      importance: 5,
      confidence: 0.9,
      tags: [],
      status: "active",
      scopeType: state.memoryPreferenceActiveScopeType,
      scopeKey: state.memoryPreferenceActiveScopeKey,
    } as Partial<MemoryScopeDraftRecord>);
    const nextRecords = [draft, ...state.memoryPreferenceRecordsDraft];
    dispatch({
      type: "BATCH_UPDATE",
      updates: {
        memoryPreferenceMode: "records",
        memoryPreferenceRecordsDraft: nextRecords,
        memoryPreferenceSelectedRecordId: draft.clientId,
        memoryPreferenceDirty: true,
        memoryPreferenceError: "",
        memoryPreferenceSaveSummary: null,
      },
    });
  }, [
    dispatch,
    state.memoryPreferenceActiveScopeKey,
    state.memoryPreferenceActiveScopeType,
    state.memoryPreferenceRecordsDraft,
  ]);

  const handlePreferenceDeleteRecord = useCallback(
    (id: string) => {
      const nextRecords = state.memoryPreferenceRecordsDraft.filter(
        (record) => record.clientId !== id,
      );
      const nextSelectedId =
        state.memoryPreferenceSelectedRecordId === id
          ? nextRecords[0]?.clientId || ""
          : state.memoryPreferenceSelectedRecordId;
      dispatch({
        type: "BATCH_UPDATE",
        updates: {
          memoryPreferenceRecordsDraft: nextRecords,
          memoryPreferenceSelectedRecordId: nextSelectedId,
          memoryPreferenceDirty: true,
          memoryPreferenceError: "",
          memoryPreferenceSaveSummary: null,
        },
      });
    },
    [
      dispatch,
      state.memoryPreferenceRecordsDraft,
      state.memoryPreferenceSelectedRecordId,
    ],
  );

  const handlePreferenceValidate = useCallback(async () => {
    if (!agentContext.agentKey) return;
    if (state.memoryPreferenceMode !== "markdown") return;
    const syncedMarkdownDraft =
      preferenceMarkdownTextareaRef.current?.value ??
      state.memoryPreferenceMarkdownDraft;
    if (syncedMarkdownDraft !== state.memoryPreferenceMarkdownDraft) {
      dispatch({
        type: "SET_MEMORY_PREFERENCE_MARKDOWN_DRAFT",
        markdown: syncedMarkdownDraft,
      });
    }
    dispatch({
      type: "BATCH_UPDATE",
      updates: {
        memoryPreferenceLoading: true,
        memoryPreferenceError: "",
      },
    });
    try {
      const response = await validateMemoryScope(
        agentContext.agentKey,
        state.memoryPreferenceActiveScopeType,
        syncedMarkdownDraft,
      );
      dispatch({
        type: "BATCH_UPDATE",
        updates: {
          memoryPreferenceValidation: response.data,
          memoryPreferenceLoading: false,
          memoryPreferenceError: "",
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      dispatch({
        type: "BATCH_UPDATE",
        updates: {
          memoryPreferenceLoading: false,
          memoryPreferenceError: t("memoryPreferences.errors.validate", {
            detail: message,
          }),
        },
      });
    }
  }, [
    agentContext.agentKey,
    dispatch,
    state.memoryPreferenceActiveScopeType,
    state.memoryPreferenceMarkdownDraft,
    state.memoryPreferenceMode,
    t,
  ]);

  const handlePreferenceSave = useCallback(async () => {
    if (!agentContext.agentKey) return;
    const syncedRecordsDraft =
      state.memoryPreferenceMode === "records"
        ? syncSelectedPreferenceDraftFromLiveValues(
            state.memoryPreferenceRecordsDraft,
            state.memoryPreferenceSelectedRecordId,
            {
              title: preferenceTitleInputRef.current?.value,
              summary: preferenceSummaryTextareaRef.current?.value,
              category: preferenceCategoryInputRef.current?.value,
              importance: preferenceImportanceInputRef.current?.value,
              confidence: preferenceConfidenceInputRef.current?.value,
              tags: preferenceTagsInputRef.current?.value,
            },
          )
        : state.memoryPreferenceRecordsDraft;
    const syncedMarkdownDraft =
      preferenceMarkdownTextareaRef.current?.value ??
      state.memoryPreferenceMarkdownDraft;
    const syncUpdates: Record<string, unknown> = {};
    if (
      state.memoryPreferenceMode === "records" &&
      syncedRecordsDraft !== state.memoryPreferenceRecordsDraft
    ) {
      syncUpdates.memoryPreferenceRecordsDraft = syncedRecordsDraft;
    }
    if (
      state.memoryPreferenceMode === "markdown" &&
      syncedMarkdownDraft !== state.memoryPreferenceMarkdownDraft
    ) {
      syncUpdates.memoryPreferenceMarkdownDraft = syncedMarkdownDraft;
    }
    dispatch({
      type: "BATCH_UPDATE",
      updates: {
        ...syncUpdates,
        memoryPreferenceSaving: true,
        memoryPreferenceError: "",
        memoryPreferenceSaveSummary: null,
      },
    });

    try {
      if (state.memoryPreferenceMode === "markdown") {
        const validationResponse = await validateMemoryScope(
          agentContext.agentKey,
          state.memoryPreferenceActiveScopeType,
          syncedMarkdownDraft,
        );
        dispatch({
          type: "SET_MEMORY_PREFERENCE_VALIDATION",
          validation: validationResponse.data,
        });
        if (!validationResponse.data.valid) {
          dispatch({
            type: "BATCH_UPDATE",
            updates: {
              memoryPreferenceSaving: false,
              memoryPreferenceError: "",
            },
          });
          return;
        }
      }

      const response = await saveMemoryScope({
        agentKey: agentContext.agentKey,
        scopeType: state.memoryPreferenceActiveScopeType,
        scopeKey: state.memoryPreferenceActiveScopeKey || undefined,
        mode: state.memoryPreferenceMode,
        archiveMissing: true,
        ...(state.memoryPreferenceMode === "markdown"
          ? { markdown: syncedMarkdownDraft }
          : {
              records: toScopeRecordInputs(syncedRecordsDraft),
            }),
      });

      dispatch({
        type: "BATCH_UPDATE",
        updates: {
          memoryPreferenceSaving: false,
          memoryPreferenceSaveSummary: response.data.summary,
          memoryPreferenceValidation: null,
        },
      });
      await loadPreferenceScope(
        normalizePreferenceScopeType(response.data.scopeType),
        response.data.scopeKey,
        { preserveSaveSummary: true, preserveValidation: false },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      dispatch({
        type: "BATCH_UPDATE",
        updates: {
          memoryPreferenceSaving: false,
          memoryPreferenceError: t("memoryPreferences.errors.save", {
            detail: message,
          }),
        },
      });
    }
  }, [
    agentContext.agentKey,
    dispatch,
    loadPreferenceScope,
    state.memoryPreferenceActiveScopeKey,
    state.memoryPreferenceActiveScopeType,
    state.memoryPreferenceMarkdownDraft,
    state.memoryPreferenceMode,
    state.memoryPreferenceRecordsDraft,
    state.memoryPreferenceSelectedRecordId,
    t,
  ]);

  useEffect(() => {
    if (state.memoryInfoOpen) {
      return;
    }
    listRequestSeqRef.current += 1;
    detailRequestSeqRef.current += 1;
    preferenceScopesSeqRef.current += 1;
    preferenceScopeSeqRef.current += 1;
    metaLoadAttemptedRef.current = false;
    previewAutoTriggeredRef.current = false;
    recordsLoadSignatureRef.current = "";
    preferencesLoadSignatureRef.current = "";
  }, [state.memoryInfoOpen]);

  useEffect(() => {
    if (!state.memoryInfoOpen) {
      return;
    }
    void loadMemoryMeta();
  }, [loadMemoryMeta, state.memoryInfoOpen]);

  useEffect(() => {
    if (!state.memoryInfoOpen) {
      return;
    }
    if (state.memoryConsoleTab !== "records") {
      return;
    }
    const signature = `${agentContext.agentKey || "__all__"}:records`;
    if (recordsLoadSignatureRef.current === signature) {
      return;
    }
    recordsLoadSignatureRef.current = signature;
    void loadRecords();
  }, [agentContext.agentKey, loadRecords, state.memoryConsoleTab, state.memoryInfoOpen]);

  useEffect(() => {
    if (!state.memoryInfoOpen || !agentContext.agentKey) {
      return;
    }
    if (state.memoryConsoleTab !== "preferences") {
      return;
    }
    const signature = `${agentContext.agentKey}:preferences`;
    if (preferencesLoadSignatureRef.current === signature) {
      return;
    }
    preferencesLoadSignatureRef.current = signature;
    void loadPreferenceScopes();
  }, [
    agentContext.agentKey,
    loadPreferenceScopes,
    state.memoryConsoleTab,
    state.memoryInfoOpen,
  ]);

  useEffect(() => {
    if (!state.memoryInfoOpen || state.memoryConsoleTab !== "preview") {
      return;
    }
    if (state.memoryPreviewDraft || !state.composerDraft) {
      return;
    }
    dispatch({
      type: "SET_MEMORY_PREVIEW_DRAFT",
      draft: state.composerDraft,
    });
  }, [
    dispatch,
    state.composerDraft,
    state.memoryConsoleTab,
    state.memoryInfoOpen,
    state.memoryPreviewDraft,
  ]);

  useEffect(() => {
    if (!state.memoryInfoOpen || state.memoryConsoleTab !== "preview") {
      return;
    }
    if (previewAutoTriggeredRef.current) {
      return;
    }
    if (
      !toText(state.chatId) ||
      !toText(state.memoryPreviewDraft) ||
      toText(state.memoryPreviewDraft) !== toText(state.composerDraft)
    ) {
      return;
    }
    previewAutoTriggeredRef.current = true;
    void runMemoryPreview(state.memoryPreviewDraft);
  }, [
    state.composerDraft,
    runMemoryPreview,
    state.chatId,
    state.memoryConsoleTab,
    state.memoryInfoOpen,
    state.memoryPreviewDraft,
  ]);

  const subtitle = agentContext.agentKey
    ? t("memoryInfo.subtitle", {
        label: agentContext.label || agentContext.agentKey,
      })
    : t("memoryInfo.subtitleEmpty");

  return (
    <MemoryInfoModalView
      open={state.memoryInfoOpen}
      title={t("memoryInfo.title")}
      subtitle={subtitle}
      activeTab={state.memoryConsoleTab}
      onTabChange={(tab) => dispatch({ type: "SET_MEMORY_CONSOLE_TAB", tab })}
      onClose={closeModal}
      recordsPanel={{
        agentKey: agentContext.agentKey,
        loading: state.memoryInfoLoading,
        error: state.memoryInfoError,
        memoryMeta: state.memoryMeta,
        records: state.memoryInfoRecords,
        selectedRecordId: state.memoryInfoSelectedRecordId,
        detail: state.memoryInfoDetail,
        detailLoading: state.memoryInfoDetailLoading,
        detailError: state.memoryInfoDetailError,
        filters: state.memoryInfoFilters,
        missingAgent: false,
        onQuery: () => {
          void loadRecords();
        },
        onRefresh: () => {
          void loadRecords();
        },
        onSelectRecord: (id) => {
          dispatch({ type: "SET_MEMORY_INFO_SELECTED_RECORD_ID", id });
          const record = state.memoryInfoRecords.find((item) => item.id === id);
          void loadDetail(id, record?.agentKey || agentContext.agentKey || undefined);
        },
        onFilterChange: updateFilter,
      }}
      preferencesPanel={{
        agentKey: agentContext.agentKey,
        missingAgent: !agentContext.agentKey,
        scopes: state.memoryPreferenceScopes,
        activeScopeType: state.memoryPreferenceActiveScopeType,
        activeScopeKey: state.memoryPreferenceActiveScopeKey,
        label: state.memoryPreferenceLabel,
        fileName: state.memoryPreferenceFileName,
        meta: state.memoryPreferenceMeta,
        memoryMeta: state.memoryMeta,
        loading: state.memoryPreferenceLoading,
        error: state.memoryPreferenceError,
        mode: state.memoryPreferenceMode,
        markdownDraft: state.memoryPreferenceMarkdownDraft,
        recordsDraft: state.memoryPreferenceRecordsDraft,
        selectedRecordId: state.memoryPreferenceSelectedRecordId,
        dirty: state.memoryPreferenceDirty,
        saving: state.memoryPreferenceSaving,
        saveSummary: state.memoryPreferenceSaveSummary,
        validation: state.memoryPreferenceValidation,
        editorRefs: {
          title: preferenceTitleInputRef,
          summary: preferenceSummaryTextareaRef,
          category: preferenceCategoryInputRef,
          importance: preferenceImportanceInputRef,
          confidence: preferenceConfidenceInputRef,
          tags: preferenceTagsInputRef,
          markdown: preferenceMarkdownTextareaRef,
        },
        onScopeSelect: handlePreferenceScopeSelect,
        onModeChange: handlePreferenceModeChange,
        onMarkdownChange: handlePreferenceMarkdownChange,
        onRecordFieldChange: handlePreferenceRecordFieldChange,
        onSelectRecord: (id) =>
          dispatch({ type: "SET_MEMORY_PREFERENCE_SELECTED_RECORD_ID", id }),
        onNewRecord: handlePreferenceNewRecord,
        onDeleteRecord: handlePreferenceDeleteRecord,
        onValidate: () => {
          void handlePreferenceValidate();
        },
        onSave: () => {
          void handlePreferenceSave();
        },
      }}
      previewPanel={{
        agentKey: agentContext.agentKey,
        chatId: state.chatId,
        teamId: currentTeamId,
        draft: state.memoryPreviewDraft,
        loading: state.memoryPreviewLoading,
        error: state.memoryPreviewError,
        result: state.memoryPreviewResult,
        promptLayer: state.memoryPreviewPromptLayer,
        onDraftChange: (draft) =>
          dispatch({ type: "SET_MEMORY_PREVIEW_DRAFT", draft }),
        onPromptLayerChange: (layer) =>
          dispatch({ type: "SET_MEMORY_PREVIEW_PROMPT_LAYER", layer }),
        onPreview: () => {
          void runMemoryPreview();
        },
      }}
    />
  );
};
