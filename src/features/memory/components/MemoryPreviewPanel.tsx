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

export interface MemoryPreviewPanelProps {
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


export const MemoryPreviewPanelView: React.FC<MemoryPreviewPanelProps> = ({
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
    <div className={MEMORY_CONSOLE_PANE_CLASS_NAME}>
      <div className={MEMORY_PREVIEW_LAYOUT_CLASS_NAME}>
        <section className={MEMORY_PREVIEW_PANE_INPUT_CLASS_NAME}>
          <div className={MEMORY_INFO_PANE_HEADER_CLASS_NAME}>
            <div>
              <strong>{t("memoryPreview.panel.input")}</strong>
              <p className={MEMORY_INFO_PANE_HINT_CLASS_NAME}>
                {t("memoryPreview.panel.inputHint")}
              </p>
            </div>
          </div>

          <div className={MEMORY_PREVIEW_CONTEXT_LIST_CLASS_NAME}>
            <div className={MEMORY_PREVIEW_CONTEXT_ITEM_CLASS_NAME}>
              <span>{t("memoryPreview.context.chatId")}</span>
              <strong>{chatId || "--"}</strong>
            </div>
            <div className={MEMORY_PREVIEW_CONTEXT_ITEM_CLASS_NAME}>
              <span>{t("memoryPreview.context.agentKey")}</span>
              <strong>{agentKey || "--"}</strong>
            </div>
            <div className={MEMORY_PREVIEW_CONTEXT_ITEM_CLASS_NAME}>
              <span>{t("memoryPreview.context.teamId")}</span>
              <strong>{teamId || "--"}</strong>
            </div>
          </div>

          <label className={MEMORY_FIELD_CLASS_NAME}>
            <span>{t("memoryPreview.field.message")}</span>
            <textarea
              className={MEMORY_PREVIEW_TEXTAREA_CLASS_NAME}
              value={draft}
              onChange={(event) => onDraftChange(event.currentTarget.value)}
              placeholder={t("memoryPreview.field.messagePlaceholder")}
            />
          </label>

          <div className={MEMORY_INFO_ACTIONS_CLASS_NAME}>
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
            <div className={COMMAND_EMPTY_STATE_CLASS_NAME}>
              {t("memoryPreview.empty.noChat")}
            </div>
          ) : null}
          {hasChat && !hasDraft ? (
            <div className={COMMAND_EMPTY_STATE_CLASS_NAME}>
              {t("memoryPreview.empty.noMessage")}
            </div>
          ) : null}
          {error ? <div className={MEMORY_INFO_ERROR_CLASS_NAME}>{error}</div> : null}

          {result ? (
            <div className={MEMORY_PREVIEW_SUMMARY_GRID_CLASS_NAME}>
              <div className={MEMORY_DETAIL_CARD_CLASS_NAME}>
                <span className={COMMAND_DETAIL_LABEL_CLASS_NAME}>
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
              <div className={MEMORY_DETAIL_CARD_CLASS_NAME}>
                <span className={COMMAND_DETAIL_LABEL_CLASS_NAME}>
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
              <div className={MEMORY_DETAIL_CARD_CLASS_NAME}>
                <span className={COMMAND_DETAIL_LABEL_CLASS_NAME}>
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
              <div className={MEMORY_DETAIL_CARD_CLASS_NAME}>
                <span className={COMMAND_DETAIL_LABEL_CLASS_NAME}>
                  {t("memoryPreview.summary.stopReason")}
                </span>
                <strong>{result.summary.stopReason || "--"}</strong>
              </div>
              <div className={MEMORY_DETAIL_CARD_CLASS_NAME}>
                <span className={COMMAND_DETAIL_LABEL_CLASS_NAME}>
                  {t("memoryPreview.summary.snapshotId")}
                </span>
                <strong>{result.summary.snapshotId || "--"}</strong>
              </div>
            </div>
          ) : null}
        </section>

        <section className={MEMORY_PREVIEW_PANE_RESULT_CLASS_NAME}>
          <div className={MEMORY_INFO_PANE_HEADER_CLASS_NAME}>
            <div>
              <strong>{t("memoryPreview.panel.prompt")}</strong>
              <p className={MEMORY_INFO_PANE_HINT_CLASS_NAME}>
                {t("memoryPreview.panel.promptHint")}
              </p>
            </div>
          </div>

          <div className={MEMORY_PREVIEW_LAYER_TABS_CLASS_NAME}>
            {PREVIEW_PROMPT_LAYER_ORDER.map((layer) => (
              <UiButton
                key={layer}
                variant="ghost"
                size="sm"
                className={MEMORY_PREVIEW_LAYER_TAB_CLASS_NAME}
                active={promptLayer === layer}
                onClick={() => onPromptLayerChange(layer)}
              >
                {formatPreviewLayerLabel(t, layer)}
              </UiButton>
            ))}
          </div>

