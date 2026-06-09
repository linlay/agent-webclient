import React, { useState } from "react";
import { Button, Flex, Input, Tooltip } from "antd";
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
    <div className="composer-mode-shell">
      <div className="composer-mode-main">
        {isVoiceMode ? (
          <div
            className={`voice-chat-panel is-${voiceStatus}`}
            aria-live="polite"
          >
            <div className="voice-chat-panel-header">
              <div className="voice-chat-panel-identity">
                <div
                  className={`voice-chat-orb is-${voiceStatus}`}
                  aria-hidden="true"
                >
                  <span />
                  <span />
                  <span />
                </div>
                <div className="voice-chat-panel-heading">
                  <div className="voice-chat-panel-title-row">
                    <div className="voice-chat-panel-title">
                      {t("composer.voice.title")}
                    </div>
                    <div className="voice-chat-worker">
                      {t("composer.voice.currentWorker")}
                      <strong>{currentWorkerName || "--"}</strong>
                    </div>
                  </div>
                </div>
              </div>
              <div className={`voice-chat-status is-${voiceStatus}`}>
                <span className="voice-chat-status-dot" />
                {voiceStatusText}
              </div>
            </div>
            <div className="voice-chat-summary-grid">
              <div className="voice-chat-snippet voice-chat-snippet-user">
                <div className="voice-chat-snippet-label">
                  {t("composer.voice.userLabel")}
                </div>
                <div
                  className={`voice-chat-snippet-text ${!hasVoiceUserPreview ? "is-placeholder" : ""}`}
                  title={voiceUserPreview}
                >
                  {voiceUserPreview}
                </div>
              </div>
              <div className="voice-chat-snippet voice-chat-snippet-assistant">
                <div className="voice-chat-snippet-label">
                  {t("composer.voice.assistantLabel")}
                </div>
                <div
                  className={`voice-chat-snippet-text ${!hasVoiceAssistantPreview ? "is-placeholder" : ""}`}
                  title={voiceAssistantPreview}
                >
                  {voiceAssistantPreview}
                </div>
              </div>
            </div>
            {voiceError && <div className="voice-chat-error">{voiceError}</div>}
          </div>
        ) : (
          <div className="composer-input-wrapper">
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
                className="composer-input-expand-btn"
                data-expanded={inputExpanded}
                onClick={() => setInputExpanded(!inputExpanded)}
              >
                <MaterialIcon
                  name="keyboard_arrow_up"
                  className="composer-input-expand-arrow"
                />
                <MaterialIcon
                  name={inputExpanded ? "collapse_content" : "expand_content"}
                />
              </UiButton>
            </Tooltip>
            <Input.TextArea
              ref={textareaRef}
              id="message-input"
              variant="borderless"
              placeholder={
                inputExpanded
                  ? t("composer.input.placeholder.expanded")
                  : isFrontendActive
                    ? t("composer.input.placeholder.frontendActive")
                    : t("composer.input.placeholder.default")
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
