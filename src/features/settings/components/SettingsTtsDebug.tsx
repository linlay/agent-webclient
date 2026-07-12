import React, { useEffect, useState } from "react";
import type { TranslateParams } from "@/shared/i18n";
import { useI18n } from "@/shared/i18n";
import { UiButton } from "@/shared/ui/UiButton";

type Translate = (key: string, params?: TranslateParams) => string;

interface SettingsTtsDebugProps {
  active: boolean;
  ttsDebugStatus: string;
  onSend: (text: string) => void;
  onStop: () => void;
}

export function formatTtsDebugStatus(status: string, t: Translate): string {
  const raw = String(status || "").trim();
  const error = raw.match(/^error:\s*(.+)$/i);
  if (error) {
    return t("settings.shared.errorWithDetail", { detail: error[1] });
  }

  const started = raw.match(/^tts started(?: \((\d+) frames, (\d+) bytes\))?$/i);
  if (started) {
    return started[1]
      ? t("settings.tts.status.startedWithStats", {
          frames: started[1],
          bytes: started[2],
        })
      : t("settings.tts.status.started");
  }

  const statusKeyByValue: Record<string, string> = {
    idle: "settings.tts.status.idle",
    connecting: "settings.tts.status.connecting",
    "socket open": "settings.tts.status.socketOpen",
    done: "settings.tts.status.completed",
    stopped: "settings.tts.status.stopped",
    "connected but no audio frames": "settings.tts.status.noAudioFrames",
  };
  const key = statusKeyByValue[raw.toLowerCase()];
  return key ? t(key) : raw;
}

export const SettingsTtsDebug: React.FC<SettingsTtsDebugProps> = ({
  active,
  ttsDebugStatus,
  onSend,
  onStop,
}) => {
  const { t } = useI18n();
  const [ttsDebugText, setTtsDebugText] = useState("");
  const defaultTtsDebugText = t("voice.debug.defaultTtsText");
  const statusText = formatTtsDebugStatus(ttsDebugStatus, t);

  useEffect(() => {
    if (!active) return;
    setTtsDebugText((current) =>
      current.trim() ? current : defaultTtsDebugText,
    );
  }, [active, defaultTtsDebugText]);

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
      <p className="settings-hint">{statusText}</p>
    </div>
  );
};
