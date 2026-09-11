import { theme as antTheme, type ThemeConfig } from "antd";
import type { ThemeMode as ResolvedThemeMode } from "@/shared/styles/appearance/bootstrap";

type CssTokenReader = (name: string) => string;

// Read the resolved CSS palette after the document target has applied a skin.
// Ant's palette algorithms need concrete seed colors, not var(--...) strings.
// No second palette or runtime CSS injection is maintained by this adapter.
export function createAntAppearanceTheme(mode: ResolvedThemeMode, read: CssTokenReader): ThemeConfig {
  const radius = (name: string) => Number.parseFloat(read(name));
  const primary = read("--control-primary-bg");
  const hover = read("--control-hover-bg");
  const active = read("--control-active-bg");
  const border = read("--control-border");
  const ink = read("--ink");
  const inkSoft = read("--ink-soft");
  const inkMuted = read("--ink-muted");
  const input = read("--control-input-bg");
  const popover = read("--control-popover-bg");
  const algorithm = mode === "dark" ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm;
  return {
    // Ant's dark algorithm also shifts its primary seed. Restore the skin's
    // already-resolved primary so native and Ant controls use the same color.
    algorithm: (seed, map) => ({ ...algorithm(seed, map), colorPrimary: primary, colorInfo: primary }),
    token: {
      colorPrimary: primary,
      colorInfo: primary,
      colorPrimaryHover: read("--control-primary-hover"),
      colorPrimaryActive: read("--control-primary-active"),
      colorPrimaryBg: read("--accent-soft"),
      colorPrimaryBorder: read("--accent"),
      colorTextBase: ink,
      colorText: ink,
      colorTextSecondary: inkSoft,
      colorTextTertiary: inkMuted,
      colorTextQuaternary: inkMuted,
      colorTextDisabled: inkMuted,
      colorTextPlaceholder: inkMuted,
      colorTextLightSolid: read("--accent-on"),
      colorBgBase: read("--bg-base"),
      colorBgLayout: read("--bg-base"),
      colorBgMask: read("--modal-mask-bg"),
      controlHeight: 32,
      fontFamily: read("--font-sans"),
      colorBgContainer: input,
      colorBgElevated: popover,
      colorBgContainerDisabled: read("--control-disabled-bg"),
      colorBorder: border,
      colorBorderSecondary: read("--line"),
      colorFillSecondary: active,
      colorFillTertiary: hover,
      controlItemBgHover: hover,
      controlItemBgActive: read("--accent-soft"),
      controlOutline: read("--accent-soft"),
      borderRadius: radius("--control-radius"),
      borderRadiusSM: radius("--control-radius-sm"),
      borderRadiusLG: radius("--control-radius-lg")
    },
    components: {
      Button: {
        defaultColor: inkSoft,
        defaultBg: read("--control-button-bg"),
        defaultBorderColor: border,
        defaultHoverBg: hover,
        defaultHoverColor: ink,
        defaultHoverBorderColor: border,
        defaultActiveBg: active,
        defaultActiveColor: ink,
        defaultActiveBorderColor: border,
        borderColorDisabled: read("--line"),
        primaryColor: read("--accent-on"),
        primaryShadow: "none",
        defaultShadow: "none"
      },
      Input: {
        hoverBorderColor: border,
        activeBorderColor: read("--accent"),
        activeShadow: `0 0 0 2px ${read("--accent-soft")}`
      },
      InputNumber: {
        hoverBorderColor: border,
        activeBorderColor: read("--accent"),
        activeShadow: `0 0 0 2px ${read("--accent-soft")}`
      },
      Select: {
        selectorBg: read("--control-select-bg"),
        optionActiveBg: hover,
        optionSelectedBg: read("--accent-soft"),
        optionSelectedColor: ink
      },
      Segmented: {
        trackBg: input,
        itemColor: inkSoft,
        itemHoverColor: ink,
        itemHoverBg: hover,
        itemActiveBg: active,
        itemSelectedBg: read("--surface-soft"),
        itemSelectedColor: ink
      },
      Modal: {
        borderRadiusLG: radius("--overlay-radius"),
        contentBg: read("--desktop-overlay-panel-bg"),
        headerBg: read("--desktop-overlay-panel-bg"),
        titleColor: ink
      },
      Dropdown: { colorBgElevated: read("--sidebar-operation-menu-bg"), controlItemBgHover: hover, controlItemBgActive: read("--nav-selected-bg") },
      Drawer: { colorBgElevated: read("--desktop-overlay-panel-bg") },
      Tooltip: { colorBgSpotlight: popover, colorTextLightSolid: ink }
    }
  };
}

export function readDocumentAntAppearanceTheme(mode: ResolvedThemeMode): ThemeConfig {
  const styles = window.getComputedStyle(document.documentElement);
  return createAntAppearanceTheme(mode, (name) => styles.getPropertyValue(name).trim());
}
