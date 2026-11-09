/** @jest-environment jsdom */
import { defaultVoiceShortcut, formatVoiceShortcut, isVoiceShortcut, matchesVoiceShortcut } from "./voiceShortcut";

const chord = (code: string, modifiers = {}) => ({ code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...modifiers });

it.each(["MacIntel", "Win32"])("uses one platform default for matching and accessible labels: %s", platform => {
  const previous = navigator.platform;
  Object.defineProperty(navigator, "platform", { configurable: true, value: platform });
  try {
    const shortcut = defaultVoiceShortcut();
    expect(isVoiceShortcut(shortcut)).toBe(true);
    expect(shortcut.metaKey).toBe(platform === "MacIntel");
    expect(formatVoiceShortcut(shortcut, true)).toBe(platform === "MacIntel" ? "Meta+Shift+Space" : "Control+Shift+Space");
    expect(matchesVoiceShortcut({ ...shortcut, altKey: true }, shortcut)).toBe(false);
  } finally { Object.defineProperty(navigator, "platform", { configurable: true, value: previous }); }
});

it.each([chord("F13"), chord("F24"), chord("KeyA", { ctrlKey: true, altKey: true }), chord("Space", { ctrlKey: true, shiftKey: true })])("accepts macro keys and deliberate combinations: %j", shortcut => {
  expect(isVoiceShortcut(shortcut)).toBe(true);
});

it.each([null, {}, chord("KeyA"), chord("Space"), chord("Escape", { ctrlKey: true }), chord("Unidentified"), chord("KeyK", { metaKey: true }), chord("KeyW", { ctrlKey: true }), chord("KeyN", { metaKey: true, shiftKey: true })])("rejects malformed, text, and reserved bindings: %j", shortcut => {
  expect(isVoiceShortcut(shortcut)).toBe(false);
});
