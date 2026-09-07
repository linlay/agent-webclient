import React from "react";
import type {
  MemoryInfoFilters,
  MemoryMeta,
  MemoryRecordDetail,
  MemoryRecordListItem,
} from "@/shared/data/memory/memoryTypes";
import { UiButton } from "@/shared/ui/UiButton";
import { UiTag } from "@/shared/ui/UiTag";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { useI18n } from "@/shared/i18n";
import {
  formatMemoryJson,
  formatMemoryTimestamp,
  normalizeMemoryTagList,
} from "@/features/memory/lib/memoryInfo";
import { toText } from "@/shared/utils/eventUtils";
import {
  MEMORY_CONSOLE_PANE_CLASS_NAME,
  MEMORY_INFO_LAYOUT_CLASS_NAME,
  MEMORY_INFO_PANE_CLASS_NAME,
  MEMORY_INFO_PANE_HEADER_CLASS_NAME,
  MEMORY_INFO_PANE_HINT_CLASS_NAME,
  MEMORY_INFO_ACTIONS_CLASS_NAME,
  MEMORY_PANE_LIST_FILTER_GRID_CLASS_NAME,
  MEMORY_PANE_LIST_FIELD_CLASS_NAME,
  MEMORY_FIELD_WIDE_CLASS_NAME,
  MEMORY_INFO_INPUT_CLASS_NAME,
  MEMORY_INFO_SELECT_CLASS_NAME,
  MEMORY_INFO_ERROR_CLASS_NAME,
  COMMAND_EMPTY_STATE_CLASS_NAME,
  COMMAND_DETAIL_LABEL_CLASS_NAME,
  MEMORY_INFO_RECORD_LIST_CLASS_NAME,
  MEMORY_INFO_RECORD_ITEM_CLASS_NAME,
  MEMORY_RECORD_HEAD_CLASS_NAME,
  MEMORY_RECORD_META_CLASS_NAME,
  MEMORY_DETAIL_STACK_CLASS_NAME,
  MEMORY_DETAIL_TITLE_CLASS_NAME,
  MEMORY_DETAIL_BADGES_CLASS_NAME,
  MEMORY_DETAIL_SUMMARY_CLASS_NAME,
  MEMORY_DETAIL_GRID_CLASS_NAME,
  MEMORY_DETAIL_CARD_CLASS_NAME,
  MEMORY_DETAIL_BLOCK_CLASS_NAME,
  MEMORY_RAW_BLOCK_CLASS_NAME,
  MEMORY_RAW_SUMMARY_CLASS_NAME,
  toneForStatus,
  formatDetailValue,
  mergeMemoryMetaOptions,
  renderMemoryDetailRows,
} from "@/features/memory/lib/memoryPanelPresentation";

