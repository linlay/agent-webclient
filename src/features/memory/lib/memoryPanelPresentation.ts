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
import { formatMemoryTimestamp } from "@/features/memory/lib/memoryInfo";
import { toText } from "@/shared/utils/eventUtils";

export type MemoryPanelTranslator = (key: string, vars?: Record<string, unknown>) => string;
type Translator = MemoryPanelTranslator;

export const PREFERENCE_SCOPE_ORDER: MemoryPreferenceScopeType[] = [
  "user",
  "agent",
  "team",
  "global",
];
export const PREVIEW_PROMPT_LAYER_ORDER: MemoryContextPromptLayer[] = [
  "stable",
  "session",
  "observation",
];
export const MEMORY_INFO_CARD_CLASS_NAME =
  "memory-info-card tw:flex tw:h-[min(88vh,940px)] tw:min-h-[min(88vh,940px)] tw:w-full tw:flex-col tw:gap-4 tw:overflow-hidden tw:[&_.settings-segmented-btn.ui-btn]:min-w-0 tw:[&_.settings-segmented-btn.ui-btn]:text-[13px] tw:[&_.settings-segmented]:w-full tw:[&_.settings-segmented]:max-w-[640px]";
export const MEMORY_HEAD_CLASS_NAME =
  "settings-head memory-info-head tw:mb-0 tw:flex tw:items-center tw:justify-between tw:[&_button]:rounded-lg tw:[&_button]:border-0 tw:[&_button]:bg-transparent tw:[&_button]:px-2.5 tw:[&_button]:py-1 tw:[&_button]:text-xs tw:[&_button]:font-semibold tw:[&_button]:text-ink-muted tw:[&_button:hover]:bg-bg-hover tw:[&_button:hover]:text-ink-1 tw:[&_button:hover]:shadow-none tw:[&_h3]:m-0 tw:[&_h3]:text-base";
export const MEMORY_SUBTITLE_CLASS_NAME =
  "memory-info-subtitle tw:mb-0 tw:mt-1.5 tw:text-[13px] tw:leading-[1.5] tw:text-ink-muted";
export const MEMORY_CONSOLE_TABS_CLASS_NAME =
  "memory-console-tabs settings-segmented tw:min-w-0 tw:w-[min(640px,100%)]";
export const MEMORY_CONSOLE_PANE_CLASS_NAME =
  "memory-console-pane tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:overflow-hidden";
export const MEMORY_INFO_LAYOUT_CLASS_NAME =
  "memory-info-layout tw:grid tw:min-h-0 tw:flex-1 tw:grid-cols-[minmax(360px,430px)_minmax(0,1fr)] tw:gap-[18px] tw:max-[980px]:grid-cols-1";
export const MEMORY_INFO_PANE_CLASS_NAME =
  "memory-info-pane tw:flex tw:min-h-0 tw:flex-col tw:gap-3.5 tw:rounded-2xl tw:border tw:p-4 tw:shadow-elevated tw:[border-color:color-mix(in_srgb,var(--line-soft)_90%,transparent)] tw:bg-[color-mix(in_srgb,var(--bg-elev-2)_94%,var(--bg-input))]";
export const MEMORY_INFO_PANE_HEADER_CLASS_NAME =
  "memory-info-pane-header tw:flex tw:items-start tw:justify-between tw:gap-3 tw:border-b tw:pb-3 tw:[border-color:color-mix(in_srgb,var(--line-soft)_88%,transparent)] tw:[&_strong]:block tw:[&_strong]:text-[15px] tw:[&_strong]:leading-[1.35] tw:[&_strong]:text-ink-1";
export const MEMORY_INFO_PANE_HINT_CLASS_NAME =
  "memory-info-pane-hint tw:mb-0 tw:mt-1 tw:text-xs tw:leading-[1.5] tw:text-ink-muted";
export const MEMORY_INFO_ACTIONS_CLASS_NAME =
  "memory-info-actions tw:inline-flex tw:items-center tw:gap-2";
