import React, { useState } from "react";
import { Input, Tooltip } from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";
import type { VoiceChatStatus } from "@/app/state/types";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";

interface ComposerInputProps {
  isVoiceMode: boolean;
  isFrontendActive: boolean;
  isTimelineEmpty: boolean;
  inputValue: string;
  placeholder?: string;
  currentWorkerName: string;
  voiceStatus: VoiceChatStatus;
  voiceError: string;
  partialUserText: string;
  partialAssistantText: string;
  emptyInputMinRows?: number;
  inputMaxRows?: number;
  onInputChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  onDragOver: (event: React.DragEvent<HTMLTextAreaElement>) => void;
  onDrop: (event: React.DragEvent<HTMLTextAreaElement>) => void;
  onCompositionStart: () => void;
  onCompositionEnd: () => void;
  textareaRef: React.RefObject<TextAreaRef>;
}

const COMPOSER_MODE_SHELL_CLASS = "composer-mode-shell tw:w-full";
const COMPOSER_MODE_MAIN_CLASS =
  "composer-mode-main tw:flex tw:min-w-0 tw:items-stretch";
const COMPOSER_INPUT_WRAPPER_CLASS =
  "composer-input-wrapper tw:relative tw:w-full";
const COMPOSER_INPUT_TEXTAREA_CLASS =
  "tw:!p-1.5 tw:!text-[13px] tw:!leading-[1.45]";
const COMPOSER_INPUT_EXPAND_BUTTON_CLASS =
  "composer-input-expand-btn tw:group tw:!absolute tw:!-right-1 tw:!-top-1 tw:z-10 tw:!h-5 tw:!min-h-5 tw:!w-5 tw:!min-w-5";
const COMPOSER_INPUT_EXPAND_ARROW_CLASS =
  "composer-input-expand-arrow tw:[transform:rotate(45deg)_translate(0px,-4px)] tw:group-hover:hidden tw:group-data-[expanded=true]:hidden";
const COMPOSER_INPUT_EXPAND_ICON_CLASS =
  "tw:hidden tw:group-hover:inline-flex tw:group-data-[expanded=true]:inline-flex";
const VOICE_PANEL_CLASS =
  "voice-chat-panel tw:[--voice-accent:var(--accent-electric)] tw:[--voice-assistant-accent:var(--voice-assistant-accent-default)] tw:relative tw:flex tw:h-full tw:min-h-[var(--composer-main-min-height)] tw:w-full tw:flex-auto tw:flex-col tw:justify-start tw:gap-2 tw:overflow-hidden tw:rounded-2xl tw:border tw:border-[rgba(226,233,242,0.82)] tw:bg-[radial-gradient(circle_at_6%_10%,rgba(255,227,193,0.14),transparent_24%),radial-gradient(circle_at_100%_0%,color-mix(in_srgb,var(--voice-accent)_4%,transparent),transparent_28%),linear-gradient(160deg,rgba(255,255,255,0.98)_0%,rgba(250,251,254,0.98)_48%,rgba(246,249,254,0.98)_100%)] tw:p-[10px_12px] tw:shadow-[0_18px_38px_rgba(17,39,76,0.04),inset_0_1px_0_rgba(255,255,255,0.96)] tw:backdrop-blur-[18px] tw:backdrop-saturate-[112%] tw:[&::before]:pointer-events-none tw:[&::before]:absolute tw:[&::before]:inset-0 tw:[&::before]:rounded-[inherit] tw:[&::before]:content-[''] tw:[&::before]:bg-[linear-gradient(180deg,rgba(255,255,255,0.52),transparent_24%),radial-gradient(circle_at_82%_100%,color-mix(in_srgb,var(--voice-accent)_3%,transparent),transparent_30%)] tw:[&::after]:pointer-events-none tw:[&::after]:absolute tw:[&::after]:-bottom-[30px] tw:[&::after]:-right-6 tw:[&::after]:h-[92px] tw:[&::after]:w-[132px] tw:[&::after]:rounded-full tw:[&::after]:bg-[radial-gradient(circle,color-mix(in_srgb,var(--voice-accent)_5%,transparent),transparent_72%)] tw:[&::after]:blur-[10px] tw:[&::after]:content-[''] tw:[html[data-theme=dark]_&]:border-[color-mix(in_srgb,var(--line-soft)_100%,transparent)] tw:[html[data-theme=dark]_&]:bg-[radial-gradient(circle_at_100%_0%,color-mix(in_srgb,var(--voice-accent)_8%,transparent),transparent_24%),linear-gradient(180deg,color-mix(in_srgb,var(--bg-elev-2)_98%,transparent),color-mix(in_srgb,var(--bg-elev-1)_96%,transparent))] tw:[html[data-theme=dark]_&]:shadow-none tw:[html[data-theme=dark]_&::before]:opacity-60 tw:[html[data-theme=dark]_&::after]:opacity-60";