export type MemoryInfoFilterField = keyof MemoryInfoFilters;
export interface MemoryRecordsPanelProps {
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


export const MemoryRecordsPanelView: React.FC<MemoryRecordsPanelProps> = ({
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
  );
  const scopeTypeOptions = mergeMemoryMetaOptions(
    memoryMeta?.scopeTypes,
    ["user", "agent", "team", "chat", "global"],
  );
  const statusOptions = mergeMemoryMetaOptions(
    memoryMeta?.statuses,
    ["active", "open", "superseded", "archived", "contested"],
  );
  const categoryOptions = mergeMemoryMetaOptions(
    memoryMeta?.categories,
    ["general", "remember", "identity", "work_rules", "bugfix"],
  );

  return (
    <div className={MEMORY_CONSOLE_PANE_CLASS_NAME}>
      <div className={MEMORY_INFO_LAYOUT_CLASS_NAME}>
        <section className={`${MEMORY_INFO_PANE_CLASS_NAME} memory-info-pane-list`}>
          <div className={MEMORY_INFO_PANE_HEADER_CLASS_NAME}>
            <div>
              <strong>{t("memoryInfo.panel.records")}</strong>
              {agentKey ? (
                <p className={MEMORY_INFO_PANE_HINT_CLASS_NAME}>
                  {t("memoryInfo.currentAgent", { agentKey })}
                </p>
              ) : null}
            </div>
            <div className={MEMORY_INFO_ACTIONS_CLASS_NAME}>
              <UiButton variant="secondary" size="sm" onClick={onQuery}>
                {t("memoryInfo.actions.query")}
              </UiButton>
              <UiButton variant="ghost" size="sm" onClick={onRefresh}>
                {t("memoryInfo.actions.refresh")}
              </UiButton>
            </div>
          </div>

          <div className={MEMORY_PANE_LIST_FILTER_GRID_CLASS_NAME}>
            <label className={MEMORY_FIELD_WIDE_CLASS_NAME}>
              <span>{t("memoryInfo.filters.keyword")}</span>
              <input
                className={MEMORY_INFO_INPUT_CLASS_NAME}
                value={filters.keyword}
                onChange={(event) =>
                  onFilterChange("keyword", event.currentTarget.value)
                }
                placeholder={t("memoryInfo.filters.keywordPlaceholder")}
              />
            </label>
            <label className={MEMORY_PANE_LIST_FIELD_CLASS_NAME}>
              <span>{t("memoryInfo.filters.kind")}</span>
              <select
                className={MEMORY_INFO_SELECT_CLASS_NAME}
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
            <label className={MEMORY_PANE_LIST_FIELD_CLASS_NAME}>
              <span>{t("memoryInfo.filters.scopeType")}</span>
              <select
                className={MEMORY_INFO_SELECT_CLASS_NAME}
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
            <label className={MEMORY_PANE_LIST_FIELD_CLASS_NAME}>
              <span>{t("memoryInfo.filters.status")}</span>
              <select
                className={MEMORY_INFO_SELECT_CLASS_NAME}
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
            <label className={MEMORY_PANE_LIST_FIELD_CLASS_NAME}>
              <span>{t("memoryInfo.filters.category")}</span>
              <select
                className={MEMORY_INFO_SELECT_CLASS_NAME}
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

          {error ? <div className={MEMORY_INFO_ERROR_CLASS_NAME}>{error}</div> : null}

          <div className={MEMORY_INFO_RECORD_LIST_CLASS_NAME}>
            {missingAgent ? (
              <div className={COMMAND_EMPTY_STATE_CLASS_NAME}>
                {t("memoryInfo.empty.noAgent")}
              </div>
            ) : loading && records.length === 0 ? (
              <div className={COMMAND_EMPTY_STATE_CLASS_NAME}>
                {t("memoryInfo.loading.records")}
              </div>
            ) : records.length === 0 ? (
              <div className={COMMAND_EMPTY_STATE_CLASS_NAME}>
                {t("memoryInfo.empty.noRecords")}
              </div>
            ) : (
              records.map((record) => {
                return (
                  <button
                    key={record.id}
                    type="button"
                    className={`${MEMORY_INFO_RECORD_ITEM_CLASS_NAME} ${record.id === selectedRecordId ? "is-selected" : ""}`.trim()}
                    onClick={() => onSelectRecord(record.id)}
                  >
                    <div className={MEMORY_RECORD_HEAD_CLASS_NAME}>
                      <strong>{toText(record.title) || record.id}</strong>
                      <span>{formatMemoryTimestamp(record.updatedAt)}</span>
                    </div>
                    <div className={MEMORY_RECORD_META_CLASS_NAME}>
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

        <section className={`${MEMORY_INFO_PANE_CLASS_NAME} memory-info-pane-detail`}>
          <div className={MEMORY_INFO_PANE_HEADER_CLASS_NAME}>
            <div>
              <strong>{t("memoryInfo.panel.detail")}</strong>
              <p className={MEMORY_INFO_PANE_HINT_CLASS_NAME}>
                {t("memoryInfo.panel.detailHint")}
              </p>
            </div>
          </div>

          {missingAgent ? (
            <div className={COMMAND_EMPTY_STATE_CLASS_NAME}>
              {t("memoryInfo.empty.noAgent")}
            </div>
          ) : detailLoading && !detail ? (
            <div className={COMMAND_EMPTY_STATE_CLASS_NAME}>
              {t("memoryInfo.loading.detail")}
            </div>
          ) : detailError ? (
            <div className={MEMORY_INFO_ERROR_CLASS_NAME}>{detailError}</div>
          ) : !detail ? (
            <div className={COMMAND_EMPTY_STATE_CLASS_NAME}>
              {t("memoryInfo.empty.unselected")}
            </div>
          ) : (
            <div className={MEMORY_DETAIL_STACK_CLASS_NAME}>
              <div className={MEMORY_DETAIL_TITLE_CLASS_NAME}>
                <h4>{toText(detail.record.title) || detail.record.id}</h4>
                <div className={MEMORY_DETAIL_BADGES_CLASS_NAME}>
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

              <div className={MEMORY_DETAIL_SUMMARY_CLASS_NAME}>
                {toText(detail.record.summary) ||
                  t("memoryInfo.empty.noSummary")}
              </div>

              <div className={MEMORY_DETAIL_GRID_CLASS_NAME}>
                {renderMemoryDetailRows(t, detail).map(([label, value]) => (
                  <div className={MEMORY_DETAIL_CARD_CLASS_NAME} key={label}>
                    <span className={COMMAND_DETAIL_LABEL_CLASS_NAME}>{label}</span>
                    <strong>{formatDetailValue(value)}</strong>
                  </div>
                ))}
              </div>

              {normalizeMemoryTagList(detail.record.tags).length > 0 ? (
                <div className={MEMORY_DETAIL_BLOCK_CLASS_NAME}>
                  <span className={COMMAND_DETAIL_LABEL_CLASS_NAME}>
                    {t("memoryInfo.field.tags")}
                  </span>
                  <div className={MEMORY_RECORD_META_CLASS_NAME}>
                    {normalizeMemoryTagList(detail.record.tags).map((tag) => (
                      <UiTag key={`${detail.id}-${tag}`} tone="default">
                        #{tag}
                      </UiTag>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className={MEMORY_DETAIL_BLOCK_CLASS_NAME}>
                <span className={COMMAND_DETAIL_LABEL_CLASS_NAME}>
                  {t("memoryInfo.field.summary")}
                </span>
                <div className={MEMORY_DETAIL_SUMMARY_CLASS_NAME}>
                  {toText(detail.record.summary) || "--"}
                </div>
              </div>

              <details className={MEMORY_RAW_BLOCK_CLASS_NAME}>
                <summary className={MEMORY_RAW_SUMMARY_CLASS_NAME}>
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


export const MemoryRecordsPanel = MemoryRecordsPanelView;
