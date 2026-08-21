import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import { Modal } from "antd";
import {
  getMemoryMeta,
  getMemoryRecord,
  getMemoryRecords,
  getMemoryScope,
  getMemoryScopes,
  previewMemoryContext,
  saveMemoryScope,
  validateMemoryScope,
} from "@/shared/data";
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
} from "@/shared/data/memory/memoryTypes";
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
  resolveMemoryPreviewContext,
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

export interface MemoryInfoConsoleViewProps {
  title: string;
  subtitle: string;
  activeTab: MemoryConsoleTab;
  onTabChange: (tab: MemoryConsoleTab) => void;
  cardClassName?: string;
  recordsPanel: MemoryRecordsPanelProps;
  preferencesPanel: MemoryPreferencesPanelProps;
  previewPanel: MemoryPreviewPanelProps;
}

export interface MemoryInfoModalViewProps extends MemoryInfoConsoleViewProps {
  open: boolean;
  onClose: () => void;
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
const MEMORY_INFO_CARD_CLASS_NAME =
  "memory-info-card tw:flex tw:h-[min(88vh,940px)] tw:min-h-[min(88vh,940px)] tw:w-full tw:flex-col tw:gap-4 tw:overflow-hidden tw:[&_.settings-segmented-btn.ui-btn]:min-w-0 tw:[&_.settings-segmented-btn.ui-btn]:text-[13px] tw:[&_.settings-segmented]:w-full tw:[&_.settings-segmented]:max-w-[640px]";
const MEMORY_HEAD_CLASS_NAME =
  "settings-head memory-info-head tw:mb-0 tw:flex tw:items-center tw:justify-between tw:[&_button]:rounded-lg tw:[&_button]:border-0 tw:[&_button]:bg-transparent tw:[&_button]:px-2.5 tw:[&_button]:py-1 tw:[&_button]:text-xs tw:[&_button]:font-semibold tw:[&_button]:text-ink-muted tw:[&_button:hover]:bg-bg-hover tw:[&_button:hover]:text-ink-1 tw:[&_button:hover]:shadow-none tw:[&_h3]:m-0 tw:[&_h3]:text-base";
const MEMORY_SUBTITLE_CLASS_NAME =
  "memory-info-subtitle tw:mb-0 tw:mt-1.5 tw:text-[13px] tw:leading-[1.5] tw:text-ink-muted";
const MEMORY_CONSOLE_TABS_CLASS_NAME =
  "memory-console-tabs settings-segmented tw:min-w-0 tw:w-[min(640px,100%)]";
const MEMORY_CONSOLE_PANE_CLASS_NAME =
  "memory-console-pane tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:overflow-hidden";
const MEMORY_INFO_LAYOUT_CLASS_NAME =
  "memory-info-layout tw:grid tw:min-h-0 tw:flex-1 tw:grid-cols-[minmax(360px,430px)_minmax(0,1fr)] tw:gap-[18px] tw:max-[980px]:grid-cols-1";
const MEMORY_INFO_PANE_CLASS_NAME =
  "memory-info-pane tw:flex tw:min-h-0 tw:flex-col tw:gap-3.5 tw:rounded-2xl tw:border tw:p-4 tw:shadow-elevated tw:[border-color:color-mix(in_srgb,var(--line-soft)_90%,transparent)] tw:bg-[color-mix(in_srgb,var(--bg-elev-2)_94%,var(--bg-input))]";
const MEMORY_INFO_PANE_HEADER_CLASS_NAME =
  "memory-info-pane-header tw:flex tw:items-start tw:justify-between tw:gap-3 tw:border-b tw:pb-3 tw:[border-color:color-mix(in_srgb,var(--line-soft)_88%,transparent)] tw:[&_strong]:block tw:[&_strong]:text-[15px] tw:[&_strong]:leading-[1.35] tw:[&_strong]:text-ink-1";
const MEMORY_INFO_PANE_HINT_CLASS_NAME =
  "memory-info-pane-hint tw:mb-0 tw:mt-1 tw:text-xs tw:leading-[1.5] tw:text-ink-muted";
const MEMORY_INFO_ACTIONS_CLASS_NAME =
  "memory-info-actions tw:inline-flex tw:items-center tw:gap-2";
const MEMORY_FILTER_GRID_CLASS_NAME =
  "memory-info-filter-grid tw:grid tw:grid-cols-2 tw:gap-3.5 tw:max-[980px]:grid-cols-1";
const MEMORY_PANE_LIST_FILTER_GRID_CLASS_NAME =
  `${MEMORY_FILTER_GRID_CLASS_NAME} tw:gap-x-3 tw:gap-y-2.5`;
const MEMORY_FIELD_CLASS_NAME =
  "memory-info-field tw:flex tw:flex-col tw:gap-[7px] tw:[&>span]:text-xs tw:[&>span]:font-semibold tw:[&>span]:tracking-[0.02em] tw:[&>span]:text-ink-muted";
const MEMORY_PANE_LIST_FIELD_CLASS_NAME =
  `${MEMORY_FIELD_CLASS_NAME} tw:gap-[5px] tw:[&>span]:text-[11px]`;
const MEMORY_FIELD_WIDE_CLASS_NAME =
  `${MEMORY_PANE_LIST_FIELD_CLASS_NAME} memory-info-field-wide tw:col-span-full`;
const MEMORY_INFO_INPUT_CLASS_NAME =
  "memory-info-input tw:w-full tw:rounded-lg tw:border tw:border-line-soft tw:bg-[color-mix(in_srgb,var(--bg-input)_92%,var(--bg-elev-2))] tw:px-2.5 tw:py-2 tw:text-xs tw:text-ink-1 tw:outline-none tw:focus:border-accent-electric tw:focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent-electric)_14%,transparent)]";
const MEMORY_INFO_SELECT_CLASS_NAME =
  "memory-info-select tw:h-9 tw:w-full tw:rounded-lg tw:border tw:border-line-soft tw:bg-[color-mix(in_srgb,var(--bg-input)_92%,var(--bg-elev-2))] tw:px-2.5 tw:py-2 tw:text-xs tw:text-ink-1 tw:outline-none tw:focus:border-accent-electric tw:focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent-electric)_14%,transparent)]";
const MEMORY_INFO_ERROR_CLASS_NAME =
  "memory-info-error tw:rounded-xl tw:border tw:px-3 tw:py-2.5 tw:text-xs tw:text-accent-danger tw:[border-color:color-mix(in_srgb,var(--accent-danger)_32%,var(--line-soft))] tw:bg-[color-mix(in_srgb,var(--accent-danger)_8%,var(--bg-elev-2))]";
const COMMAND_EMPTY_STATE_CLASS_NAME =
  "command-empty-state tw:rounded-[14px] tw:border tw:border-dashed tw:px-4 tw:py-6 tw:text-center tw:text-[13px] tw:text-ink-muted tw:[border-color:color-mix(in_srgb,var(--line-strong)_76%,transparent)] tw:bg-[color-mix(in_srgb,var(--bg-input)_56%,var(--bg-elev-2))]";
const COMMAND_DETAIL_LABEL_CLASS_NAME =
  "command-detail-label tw:mb-1.5 tw:block tw:text-[11px] tw:text-ink-muted";
const SETTINGS_SEGMENTED_BUTTON_CLASS_NAME =
  "settings-segmented-btn tw:flex-1 tw:min-w-24 tw:rounded-pill";
const MEMORY_INFO_RECORD_LIST_CLASS_NAME =
  "memory-info-record-list tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-2 tw:overflow-auto tw:pb-3 tw:pl-0 tw:pr-1.5 tw:pt-1 tw:[scrollbar-gutter:stable]";
const MEMORY_INFO_RECORD_ITEM_CLASS_NAME =
  "memory-info-record-item tw:w-full tw:rounded-xl tw:border tw:p-3 tw:pt-[11px] tw:text-left tw:transition-[border-color,background,box-shadow,transform] tw:duration-[140ms] tw:ease-out tw:[border-color:color-mix(in_srgb,var(--line-soft)_92%,transparent)] tw:bg-[color-mix(in_srgb,var(--bg-elev-2)_94%,var(--bg-input))] tw:hover:[border-color:color-mix(in_srgb,var(--accent-electric)_52%,var(--line-soft))] tw:hover:bg-[color-mix(in_srgb,var(--accent-soft)_58%,var(--bg-elev-2))] tw:hover:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent-soft)_82%,transparent)] tw:[&.is-selected]:[border-color:color-mix(in_srgb,var(--accent-electric)_52%,var(--line-soft))] tw:[&.is-selected]:bg-[color-mix(in_srgb,var(--accent-soft)_58%,var(--bg-elev-2))] tw:[&.is-selected]:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent-soft)_82%,transparent)] tw:[&_.ui-tag]:min-h-5 tw:[&_.ui-tag]:px-[7px] tw:[&_.ui-tag]:py-0.5 tw:[&_.ui-tag]:text-[11px]";
const MEMORY_RECORD_HEAD_CLASS_NAME =
  "memory-info-record-head tw:flex tw:items-start tw:justify-between tw:gap-3 tw:[&>span]:flex-none tw:[&>span]:whitespace-nowrap tw:[&>span]:text-[11px] tw:[&>span]:text-ink-muted tw:[&>strong]:line-clamp-2 tw:[&>strong]:break-words tw:[&>strong]:text-[13px] tw:[&>strong]:leading-[1.45] tw:[&>strong]:text-ink-1";
const MEMORY_RECORD_META_CLASS_NAME =
  "memory-info-record-meta tw:mt-1.5 tw:flex tw:flex-wrap tw:gap-2";
const MEMORY_RECORD_SUMMARY_CLASS_NAME =
  "memory-info-record-summary tw:mt-2.5 tw:line-clamp-4 tw:whitespace-pre-wrap tw:break-words tw:text-[13px] tw:leading-[1.7] tw:text-ink-2";
const MEMORY_DETAIL_STACK_CLASS_NAME =
  "memory-info-detail-stack tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-4 tw:overflow-auto tw:pb-[18px] tw:pl-0 tw:pr-2 tw:pt-0 tw:[scrollbar-gutter:stable]";
const MEMORY_DETAIL_TITLE_CLASS_NAME =
  "memory-info-detail-title tw:[&_h4]:m-0 tw:[&_h4]:text-[17px] tw:[&_h4]:leading-[1.45] tw:[&_h4]:text-ink-1";
const MEMORY_DETAIL_BADGES_CLASS_NAME =
  "memory-info-detail-badges tw:mt-2.5 tw:flex tw:flex-wrap tw:gap-2";
const MEMORY_DETAIL_SUMMARY_CLASS_NAME =
  "memory-info-detail-summary tw:whitespace-pre-wrap tw:break-words tw:text-[13px] tw:leading-[1.7] tw:text-ink-2";
const MEMORY_DETAIL_GRID_CLASS_NAME =
  "memory-info-detail-grid tw:grid tw:grid-cols-2 tw:gap-2.5 tw:max-[980px]:grid-cols-1";
const MEMORY_DETAIL_CARD_CLASS_NAME =
  "memory-info-detail-card tw:box-border tw:flex-none tw:rounded-[14px] tw:border tw:px-[15px] tw:py-3.5 tw:[border-color:color-mix(in_srgb,var(--line-soft)_92%,transparent)] tw:bg-[color-mix(in_srgb,var(--bg-input)_74%,var(--bg-elev-2))] tw:[&>small]:block tw:[&>small]:text-[11px] tw:[&>small]:leading-[1.45] tw:[&>small]:text-ink-muted tw:[&>strong]:block tw:[&>strong]:break-words tw:[&>strong]:text-sm tw:[&>strong]:leading-[1.55] tw:[&>strong]:text-ink-1";
const MEMORY_DETAIL_BLOCK_CLASS_NAME =
  "memory-info-detail-block tw:box-border tw:flex tw:flex-none tw:flex-col tw:gap-2.5 tw:rounded-[14px] tw:border tw:px-[15px] tw:py-3.5 tw:[border-color:color-mix(in_srgb,var(--line-soft)_92%,transparent)] tw:bg-[color-mix(in_srgb,var(--bg-input)_74%,var(--bg-elev-2))]";
const MEMORY_RAW_BLOCK_CLASS_NAME =
  `${MEMORY_DETAIL_BLOCK_CLASS_NAME} memory-info-raw-block tw:mb-0.5 tw:overflow-hidden tw:[&_pre]:m-0 tw:[&_pre]:max-h-[260px] tw:[&_pre]:overflow-auto tw:[&_pre]:whitespace-pre-wrap tw:[&_pre]:break-words tw:[&_pre]:font-code tw:[&_pre]:text-xs tw:[&_pre]:leading-[1.55] tw:[&_pre]:text-ink-2`;
const MEMORY_RAW_SUMMARY_CLASS_NAME =
  "memory-info-raw-summary tw:inline-flex tw:cursor-pointer tw:list-none tw:items-center tw:gap-2 tw:text-xs tw:font-bold tw:text-ink-1 tw:[&::-webkit-details-marker]:hidden";
const MEMORY_PREVIEW_LAYOUT_CLASS_NAME =
  "memory-preview-layout tw:grid tw:min-h-0 tw:flex-1 tw:grid-cols-[minmax(320px,380px)_minmax(0,1fr)] tw:gap-[18px] tw:max-[980px]:grid-cols-1";
const MEMORY_PREVIEW_PANE_INPUT_CLASS_NAME =
  `${MEMORY_INFO_PANE_CLASS_NAME} memory-preview-pane memory-preview-pane-input tw:min-w-0 tw:overflow-auto`;
const MEMORY_PREVIEW_PANE_RESULT_CLASS_NAME =
  `${MEMORY_INFO_PANE_CLASS_NAME} memory-preview-pane memory-preview-pane-result tw:min-w-0 tw:overflow-hidden`;
const MEMORY_PREVIEW_CONTEXT_LIST_CLASS_NAME =
  "memory-preview-context-list tw:grid tw:grid-cols-3 tw:gap-2.5 tw:max-[980px]:grid-cols-1";
const MEMORY_PREVIEW_CONTEXT_ITEM_CLASS_NAME =
  "memory-preview-context-item tw:rounded-[14px] tw:border tw:px-[13px] tw:py-3 tw:[border-color:color-mix(in_srgb,var(--line-soft)_92%,transparent)] tw:bg-[color-mix(in_srgb,var(--bg-input)_72%,var(--bg-elev-2))] tw:[&>span]:block tw:[&>span]:text-[11px] tw:[&>span]:leading-[1.45] tw:[&>span]:text-ink-muted tw:[&>strong]:mt-2 tw:[&>strong]:block tw:[&>strong]:break-words tw:[&>strong]:text-[13px] tw:[&>strong]:leading-[1.45] tw:[&>strong]:text-ink-1";
const MEMORY_PREVIEW_TEXTAREA_CLASS_NAME =
  "settings-textarea memory-preview-textarea tw:min-h-[124px]";
const MEMORY_PREVIEW_SUMMARY_GRID_CLASS_NAME =
  "memory-preview-summary-grid tw:grid tw:grid-cols-2 tw:gap-2.5 tw:max-[980px]:grid-cols-1 tw:[&_.memory-info-detail-card]:gap-2";
const MEMORY_PREVIEW_LAYER_TABS_CLASS_NAME =
  "memory-preview-layer-tabs settings-segmented tw:w-[min(420px,100%)]";
const MEMORY_PREVIEW_LAYER_TAB_CLASS_NAME =
  `${SETTINGS_SEGMENTED_BUTTON_CLASS_NAME} memory-preview-layer-tab`;
const MEMORY_PREVIEW_PROMPT_BLOCK_CLASS_NAME =
  "memory-preview-prompt-block tw:rounded-[14px] tw:border tw:px-[15px] tw:py-3.5 tw:[border-color:color-mix(in_srgb,var(--line-soft)_92%,transparent)] tw:bg-[color-mix(in_srgb,var(--bg-input)_72%,var(--bg-elev-2))] tw:[&_pre]:mt-2.5 tw:[&_pre]:max-h-[260px] tw:[&_pre]:overflow-auto tw:[&_pre]:whitespace-pre-wrap tw:[&_pre]:break-words tw:[&_pre]:font-code tw:[&_pre]:text-xs tw:[&_pre]:leading-[1.65] tw:[&_pre]:text-ink-2";
const MEMORY_PREVIEW_LIST_CLASS_NAME =
  "tw:flex tw:flex-col tw:gap-2.5";
const MEMORY_PREVIEW_ITEM_CARD_CLASS_NAME =
  "tw:rounded-[14px] tw:border tw:px-[13px] tw:py-3 tw:[border-color:color-mix(in_srgb,var(--line-soft)_92%,transparent)] tw:bg-[color-mix(in_srgb,var(--bg-input)_72%,var(--bg-elev-2))]";
const MEMORY_PREVIEW_HEAD_CLASS_NAME =
  "tw:flex tw:items-start tw:justify-between tw:gap-2.5 tw:[&>span]:text-[11px] tw:[&>span]:leading-[1.45] tw:[&>span]:text-ink-muted tw:[&>strong]:text-[13px] tw:[&>strong]:leading-[1.45] tw:[&>strong]:text-ink-1";
const MEMORY_PREVIEW_EMPTY_CLASS_NAME =
  "memory-preview-layer-empty tw:text-xs tw:leading-[1.55] tw:text-ink-muted";
const MEMORY_PREFERENCE_SCOPE_TABS_CLASS_NAME =
  "memory-preference-scope-tabs tw:mb-3.5 tw:flex tw:flex-wrap tw:gap-2.5";
const MEMORY_PREFERENCE_SCOPE_TAB_CLASS_NAME =
  "memory-preference-scope-tab tw:rounded-[14px] tw:px-4";
const MEMORY_PREFERENCE_LAYOUT_CLASS_NAME =
  "memory-preference-layout tw:grid tw:min-h-0 tw:flex-1 tw:grid-cols-[minmax(290px,340px)_minmax(320px,0.92fr)_minmax(360px,1.08fr)] tw:gap-[18px] tw:max-[1320px]:grid-cols-[minmax(280px,320px)_minmax(0,1fr)] tw:max-[980px]:grid-cols-1";
const MEMORY_PREFERENCE_PANE_LIST_CLASS_NAME =
  `${MEMORY_INFO_PANE_CLASS_NAME} memory-preference-pane memory-preference-pane-list tw:min-w-0 tw:overflow-hidden`;
const MEMORY_PREFERENCE_PANE_DETAIL_CLASS_NAME =
  `${MEMORY_INFO_PANE_CLASS_NAME} memory-preference-pane memory-preference-pane-detail tw:min-w-0 tw:overflow-auto`;
const MEMORY_PREFERENCE_PANE_EDITOR_CLASS_NAME =
  `${MEMORY_INFO_PANE_CLASS_NAME} memory-preference-pane memory-preference-pane-editor tw:min-w-0 tw:overflow-auto tw:max-[1320px]:col-span-full tw:max-[980px]:col-auto`;
const MEMORY_PREFERENCE_MODE_TOGGLE_CLASS_NAME =
  "memory-preference-mode-toggle settings-segmented tw:w-fit tw:min-w-[292px]";
const MEMORY_PREFERENCE_FORM_CLASS_NAME =
  "memory-preference-form tw:flex tw:flex-col tw:gap-3.5";
const MEMORY_PREFERENCE_FORM_GRID_CLASS_NAME =
  "memory-preference-form-grid tw:grid tw:grid-cols-2 tw:gap-3 tw:max-[980px]:grid-cols-1";
const MEMORY_PREFERENCE_TEXTAREA_CLASS_NAME =
  "settings-textarea memory-preference-textarea tw:min-h-28";
const MEMORY_PREFERENCE_MARKDOWN_PANEL_CLASS_NAME =
  "memory-preference-markdown-panel tw:flex tw:flex-col tw:gap-3.5";
const MEMORY_PREFERENCE_MARKDOWN_CLASS_NAME =
  "settings-textarea memory-preference-markdown tw:min-h-[360px] tw:font-code tw:text-xs tw:leading-[1.6]";
const MEMORY_PREFERENCE_MARKDOWN_HINT_CLASS_NAME =
  "memory-preference-markdown-hint tw:flex tw:items-start tw:justify-between tw:gap-3 tw:rounded-xl tw:border tw:px-3 tw:py-2.5 tw:[border-color:color-mix(in_srgb,var(--line-soft)_90%,transparent)] tw:bg-[color-mix(in_srgb,var(--bg-elev-2)_92%,var(--accent-soft))] tw:[&_p]:m-0 tw:[&_p]:text-xs tw:[&_p]:leading-[1.6] tw:[&_p]:text-ink-2";
const MEMORY_PREFERENCE_VALIDATION_CLASS_NAME =
  "memory-preference-validation tw:flex tw:flex-col tw:gap-2";
const MEMORY_PREFERENCE_VALIDATION_ITEM_CLASS_BY_KIND = {
  error:
    "memory-preference-validation-item is-error tw:rounded-[10px] tw:bg-[color-mix(in_srgb,var(--accent-danger)_8%,var(--bg-elev-2))] tw:px-2.5 tw:py-2 tw:text-xs tw:leading-[1.5] tw:text-accent-danger",
  warning:
    "memory-preference-validation-item is-warning tw:rounded-[10px] tw:bg-[color-mix(in_srgb,#fff6d8_72%,var(--bg-elev-2))] tw:px-2.5 tw:py-2 tw:text-xs tw:leading-[1.5] tw:text-[color-mix(in_srgb,#9a6700_72%,var(--ink-1))]",
} as const;
const MEMORY_PREFERENCE_RECORD_ROW_CLASS_NAME =
  "memory-preference-record-row tw:grid tw:grid-cols-[minmax(0,1fr)_auto] tw:items-center tw:gap-2.5 tw:rounded-[14px] tw:border tw:py-2.5 tw:pl-3 tw:pr-2.5 tw:transition-[border-color,background,box-shadow,transform] tw:duration-[140ms] tw:ease-out tw:[border-color:color-mix(in_srgb,var(--line-soft)_92%,transparent)] tw:bg-[color-mix(in_srgb,var(--bg-elev-2)_88%,var(--bg-input))] tw:[&.is-selected]:-translate-y-px tw:[&.is-selected]:[border-color:color-mix(in_srgb,var(--accent-electric)_52%,var(--line-soft))] tw:[&.is-selected]:bg-[color-mix(in_srgb,var(--accent-soft)_74%,var(--bg-elev-2))] tw:[&.is-selected]:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent-soft)_88%,transparent),0_8px_18px_color-mix(in_srgb,var(--accent-soft)_12%,transparent)] tw:[&.is-selected_.memory-preference-record-marker]:bg-[color-mix(in_srgb,var(--accent-electric)_78%,white)]";
const MEMORY_PREFERENCE_RECORD_MAIN_CLASS_NAME =
  "memory-preference-record-main tw:grid tw:min-w-0 tw:grid-cols-[4px_minmax(0,1fr)] tw:items-stretch tw:gap-2.5 tw:border-0 tw:bg-transparent tw:p-0 tw:text-left";
const MEMORY_PREFERENCE_RECORD_MARKER_CLASS_NAME =
  "memory-preference-record-marker tw:min-h-full tw:w-1 tw:rounded-pill tw:bg-[color-mix(in_srgb,var(--accent-electric)_26%,var(--line-soft))]";
const MEMORY_PREFERENCE_RECORD_BODY_CLASS_NAME =
  "memory-preference-record-body tw:flex tw:min-w-0 tw:flex-col tw:gap-2";
const MEMORY_PREFERENCE_RECORD_TOPLINE_CLASS_NAME =
  "memory-preference-record-topline tw:flex tw:items-start tw:justify-between tw:gap-2.5 tw:[&>span]:flex-none tw:[&>span]:whitespace-nowrap tw:[&>span]:text-[11px] tw:[&>span]:leading-[1.35] tw:[&>span]:text-ink-muted tw:[&>strong]:line-clamp-2 tw:[&>strong]:min-w-0 tw:[&>strong]:text-xs tw:[&>strong]:font-bold tw:[&>strong]:leading-[1.45] tw:[&>strong]:text-ink-1";
const MEMORY_PREFERENCE_RECORD_SUMMARY_CLASS_NAME =
  "memory-info-record-summary tw:mt-0 tw:line-clamp-2 tw:whitespace-pre-wrap tw:break-words tw:text-xs tw:leading-[1.55] tw:text-ink-muted";
const MEMORY_PREFERENCE_RECORD_META_CLASS_NAME =
  "memory-info-record-meta tw:mt-0 tw:flex tw:flex-wrap tw:gap-1.5";
const MEMORY_PREFERENCE_RECORD_DELETE_CLASS_NAME =
  "memory-preference-record-delete tw:self-start tw:rounded-[10px] tw:px-2 tw:py-1.5";
const MEMORY_INFO_BANNER_CLASS_BY_TONE = {
  warning:
    "memory-info-banner memory-info-banner-warning tw:rounded-xl tw:border tw:px-3 tw:py-2.5 tw:text-xs tw:text-[color-mix(in_srgb,#9a6700_72%,var(--ink-1))] tw:[border-color:color-mix(in_srgb,#f5c451_45%,var(--line-soft))] tw:bg-[color-mix(in_srgb,#fff6d8_72%,var(--bg-elev-2))]",
  success:
    "memory-info-banner memory-info-banner-success tw:rounded-xl tw:border tw:px-3 tw:py-2.5 tw:text-xs tw:text-[color-mix(in_srgb,#156f48_72%,var(--ink-1))] tw:[border-color:color-mix(in_srgb,#82d4ab_40%,var(--line-soft))] tw:bg-[color-mix(in_srgb,#ecfff3_74%,var(--bg-elev-2))]",
  danger:
    "memory-info-banner memory-info-banner-danger tw:rounded-xl tw:border tw:px-3 tw:py-2.5 tw:text-xs tw:text-accent-danger tw:[border-color:color-mix(in_srgb,var(--accent-danger)_32%,var(--line-soft))] tw:bg-[color-mix(in_srgb,var(--accent-danger)_8%,var(--bg-elev-2))]",
} as const;

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
): string[] {
  return Array.from(
    new Set((preferred && preferred.length > 0 ? preferred : fallback)
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

export const MemoryInfoConsoleView: React.FC<MemoryInfoConsoleViewProps> = ({
  title,
  subtitle,
  activeTab,
  onTabChange,
  cardClassName = "",
  recordsPanel,
  preferencesPanel,
  previewPanel,
}) => {
  const { t } = useI18n();

  return (
    <div
      className={`${MEMORY_INFO_CARD_CLASS_NAME} ${cardClassName}`.trim()}
    >
      <div className={MEMORY_HEAD_CLASS_NAME}>
        <div>
          <h3>{title}</h3>
          <p className={MEMORY_SUBTITLE_CLASS_NAME}>{subtitle}</p>
        </div>
      </div>

      <div className={MEMORY_CONSOLE_TABS_CLASS_NAME}>
        <UiButton
          variant="ghost"
          size="sm"
          className={SETTINGS_SEGMENTED_BUTTON_CLASS_NAME}
          active={activeTab === "preferences"}
          onClick={() => onTabChange("preferences")}
        >
          {t("memoryPreferences.tab")}
        </UiButton>
        <UiButton
          variant="ghost"
          size="sm"
          className={SETTINGS_SEGMENTED_BUTTON_CLASS_NAME}
          active={activeTab === "preview"}
          onClick={() => onTabChange("preview")}
        >
          {t("memoryPreview.tab")}
        </UiButton>
        <UiButton
          variant="ghost"
          size="sm"
          className={SETTINGS_SEGMENTED_BUTTON_CLASS_NAME}
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
  );
};

export const MemoryInfoModalView: React.FC<MemoryInfoModalViewProps> = ({
  open,
  onClose,
  ...consoleProps
}) => {
  if (!open) {
    return null;
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      centered
      footer={null}
      destroyOnHidden
      getContainer={false}
      width="min(1220px, calc(100vw - 36px))"
      className="memory-info-modal"
    >
      <MemoryInfoConsoleView {...consoleProps} />
    </Modal>
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

interface MemoryInfoConsoleProps {
  open?: boolean;
  onClose?: () => void;
  surface?: "modal" | "page";
}

export const MemoryInfoConsole: React.FC<MemoryInfoConsoleProps> = ({
  open = true,
  onClose,
  surface = "page",
}) => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { t } = useI18n();
  const listRequestSeqRef = useRef(0);
  const detailRequestSeqRef = useRef(0);
  const preferenceScopesSeqRef = useRef(0);
  const preferenceScopeSeqRef = useRef(0);
  const metaLoadAttemptedRef = useRef(false);
  const previewAutoTriggeredRef = useRef(false);
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
  const previewContext = useMemo(
    () =>
      resolveMemoryPreviewContext({
        chatId: state.chatId,
        chats: state.chats,
        workerSelectionKey: state.workerSelectionKey,
        workerIndexByKey: state.workerIndexByKey,
        workerRows: state.workerRows,
        workerRelatedChats: state.workerRelatedChats,
      }),
    [
      state.chatId,
      state.chats,
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
  const previewChatId = toText(previewContext.chatId);
  const previewTeamId = toText(currentChat?.teamId) || toText(previewContext.teamId);

  const closeModal = useCallback(() => {
    onClose?.();
  }, [onClose]);

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
      const chatId = previewChatId;
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
    [dispatch, previewChatId, state.memoryPreviewDraft, t],
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
    if (open) {
      return;
    }
    listRequestSeqRef.current += 1;
    detailRequestSeqRef.current += 1;
    preferenceScopesSeqRef.current += 1;
    preferenceScopeSeqRef.current += 1;
    metaLoadAttemptedRef.current = false;
    previewAutoTriggeredRef.current = false;
    preferencesLoadSignatureRef.current = "";
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    void loadMemoryMeta();
  }, [loadMemoryMeta, open]);

  useEffect(() => {
    if (!open || !agentContext.agentKey) {
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
    open,
  ]);

  useEffect(() => {
    if (!open || state.memoryConsoleTab !== "preview") {
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
    open,
    state.memoryPreviewDraft,
  ]);

  useEffect(() => {
    if (!open || state.memoryConsoleTab !== "preview") {
      return;
    }
    if (previewAutoTriggeredRef.current) {
      return;
    }
    if (
      !toText(previewChatId) ||
      !toText(state.memoryPreviewDraft) ||
      toText(state.memoryPreviewDraft) !== toText(state.composerDraft)
    ) {
      return;
    }
    previewAutoTriggeredRef.current = true;
    void runMemoryPreview(state.memoryPreviewDraft);
  }, [
    state.composerDraft,
    previewChatId,
    runMemoryPreview,
    state.memoryConsoleTab,
    open,
    state.memoryPreviewDraft,
  ]);

  const subtitle = agentContext.agentKey
    ? t("memoryInfo.subtitle", {
        label: agentContext.label || agentContext.agentKey,
      })
    : t("memoryInfo.subtitleEmpty");

  const consoleProps: MemoryInfoConsoleViewProps = {
    title: t("memoryInfo.title"),
    subtitle,
    activeTab: state.memoryConsoleTab,
    onTabChange: (tab) => dispatch({ type: "SET_MEMORY_CONSOLE_TAB", tab }),
    recordsPanel: {
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
        void loadDetail(
          id,
          record?.agentKey || agentContext.agentKey || undefined,
        );
      },
      onFilterChange: updateFilter,
    },
    preferencesPanel: {
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
    },
    previewPanel: {
      agentKey: agentContext.agentKey,
      chatId: previewChatId,
      teamId: previewTeamId,
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
    },
  };

  if (!open) {
    return null;
  }

  if (surface === "modal") {
    return (
      <MemoryInfoModalView
        {...consoleProps}
        open={open}
        onClose={closeModal}
      />
    );
  }

  return (
    <MemoryInfoConsoleView
      {...consoleProps}
      cardClassName="memory-info-page-card"
    />
  );
};

export const MemoryInfoModal: React.FC<{
  open?: boolean;
  onClose?: () => void;
}> = ({ open = true, onClose }) => {
  return (
    <MemoryInfoConsole
      open={open}
      surface="modal"
      onClose={onClose}
    />
  );
};
