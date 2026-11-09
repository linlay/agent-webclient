export interface VoiceShortcut {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

export function defaultVoiceShortcut(): VoiceShortcut {
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  return { code: "Space", ctrlKey: !mac, metaKey: mac, shiftKey: true, altKey: false };
}

export function isVoiceShortcut(value: unknown): value is VoiceShortcut {
  if (!value || typeof value !== "object") return false;
  const key = value as Partial<VoiceShortcut>;
  if (typeof key.code !== "string" || ![key.ctrlKey, key.altKey, key.shiftKey, key.metaKey].every(flag => typeof flag === "boolean")) return false;
  if (/^F(1[3-9]|2[0-4])$/.test(key.code)) return true;
  if (!/^(Key[A-Z]|Digit[0-9]|Space|F([1-9]|1[0-2]))$/.test(key.code) || !(key.ctrlKey || key.altKey || key.metaKey)) return false;
  // Existing app commands and common browser edit/navigation commands stay reserved.
  if ((key.ctrlKey || key.metaKey) && !key.altKey && !key.shiftKey && /^(Key[ACFKLNPQRTVWXZ]|Digit[0-9])$/.test(key.code)) return false;
  if ((key.ctrlKey || key.metaKey) && !key.altKey && key.shiftKey && /^Key[FNPTW]$/.test(key.code)) return false;
  if (key.metaKey && key.shiftKey && !key.altKey && /^Digit[345]$/.test(key.code)) return false;
  return !(key.altKey && key.code === "F4");
}

export function shortcutFromEvent(event: VoiceShortcut): VoiceShortcut {
  const { code, ctrlKey, altKey, shiftKey, metaKey } = event;
  return { code, ctrlKey, altKey, shiftKey, metaKey };
}

export function matchesVoiceShortcut(event: VoiceShortcut, shortcut: VoiceShortcut | null): boolean {
  return Boolean(shortcut && event.code === shortcut.code && event.ctrlKey === shortcut.ctrlKey &&
    event.altKey === shortcut.altKey && event.shiftKey === shortcut.shiftKey && event.metaKey === shortcut.metaKey);
}

export function formatVoiceShortcut(shortcut: VoiceShortcut | null, aria = false): string {
  if (!shortcut) return "";
  return [shortcut.metaKey && (aria ? "Meta" : "⌘"), shortcut.ctrlKey && (aria ? "Control" : "Ctrl"),
    shortcut.altKey && "Alt", shortcut.shiftKey && "Shift", shortcut.code.replace(/^(Key|Digit)/, "")].filter(Boolean).join("+");
}

export function isVoiceShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  if (target.closest("input:not([type='checkbox']):not([type='radio']), textarea, [contenteditable], [role='textbox'], [role='dialog'], .modal, .ant-modal-wrap, .ant-drawer, [data-voice-shortcut-settings]")) return false;
  return !target.closest("select") || Boolean(target.closest("[data-voice-controls]"));
}
