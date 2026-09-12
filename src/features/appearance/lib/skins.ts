import goldLight from "../assets/gold-light.svg";
import goldDark from "../assets/gold-dark.svg";
import blueLight from "../assets/blue-light.svg";
import blueDark from "../assets/blue-dark.svg";
import purpleLight from "../assets/purple-light.svg";
import purpleDark from "../assets/purple-dark.svg";
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

const GOLD_DESKTOP_SKIN: DesktopSkinDefinition = Object.freeze({
  id: "gold",
  tokens: Object.freeze({
    light: Object.freeze({
      "--bg-base": "#F5F2EB",
      "--surface": "rgba(249, 247, 241, 0.35)",
      "--surface-strong": "rgba(252, 251, 247, 0.94)",
      "--surface-soft": "rgba(241, 237, 227, 0.9)",
      "--surface-sidebar": "rgba(237, 232, 221, 0.72)",
      "--ink": "#3F3620",
      "--ink-soft": "#6F5F39",
      "--ink-muted": "#937E4C",
      "--line": "rgba(100, 85, 51, 0.13)",
      "--line-strong": "rgba(100, 85, 51, 0.24)",
      "--accent-on": "#FFFFFF",
      "--accent": "#946400",
      "--accent-rgb": "148, 100, 0",
      "--accent-strong": "#5F4C20",
      "--accent-soft": "#EEE9DE",
      "--control-button-bg": "rgba(252, 250, 244, 0.85)",
      "--control-input-bg": "rgba(253, 251, 247, 0.9)",
      "--control-hover-bg": "rgba(103, 88, 52, 0.09)",
      "--control-active-bg": "rgba(103, 88, 52, 0.16)",
      "--control-disabled-bg": "rgba(117, 100, 60, 0.07)",
      "--control-primary-active": "#4D3D19",
      "--control-tab-strip-bg": "#ECE7DA",
      "--control-tab-active-bg": "#F8F6F0",
      "--control-tab-hover-bg": "rgba(248, 246, 240, 0.6)",
      "--nav-selected-bg": "rgba(109, 93, 56, 0.14)",
      "--sidebar-operation-menu-bg": "rgba(250, 247, 240, 0.96)",
      "--sidebar-operation-menu-border": "rgba(100, 85, 51, 0.19)",
      "--desktop-overlay-panel-bg": "#F8F6F0",
      "--shell-sidebar-bg": "rgba(242, 238, 229, 0.42)",
      "--shell-content-bg": "rgba(250, 248, 242, 0.88)",
      "--shell-titlebar-bg": "rgba(242, 238, 229, 0.84)",
      "--shell-background-tint": "rgba(250, 248, 242, 0.06)"
    }),
    dark: Object.freeze({
      "--bg-base": "#2A2314",
      "--surface": "rgba(61, 52, 31, 0.35)",
      "--surface-strong": "rgba(51, 43, 26, 0.96)",
      "--surface-soft": "rgba(73, 63, 38, 0.92)",
      "--surface-sidebar": "rgba(42, 35, 20, 0.72)",
      "--ink": "#F0EBE1",
      "--ink-soft": "#D7CCB2",
      "--ink-muted": "#BFAD82",
      "--line": "rgba(205, 190, 157, 0.12)",
      "--line-strong": "rgba(205, 190, 157, 0.25)",
      "--accent": "#E8BD62",
      "--accent-rgb": "232, 189, 98",
      "--accent-strong": "#D7C7A1",
      "--accent-soft": "rgba(199, 179, 131, 0.16)",
      "--accent-on": "#2F2713",
      "--control-button-bg": "rgba(123, 105, 63, 0.2)",
      "--control-input-bg": "#3B331F",
      "--control-hover-bg": "rgba(195, 179, 140, 0.13)",
      "--control-active-bg": "rgba(195, 179, 140, 0.22)",
      "--control-disabled-bg": "rgba(169, 144, 87, 0.09)",
      "--control-primary-active": "#B39D6A",
      "--control-tab-strip-bg": "#362E1C",
      "--control-tab-active-bg": "#463C24",
      "--control-tab-hover-bg": "rgba(195, 179, 140, 0.12)",
      "--nav-selected-bg": "rgba(195, 179, 140, 0.18)",
      "--sidebar-operation-menu-bg": "rgba(48, 41, 24, 0.97)",
      "--sidebar-operation-menu-border": "rgba(205, 190, 157, 0.22)",
      "--desktop-overlay-panel-bg": "#342D1B",
      "--shell-sidebar-bg": "rgba(38, 32, 17, 0.4)",
      "--shell-content-bg": "rgba(39, 33, 20, 0.9)",
      "--shell-titlebar-bg": "rgba(39, 33, 20, 0.88)",
      "--shell-background-tint": "rgba(26, 21, 9, 0.12)"
})
  }),
  backgrounds: Object.freeze({
    light: Object.freeze({ imageUrl: goldLight, position: "center" }),
    dark: Object.freeze({ imageUrl: goldDark, position: "center" })
  })
});