export const MEMORY_FILTER_GRID_CLASS_NAME =
  "memory-info-filter-grid tw:grid tw:grid-cols-2 tw:gap-3.5 tw:max-[980px]:grid-cols-1";
export const MEMORY_PANE_LIST_FILTER_GRID_CLASS_NAME =
  `${MEMORY_FILTER_GRID_CLASS_NAME} tw:gap-x-3 tw:gap-y-2.5`;
export const MEMORY_FIELD_CLASS_NAME =
  "memory-info-field tw:flex tw:flex-col tw:gap-[7px] tw:[&>span]:text-xs tw:[&>span]:font-semibold tw:[&>span]:tracking-[0.02em] tw:[&>span]:text-ink-muted";
export const MEMORY_PANE_LIST_FIELD_CLASS_NAME =
  `${MEMORY_FIELD_CLASS_NAME} tw:gap-[5px] tw:[&>span]:text-[11px]`;
export const MEMORY_FIELD_WIDE_CLASS_NAME =
  `${MEMORY_PANE_LIST_FIELD_CLASS_NAME} memory-info-field-wide tw:col-span-full`;
export const MEMORY_INFO_INPUT_CLASS_NAME =
  "memory-info-input tw:w-full tw:rounded-lg tw:border tw:border-line-soft tw:bg-[color-mix(in_srgb,var(--bg-input)_92%,var(--bg-elev-2))] tw:px-2.5 tw:py-2 tw:text-xs tw:text-ink-1 tw:outline-none tw:focus:border-accent-electric tw:focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent-electric)_14%,transparent)]";
export const MEMORY_INFO_SELECT_CLASS_NAME =
  "memory-info-select tw:h-9 tw:w-full tw:rounded-lg tw:border tw:border-line-soft tw:bg-[color-mix(in_srgb,var(--bg-input)_92%,var(--bg-elev-2))] tw:px-2.5 tw:py-2 tw:text-xs tw:text-ink-1 tw:outline-none tw:focus:border-accent-electric tw:focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent-electric)_14%,transparent)]";
export const MEMORY_INFO_ERROR_CLASS_NAME =
  "memory-info-error tw:rounded-xl tw:border tw:px-3 tw:py-2.5 tw:text-xs tw:text-accent-danger tw:[border-color:color-mix(in_srgb,var(--accent-danger)_32%,var(--line-soft))] tw:bg-[color-mix(in_srgb,var(--accent-danger)_8%,var(--bg-elev-2))]";
export const COMMAND_EMPTY_STATE_CLASS_NAME =
  "command-empty-state tw:rounded-[14px] tw:border tw:border-dashed tw:px-4 tw:py-6 tw:text-center tw:text-[13px] tw:text-ink-muted tw:[border-color:color-mix(in_srgb,var(--line-strong)_76%,transparent)] tw:bg-[color-mix(in_srgb,var(--bg-input)_56%,var(--bg-elev-2))]";
export const COMMAND_DETAIL_LABEL_CLASS_NAME =
  "command-detail-label tw:mb-1.5 tw:block tw:text-[11px] tw:text-ink-muted";
export const SETTINGS_SEGMENTED_BUTTON_CLASS_NAME =
  "settings-segmented-btn tw:flex-1 tw:min-w-24 tw:rounded-pill";
export const MEMORY_INFO_RECORD_LIST_CLASS_NAME =
  "memory-info-record-list tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-2 tw:overflow-auto tw:pb-3 tw:pl-0 tw:pr-1.5 tw:pt-1 tw:[scrollbar-gutter:stable]";
