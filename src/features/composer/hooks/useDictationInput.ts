import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useI18n } from "@/shared/i18n";
import { ensureAccessToken } from "@/shared/data";
import { getDictationCapabilities } from "@/shared/data/api/requests/dictation";
import { isDictationEnabled } from "@/shared/config/featureFlags";
import { isDesktopAppMode } from "@/shared/utils/routing";
import { DictationSession, type DictationStatus } from "../lib/dictationSession";

export function useDictationInput(input: {
  scopeKey: string;
  inputValue: string;
  setInputValue: (value: string) => void;
  setSlashDismissed: (dismissed: boolean) => void;
  updateMentionSuggestions: (value: string) => void;
}) {
  const { t } = useI18n();
  const latest = useRef(input); latest.current = input;
  const sessionRef = useRef<DictationSession | null>(null);
  const generation = useRef(0);
  const finalDraftRef = useRef("");
  const [available, setAvailable] = useState(false);
  const [status, setStatus] = useState<DictationStatus>("ready");
  const enabled = isDictationEnabled();
  const supported = typeof AudioContext !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);

  const cancelDictation = useCallback(() => {
    generation.current++;
    const session = sessionRef.current; sessionRef.current = null;
    session?.cancel(); setStatus("ready");
  }, []);

  useEffect(() => {
    if (!enabled || !supported) { setAvailable(false); return; }
    const controller = new AbortController();
    void getDictationCapabilities(controller.signal).then(c => {
      if (!controller.signal.aborted) setAvailable(c.enabled && c.version === 1 && c.websocketPath === "/api/dictation/ws" && c.maxRecordingSeconds === 60 && c.input.codec === "pcm_s16le" && c.input.sampleRate === 16000 && c.input.channels === 1 && c.input.frameMs === 20);
    }).catch(() => { if (!controller.signal.aborted) setAvailable(false); });
    return () => controller.abort();
  }, [enabled, supported]);

  useLayoutEffect(() => { cancelDictation(); return cancelDictation; }, [input.scopeKey, cancelDictation]);
  useLayoutEffect(() => {
    // History, paste helpers and draft restoration also replace editable text.
    if (sessionRef.current && input.inputValue !== finalDraftRef.current) cancelDictation();
  }, [input.inputValue, cancelDictation]);
  useEffect(() => {
    const hide = () => { if (document.hidden) cancelDictation(); };
    window.addEventListener("pagehide", cancelDictation);
    window.addEventListener("agent:dictation-cancel", cancelDictation);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("pagehide", cancelDictation);
      window.removeEventListener("agent:dictation-cancel", cancelDictation);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [cancelDictation]);

  const toggleDictation = useCallback(() => {
    if (sessionRef.current) { void sessionRef.current.finish(); return; }
    if (!enabled || !supported || !available) return;
    const current = latest.current, base = current.inputValue, scope = current.scopeKey;
    const id = ++generation.current;
    const valid = () => generation.current === id && latest.current.scopeKey === scope;
    const session = new DictationSession({
      onText: text => {
        if (!valid()) return;
        const next = base + text;
        finalDraftRef.current = next;
        latest.current.setInputValue(next); latest.current.setSlashDismissed(false); latest.current.updateMentionSuggestions(next);
      },
      onStatus: next => { if (valid()) setStatus(next); },
    });
    finalDraftRef.current = base;
    sessionRef.current = session; setStatus("connecting");
    // No awaited cleanup or token request before AudioContext/getUserMedia.
    void session.prepare().then(() => !valid() || isDesktopAppMode() ? "" : ensureAccessToken()).then(token => {
      if (valid()) session.connect(token);
    }).catch(() => { if (valid()) session.fail("microphone_unavailable"); });
    void session.result.then(() => { if (sessionRef.current === session) sessionRef.current = null; });
  }, [enabled, supported, available]);

  // Null preserves the existing synchronous send path when no dictation is active.
  const finishDictation = useCallback((): Promise<string | undefined> | null => {
    const session = sessionRef.current;
    if (!session) return null;
    const id = generation.current, scope = latest.current.scopeKey;

    return session.finish().then(result => {
      if (generation.current !== id || latest.current.scopeKey !== scope || !("text" in result)) return undefined;
      return finalDraftRef.current;
    });
  }, []);

  return {
    dictationEnabled: enabled,
    dictationSupported: supported && available,
    dictationActive: status === "connecting" || status === "listening" || status === "finishing",
    dictationState: status,
    dictationStatus: t(!supported || !available ? "composer.dictation.unavailable" : `composer.dictation.${status}`),
    toggleDictation, cancelDictation, finishDictation,
  };
}