const BLUE_DESKTOP_SKIN: DesktopSkinDefinition = Object.freeze({
  id: "blue",
  tokens: Object.freeze({
    light: Object.freeze({
      "--bg-base": "#EBEFF5",
      "--surface": "rgba(241, 244, 249, 0.35)",
      "--surface-strong": "rgba(247, 249, 252, 0.94)",
      "--surface-soft": "rgba(227, 233, 241, 0.9)",
      "--surface-sidebar": "rgba(221, 228, 237, 0.72)",
      "--ink": "#202D3F",
      "--ink-soft": "#39506F",
      "--ink-muted": "#4C6B93",
      "--line": "rgba(51, 72, 100, 0.13)",
      "--line-strong": "rgba(51, 72, 100, 0.24)",
      "--accent-on": "#FFFFFF",
      "--accent": "#2868B8",
      "--accent-rgb": "40, 104, 184",
      "--accent-strong": "#203B5F",
      "--accent-soft": "#DEE5EE",
      "--control-button-bg": "rgba(244, 247, 252, 0.85)",
      "--control-input-bg": "rgba(247, 250, 253, 0.9)",
      "--control-hover-bg": "rgba(52, 74, 103, 0.09)",
      "--control-active-bg": "rgba(52, 74, 103, 0.16)",
      "--control-disabled-bg": "rgba(60, 85, 117, 0.07)",
      "--control-primary-active": "#19304D",
      "--control-tab-strip-bg": "#DAE2EC",
      "--control-tab-active-bg": "#F0F3F8",
      "--control-tab-hover-bg": "rgba(240, 243, 248, 0.6)",
      "--nav-selected-bg": "rgba(56, 79, 109, 0.14)",
      "--sidebar-operation-menu-bg": "rgba(240, 244, 250, 0.96)",
      "--sidebar-operation-menu-border": "rgba(51, 72, 100, 0.19)",
      "--desktop-overlay-panel-bg": "#F0F3F8",
      "--shell-sidebar-bg": "rgba(229, 235, 242, 0.42)",
      "--shell-content-bg": "rgba(242, 245, 250, 0.88)",
      "--shell-titlebar-bg": "rgba(229, 235, 242, 0.84)",
      "--shell-background-tint": "rgba(242, 245, 250, 0.06)"
    }),
    dark: Object.freeze({
      "--bg-base": "#141E2A",
      "--surface": "rgba(31, 44, 61, 0.35)",
      "--surface-strong": "rgba(26, 37, 51, 0.96)",
      "--surface-soft": "rgba(38, 53, 73, 0.92)",
      "--surface-sidebar": "rgba(20, 30, 42, 0.72)",
      "--ink": "#E1E8F0",
      "--ink-soft": "#B2C2D7",
      "--ink-muted": "#829CBF",
      "--line": "rgba(157, 178, 205, 0.12)",
      "--line-strong": "rgba(157, 178, 205, 0.25)",
      "--accent": "#89B8EE",
      "--accent-rgb": "137, 184, 238",
      "--accent-strong": "#A1B8D7",
      "--accent-soft": "rgba(131, 160, 199, 0.16)",
      "--accent-on": "#131F2F",
      "--control-button-bg": "rgba(63, 89, 123, 0.2)",
      "--control-input-bg": "#1F2B3B",
      "--control-hover-bg": "rgba(140, 164, 195, 0.13)",
      "--control-active-bg": "rgba(140, 164, 195, 0.22)",
      "--control-disabled-bg": "rgba(87, 123, 169, 0.09)",
      "--control-primary-active": "#6A8AB3",
      "--control-tab-strip-bg": "#1C2736",
      "--control-tab-active-bg": "#243346",
      "--control-tab-hover-bg": "rgba(140, 164, 195, 0.12)",
      "--nav-selected-bg": "rgba(140, 164, 195, 0.18)",
      "--sidebar-operation-menu-bg": "rgba(24, 34, 48, 0.97)",
      "--sidebar-operation-menu-border": "rgba(157, 178, 205, 0.22)",
      "--desktop-overlay-panel-bg": "#1B2634",
      "--shell-sidebar-bg": "rgba(17, 26, 38, 0.4)",
      "--shell-content-bg": "rgba(20, 28, 39, 0.9)",
      "--shell-titlebar-bg": "rgba(20, 28, 39, 0.88)",
      "--shell-background-tint": "rgba(9, 16, 26, 0.12)"
})
  }),
  backgrounds: Object.freeze({
    light: Object.freeze({ imageUrl: blueLight, position: "center" }),
    dark: Object.freeze({ imageUrl: blueDark, position: "center" })
  })
});