const VOICE_PANEL_STATUS_CLASS = {
  idle: "",
  connecting: "",
  listening: "tw:[--voice-accent:var(--voice-listening-accent)]",
  thinking: "",
  speaking: "tw:[--voice-accent:var(--voice-speaking-accent)]",
  error: "tw:[--voice-accent:var(--accent-danger)]",
} satisfies Record<VoiceChatStatus, string>;
const VOICE_PANEL_HEADER_CLASS =
  "tw:flex tw:items-center tw:justify-between tw:gap-2.5";
const VOICE_PANEL_IDENTITY_CLASS =
  "tw:flex tw:min-w-0 tw:items-center tw:gap-2.5";
const VOICE_ORB_CLASS =
  "voice-chat-orb tw:relative tw:flex tw:h-[34px] tw:w-[34px] tw:flex-none tw:items-end tw:justify-center tw:gap-[3px] tw:rounded-xl tw:bg-[linear-gradient(180deg,rgba(255,255,255,0.96),color-mix(in_srgb,var(--voice-accent)_6%,#f7fbff))] tw:px-2 tw:pb-[7px] tw:pt-0 tw:text-[color-mix(in_srgb,var(--voice-accent)_86%,#25425f)] tw:shadow-[inset_0_1px_0_rgba(255,255,255,0.94),0_6px_14px_rgba(17,39,76,0.04)] tw:[&::after]:absolute tw:[&::after]:inset-[-6px] tw:[&::after]:rounded-[15px] tw:[&::after]:border tw:[&::after]:border-[color-mix(in_srgb,var(--voice-accent)_11%,transparent)] tw:[&::after]:opacity-0 tw:[&::after]:content-[''] tw:[&>span]:w-[3px] tw:[&>span]:origin-bottom tw:[&>span]:animate-[voice-eq_1.25s_ease-in-out_infinite] tw:[&>span]:rounded-pill tw:[&>span]:bg-current tw:[&>span:nth-child(1)]:h-[9px] tw:[&>span:nth-child(1)]:[animation-delay:-0.15s] tw:[&>span:nth-child(2)]:h-[15px] tw:[&>span:nth-child(2)]:[animation-delay:-0.35s] tw:[&>span:nth-child(3)]:h-[11px] tw:[&>span:nth-child(3)]:[animation-delay:-0.55s] tw:[html[data-theme=dark]_&]:border-[color-mix(in_srgb,var(--line-soft)_100%,transparent)] tw:[html[data-theme=dark]_&]:bg-[color-mix(in_srgb,var(--bg-elev-1)_92%,var(--bg-elev-2))] tw:[html[data-theme=dark]_&]:shadow-none";
const VOICE_ORB_STATUS_CLASS = {
  idle: "",
  connecting:
    "tw:text-accent-electric tw:[&::after]:animate-[voice-orb-pulse_1.8s_ease-out_infinite]",
  listening:
    "tw:bg-[linear-gradient(180deg,rgba(250,255,252,0.88),rgba(226,247,235,0.98))] tw:text-[var(--voice-listening-strong)] tw:[&::after]:animate-[voice-orb-pulse_1.8s_ease-out_infinite]",
  thinking:
    "tw:text-accent-electric tw:[&>span]:[animation-duration:1.6s] tw:[&::after]:animate-[voice-orb-pulse_1.8s_ease-out_infinite]",
  speaking:
    "tw:bg-[linear-gradient(180deg,rgba(255,252,247,0.9),rgba(255,236,214,0.98))] tw:text-[var(--voice-speaking-strong)] tw:[&::after]:animate-[voice-orb-pulse_1.8s_ease-out_infinite]",
  error:
    "tw:bg-[linear-gradient(180deg,rgba(255,248,249,0.9),rgba(255,229,234,0.96))] tw:text-accent-danger tw:[&>span]:animate-none tw:[&>span]:opacity-80",
} satisfies Record<VoiceChatStatus, string>;
const VOICE_PANEL_HEADING_CLASS = "tw:grid tw:min-w-0";
const VOICE_PANEL_TITLE_ROW_CLASS =
  "tw:flex tw:flex-wrap tw:items-center tw:gap-x-2 tw:gap-y-1";
