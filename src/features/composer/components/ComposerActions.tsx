import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ControlsForm } from "@/features/composer/components/ControlsForm";
import { ComposerAddMenu } from "@/features/composer/components/ComposerAddMenu";
import { QuerySettingsControls } from "@/features/composer/components/QuerySettingsControls";
import { useComposerContext } from "@/features/composer/components/ComposerContext";
import type {
  ComposerContextReferenceInput,
  ComposerRequiredSkill,
} from "@/features/composer/lib/composerAttachments";
import type { QueryAccessLevel, QueryModelOverride } from "@/shared/data";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { Flex, Tooltip } from "antd";

const COMPOSER_CONTROL_ROW_CLASS =
  "composer-control-row tw:flex tw:w-full tw:items-center tw:gap-2.5 tw:overflow-hidden";
const COMPOSER_PLUS_WRAP_CLASS =
  "composer-plus-wrap tw:relative tw:inline-flex tw:flex-1 tw:items-center tw:overflow-auto tw:whitespace-nowrap";
const CONTEXT_TOGGLE_BUTTON_CLASS =
  "composer-context-toggle-btn tw:group tw:!max-w-[160px] tw:!gap-1.5 tw:!px-2 tw:!text-[13px] tw:!text-text-muted tw:hover:!bg-bg-hover tw:hover:!text-ink-1";
const CONTEXT_TOGGLE_ICON_CLASS = "composer-context-toggle-icon tw:group-hover:hidden";
const CONTEXT_TOGGLE_CLOSE_ICON_CLASS =
  "composer-context-toggle-close-icon tw:hidden tw:scale-[.8] tw:text-lg tw:group-hover:inline-flex";
const CONTEXT_TOGGLE_LABEL_CLASS =
  "composer-context-toggle-label tw:overflow-hidden tw:text-ellipsis";
const PLAN_TOGGLE_SHORTCUT_CLASS =
  "plan-toggle-shortcut tw:rounded-md tw:bg-[var(--colorFillSecondary)] tw:px-[7px] tw:py-[5px] tw:text-[10px] tw:text-text-sub";
const VOICE_BUTTON_BASE_CLASS =
  "voice-btn tw:!grid tw:!h-8 tw:!min-h-8 tw:!w-8 tw:!min-w-8 tw:!place-items-center tw:!rounded-full tw:!border tw:!border-[color-mix(in_srgb,var(--line-soft)_90%,transparent)] tw:!bg-[color-mix(in_srgb,var(--bg-elev-2)_92%,var(--bg-input))] tw:!p-0 tw:hover:!border-[color-mix(in_srgb,var(--accent-electric)_22%,var(--line-strong))] tw:disabled:opacity-55 tw:[&_.material-icon]:text-[17px]";
const VOICE_BUTTON_STATE_CLASS = {
  idle: "",
  listening:
    "is-listening tw:!border-[color-mix(in_srgb,var(--accent-danger)_56%,var(--line-soft))] tw:!bg-[color-mix(in_srgb,var(--accent-danger)_12%,var(--bg-elev-2))] tw:!shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent-danger)_22%,transparent)]",
} as const;
const SEND_BUTTON_CLASS =
  "send-btn tw:!grid tw:!h-8 tw:!min-h-8 tw:!w-8 tw:!min-w-8 tw:!flex-none tw:!place-items-center tw:self-center tw:!rounded-lg tw:!border-0 tw:!bg-accent-electric tw:!p-0 tw:!text-base tw:!font-bold tw:!text-white tw:!shadow-[0_6px_16px_rgba(38,99,235,0.22)] tw:!transition-[transform,box-shadow] tw:duration-[180ms] tw:ease-in-out tw:hover:!scale-[1.03] tw:hover:!bg-[color-mix(in_srgb,var(--accent-electric)_88%,#0b4aa2)] tw:hover:!shadow-[0_6px_12px_rgba(22,119,255,0.28)] tw:active:!scale-[0.97] tw:[&_.material-icon]:text-[17px]";
