import { SkinVisual } from "@/shared/ui/SkinVisual";
import React, { useState } from "react";
import { Input, Tooltip } from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";
import type { VoiceChatStatus } from "@/features/voice/lib/voiceState";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { useComposerPastedText } from "../hooks/useComposerPastedText";
import { ComposerPastedTexts } from "./ComposerPastedTexts";
import voiceStyles from "@/features/voice/components/VoiceEffects.module.css";
import { VoiceControls } from "@/features/voice/components/VoiceControls";

interface ComposerInputProps {
  isVoiceMode: boolean;
  isFrontendActive: boolean;
  disabled?: boolean;
  isTimelineEmpty: boolean;
  inputValue: string;
  draftScopeKey?: string;
  renderAttachments?: (pastedTexts: React.ReactNode, pastedTextCount: number) => React.ReactNode;
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
  "tw:!p-1.5 tw:!leading-[1.45] tw:text-[15px]";
const COMPOSER_INPUT_EXPAND_BUTTON_CLASS =
  "composer-input-expand-btn tw:group tw:!absolute tw:!-right-1 tw:!-top-1 tw:z-10 tw:!h-5 tw:!min-h-5 tw:!w-5 tw:!min-w-5";
const COMPOSER_INPUT_EXPAND_ARROW_CLASS =
  "composer-input-expand-arrow tw:[transform:rotate(45deg)_translate(0px,-4px)] tw:group-hover:hidden tw:group-data-[expanded=true]:hidden";
const COMPOSER_INPUT_EXPAND_ICON_CLASS =
  "tw:hidden tw:group-hover:inline-flex tw:group-data-[expanded=true]:inline-flex";
export const ComposerInput: React.FC<ComposerInputProps> = ({
  isVoiceMode,
  isFrontendActive,
  disabled = false,
  isTimelineEmpty,
  inputValue,
  draftScopeKey = "",
  renderAttachments,
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
  const pastedText = useComposerPastedText({ value: inputValue, scopeKey: draftScopeKey, onChange: onInputChange, onFilePaste: onPaste, textareaRef });
  const voiceUserPreview = partialUserText.trim();
  const voiceAssistantPreview = partialAssistantText.trim();
  const voiceStatusText = t(`composer.voice.status.${voiceStatus === "idle" ? "ready" : voiceStatus}`);
  const [inputExpanded, setInputExpanded] = useState(false);
  const pastedTextCards = (
    <ComposerPastedTexts pastes={pastedText.pastes} disabled={disabled || isFrontendActive}
      inline={Boolean(renderAttachments)} onRemove={pastedText.removePaste} onExpand={pastedText.expandPaste} />
  );

  return (
    <div className={COMPOSER_MODE_SHELL_CLASS}>
      {renderAttachments ? renderAttachments(pastedTextCards, pastedText.pastes.length) : pastedTextCards}
      <div className={COMPOSER_MODE_MAIN_CLASS}>
        {isVoiceMode ? (
          <div className={`voice-chat-panel ${voiceStyles.panel}`} data-status={voiceStatus}>
            <div className={voiceStyles.header}>
              <div className={voiceStyles.identity}>
                <strong>{t("composer.voice.title")}</strong>
                {currentWorkerName && <span title={currentWorkerName}>{currentWorkerName}</span>}
              </div>
              <span className={`voice-chat-status ${voiceStyles.status}`} role="status">
                {voiceStatusText}
              </span>
            </div>
            {(voiceUserPreview || voiceAssistantPreview) && (
              <dl className={`voice-chat-summary-grid ${voiceStyles.transcript}`}>
                {voiceUserPreview && (
                  <div>
                    <dt>{t("composer.voice.userLabel")}</dt>
                    <dd title={voiceUserPreview}>{voiceUserPreview}</dd>
                  </div>
                )}
                {voiceAssistantPreview && (
                  <div>
                    <dt>{t("composer.voice.assistantLabel")}</dt>
                    <dd title={voiceAssistantPreview}>{voiceAssistantPreview}</dd>
                  </div>
                )}
              </dl>
            )}
            {voiceError && <div className={voiceStyles.error} role="alert">{voiceError}</div>}
            <VoiceControls />
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
                <SkinVisual slot={inputExpanded ? "chat.collapse" : "chat.expand"} className={COMPOSER_INPUT_EXPAND_ICON_CLASS}>
                  <MaterialIcon
                  name={inputExpanded ? "collapse_content" : "expand_content"}
                  className={COMPOSER_INPUT_EXPAND_ICON_CLASS}
                />
                </SkinVisual>
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
              disabled={disabled}
              value={pastedText.inputValue}
              onChange={(event) => pastedText.handleInputChange(event.target.value, event.target.selectionStart)}
              onSelect={pastedText.captureSelection}
              onBeforeInput={pastedText.captureSelection}
              onCut={pastedText.captureSelection}
              onKeyDown={(e) => {
                pastedText.captureSelection(e);
                if (inputExpanded && e.key === "Enter" && !(e.metaKey && !e.shiftKey && !e.altKey)) return;
                if (inputExpanded && e.key === "Escape") {
                  setInputExpanded(false);
                  return;
                }
                onKeyDown(e);
              }}
              onPaste={disabled ? undefined : pastedText.handlePaste}
              onDragOver={disabled ? undefined : onDragOver}
              onDrop={disabled ? undefined : onDrop}
              onCompositionStart={onCompositionStart}
              onCompositionEnd={onCompositionEnd}
            />
          </div>
        )}
      </div>
    </div>
  );
};
