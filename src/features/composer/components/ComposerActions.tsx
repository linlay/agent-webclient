import React from "react";
import { ControlsForm } from "@/features/composer/components/ControlsForm";
import { useComposerContext } from "@/features/composer/components/ComposerContext";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";

interface ComposerActionsProps {
  isFrontendActive: boolean;
  isVoiceMode: boolean;
  isStreaming: boolean;
  planningMode: boolean;
  hasUploadingAttachments: boolean;
  speechListening: boolean;
  speechSupported: boolean;
  speechStatus: string;
  sendDisabled: boolean;
  onControlParamsChange: (params: Record<string, unknown>) => void;
  onTogglePlanningMode: () => void;
}

export const ComposerActions: React.FC<ComposerActionsProps> = ({
  isFrontendActive,
  isVoiceMode,
  isStreaming,
  planningMode,
  hasUploadingAttachments,
  speechListening,
  speechSupported,
  speechStatus,
  sendDisabled,
  onControlParamsChange,
  onTogglePlanningMode,
}) => {
  const { t } = useI18n();
  const {
    openFilePicker,
    interruptCurrentRun,
    toggleSpeechInput,
    handleSend,
  } = useComposerContext();

  return (
    <div className="composer-control-row">
      <div className="composer-plus-wrap">
        <UiButton
          className="composer-plus-btn"
          variant="ghost"
          size="sm"
          iconOnly
          loading={hasUploadingAttachments}
          disabled={isFrontendActive || isVoiceMode || isStreaming}
          onClick={openFilePicker}
          aria-label={t("composer.actions.upload")}
          title={
            isFrontendActive
              ? t("composer.actions.uploadDisabled.frontendActive")
              : isVoiceMode
                ? t("composer.actions.uploadDisabled.voiceMode")
                : isStreaming
                  ? t("composer.actions.uploadDisabled.streaming")
                  : t("composer.actions.upload")
          }
        >
          <MaterialIcon name="add" />
        </UiButton>
        <ControlsForm
          disabled={isFrontendActive || isStreaming}
          onChange={onControlParamsChange}
        />
      </div>
      <div
        className={`composer-actions ${isVoiceMode ? "has-voice-controls" : ""}`.trim()}
      >
        {isStreaming ? (
          <UiButton
            className="interrupt-btn"
            id="interrupt-btn"
            variant="danger"
            size="sm"
            iconOnly
            disabled={isFrontendActive}
            onClick={() => void interruptCurrentRun()}
            aria-label={t("composer.actions.interrupt")}
          >
            <MaterialIcon name="stop_circle" style={{ fontSize: 28 }} />
          </UiButton>
        ) : !isVoiceMode ? (
          <>
            {planningMode && (
              <UiButton
                className={`plan-toggle-btn ${planningMode ? "is-active" : ""}`}
                variant="ghost"
                size="sm"
                onClick={onTogglePlanningMode}
              >
                {t("composer.actions.plan")}
              </UiButton>
            )}
            <UiButton
              className={`voice-btn ${speechListening ? "is-listening" : ""}`}
              variant="secondary"
              size="sm"
              iconOnly
              disabled={isFrontendActive}
              onClick={toggleSpeechInput}
              aria-label={
                !speechSupported
                  ? t("composer.actions.voiceUnavailable")
                  : speechListening
                    ? t("composer.actions.stopVoiceInput")
                    : t("composer.actions.voiceInput")
              }
              title={
                isFrontendActive
                  ? t("composer.actions.voiceInputDisabled.frontendActive")
                  : speechStatus
              }
            >
              <MaterialIcon name="mic" />
            </UiButton>
            <UiButton
              className="send-btn"
              id="send-btn"
              variant="primary"
              size="sm"
              iconOnly
              disabled={sendDisabled}
              onClick={handleSend}
              aria-label={t("composer.actions.send")}
            >
              <MaterialIcon name="arrow_upward" />
            </UiButton>
          </>
        ) : null}
      </div>
    </div>
  );
};
