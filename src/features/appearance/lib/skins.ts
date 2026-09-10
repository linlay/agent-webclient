import mistLight from "../assets/mist-light.svg";
import mistDark from "../assets/mist-dark.svg";
import type { DesktopSkinDefinition, DesktopSkinToken } from "@/shared/styles/appearance/skinDefinition";
const DEFAULT_DESKTOP_SKIN: DesktopSkinDefinition = { id: "default", tokens: { light: {}, dark: {} } };

type SkinTokens = Readonly<Partial<Record<DesktopSkinToken, string>>>;

const light: SkinTokens = Object.freeze({
  "--bg-base": "#EDF3ED",
  "--surface": "rgba(244, 249, 241, 0.35)",
  "--surface-strong": "rgba(249, 252, 247, 0.94)",
  "--surface-soft": "rgba(229, 239, 229, 0.9)",
  "--surface-sidebar": "rgba(222, 236, 224, 0.72)",
  "--ink": "#233C33",
  "--ink-soft": "#486055",
  "--ink-muted": "#657A6E",
  "--line": "rgba(58, 93, 72, 0.13)",
  "--line-strong": "rgba(58, 93, 72, 0.24)",
  "--accent": "#287653",
  "--accent-rgb": "40, 118, 83",
  "--accent-strong": "#205F43",
  "--accent-soft": "#DEEEE1",
  "--control-button-bg": "rgba(246, 252, 244, 0.85)",
  "--control-input-bg": "rgba(249, 253, 247, 0.9)",
  "--control-hover-bg": "rgba(52, 103, 72, 0.09)",
  "--control-active-bg": "rgba(52, 103, 72, 0.16)",
  "--control-disabled-bg": "rgba(72, 105, 80, 0.07)",
  "--control-primary-active": "#194D35",
  "--control-tab-strip-bg": "#DDE9DE",
  "--control-tab-active-bg": "#F3F8F0",
  "--control-tab-hover-bg": "rgba(243, 248, 240, 0.6)",
  "--nav-selected-bg": "rgba(57, 108, 77, 0.14)",
  "--sidebar-operation-menu-bg": "rgba(244, 250, 240, 0.96)",
  "--sidebar-operation-menu-border": "rgba(58, 93, 72, 0.19)",
  "--desktop-overlay-panel-bg": "#F3F8F0",
  "--shell-sidebar-bg": "rgba(231, 241, 230, 0.42)",
  "--shell-content-bg": "rgba(246, 250, 242, 0.88)",
  "--shell-titlebar-bg": "rgba(231, 241, 230, 0.84)",
  "--shell-background-tint": "rgba(246, 250, 242, 0.06)"
});

const dark: SkinTokens = Object.freeze({
  "--bg-base": "#142A22",
  "--surface": "rgba(33, 59, 46, 0.35)",
  "--surface-strong": "rgba(28, 49, 39, 0.96)",
  "--surface-soft": "rgba(44, 67, 53, 0.92)",
  "--surface-sidebar": "rgba(20, 42, 32, 0.72)",
  "--ink": "#E3EEE4",
  "--ink-soft": "#BBCEBE",
  "--ink-muted": "#94AD99",
  "--line": "rgba(163, 199, 172, 0.12)",
  "--line-strong": "rgba(163, 199, 172, 0.25)",
  "--accent": "#83C79A",
  "--accent-rgb": "131, 199, 154",
  "--accent-strong": "#A1D7B0",
  "--accent-soft": "rgba(131, 199, 154, 0.16)",
  "--accent-on": "#132F20",
  "--control-button-bg": "rgba(76, 110, 84, 0.2)",
  "--control-input-bg": "#203A2B",
  "--control-hover-bg": "rgba(147, 188, 154, 0.13)",
  "--control-active-bg": "rgba(147, 188, 154, 0.22)",
  "--control-disabled-bg": "rgba(109, 147, 116, 0.09)",
  "--control-primary-active": "#6EAF83",
  "--control-tab-strip-bg": "#1D352A",
  "--control-tab-active-bg": "#284233",
  "--control-tab-hover-bg": "rgba(147, 188, 154, 0.12)",
  "--nav-selected-bg": "rgba(147, 188, 154, 0.18)",
  "--sidebar-operation-menu-bg": "rgba(25, 47, 34, 0.97)",
  "--sidebar-operation-menu-border": "rgba(163, 199, 172, 0.22)",
  "--desktop-overlay-panel-bg": "#1C3326",
  "--shell-sidebar-bg": "rgba(17, 38, 28, 0.4)",
  "--shell-content-bg": "rgba(20, 39, 29, 0.9)",
  "--shell-titlebar-bg": "rgba(20, 39, 29, 0.88)",
  "--shell-background-tint": "rgba(9, 26, 20, 0.12)"
});

const MIST_DESKTOP_SKIN: DesktopSkinDefinition = Object.freeze({
  id: "mist",
  tokens: Object.freeze({ light, dark }),
  backgrounds: Object.freeze({
    light: Object.freeze({ imageUrl: mistLight, position: "center" }),
    dark: Object.freeze({ imageUrl: mistDark, position: "center" })
  })
});

// Trusted bundled defaults mirror Desktop. Standalone installed packages are
// resolved separately from the validated browser asset store.
export const DESKTOP_SKINS = Object.freeze([DEFAULT_DESKTOP_SKIN, MIST_DESKTOP_SKIN]);

export function findDesktopSkin(id: string): DesktopSkinDefinition | undefined {
  return DESKTOP_SKINS.find((skin) => skin.id === id);
}