export const MEMORY_INFO_RECORD_ITEM_CLASS_NAME =
  "memory-info-record-item tw:w-full tw:rounded-xl tw:border tw:p-3 tw:pt-[11px] tw:text-left tw:transition-[border-color,background,box-shadow,transform] tw:duration-[140ms] tw:ease-out tw:[border-color:color-mix(in_srgb,var(--line-soft)_92%,transparent)] tw:bg-[color-mix(in_srgb,var(--bg-elev-2)_94%,var(--bg-input))] tw:hover:[border-color:color-mix(in_srgb,var(--accent-electric)_52%,var(--line-soft))] tw:hover:bg-[color-mix(in_srgb,var(--accent-soft)_58%,var(--bg-elev-2))] tw:hover:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent-soft)_82%,transparent)] tw:[&.is-selected]:[border-color:color-mix(in_srgb,var(--accent-electric)_52%,var(--line-soft))] tw:[&.is-selected]:bg-[color-mix(in_srgb,var(--accent-soft)_58%,var(--bg-elev-2))] tw:[&.is-selected]:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent-soft)_82%,transparent)] tw:[&_.ui-tag]:min-h-5 tw:[&_.ui-tag]:px-[7px] tw:[&_.ui-tag]:py-0.5 tw:[&_.ui-tag]:text-[11px]";
export const MEMORY_RECORD_HEAD_CLASS_NAME =
  "memory-info-record-head tw:flex tw:items-start tw:justify-between tw:gap-3 tw:[&>span]:flex-none tw:[&>span]:whitespace-nowrap tw:[&>span]:text-[11px] tw:[&>span]:text-ink-muted tw:[&>strong]:line-clamp-2 tw:[&>strong]:break-words tw:[&>strong]:text-[13px] tw:[&>strong]:leading-[1.45] tw:[&>strong]:text-ink-1";
export const MEMORY_RECORD_META_CLASS_NAME =
  "memory-info-record-meta tw:mt-1.5 tw:flex tw:flex-wrap tw:gap-2";
export const MEMORY_RECORD_SUMMARY_CLASS_NAME =
  "memory-info-record-summary tw:mt-2.5 tw:line-clamp-4 tw:whitespace-pre-wrap tw:break-words tw:text-[13px] tw:leading-[1.7] tw:text-ink-2";
export const MEMORY_DETAIL_STACK_CLASS_NAME =
  "memory-info-detail-stack tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-4 tw:overflow-auto tw:pb-[18px] tw:pl-0 tw:pr-2 tw:pt-0 tw:[scrollbar-gutter:stable]";
export const MEMORY_DETAIL_TITLE_CLASS_NAME =
  "memory-info-detail-title tw:[&_h4]:m-0 tw:[&_h4]:text-[17px] tw:[&_h4]:leading-[1.45] tw:[&_h4]:text-ink-1";
export const MEMORY_DETAIL_BADGES_CLASS_NAME =
  "memory-info-detail-badges tw:mt-2.5 tw:flex tw:flex-wrap tw:gap-2";
export const MEMORY_DETAIL_SUMMARY_CLASS_NAME =
  "memory-info-detail-summary tw:whitespace-pre-wrap tw:break-words tw:text-[13px] tw:leading-[1.7] tw:text-ink-2";
export const MEMORY_DETAIL_GRID_CLASS_NAME =
  "memory-info-detail-grid tw:grid tw:grid-cols-2 tw:gap-2.5 tw:max-[980px]:grid-cols-1";
export const MEMORY_DETAIL_CARD_CLASS_NAME =
  "memory-info-detail-card tw:box-border tw:flex-none tw:rounded-[14px] tw:border tw:px-[15px] tw:py-3.5 tw:[border-color:color-mix(in_srgb,var(--line-soft)_92%,transparent)] tw:bg-[color-mix(in_srgb,var(--bg-input)_74%,var(--bg-elev-2))] tw:[&>small]:block tw:[&>small]:text-[11px] tw:[&>small]:leading-[1.45] tw:[&>small]:text-ink-muted tw:[&>strong]:block tw:[&>strong]:break-words tw:[&>strong]:text-sm tw:[&>strong]:leading-[1.55] tw:[&>strong]:text-ink-1";
export const MEMORY_DETAIL_BLOCK_CLASS_NAME =
  "memory-info-detail-block tw:box-border tw:flex tw:flex-none tw:flex-col tw:gap-2.5 tw:rounded-[14px] tw:border tw:px-[15px] tw:py-3.5 tw:[border-color:color-mix(in_srgb,var(--line-soft)_92%,transparent)] tw:bg-[color-mix(in_srgb,var(--bg-input)_74%,var(--bg-elev-2))]";