const VOICE_PANEL_TITLE_CLASS =
  "tw:text-[15px] tw:font-extrabold tw:text-ink-1";
const VOICE_WORKER_CLASS =
  "voice-chat-worker tw:inline-flex tw:min-h-[22px] tw:min-w-0 tw:max-w-full tw:items-center tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:rounded-pill tw:border tw:border-[rgba(231,237,244,0.82)] tw:bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(248,250,254,0.84))] tw:px-2 tw:text-[9px] tw:font-bold tw:text-ink-2 tw:shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_4px_10px_rgba(17,39,76,0.025)] tw:[html[data-theme=dark]_&]:border-[color-mix(in_srgb,var(--line-soft)_100%,transparent)] tw:[html[data-theme=dark]_&]:bg-[color-mix(in_srgb,var(--bg-elev-1)_92%,var(--bg-elev-2))] tw:[html[data-theme=dark]_&]:shadow-none";
const VOICE_WORKER_NAME_CLASS = "tw:ml-[5px] tw:text-ink-1";
const VOICE_STATUS_CLASS =
  "voice-chat-status tw:inline-flex tw:max-w-[min(100%,190px)] tw:items-center tw:justify-start tw:gap-1.5 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:rounded-pill tw:border tw:border-[rgba(229,235,243,0.86)] tw:bg-[linear-gradient(180deg,rgba(255,255,255,0.88),color-mix(in_srgb,var(--voice-accent)_5%,rgba(247,250,255,0.96)))] tw:px-2 tw:py-1 tw:text-[9px] tw:font-extrabold tw:text-[color-mix(in_srgb,var(--voice-accent)_78%,#29435f)] tw:shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_4px_10px_rgba(17,39,76,0.025)] tw:[html[data-theme=dark]_&]:border-[color-mix(in_srgb,var(--line-soft)_100%,transparent)] tw:[html[data-theme=dark]_&]:bg-[color-mix(in_srgb,var(--bg-elev-1)_92%,var(--bg-elev-2))] tw:[html[data-theme=dark]_&]:shadow-none";
const VOICE_STATUS_STATE_CLASS = {
  idle: "",
  connecting: "",
  listening:
    "tw:!bg-[linear-gradient(180deg,rgba(250,255,252,0.9),rgba(238,250,243,0.96))] tw:!text-[var(--voice-listening-status)]",
  thinking:
    "tw:!bg-[linear-gradient(180deg,rgba(248,252,255,0.9),rgba(239,247,255,0.96))] tw:!text-accent-electric",
  speaking:
    "tw:!bg-[linear-gradient(180deg,rgba(255,252,249,0.9),rgba(255,244,233,0.96))] tw:!text-[var(--voice-speaking-status)]",
  error:
    "tw:!bg-[linear-gradient(180deg,rgba(255,249,250,0.9),rgba(253,239,243,0.96))] tw:!text-accent-danger",
} satisfies Record<VoiceChatStatus, string>;
const VOICE_STATUS_DOT_CLASS =
  "tw:h-[5px] tw:w-[5px] tw:flex-none tw:rounded-full tw:bg-current tw:shadow-[0_0_0_2px_color-mix(in_srgb,currentColor_14%,transparent)]";
const VOICE_SUMMARY_GRID_CLASS =
  "voice-chat-summary-grid tw:grid tw:min-h-[50px] tw:grid-cols-2 tw:items-start tw:gap-0 tw:rounded-[14px] tw:border tw:border-[rgba(229,235,243,0.82)] tw:bg-[linear-gradient(180deg,rgba(255,255,255,0.8),rgba(250,252,255,0.72))] tw:shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_6px_14px_rgba(17,39,76,0.02)] tw:[html[data-theme=dark]_&]:border-[color-mix(in_srgb,var(--line-soft)_100%,transparent)] tw:[html[data-theme=dark]_&]:bg-[color-mix(in_srgb,var(--bg-elev-1)_92%,var(--bg-elev-2))] tw:[html[data-theme=dark]_&]:shadow-none";
const VOICE_SNIPPET_CLASS =
  "voice-chat-snippet tw:relative tw:grid tw:min-h-[50px] tw:min-w-0 tw:gap-1 tw:bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.04))] tw:px-3 tw:pb-2.5 tw:pt-[9px] tw:[html[data-theme=dark]_&]:bg-transparent";