const INTERRUPT_BUTTON_CLASS =
  "interrupt-btn tw:!h-8 tw:!min-h-8 tw:!w-8 tw:!min-w-8 tw:!flex-none tw:self-center tw:!rounded-lg tw:!border-0 tw:!p-0 tw:!text-[11px] tw:!font-bold tw:hover:!bg-[color-mix(in_srgb,var(--accent-danger)_10%,transparent)] tw:disabled:opacity-60";

interface ComposerActionsProps {
  accessLevel: QueryAccessLevel;
  isFrontendActive: boolean;
  isVoiceMode: boolean;
  isStreaming: boolean;
  canCaptureDesktopScreenshot: boolean;
  isCapturingDesktopScreenshot: boolean;
  modelOverride: QueryModelOverride;
  planningMode: boolean;
  canUsePlanningMode: boolean;
  editingMode: boolean;
  canUseEditingMode: boolean;
  currentChatId: string;
  selectedSkills: ComposerRequiredSkill[];
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
  onEditingModeChange: (enabled: boolean) => void;
  onAddReference: (reference: ComposerContextReferenceInput) => void;
  onRemoveSelectedSkill: (skillKey: string) => void;
}

export const ComposerActions: React.FC<ComposerActionsProps> = ({
  accessLevel,
  isFrontendActive,
  isVoiceMode,
  isStreaming,
  canCaptureDesktopScreenshot,
  isCapturingDesktopScreenshot,
  modelOverride,
  planningMode,
  canUsePlanningMode,
  editingMode,
  canUseEditingMode,
  currentChatId,
  selectedSkills,
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
  onEditingModeChange,
  onAddReference,
  onRemoveSelectedSkill,
}) => {
  const { t } = useI18n();
  const {
    captureDesktopScreenshot,
    openFilePicker,
    interruptCurrentRun,
    toggleSpeechInput,
    handleSend,
  } = useComposerContext();
  const attachmentActionsDisabled =
    isFrontendActive || isVoiceMode || isStreaming;

  const controlRowRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);

  const updateCompact = useCallback(() => {
    if (controlRowRef.current) {
      setCompact(controlRowRef.current.clientWidth < 500);
    }
  }, []);

  useEffect(() => {
    const el = controlRowRef.current;
    if (!el) return;
    updateCompact();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => updateCompact());
      observer.observe(el);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", updateCompact);
    return () => window.removeEventListener("resize", updateCompact);
  }, [updateCompact]);

  const isCopilot = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.location.pathname.startsWith("/copilot"),
    [],
  );
  const voiceButtonStateClass = speechListening
    ? VOICE_BUTTON_STATE_CLASS.listening
    : VOICE_BUTTON_STATE_CLASS.idle;

  return (
    <Flex vertical style={{ width: "100%" }}>
      {isCopilot && (
        <Flex gap={4} style={{ overflow: "auto" }}>
          <ControlsForm
            disabled={isFrontendActive || isStreaming}
            onChange={onControlParamsChange}
          />
        </Flex>
      )}
      <div ref={controlRowRef} className={COMPOSER_CONTROL_ROW_CLASS}>
        <ComposerAddMenu
          disabled={attachmentActionsDisabled}
          loading={hasUploadingAttachments}
          currentChatId={currentChatId}
          planningMode={planningMode}
          canUsePlanningMode={canUsePlanningMode}
          editingMode={editingMode}
          canUseEditingMode={canUseEditingMode}
          onOpenFilePicker={openFilePicker}
          onAddReference={onAddReference}
          onTogglePlanningMode={onTogglePlanningMode}
          onEditingModeChange={onEditingModeChange}
        />
        <div className={COMPOSER_PLUS_WRAP_CLASS}>
          {canCaptureDesktopScreenshot ? (
            <UiButton
              className="desktop-screenshot-btn"
              variant="ghost"
              size="sm"
              iconOnly
              loading={isCapturingDesktopScreenshot}
              disabled={
                attachmentActionsDisabled || isCapturingDesktopScreenshot
              }
              onClick={() => void captureDesktopScreenshot()}
              aria-label={t("composer.actions.screenshot")}
              title={
                isFrontendActive
                  ? t("composer.actions.screenshotDisabled.frontendActive")
                  : isVoiceMode
                    ? t("composer.actions.screenshotDisabled.voiceMode")
                    : isStreaming
                      ? t("composer.actions.screenshotDisabled.streaming")
                      : isCapturingDesktopScreenshot
                        ? t("composer.actions.screenshotCapturing")
                        : t("composer.actions.screenshot")
              }
            >
              <MaterialIcon name="crop_free" />
            </UiButton>
          ) : null}
          {planningMode && canUsePlanningMode && (
            <Tooltip
              title={
                <Flex align="center" vertical style={{ fontSize: 12 }}>
                  <div>{t("composer.tooltip.createPlan")}</div>
                  <div>
                    <code className={PLAN_TOGGLE_SHORTCUT_CLASS}>
                      Shift + Tab
                    </code>{" "}
                    {t("composer.tooltip.planShortcut")}
                  </div>
                </Flex>
              }
            >
              <UiButton
                className={CONTEXT_TOGGLE_BUTTON_CLASS}
                variant="ghost"
                size="sm"
                onClick={onTogglePlanningMode}
              >
                <MaterialIcon
                  name="checklist"
                  className={CONTEXT_TOGGLE_ICON_CLASS}
                />
                <MaterialIcon
                  name="close"
                  className={CONTEXT_TOGGLE_CLOSE_ICON_CLASS}
                />
                {!compact && (
                  <span className={CONTEXT_TOGGLE_LABEL_CLASS}>
                    {t("composer.actions.plan")}
                  </span>
                )}
              </UiButton>
            </Tooltip>
          )}
          {editingMode && canUseEditingMode ? (
            <Tooltip title={t("composer.editingMode.tooltip")}>
              <UiButton
                className={CONTEXT_TOGGLE_BUTTON_CLASS}
                variant="ghost"
                size="sm"
                disabled={attachmentActionsDisabled}
                onClick={() => onEditingModeChange(false)}
              >
                <MaterialIcon
                  name="edit_square"
                  className={CONTEXT_TOGGLE_ICON_CLASS}
                />
                <MaterialIcon
                  name="close"
                  className={CONTEXT_TOGGLE_CLOSE_ICON_CLASS}
                />
                {!compact && (
                  <span className={CONTEXT_TOGGLE_LABEL_CLASS}>
                    {t("composer.editingMode.label")}
                  </span>
                )}
              </UiButton>
            </Tooltip>
          ) : null}
          {selectedSkills.map((skill) => (
            <Tooltip
              key={skill.key.toLowerCase()}
              title={t("composer.addMenu.skill.requiredTooltip", {
                name: skill.label,
              })}
            >
              <UiButton
                className={CONTEXT_TOGGLE_BUTTON_CLASS}
                variant="ghost"
                size="sm"
                disabled={attachmentActionsDisabled}
                onClick={() => onRemoveSelectedSkill(skill.key)}
              >
                <MaterialIcon
                  name="skills"
                  className={CONTEXT_TOGGLE_ICON_CLASS}
                />
                <MaterialIcon
                  name="close"
                  className={CONTEXT_TOGGLE_CLOSE_ICON_CLASS}
                />
                {!compact && (
                  <span className={CONTEXT_TOGGLE_LABEL_CLASS}>
                    <span className="composer-context-required-badge">
                      {t("composer.addMenu.skill.requiredBadge")}
                    </span>
                    {skill.label}
                  </span>
                )}
              </UiButton>
            </Tooltip>
          ))}

          {!isCopilot && (
            <ControlsForm
              disabled={isFrontendActive || isStreaming}
              onChange={onControlParamsChange}
            />
          )}
        </div>
        {isStreaming ? (
          <>
            <QuerySettingsControls
              accessLevel={accessLevel}
              disabled={true}
              compact={compact}
              modelOverride={modelOverride}
              onAccessLevelChange={onAccessLevelChange}
              onModelOverrideChange={onModelOverrideChange}
            />
            <UiButton
              className={INTERRUPT_BUTTON_CLASS}
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
              compact={compact}
              modelOverride={modelOverride}
              onAccessLevelChange={onAccessLevelChange}
              onModelOverrideChange={onModelOverrideChange}
            />
            {voiceEnabled ? (
              <UiButton
                className={`${VOICE_BUTTON_BASE_CLASS} ${voiceButtonStateClass}`}
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
              className={SEND_BUTTON_CLASS}
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
    </Flex>
  );
};