const PURPLE_DESKTOP_SKIN: DesktopSkinDefinition = Object.freeze({
  id: "purple",
  tokens: Object.freeze({
    light: Object.freeze({
      "--bg-base": "#F0EBF5",
      "--surface": "rgba(245, 241, 249, 0.35)",
      "--surface-strong": "rgba(250, 247, 252, 0.94)",
      "--surface-soft": "rgba(234, 227, 241, 0.9)",
      "--surface-sidebar": "rgba(230, 221, 237, 0.72)",
      "--ink": "#31203F",
      "--ink-soft": "#56396F",
      "--ink-muted": "#724C93",
      "--line": "rgba(77, 51, 100, 0.13)",
      "--line-strong": "rgba(77, 51, 100, 0.24)",
      "--accent-on": "#FFFFFF",
      "--accent": "#8051AD",
      "--accent-rgb": "128, 81, 173",
      "--accent-strong": "#42205F",
      "--accent-soft": "#E7DEEE",
      "--control-button-bg": "rgba(248, 244, 252, 0.85)",
      "--control-input-bg": "rgba(250, 247, 253, 0.9)",
      "--control-hover-bg": "rgba(79, 52, 103, 0.09)",
      "--control-active-bg": "rgba(79, 52, 103, 0.16)",
      "--control-disabled-bg": "rgba(90, 60, 117, 0.07)",
      "--control-primary-active": "#35194D",
      "--control-tab-strip-bg": "#E4DAEC",
      "--control-tab-active-bg": "#F4F0F8",
      "--control-tab-hover-bg": "rgba(244, 240, 248, 0.6)",
      "--nav-selected-bg": "rgba(84, 56, 109, 0.14)",
      "--sidebar-operation-menu-bg": "rgba(245, 240, 250, 0.96)",
      "--sidebar-operation-menu-border": "rgba(77, 51, 100, 0.19)",
      "--desktop-overlay-panel-bg": "#F4F0F8",
      "--shell-sidebar-bg": "rgba(236, 229, 242, 0.42)",
      "--shell-content-bg": "rgba(246, 242, 250, 0.88)",
      "--shell-titlebar-bg": "rgba(236, 229, 242, 0.84)",
      "--shell-background-tint": "rgba(246, 242, 250, 0.06)"
    }),
    dark: Object.freeze({
      "--bg-base": "#20142A",
      "--surface": "rgba(47, 31, 61, 0.35)",
      "--surface-strong": "rgba(39, 26, 51, 0.96)",
      "--surface-soft": "rgba(57, 38, 73, 0.92)",
      "--surface-sidebar": "rgba(32, 20, 42, 0.72)",
      "--ink": "#E9E1F0",
      "--ink-soft": "#C6B2D7",
      "--ink-muted": "#A382BF",
      "--line": "rgba(183, 157, 205, 0.12)",
      "--line-strong": "rgba(183, 157, 205, 0.25)",
      "--accent": "#C2A0E6",
      "--accent-rgb": "194, 160, 230",
      "--accent-strong": "#BEA1D7",
      "--accent-soft": "rgba(167, 131, 199, 0.16)",
      "--accent-on": "#22132F",
      "--control-button-bg": "rgba(95, 63, 123, 0.2)",
      "--control-input-bg": "#2E1F3B",
      "--control-hover-bg": "rgba(169, 140, 195, 0.13)",
      "--control-active-bg": "rgba(169, 140, 195, 0.22)",
      "--control-disabled-bg": "rgba(131, 87, 169, 0.09)",
      "--control-primary-active": "#916AB3",
      "--control-tab-strip-bg": "#2A1C36",
      "--control-tab-active-bg": "#362446",
      "--control-tab-hover-bg": "rgba(169, 140, 195, 0.12)",
      "--nav-selected-bg": "rgba(169, 140, 195, 0.18)",
      "--sidebar-operation-menu-bg": "rgba(37, 24, 48, 0.97)",
      "--sidebar-operation-menu-border": "rgba(183, 157, 205, 0.22)",
      "--desktop-overlay-panel-bg": "#281B34",
      "--shell-sidebar-bg": "rgba(28, 17, 38, 0.4)",
      "--shell-content-bg": "rgba(30, 20, 39, 0.9)",
      "--shell-titlebar-bg": "rgba(30, 20, 39, 0.88)",
      "--shell-background-tint": "rgba(18, 9, 26, 0.12)"
})
  }),
  backgrounds: Object.freeze({
    light: Object.freeze({ imageUrl: purpleLight, position: "center" }),
    dark: Object.freeze({ imageUrl: purpleDark, position: "center" })
  })
});

// Standalone bundled skins; Desktop appearance is supplied by the host.
export const DESKTOP_SKINS = Object.freeze([DEFAULT_DESKTOP_SKIN, GOLD_DESKTOP_SKIN, BLUE_DESKTOP_SKIN, MIST_DESKTOP_SKIN, PURPLE_DESKTOP_SKIN]);

export function findDesktopSkin(id: string): DesktopSkinDefinition | undefined {
  return DESKTOP_SKINS.find((skin) => skin.id === id);
}