const VOICE_SNIPPET_USER_CLASS =
  "tw:bg-[linear-gradient(180deg,rgba(246,249,255,0.2),rgba(246,249,255,0.04))]";
const VOICE_SNIPPET_ASSISTANT_CLASS =
  "tw:border-l tw:border-l-[rgba(231,237,244,0.8)] tw:bg-[linear-gradient(180deg,rgba(255,249,243,0.22),rgba(255,249,243,0.04))]";
const VOICE_SNIPPET_LABEL_CLASS =
  "voice-chat-snippet-label tw:inline-flex tw:items-center tw:gap-1.5 tw:text-[9px] tw:font-extrabold tw:text-[color-mix(in_srgb,var(--ink-muted)_94%,var(--voice-accent)_6%)] tw:[&::before]:h-[5px] tw:[&::before]:w-[5px] tw:[&::before]:rounded-full tw:[&::before]:bg-[color-mix(in_srgb,var(--line-strong)_44%,transparent)] tw:[&::before]:content-['']";
const VOICE_SNIPPET_LABEL_USER_CLASS =
  "tw:[&::before]:bg-[color-mix(in_srgb,var(--voice-accent)_52%,transparent)]";
const VOICE_SNIPPET_LABEL_ASSISTANT_CLASS =
  "tw:[&::before]:bg-[color-mix(in_srgb,var(--voice-assistant-accent)_52%,transparent)]";
const VOICE_SNIPPET_TEXT_CLASS =
  "voice-chat-snippet-text tw:min-h-0 tw:overflow-hidden tw:break-words tw:text-[12px] tw:leading-[1.4] tw:text-ink-1 tw:[-webkit-box-orient:vertical] tw:[-webkit-line-clamp:1] tw:[display:-webkit-box]";
const VOICE_SNIPPET_PLACEHOLDER_CLASS = "tw:text-ink-muted";
const VOICE_ERROR_CLASS =
  "voice-chat-error tw:whitespace-normal tw:rounded-[10px] tw:border tw:border-[rgba(246,221,227,0.92)] tw:bg-[linear-gradient(180deg,rgba(255,249,250,0.92),rgba(255,241,244,0.94))] tw:px-2 tw:py-1.5 tw:text-[9px] tw:font-semibold tw:text-accent-danger tw:shadow-[inset_0_1px_0_rgba(255,255,255,0.88)]";

function getVoiceStatusText(
  status: VoiceChatStatus,
  error: string,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  if (status === "connecting") return t("composer.voice.status.connecting");
  if (status === "listening") return t("composer.voice.status.listening");
  if (status === "thinking") return t("composer.voice.status.thinking");
  if (status === "speaking") return t("composer.voice.status.speaking");
  if (status === "error") {
    return error || t("composer.voice.status.error");
  }
  return t("composer.voice.status.ready");
}

