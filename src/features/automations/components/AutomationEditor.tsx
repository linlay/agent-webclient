import { Input, Popconfirm, Spin, Tooltip } from "antd";
import type { Agent, Team } from "@/app/state/types";
import { AutomationFormFields } from "@/features/automations/components/AutomationFormFields";
import { useAutomationEditorRuntime } from "@/features/automations/hooks/useAutomationEditorRuntime";
import type { CurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";

const ERROR_CLASS_NAME =
  "automation-console-error tw:flex tw:items-center tw:justify-between tw:gap-3 tw:rounded-control tw:border tw:px-2.5 tw:py-2 tw:text-xs tw:text-accent-danger tw:[border-color:color-mix(in_srgb,var(--accent-danger)_42%,var(--line-soft))]";
const BODY_CLASS_NAME =
  "automation-console-body is-editor-only tw:grid tw:min-h-0 tw:flex-auto tw:overflow-hidden";
const DETAIL_CLASS_NAME =
  "automation-console-detail tw:min-h-0 tw:min-w-0 tw:overflow-auto tw:[&_.ant-select]:min-w-0 tw:[&_.ant-select]:w-full tw:[&_select]:min-h-8 tw:[&_select]:w-full tw:[&_select]:rounded-control tw:[&_select]:border tw:[&_select]:px-2 tw:[&_select]:py-1.5 tw:[&_select]:text-xs tw:[&_select]:text-ink-1 tw:[&_select]:[border-color:color-mix(in_srgb,var(--line-soft)_92%,transparent)] tw:[&_select]:bg-[color-mix(in_srgb,var(--bg-input)_92%,var(--bg-elev-2))]";
const SOURCE_EDITOR_CLASS_NAME =
  "settings-textarea automation-source-editor tw:min-h-0 tw:flex-1 tw:resize-none tw:font-code tw:leading-[1.5] tw:[tab-size:2] tw:max-[860px]:min-h-80 tw:max-[860px]:flex-none tw:max-[860px]:resize-y";

export interface AutomationEditorProps {
  automationId: string;
  currentWorker: CurrentWorkerSummary | null;
  agents: Agent[];
  teams: Team[];
  onSaved?: (automationId: string) => void;
  onDeleted?: (automationId: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

export function AutomationEditor({
  automationId,
  currentWorker,
  agents,
  teams: _teams,
  onSaved,
  onDeleted,
  onDirtyChange,
}: AutomationEditorProps) {
  const { t } = useI18n();
  const runtime = useAutomationEditorRuntime({
    automationId,
    currentWorker,
    onDeleted,
    onDirtyChange,
    onSaved,
    t,
  });
  const isExisting = Boolean(String(automationId || "").trim());
  const isSourceMode = runtime.editorMode === "source";

  return (
    <div className="command-modal-section automation-console is-editor-only tw:overflow-hidden">
      {runtime.error ? (
        <div className={ERROR_CLASS_NAME}>
          <span>{runtime.error}</span>
          <UiButton size="sm" variant="ghost" onClick={() => void runtime.loadAutomation()}>
            {t("automationConsole.action.retry")}
          </UiButton>
        </div>
      ) : null}

      <div className={BODY_CLASS_NAME}>
        <Spin spinning={runtime.loading}>
          <div
            className={`${DETAIL_CLASS_NAME} ${isSourceMode ? "is-source-editor" : ""}`}
          >
            <nav
              className="automation-section-nav tw:sticky tw:top-0 tw:flex tw:items-center tw:gap-1"
              aria-label={t("automationConsole.sectionNav.ariaLabel")}
            >
              <div className="automation-section-nav-links tw:flex tw:min-w-0 tw:flex-1 tw:overflow-x-auto">
                <a
                  className="automation-section-nav-link tw:flex-none tw:whitespace-nowrap"
                  href="#automation-section-basic"
                  aria-current={!isSourceMode ? "location" : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    if (isSourceMode) void runtime.toggleEditorMode();
                  }}
                >
                  {t("automationConsole.section.basic")}
                </a>
              </div>
              <div className="automation-section-nav-actions tw:ml-auto tw:flex tw:flex-none tw:items-center tw:gap-1">
                {isExisting ? (
                  <Tooltip
                    title={
                      isSourceMode
                        ? t("automationConsole.action.structuredEdit")
                        : t("automationConsole.action.sourceEdit")
                    }
                    arrow={false}
                  >
                    <UiButton
                      className="automation-section-nav-icon-button ui-icon-hover-24"
                      size="sm"
                      variant="ghost"
                      iconOnly
                      active={isSourceMode}
                      onClick={() => void runtime.toggleEditorMode()}
                      disabled={runtime.saving || runtime.deleting || runtime.savingToggle}
                      loading={runtime.loadingSource}
                      aria-label={
                        isSourceMode
                          ? t("automationConsole.action.structuredEdit")
                          : t("automationConsole.action.sourceEdit")
                      }
                    >
                      <MaterialIcon name={isSourceMode ? "tune" : "code"} />
                    </UiButton>
                  </Tooltip>
                ) : null}
                <Tooltip
                  title={
                    runtime.form.enabled
                      ? t("automationConsole.action.disable")
                      : t("automationConsole.action.enable")
                  }
                  arrow={false}
                >
                  <UiButton
                    className="automation-section-nav-icon-button ui-icon-hover-24"
                    size="sm"
                    variant="ghost"
                    iconOnly
                    onClick={() => void runtime.toggleEnabled()}
                    disabled={runtime.saving || runtime.deleting}
                    loading={runtime.savingToggle}
                    aria-label={
                      runtime.form.enabled
                        ? t("automationConsole.action.disable")
                        : t("automationConsole.action.enable")
                    }
                  >
                    <MaterialIcon
                      name={runtime.form.enabled ? "pause_circle" : "play_circle"}
                    />
                  </UiButton>
                </Tooltip>
                {isExisting ? (
                  <Popconfirm
                    title={t("automationConsole.confirm.deleteTitle")}
                    okText={t("automationConsole.confirm.deleteOk")}
                    cancelText={t("automationConsole.confirm.deleteCancel")}
                    okButtonProps={{ danger: true }}
                    onConfirm={() => runtime.deleteCurrent()}
                    disabled={runtime.saving || runtime.deleting || runtime.savingToggle}
                  >
                    <UiButton
                      className="automation-section-nav-icon-button ui-icon-hover-24 tw:!text-danger"
                      size="sm"
                      variant="ghost"
                      iconOnly
                      disabled={runtime.saving || runtime.savingToggle}
                      loading={runtime.deleting}
                      aria-label={t("automationConsole.action.delete")}
                    >
                      <MaterialIcon name="delete" />
                    </UiButton>
                  </Popconfirm>
                ) : null}
                <UiButton
                  className="automation-section-nav-icon-button automation-section-nav-save"
                  size="sm"
                  variant="primary"
                  onClick={() =>
                    void (isSourceMode ? runtime.saveSource() : runtime.saveForm())
                  }
                  disabled={
                    runtime.deleting ||
                    runtime.savingToggle ||
                    (isSourceMode &&
                      (runtime.loadingSource ||
                        !runtime.sourceDirty ||
                        runtime.sourceLoadedId !== automationId))
                  }
                  loading={runtime.saving}
                  aria-label={
                    isSourceMode
                      ? t("automationConsole.action.saveSource")
                      : isExisting
                        ? t("automationConsole.action.saveChanges")
                        : t("automationConsole.action.create")
                  }
                >
                  <MaterialIcon name="save" />
                  <span>{t("automationConsole.action.saveChanges")}</span>
                </UiButton>
              </div>
            </nav>

            {isSourceMode ? (
              <div className="automation-source-workspace">
                <div className="field-group automation-source-field">
                  <label htmlFor="automation-source-editor">
                    {t("automationConsole.field.sourceFile")}
                  </label>
                  <Input.TextArea
                    id="automation-source-editor"
                    className={SOURCE_EDITOR_CLASS_NAME}
                    value={runtime.sourceDraft}
                    onChange={(event) => runtime.updateSourceDraft(event.target.value)}
                  />
                </div>
                {runtime.formError ? (
                  <div className="settings-error">{runtime.formError}</div>
                ) : null}
                {runtime.sourceDirty ? (
                  <span className="automation-source-dirty tw:mt-2 tw:text-[11px] tw:text-ink-muted">
                    {t("automationConsole.message.unsaved")}
                  </span>
                ) : null}
              </div>
            ) : (
              <>
                <AutomationFormFields
                  agents={agents}
                  form={runtime.form}
                  onChange={runtime.updateForm}
                />
                {runtime.formError ? (
                  <div className="settings-error">{runtime.formError}</div>
                ) : null}
              </>
            )}
          </div>
        </Spin>
      </div>
    </div>
  );
}