          {!hasChat ? (
            <div className={COMMAND_EMPTY_STATE_CLASS_NAME}>
              {t("memoryPreview.empty.noChat")}
            </div>
          ) : loading && !result ? (
            <div className={COMMAND_EMPTY_STATE_CLASS_NAME}>
              {t("memoryPreview.loading.preview")}
            </div>
          ) : !hasDraft ? (
            <div className={COMMAND_EMPTY_STATE_CLASS_NAME}>
              {t("memoryPreview.empty.noMessage")}
            </div>
          ) : result && !result.enabled ? (
            <div className={COMMAND_EMPTY_STATE_CLASS_NAME}>
              {t("memoryPreview.empty.disabled")}
            </div>
          ) : !result ? (
            <div className={COMMAND_EMPTY_STATE_CLASS_NAME}>
              {t("memoryPreview.empty.noResult")}
            </div>
          ) : (
            <div className={MEMORY_DETAIL_STACK_CLASS_NAME}>
              <div className={MEMORY_PREVIEW_PROMPT_BLOCK_CLASS_NAME}>
                <span className={COMMAND_DETAIL_LABEL_CLASS_NAME}>
                  {formatPreviewLayerLabel(t, promptLayer)}
                </span>
                <pre>{activePrompt || t("memoryPreview.empty.noPrompt")}</pre>
              </div>

              <div className={MEMORY_DETAIL_BLOCK_CLASS_NAME}>
                <span className={COMMAND_DETAIL_LABEL_CLASS_NAME}>
                  {t("memoryPreview.section.selectedMemory")}
                </span>
                <div className={`memory-preview-layer-list ${MEMORY_PREVIEW_LIST_CLASS_NAME}`}>
                  {previewLayers.map((layer) => (
                    <div className={`memory-preview-layer-block ${MEMORY_PREVIEW_ITEM_CARD_CLASS_NAME}`} key={layer.layer}>
                      <div className={`memory-preview-layer-head ${MEMORY_PREVIEW_HEAD_CLASS_NAME}`}>
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
                        <div className={MEMORY_PREVIEW_EMPTY_CLASS_NAME}>
                          {t("memoryPreview.empty.noItems")}
                        </div>
                      ) : (
                        <div className={`memory-preview-item-list ${MEMORY_PREVIEW_LIST_CLASS_NAME}`}>
                          {layer.items.map((item) => (
                            <div
                              className={`memory-preview-item ${MEMORY_PREVIEW_ITEM_CARD_CLASS_NAME}`}
                              key={`${layer.layer}-${item.id}-${item.order}`}
                            >
                              <div className={`memory-preview-item-head ${MEMORY_PREVIEW_HEAD_CLASS_NAME}`}>
                                <strong>{toText(item.title) || item.id}</strong>
                                <span>#{item.order}</span>
                              </div>
                              <div className={MEMORY_RECORD_META_CLASS_NAME}>
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
                              <div className={MEMORY_RECORD_SUMMARY_CLASS_NAME}>
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

              <div className={MEMORY_DETAIL_BLOCK_CLASS_NAME}>
                <span className={COMMAND_DETAIL_LABEL_CLASS_NAME}>
                  {t("memoryPreview.section.decisions")}
                </span>
                {decisions.length === 0 ? (
                  <div className={MEMORY_PREVIEW_EMPTY_CLASS_NAME}>
                    {t("memoryPreview.empty.noDecisions")}
                  </div>
                ) : (
                  <div className={`memory-preview-decision-list ${MEMORY_PREVIEW_LIST_CLASS_NAME}`}>
                    {decisions.map((decision, index) => (
                      <div
                        className={`memory-preview-decision-item ${MEMORY_PREVIEW_ITEM_CARD_CLASS_NAME}`}
                        key={`${decision.layer}-${decision.reason}-${index}`}
                      >
                        <div className={`memory-preview-decision-head ${MEMORY_PREVIEW_HEAD_CLASS_NAME}`}>
                          <UiTag tone={promptToneForLayer(decision.layer)}>
                            {formatPreviewLayerLabel(t, decision.layer)}
                          </UiTag>
                          <strong>{decision.reason || "--"}</strong>
                        </div>
                        <div className={MEMORY_DETAIL_SUMMARY_CLASS_NAME}>
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


export const MemoryPreviewPanel = MemoryPreviewPanelView;
