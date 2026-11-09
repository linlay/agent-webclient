import { resolveStorageIdentity } from "@/shared/data/auth/storageIdentity";
import { getBackendMode } from "@/shared/config/backendMode";
import { readJwtPreferenceIdentity } from "@/shared/data/auth/appAuth";
import type { VoiceInterruptionMode } from "./voiceState";
import { defaultVoiceShortcut, isVoiceShortcut, type VoiceShortcut } from "./voiceShortcut";

export function voicePreferenceScope(accessToken: string): string {
  // Reuse Desktop's backend/account context and gateway identity. JWT refresh
  // changes credentials, but should not reset this account's preference.
  const identity = getBackendMode() === "platform" && !window.__AGENT_APP_AUTH_CONTEXT
    ? readJwtPreferenceIdentity(accessToken) : null;
  return JSON.stringify([window.location.origin, identity ? ["platform", identity] : resolveStorageIdentity(accessToken)]);
}

function key(scope: string): string { return `agent-webclient.voice-interruption.v1:${scope}`; }

export function readVoiceMode(scope: string): VoiceInterruptionMode {
  try { return window.localStorage.getItem(key(scope)) === "duplex" ? "duplex" : "button"; }
  catch { return "button"; }
}

export function saveVoiceMode(scope: string, mode: VoiceInterruptionMode): void {
  try { window.localStorage.setItem(key(scope), mode); }
  catch { /* The current session still uses the selected mode. */ }
}

export function readVoiceShortcut(scope: string): { shortcut: VoiceShortcut | null; shortcutError: string } {
  try {
    const raw = window.localStorage.getItem(`agent-webclient.voice-shortcut.v1:${scope}`);
    const shortcut: unknown = raw === null ? defaultVoiceShortcut() : JSON.parse(raw);
    if (shortcut === null || isVoiceShortcut(shortcut)) return { shortcut, shortcutError: "" };
  } catch { /* Invalid or inaccessible preferences must not silently enable another key. */ }
  return { shortcut: null, shortcutError: "voice.shortcut.invalidStorage" };
}

export function saveVoiceShortcut(scope: string, shortcut: VoiceShortcut | null): boolean {
  if (shortcut !== null && !isVoiceShortcut(shortcut)) return false;
  try {
    window.localStorage.setItem(`agent-webclient.voice-shortcut.v1:${scope}`, JSON.stringify(shortcut));
    return true;
  } catch { return false; }
}