export const MEMORY_RAW_BLOCK_CLASS_NAME =
  `${MEMORY_DETAIL_BLOCK_CLASS_NAME} memory-info-raw-block tw:mb-0.5 tw:overflow-hidden tw:[&_pre]:m-0 tw:[&_pre]:max-h-[260px] tw:[&_pre]:overflow-auto tw:[&_pre]:whitespace-pre-wrap tw:[&_pre]:break-words tw:[&_pre]:font-code tw:[&_pre]:text-xs tw:[&_pre]:leading-[1.55] tw:[&_pre]:text-ink-2`;
export const MEMORY_RAW_SUMMARY_CLASS_NAME =
  "memory-info-raw-summary tw:inline-flex tw:cursor-pointer tw:list-none tw:items-center tw:gap-2 tw:text-xs tw:font-bold tw:text-ink-1 tw:[&::-webkit-details-marker]:hidden";
export const MEMORY_PREVIEW_LAYOUT_CLASS_NAME =
  "memory-preview-layout tw:grid tw:min-h-0 tw:flex-1 tw:grid-cols-[minmax(320px,380px)_minmax(0,1fr)] tw:gap-[18px] tw:max-[980px]:grid-cols-1";
export const MEMORY_PREVIEW_PANE_INPUT_CLASS_NAME =
  `${MEMORY_INFO_PANE_CLASS_NAME} memory-preview-pane memory-preview-pane-input tw:min-w-0 tw:overflow-auto`;
export const MEMORY_PREVIEW_PANE_RESULT_CLASS_NAME =
  `${MEMORY_INFO_PANE_CLASS_NAME} memory-preview-pane memory-preview-pane-result tw:min-w-0 tw:overflow-hidden`;
export const MEMORY_PREVIEW_CONTEXT_LIST_CLASS_NAME =
  "memory-preview-context-list tw:grid tw:grid-cols-3 tw:gap-2.5 tw:max-[980px]:grid-cols-1";
export const MEMORY_PREVIEW_CONTEXT_ITEM_CLASS_NAME =
  "memory-preview-context-item tw:rounded-[14px] tw:border tw:px-[13px] tw:py-3 tw:[border-color:color-mix(in_srgb,var(--line-soft)_92%,transparent)] tw:bg-[color-mix(in_srgb,var(--bg-input)_72%,var(--bg-elev-2))] tw:[&>span]:block tw:[&>span]:text-[11px] tw:[&>span]:leading-[1.45] tw:[&>span]:text-ink-muted tw:[&>strong]:mt-2 tw:[&>strong]:block tw:[&>strong]:break-words tw:[&>strong]:text-[13px] tw:[&>strong]:leading-[1.45] tw:[&>strong]:text-ink-1";
export const MEMORY_PREVIEW_TEXTAREA_CLASS_NAME =
  "settings-textarea memory-preview-textarea tw:min-h-[124px]";
export const MEMORY_PREVIEW_SUMMARY_GRID_CLASS_NAME =
  "memory-preview-summary-grid tw:grid tw:grid-cols-2 tw:gap-2.5 tw:max-[980px]:grid-cols-1 tw:[&_.memory-info-detail-card]:gap-2";
export const MEMORY_PREVIEW_LAYER_TABS_CLASS_NAME =
  "memory-preview-layer-tabs settings-segmented tw:w-[min(420px,100%)]";
export const MEMORY_PREVIEW_LAYER_TAB_CLASS_NAME =
  `${SETTINGS_SEGMENTED_BUTTON_CLASS_NAME} memory-preview-layer-tab`;
