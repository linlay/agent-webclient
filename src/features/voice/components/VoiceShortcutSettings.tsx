import React, { useEffect, useRef, useState } from "react";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import { useI18n } from "@/shared/i18n";
import { UiButton } from "@/shared/ui/UiButton";
import { defaultVoiceShortcut, formatVoiceShortcut, isVoiceShortcut, matchesVoiceShortcut, shortcutFromEvent, type VoiceShortcut } from "../lib/voiceShortcut";
import { saveVoiceShortcut, voicePreferenceScope } from "../lib/voicePreferences";
import styles from "./VoiceEffects.module.css";

export function VoiceShortcutSettings() {
  const state = useAppState(), dispatch = useAppDispatch();
  const { t } = useI18n();
  const scope = voicePreferenceScope(state.accessToken);
  const [phase, setPhase] = useState<"record" | "test" | null>(null);
  const [draft, setDraft] = useState<VoiceShortcut>();
  const [feedback, setFeedback] = useState("");
  const capture = useRef<HTMLDivElement>(null);
  useEffect(() => { setDraft(undefined); setPhase(null); setFeedback(""); }, [scope, state.voiceShortcut]);
  const save = (shortcut: VoiceShortcut | null) => {
    setPhase(null); setDraft(undefined); setFeedback("");
    const saved = saveVoiceShortcut(scope, shortcut);
    dispatch({ type: "SET_VOICE_SHORTCUT", shortcut, error: saved ? "" : "voice.shortcut.sessionOnly" });
  };
  const begin = (next: "record" | "test") => {
    if (next === "record") setDraft(undefined);
    setPhase(next); setFeedback(t("voice.shortcut.waiting")); capture.current?.focus();
  };
  return (
    <div className={styles.shortcutSettings} data-voice-shortcut-settings
      onBlurCapture={event => {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setPhase(null);
      }}
      onKeyDownCapture={event => {
        if (!phase) return;
        event.preventDefault(); event.stopPropagation();
        if (event.key === "Escape") { setPhase(null); setFeedback(""); return; }
        if (event.repeat || event.nativeEvent.isComposing || /^(Control|Shift|Alt|Meta)(Left|Right)?$/.test(event.code)) return;
        const shortcut = shortcutFromEvent(event);
        if (phase === "test") {
          setFeedback(t(matchesVoiceShortcut(shortcut, state.voiceShortcut) ? "voice.shortcut.matched" : "voice.shortcut.unmatched", { shortcut: formatVoiceShortcut(shortcut) }));
        } else if (isVoiceShortcut(shortcut)) {
          setDraft(shortcut); setPhase(null); setFeedback("");
        } else setFeedback(t("voice.shortcut.invalid"));
      }}>
      <strong>{t("voice.shortcut.title")}</strong>
      <div ref={capture} tabIndex={0} role="textbox" aria-readonly="true" aria-label={t("voice.shortcut.capture")} className={styles.shortcutCapture}>
        {draft ? formatVoiceShortcut(draft) : formatVoiceShortcut(state.voiceShortcut) || t("voice.shortcut.disabled")}
      </div>
      <div className={styles.settings}>
        <UiButton size="sm" onClick={() => begin("record")}>{t("voice.shortcut.record")}</UiButton>
        <UiButton size="sm" disabled={!draft} onClick={() => draft && save(draft)}>{t("voice.shortcut.save")}</UiButton>
        <UiButton size="sm" onClick={() => begin("test")}>{t("voice.shortcut.test")}</UiButton>
        <UiButton size="sm" onClick={() => save(null)}>{t("voice.shortcut.disable")}</UiButton>
        <UiButton size="sm" onClick={() => save(defaultVoiceShortcut())}>{t("voice.shortcut.reset")}</UiButton>
      </div>
      <p className={styles.notice}>{t("voice.shortcut.hint")}</p>
      <div role="status">{feedback}</div>
      {state.voiceShortcutError && <div role="alert">{t(state.voiceShortcutError)}</div>}
    </div>
  );
}
