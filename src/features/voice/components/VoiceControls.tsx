import React from "react";
import { useAppContext } from "@/app/state/AppContext";
import { UiButton } from "@/shared/ui/UiButton";
import styles from "./VoiceEffects.module.css";
import { useI18n } from "@/shared/i18n";
import { Popover } from "antd";
import { VoiceShortcutSettings } from "./VoiceShortcutSettings";
import { formatVoiceShortcut } from "../lib/voiceShortcut";

export function VoiceControls() {
  const { state, dispatch } = useAppContext();
  const voice = state.voiceChat;
  const { t } = useI18n();
  const shortcut = formatVoiceShortcut(state.voiceShortcut);
  const changeDisabled = voice.awaiting || !["listening", "idle", "error"].includes(voice.status);
  const restart = (patch: { selectedVoice?: string }) => {
    dispatch({ type: "PATCH_VOICE_CHAT", patch });
    window.dispatchEvent(new CustomEvent("agent:voice-start", { detail: patch }));
  };
  return (
    <>
      {voice.awaiting && <div className={styles.notice} role="status">{t(voice.canAnswerQuestion ? "voice.controls.question" : "voice.controls.awaiting")}</div>}
      {voice.supplementAccepted && !voice.awaiting && <div className={styles.notice} role="status">{t("voice.controls.supplementAccepted")}</div>}
      {voice.duplexStatus === "loading" && <div className={styles.notice} role="status">{t("voice.controls.duplexLoading")}</div>}
      {voice.duplexStatus === "error" && <div className={styles.notice} role="alert">{t("voice.controls.duplexFailed")}</div>}
      <div className={styles.toolbar} data-voice-controls>
        <div className={styles.settings}>
          <select aria-label={t("voice.controls.interruptionMode")} value={voice.interruptionMode} disabled={voice.status === "connecting"}
            onChange={event => window.dispatchEvent(new CustomEvent("agent:voice-interruption-mode", { detail: event.target.value }))}>
            <option value="button">{t("voice.controls.buttonMode")}</option>
            <option value="duplex">{t("voice.controls.duplexMode")}</option>
          </select>
          {Boolean(voice.capabilities?.voices.length) && (
            <select aria-label={t("voice.controls.voice")} value={voice.selectedVoice} disabled={changeDisabled}
              onChange={event => restart({ selectedVoice: event.target.value })}>
              {voice.capabilities?.voices.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          )}
          <Popover trigger="click" content={<VoiceShortcutSettings />}>
            <UiButton size="sm" variant="ghost">{t("voice.shortcut.title")}</UiButton>
          </Popover>
        </div>
        <div className={styles.actions}>
          {voice.status === "listening" && (
            <UiButton size="sm" variant="primary"
              onClick={() => window.dispatchEvent(new CustomEvent("agent:voice-listen-stop"))}>{t("voice.controls.finish")}</UiButton>
          )}
          {voice.sessionActive && <UiButton size="sm" variant="primary" disabled={(voice.awaiting && !voice.canAnswerQuestion) || voice.status === "listening"}
            aria-keyshortcuts={formatVoiceShortcut(state.voiceShortcut, true) || undefined}
            onClick={() => window.dispatchEvent(new CustomEvent("agent:voice-listen"))}>{t("voice.controls.speak")}{shortcut && ` (${shortcut})`}</UiButton>}
          {voice.sessionActive && (
            <UiButton size="sm" variant="secondary"
              onClick={() => window.dispatchEvent(new CustomEvent("agent:voice-abort"))}>{t("voice.controls.abort")}</UiButton>
          )}
          {voice.status === "error" && (
            <UiButton size="sm" variant="secondary"
              onClick={() => window.dispatchEvent(new CustomEvent(voice.sessionActive ? "agent:voice-listen" : "agent:voice-start"))}>
              {t(voice.sessionActive ? "voice.controls.resume" : "voice.controls.reconnect")}
            </UiButton>
          )}
          <UiButton size="sm" variant="ghost" onClick={() => dispatch({ type: "SET_INPUT_MODE", mode: "text" })}>
            {t("voice.controls.hangup")}
          </UiButton>
        </div>
      </div>
    </>
  );
}