export const MEMORY_PREVIEW_PROMPT_BLOCK_CLASS_NAME =
  "memory-preview-prompt-block tw:rounded-[14px] tw:border tw:px-[15px] tw:py-3.5 tw:[border-color:color-mix(in_srgb,var(--line-soft)_92%,transparent)] tw:bg-[color-mix(in_srgb,var(--bg-input)_72%,var(--bg-elev-2))] tw:[&_pre]:mt-2.5 tw:[&_pre]:max-h-[260px] tw:[&_pre]:overflow-auto tw:[&_pre]:whitespace-pre-wrap tw:[&_pre]:break-words tw:[&_pre]:font-code tw:[&_pre]:text-xs tw:[&_pre]:leading-[1.65] tw:[&_pre]:text-ink-2";
export const MEMORY_PREVIEW_LIST_CLASS_NAME =
  "tw:flex tw:flex-col tw:gap-2.5";
export const MEMORY_PREVIEW_ITEM_CARD_CLASS_NAME =
  "tw:rounded-[14px] tw:border tw:px-[13px] tw:py-3 tw:[border-color:color-mix(in_srgb,var(--line-soft)_92%,transparent)] tw:bg-[color-mix(in_srgb,var(--bg-input)_72%,var(--bg-elev-2))]";
export const MEMORY_PREVIEW_HEAD_CLASS_NAME =
  "tw:flex tw:items-start tw:justify-between tw:gap-2.5 tw:[&>span]:text-[11px] tw:[&>span]:leading-[1.45] tw:[&>span]:text-ink-muted tw:[&>strong]:text-[13px] tw:[&>strong]:leading-[1.45] tw:[&>strong]:text-ink-1";
export const MEMORY_PREVIEW_EMPTY_CLASS_NAME =
  "memory-preview-layer-empty tw:text-xs tw:leading-[1.55] tw:text-ink-muted";
export const MEMORY_PREFERENCE_SCOPE_TABS_CLASS_NAME =
  "memory-preference-scope-tabs tw:mb-3.5 tw:flex tw:flex-wrap tw:gap-2.5";
export const MEMORY_PREFERENCE_SCOPE_TAB_CLASS_NAME =
  "memory-preference-scope-tab tw:rounded-[14px] tw:px-4";
export const MEMORY_PREFERENCE_LAYOUT_CLASS_NAME =
  "memory-preference-layout tw:grid tw:min-h-0 tw:flex-1 tw:grid-cols-[minmax(290px,340px)_minmax(320px,0.92fr)_minmax(360px,1.08fr)] tw:gap-[18px] tw:max-[1320px]:grid-cols-[minmax(280px,320px)_minmax(0,1fr)] tw:max-[980px]:grid-cols-1";
export const MEMORY_PREFERENCE_PANE_LIST_CLASS_NAME =
  `${MEMORY_INFO_PANE_CLASS_NAME} memory-preference-pane memory-preference-pane-list tw:min-w-0 tw:overflow-hidden`;
export const MEMORY_PREFERENCE_PANE_DETAIL_CLASS_NAME =
  `${MEMORY_INFO_PANE_CLASS_NAME} memory-preference-pane memory-preference-pane-detail tw:min-w-0 tw:overflow-auto`;
export const MEMORY_PREFERENCE_PANE_EDITOR_CLASS_NAME =
  `${MEMORY_INFO_PANE_CLASS_NAME} memory-preference-pane memory-preference-pane-editor tw:min-w-0 tw:overflow-auto tw:max-[1320px]:col-span-full tw:max-[980px]:col-auto`;
export const MEMORY_PREFERENCE_MODE_TOGGLE_CLASS_NAME =
  "memory-preference-mode-toggle settings-segmented tw:w-fit tw:min-w-[292px]";
export const MEMORY_PREFERENCE_FORM_CLASS_NAME =
  "memory-preference-form tw:flex tw:flex-col tw:gap-3.5";
export const MEMORY_PREFERENCE_FORM_GRID_CLASS_NAME =
  "memory-preference-form-grid tw:grid tw:grid-cols-2 tw:gap-3 tw:max-[980px]:grid-cols-1";
export const MEMORY_PREFERENCE_TEXTAREA_CLASS_NAME =
  "settings-textarea memory-preference-textarea tw:min-h-28";
export const MEMORY_PREFERENCE_MARKDOWN_PANEL_CLASS_NAME =
  "memory-preference-markdown-panel tw:flex tw:flex-col tw:gap-3.5";
