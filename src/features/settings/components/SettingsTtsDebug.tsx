import React, { useEffect, useState } from "react";
import { useI18n } from "@/shared/i18n";
import { UiButton } from "@/shared/ui/UiButton";

interface SettingsTtsDebugProps {
  settingsOpen: boolean;
  ttsDebugStatus: string;
  onSend: (text: string) => void;
  onStop: () => void;
}

export const SettingsTtsDebug: React.FC<SettingsTtsDebugProps> = ({
  settingsOpen,
  ttsDebugStatus,
  onSend,
  onStop,
}) => {
  const { t } = useI18n();
  const [ttsDebugText, setTtsDebugText] = useState("");
  const defaultTtsDebugText = t("voice.debug.defaultTtsText");

  useEffect(() => {
    if (!settingsOpen) return;
    setTtsDebugText((current) =>
      current.trim() ? current : defaultTtsDebugText,
    );
  }, [defaultTtsDebugText, settingsOpen]);

  return (
    <div className="field-group" style={{ marginTop: "14px" }}>
      <label htmlFor="tts-debug-input">{t("settings.tts.label")}</label>
      <textarea
        id="tts-debug-input"
        rows={3}
        className="settings-textarea"
        placeholder={defaultTtsDebugText}
        value={ttsDebugText}
        onChange={(event) => setTtsDebugText(event.target.value)}
      />
      <div className="settings-inline-actions">
        <UiButton
          variant="primary"
          size="sm"
          onClick={() => onSend(ttsDebugText)}
        >
          {t("settings.tts.send")}
        </UiButton>
        <UiButton variant="danger" size="sm" onClick={onStop}>
          {t("settings.tts.stop")}
        </UiButton>
      </div>
      <p className="settings-hint">{ttsDebugStatus}</p>
    </div>
  );
};
