import React from "react";
import { useAppContext } from "@/app/state/AppContext";
import { UiButton } from "@/shared/ui/UiButton";
import { useI18n } from "@/shared/i18n";

export function VoiceControls() {
  const { state, dispatch } = useAppContext();
  const voice = state.voiceChat;
  const { t } = useI18n();
  const changeDisabled = voice.awaiting || !["listening", "idle", "error"].includes(voice.status);
  const restart = (patch: { mode?: "auto" | "manual"; selectedVoice?: string }) => {
    dispatch({ type: "PATCH_VOICE_CHAT", patch });
    window.dispatchEvent(new CustomEvent("agent:voice-start", { detail: patch }));
  };
  return <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
    <select aria-label={t("voice.controls.mode")} value={voice.mode} disabled={changeDisabled}
      onChange={event => restart({ mode: event.target.value === "manual" ? "manual" : "auto" })}>
      <option value="auto">{t("voice.controls.auto")}</option>
      <option value="manual">{t("voice.controls.manual")}</option>
    </select>
    <select aria-label={t("voice.controls.voice")} value={voice.selectedVoice} disabled={changeDisabled}
      onChange={event => restart({ selectedVoice: event.target.value })}>
      {voice.capabilities?.voices.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select>
    {voice.mode === "manual" && voice.status === "listening" && <UiButton size="sm" variant="secondary"
      onClick={() => window.dispatchEvent(new CustomEvent("agent:voice-listen-stop"))}>{t("voice.controls.finish")}</UiButton>}
    {voice.sessionActive && <UiButton size="sm" variant="secondary"
      onClick={() => window.dispatchEvent(new CustomEvent("agent:voice-abort"))}>{t("voice.controls.abort")}</UiButton>}
    {voice.status === "error" && voice.sessionActive && <UiButton size="sm" variant="secondary"
      onClick={() => window.dispatchEvent(new CustomEvent("agent:voice-listen"))}>{t("voice.controls.resume")}</UiButton>}
    {voice.status === "error" && !voice.sessionActive && <UiButton size="sm" variant="secondary"
      onClick={() => window.dispatchEvent(new CustomEvent("agent:voice-start"))}>{t("voice.controls.reconnect")}</UiButton>}
    <UiButton size="sm" variant="ghost" onClick={() => dispatch({ type: "SET_INPUT_MODE", mode: "text" })}>{t("voice.controls.hangup")}</UiButton>
    {voice.awaiting && <span role="status">{t("voice.controls.awaiting")}</span>}
  </div>;
}