export const MEMORY_PREFERENCE_MARKDOWN_CLASS_NAME =
  "settings-textarea memory-preference-markdown tw:min-h-[360px] tw:font-code tw:text-xs tw:leading-[1.6]";
export const MEMORY_PREFERENCE_MARKDOWN_HINT_CLASS_NAME =
  "memory-preference-markdown-hint tw:flex tw:items-start tw:justify-between tw:gap-3 tw:rounded-xl tw:border tw:px-3 tw:py-2.5 tw:[border-color:color-mix(in_srgb,var(--line-soft)_90%,transparent)] tw:bg-[color-mix(in_srgb,var(--bg-elev-2)_92%,var(--accent-soft))] tw:[&_p]:m-0 tw:[&_p]:text-xs tw:[&_p]:leading-[1.6] tw:[&_p]:text-ink-2";
export const MEMORY_PREFERENCE_VALIDATION_CLASS_NAME =
  "memory-preference-validation tw:flex tw:flex-col tw:gap-2";
export const MEMORY_PREFERENCE_VALIDATION_ITEM_CLASS_BY_KIND = {
  error:
    "memory-preference-validation-item is-error tw:rounded-[10px] tw:bg-[color-mix(in_srgb,var(--accent-danger)_8%,var(--bg-elev-2))] tw:px-2.5 tw:py-2 tw:text-xs tw:leading-[1.5] tw:text-accent-danger",
  warning:
    "memory-preference-validation-item is-warning tw:rounded-[10px] tw:bg-[color-mix(in_srgb,#fff6d8_72%,var(--bg-elev-2))] tw:px-2.5 tw:py-2 tw:text-xs tw:leading-[1.5] tw:text-[color-mix(in_srgb,#9a6700_72%,var(--ink-1))]",
} as const;
export const MEMORY_PREFERENCE_RECORD_ROW_CLASS_NAME =
  "memory-preference-record-row tw:grid tw:grid-cols-[minmax(0,1fr)_auto] tw:items-center tw:gap-2.5 tw:rounded-[14px] tw:border tw:py-2.5 tw:pl-3 tw:pr-2.5 tw:transition-[border-color,background,box-shadow,transform] tw:duration-[140ms] tw:ease-out tw:[border-color:color-mix(in_srgb,var(--line-soft)_92%,transparent)] tw:bg-[color-mix(in_srgb,var(--bg-elev-2)_88%,var(--bg-input))] tw:[&.is-selected]:-translate-y-px tw:[&.is-selected]:[border-color:color-mix(in_srgb,var(--accent-electric)_52%,var(--line-soft))] tw:[&.is-selected]:bg-[color-mix(in_srgb,var(--accent-soft)_74%,var(--bg-elev-2))] tw:[&.is-selected]:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent-soft)_88%,transparent),0_8px_18px_color-mix(in_srgb,var(--accent-soft)_12%,transparent)] tw:[&.is-selected_.memory-preference-record-marker]:bg-[color-mix(in_srgb,var(--accent-electric)_78%,white)]";
export const MEMORY_PREFERENCE_RECORD_MAIN_CLASS_NAME =
  "memory-preference-record-main tw:grid tw:min-w-0 tw:grid-cols-[4px_minmax(0,1fr)] tw:items-stretch tw:gap-2.5 tw:border-0 tw:bg-transparent tw:p-0 tw:text-left";
export const MEMORY_PREFERENCE_RECORD_MARKER_CLASS_NAME =
  "memory-preference-record-marker tw:min-h-full tw:w-1 tw:rounded-pill tw:bg-[color-mix(in_srgb,var(--accent-electric)_26%,var(--line-soft))]";
export const MEMORY_PREFERENCE_RECORD_BODY_CLASS_NAME =
  "memory-preference-record-body tw:flex tw:min-w-0 tw:flex-col tw:gap-2";
