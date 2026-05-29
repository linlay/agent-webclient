import React from "react";
import { ControlsForm } from "@/features/composer/components/ControlsForm";
import { QuerySettingsControls } from "@/features/composer/components/QuerySettingsControls";
import { useComposerContext } from "@/features/composer/components/ComposerContext";
import type {
  QueryAccessLevel,
  QueryModelOverride,
} from "@/shared/api/apiClient";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { Flex, Tooltip } from "antd";

interface ComposerActionsProps {
  accessLevel: QueryAccessLevel;
  isFrontendActive: boolean;
  isVoiceMode: boolean;
  isStreaming: boolean;
  modelOverride: QueryModelOverride;
  planningMode: boolean;
  voiceEnabled: boolean;
  hasUploadingAttachments: boolean;
  speechListening: boolean;
  speechSupported: boolean;
  speechStatus: string;
  sendDisabled: boolean;
  onAccessLevelChange: (value: QueryAccessLevel) => void;
  onControlParamsChange: (params: Record<string, unknown>) => void;
  onModelOverrideChange: (value: QueryModelOverride) => void;
  onTogglePlanningMode: () => void;
}

export const ComposerActions: React.FC<ComposerActionsProps> = ({
  accessLevel,
  isFrontendActive,
  isVoiceMode,
  isStreaming,
  modelOverride,
  planningMode,
  voiceEnabled,
  hasUploadingAttachments,
  speechListening,
  speechSupported,
  speechStatus,
  sendDisabled,
  onAccessLevelChange,
  onControlParamsChange,
  onModelOverrideChange,
  onTogglePlanningMode,
}) => {
  const { t } = useI18n();
  const { openFilePicker, interruptCurrentRun, toggleSpeechInput, handleSend } =
    useComposerContext();

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
        {planningMode && (
          <Tooltip
            title={
              <Flex align="center" vertical style={{fontSize: 12}}>
                <div>{t("composer.tooltip.createPlan")}</div>
                <div>{t("composer.tooltip.planShortcut")}</div>
              </Flex>
            }
          >
            <UiButton
              className="plan-toggle-btn"
              variant="ghost"
              size="sm"
              onClick={onTogglePlanningMode}
            >
              <MaterialIcon name="checklist" className="plan-toggle-icon" />
              <MaterialIcon name="close" className="plan-toggle-close-icon" />
              <span>{t("composer.actions.plan")}</span>
            </UiButton>
          </Tooltip>
        )}
        <ControlsForm
          disabled={isFrontendActive || isStreaming}
          onChange={onControlParamsChange}
        />
      </div>
      <div
        className={`composer-actions ${isVoiceMode ? "has-voice-controls" : ""}`.trim()}
      >
        {isStreaming ? (
          <>
            <QuerySettingsControls
              accessLevel={accessLevel}
              disabled={isFrontendActive}
              modelOverride={modelOverride}
              onAccessLevelChange={onAccessLevelChange}
              onModelOverrideChange={onModelOverrideChange}
              showModelSelector={false}
            />
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
          </>
        ) : !isVoiceMode ? (
          <>
            <QuerySettingsControls
              accessLevel={accessLevel}
              disabled={isFrontendActive}
              modelOverride={modelOverride}
              onAccessLevelChange={onAccessLevelChange}
              onModelOverrideChange={onModelOverrideChange}
            />
            {voiceEnabled ? (
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
            ) : null}
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
