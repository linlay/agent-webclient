import React from "react";
import { useI18n } from "@/shared/i18n";
import { UiButton } from "@/shared/ui/UiButton";
import { UiInput } from "@/shared/ui/UiInput";

interface SettingsTokenProps {
  appMode: boolean;
  tokenInput: string;
  error: string;
  onTokenInputChange: (value: string) => void;
  onSave: () => void;
}

export const SettingsToken: React.FC<SettingsTokenProps> = ({
  appMode,
  tokenInput,
  error,
  onTokenInputChange,
  onSave,
}) => {
  const { t } = useI18n();

  return (
    <>
      <div className="field-group">
        <label htmlFor="settings-token">{t("settings.token.label")}</label>
        <UiInput
          id="settings-token"
          inputSize="md"
          type="password"
          placeholder={
            appMode
              ? t("settings.token.placeholder.app")
              : t("settings.token.placeholder.web")
          }
          value={tokenInput}
          readOnly={appMode}
          onChange={(event) => onTokenInputChange(event.target.value)}
        />
        {error && <p className="settings-error">{error}</p>}
        <p className="settings-hint">
          {appMode
            ? t("settings.token.hint.app")
            : t("settings.token.hint.web")}
        </p>
      </div>

      {!appMode && (
        <div className="settings-inline-actions">
          <UiButton variant="primary" size="sm" onClick={onSave}>
            {t("settings.token.save")}
          </UiButton>
        </div>
      )}
    </>
  );
};