export const MEMORY_PREFERENCE_RECORD_TOPLINE_CLASS_NAME =
  "memory-preference-record-topline tw:flex tw:items-start tw:justify-between tw:gap-2.5 tw:[&>span]:flex-none tw:[&>span]:whitespace-nowrap tw:[&>span]:text-[11px] tw:[&>span]:leading-[1.35] tw:[&>span]:text-ink-muted tw:[&>strong]:line-clamp-2 tw:[&>strong]:min-w-0 tw:[&>strong]:text-xs tw:[&>strong]:font-bold tw:[&>strong]:leading-[1.45] tw:[&>strong]:text-ink-1";
export const MEMORY_PREFERENCE_RECORD_SUMMARY_CLASS_NAME =
  "memory-info-record-summary tw:mt-0 tw:line-clamp-2 tw:whitespace-pre-wrap tw:break-words tw:text-xs tw:leading-[1.55] tw:text-ink-muted";
export const MEMORY_PREFERENCE_RECORD_META_CLASS_NAME =
  "memory-info-record-meta tw:mt-0 tw:flex tw:flex-wrap tw:gap-1.5";
export const MEMORY_PREFERENCE_RECORD_DELETE_CLASS_NAME =
  "memory-preference-record-delete tw:self-start tw:rounded-[10px] tw:px-2 tw:py-1.5";
export const MEMORY_INFO_BANNER_CLASS_BY_TONE = {
  warning:
    "memory-info-banner memory-info-banner-warning tw:rounded-xl tw:border tw:px-3 tw:py-2.5 tw:text-xs tw:text-[color-mix(in_srgb,#9a6700_72%,var(--ink-1))] tw:[border-color:color-mix(in_srgb,#f5c451_45%,var(--line-soft))] tw:bg-[color-mix(in_srgb,#fff6d8_72%,var(--bg-elev-2))]",
  success:
    "memory-info-banner memory-info-banner-success tw:rounded-xl tw:border tw:px-3 tw:py-2.5 tw:text-xs tw:text-[color-mix(in_srgb,#156f48_72%,var(--ink-1))] tw:[border-color:color-mix(in_srgb,#82d4ab_40%,var(--line-soft))] tw:bg-[color-mix(in_srgb,#ecfff3_74%,var(--bg-elev-2))]",
  danger:
    "memory-info-banner memory-info-banner-danger tw:rounded-xl tw:border tw:px-3 tw:py-2.5 tw:text-xs tw:text-accent-danger tw:[border-color:color-mix(in_srgb,var(--accent-danger)_32%,var(--line-soft))] tw:bg-[color-mix(in_srgb,var(--accent-danger)_8%,var(--bg-elev-2))]",
} as const;

export function toneForStatus(
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

export function formatDetailValue(value: unknown): string {
  if (value === null || value === undefined) return "--";
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return toText(value) || "--";
}

export function mergeMemoryMetaOptions(
  preferred: string[] | undefined,
  fallback: string[],
): string[] {
  return Array.from(
    new Set((preferred && preferred.length > 0 ? preferred : fallback)
      .map((value) => toText(value))
      .filter(Boolean)),
  );
}

export function promptToneForLayer(
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

export function formatPreviewLayerLabel(t: Translator, layer: string): string {
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

export function renderMemoryDetailRows(t: Translator, detail: MemoryRecordDetail) {
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

export function renderPreferenceInspectorRows(
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

export function buildFallbackScopeSummaries(t: Translator): MemoryScopeSummary[] {
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

export function formatValidationFieldLabel(t: Translator, field: string): string {
  const normalized = toText(field).trim().toLowerCase();
  if (!normalized) {
    return t("memoryPreferences.validation.field.unknown");
  }
  if (normalized === "field" || normalized === "entry") {
    return t(`memoryPreferences.validation.field.${normalized}`);
  }
  return field;
}

export function formatValidationMessage(
  t: Translator,
  issue: { message?: string | null },
): string {
  const message = toText(issue.message);
  if (message === "expected 'key: value'") {
    return t("memoryPreferences.validation.expectedKeyValue");
  }
  return message || t("memoryPreferences.validation.unknown");
}
