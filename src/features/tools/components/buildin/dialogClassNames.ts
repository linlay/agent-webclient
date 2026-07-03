import "../hitlCompat.module.css";

const dialogSurface =
  "tw:overflow-hidden tw:rounded-[20px] tw:border tw:border-border tw:bg-bg-card tw:p-2.5 tw:shadow-elevated";

const dialogLoadingSurface =
  "tw:overflow-hidden tw:rounded-[20px] tw:border tw:border-border tw:bg-bg-card tw:p-2.5 tw:shadow-elevated tw:min-h-[200px] tw:text-[var(--colorTextSecondary)]";

export const hitlDialogClassNames = {
  surface: dialogSurface,
  loadingSurface: dialogLoadingSurface,
  loadingIcon: "tw:text-[var(--colorPrimary)]",
  button: "tw:text-xs",
  skipButton: "tw:text-xs tw:text-text-muted",
  headerSide: "tw:shrink-0",
  timeoutRow: "tw:whitespace-nowrap tw:text-xs tw:text-text-muted",
  timeoutRowWithOffset:
    "tw:ml-3.5 tw:whitespace-nowrap tw:text-xs tw:text-text-muted",
  questionWrapper: "tw:text-xs",
  questionHeader: "tw:gap-4 tw:px-2.5 tw:pb-2.5",
  planQuestionHeader: "tw:gap-4 tw:px-2.5 tw:py-1.5",
  questionText: "tw:min-w-0 tw:flex-1",
  questionHeading: "tw:text-sm tw:font-bold tw:text-text-main",
  planQuestionHeading: "tw:font-bold tw:text-text-main",
  questionPrompt: "tw:leading-normal tw:text-text-muted",
  formItem: "tw:mb-0",
  inputField: "tw:m-[0_10px_10px] tw:w-auto",
  inputFieldFull: "tw:m-[0_10px_10px] tw:w-full",
  pagination: "tw:shrink-0",
  paginationDot:
    "tw:h-1.5 tw:w-1.5 tw:cursor-pointer tw:rounded-full tw:bg-[color-mix(in_srgb,var(--ink-muted)_84%,transparent)] tw:transition-transform tw:hover:scale-150",
  paginationDotActive: "tw:scale-150",
  paginationDotDone: "tw:bg-accent-lime",
  paginationDotSkip: "tw:bg-accent-danger",
  approvalDetails: "tw:px-3 tw:pb-3 tw:text-text-muted",
  approvalMeta: "tw:text-xs tw:leading-normal tw:text-text-muted",
  radioGroup: "hitl-radio-group tw:flex tw:flex-col tw:gap-1",
  checkboxGroup: "hitl-checkbox-group tw:flex tw:flex-col tw:gap-1",
  planCheckboxGroup: "hitl-checkbox-group tw:flex tw:flex-col tw:gap-0.5",
  radioOption:
    "hitl-radio-option tw:flex-1 tw:rounded-2xl tw:px-[3px] tw:py-1.5 tw:text-xs tw:text-text-muted tw:hover:bg-bg-hover tw:focus-within:bg-bg-hover",
  checkboxOption:
    "hitl-checkbox-option tw:rounded-2xl tw:px-[3px] tw:py-1.5 tw:text-xs tw:text-text-muted tw:hover:bg-bg-hover tw:focus-within:bg-bg-hover",
  planOption:
    "hitl-checkbox-option hitl-plan-option tw:flex-1 tw:rounded-2xl tw:px-[3px] tw:py-1.5 tw:text-xs tw:text-text-main tw:hover:bg-bg-hover tw:focus-within:bg-bg-hover",
  freeTextOption:
    "hitl-free-text tw:rounded-2xl tw:border tw:border-transparent tw:px-2.5 tw:py-1.5 tw:my-1 tw:text-xs tw:text-text-main tw:focus-within:border-accent",
  approvalFreeTextOption:
    "hitl-radio-option hitl-free-text tw:rounded-2xl tw:border tw:border-transparent tw:px-[3px] tw:py-1.5 tw:text-xs tw:text-text-main tw:focus-within:border-accent",
  optionIndex:
    "hitl-option-index tw:flex tw:h-5 tw:w-5 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-full tw:border tw:border-line tw:bg-bg-hover tw:text-text-muted",
  optionIndexIcon: "tw:text-xs",
  optionInfo: "tw:font-bold tw:text-text-main",
  optionInfoPlain: "tw:text-text-main",
  selectedBadge:
    "hitl-selected-badge tw:hidden tw:rounded-[10px] tw:bg-bg-hover tw:px-1.5 tw:text-xs tw:text-[var(--colorTextSecondary)]",
  optionPreview:
    "tw:h-[200px] tw:w-[min(340px,80vw)] tw:overflow-hidden tw:rounded-lg tw:border tw:border-border tw:bg-bg-card",
  optionPreviewFrame: "tw:block tw:h-full tw:w-full tw:border-0 tw:bg-white",
};

export function getHitlPaginationDotClassName(params: {
  active: boolean;
  done: boolean;
  skip: boolean;
}): string {
  return [
    hitlDialogClassNames.paginationDot,
    params.active ? hitlDialogClassNames.paginationDotActive : "",
    params.done ? hitlDialogClassNames.paginationDotDone : "",
    params.skip ? hitlDialogClassNames.paginationDotSkip : "",
  ]
    .filter(Boolean)
    .join(" ");
}