export const ComposerInput: React.FC<ComposerInputProps> = ({
  isVoiceMode,
  isFrontendActive,
  isTimelineEmpty,
  inputValue,
  placeholder,
  currentWorkerName,
  voiceStatus,
  voiceError,
  partialUserText,
  partialAssistantText,
  emptyInputMinRows = 5,
  inputMaxRows = 10,
  onInputChange,
  onKeyDown,
  onPaste,
  onDragOver,
  onDrop,
  onCompositionStart,
  onCompositionEnd,
  textareaRef,
}) => {
  const { t } = useI18n();
  const voiceUserPreview =
    partialUserText || t("composer.voice.userPlaceholder");
  const voiceAssistantPreview =
    partialAssistantText ||
    (voiceStatus === "thinking"
      ? t("composer.voice.assistantThinkingPlaceholder")
      : t("composer.voice.assistantPlaceholder"));
  const hasVoiceUserPreview = Boolean(partialUserText.trim());
  const hasVoiceAssistantPreview = Boolean(partialAssistantText.trim());
  const voiceStatusText = getVoiceStatusText(voiceStatus, voiceError, t);
  const [inputExpanded, setInputExpanded] = useState(false);

  return (
    <div className={COMPOSER_MODE_SHELL_CLASS}>
      <div className={COMPOSER_MODE_MAIN_CLASS}>
        {isVoiceMode ? (
          <div
            className={`${VOICE_PANEL_CLASS} ${VOICE_PANEL_STATUS_CLASS[voiceStatus]}`}
            aria-live="polite"
          >
            <div className={VOICE_PANEL_HEADER_CLASS}>
              <div className={VOICE_PANEL_IDENTITY_CLASS}>
                <div
                  className={`${VOICE_ORB_CLASS} ${VOICE_ORB_STATUS_CLASS[voiceStatus]}`}
                  aria-hidden="true"
                >
                  <span />
                  <span />
                  <span />
                </div>
                <div className={VOICE_PANEL_HEADING_CLASS}>
                  <div className={VOICE_PANEL_TITLE_ROW_CLASS}>
                    <div className={VOICE_PANEL_TITLE_CLASS}>
                      {t("composer.voice.title")}
                    </div>
                    <div className={VOICE_WORKER_CLASS}>
                      {t("composer.voice.currentWorker")}
                      <strong className={VOICE_WORKER_NAME_CLASS}>
                        {currentWorkerName || "--"}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
              <div className={`${VOICE_STATUS_CLASS} ${VOICE_STATUS_STATE_CLASS[voiceStatus]}`}>
                <span className={VOICE_STATUS_DOT_CLASS} />
                {voiceStatusText}
              </div>
            </div>
            <div className={VOICE_SUMMARY_GRID_CLASS}>
              <div className={`${VOICE_SNIPPET_CLASS} ${VOICE_SNIPPET_USER_CLASS}`}>
                <div className={`${VOICE_SNIPPET_LABEL_CLASS} ${VOICE_SNIPPET_LABEL_USER_CLASS}`}>
                  {t("composer.voice.userLabel")}
                </div>
                <div
                  className={`${VOICE_SNIPPET_TEXT_CLASS} ${hasVoiceUserPreview ? "" : VOICE_SNIPPET_PLACEHOLDER_CLASS}`}
                  title={voiceUserPreview}
                >
                  {voiceUserPreview}
                </div>
              </div>
              <div className={`${VOICE_SNIPPET_CLASS} ${VOICE_SNIPPET_ASSISTANT_CLASS}`}>
                <div className={`${VOICE_SNIPPET_LABEL_CLASS} ${VOICE_SNIPPET_LABEL_ASSISTANT_CLASS}`}>
                  {t("composer.voice.assistantLabel")}
                </div>
                <div
                  className={`${VOICE_SNIPPET_TEXT_CLASS} ${hasVoiceAssistantPreview ? "" : VOICE_SNIPPET_PLACEHOLDER_CLASS}`}
                  title={voiceAssistantPreview}
                >
                  {voiceAssistantPreview}
                </div>
              </div>
            </div>
            {voiceError && <div className={VOICE_ERROR_CLASS}>{voiceError}</div>}
          </div>
        ) : (
          <div className={COMPOSER_INPUT_WRAPPER_CLASS}>
            <Tooltip
              title={
                inputExpanded
                  ? t("composer.input.tooltip.collapse")
                  : t("composer.input.tooltip.expand")
              }
            >
              <UiButton
                variant="ghost"
                iconOnly
                size="sm"
                className={COMPOSER_INPUT_EXPAND_BUTTON_CLASS}
                data-expanded={inputExpanded}
                onClick={() => setInputExpanded(!inputExpanded)}
              >
                <MaterialIcon
                  name="keyboard_arrow_up"
                  className={COMPOSER_INPUT_EXPAND_ARROW_CLASS}
                />
                <MaterialIcon
                  name={inputExpanded ? "collapse_content" : "expand_content"}
                  className={COMPOSER_INPUT_EXPAND_ICON_CLASS}
                />
              </UiButton>
            </Tooltip>
            <Input.TextArea
              ref={textareaRef}
              id="message-input"
              className={COMPOSER_INPUT_TEXTAREA_CLASS}
              variant="borderless"
              placeholder={
                isFrontendActive
                  ? t("composer.input.placeholder.frontendActive")
                  : inputExpanded
                    ? t("composer.input.placeholder.expanded")
                    : placeholder || t("composer.input.placeholder.default")
              }
              autoSize={{
                minRows:
                  (isTimelineEmpty ? emptyInputMinRows : 1) +
                  (inputExpanded ? 1 : 0),
                maxRows: inputMaxRows,
              }}
              disabled={isFrontendActive}
              value={inputValue}
              onChange={(event) => onInputChange(event.target.value)}
              onKeyDown={(e) => {
                if (inputExpanded && e.key === "Enter") return;
                if (inputExpanded && e.key === "Escape") {
                  setInputExpanded(false);
                  return;
                }
                onKeyDown(e);
              }}
              onPaste={onPaste}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onCompositionStart={onCompositionStart}
              onCompositionEnd={onCompositionEnd}
            />
          </div>
        )}
      </div>
    </div>
  );
};
