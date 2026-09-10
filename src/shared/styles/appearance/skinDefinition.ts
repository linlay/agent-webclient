export type ResolvedThemeMode = "light" | "dark";

// Skin overrides are visual properties only; layout and guest surfaces retain
// their own contracts. Extend this list as shell controls adopt shared tokens.
export type DesktopSkinToken =
  | "--bg-base"
  | "--surface"
  | "--surface-strong"
  | "--surface-soft"
  | "--surface-sidebar"
  | "--ink"
  | "--ink-soft"
  | "--ink-muted"
  | "--line"
  | "--line-strong"
  | "--accent"
  | "--accent-strong"
  | "--accent-soft"
  | "--accent-rgb"
  | "--accent-on"
  | "--accent-glow"
  | "--control-radius"
  | "--control-radius-sm"
  | "--control-radius-lg"
  | "--control-button-bg"
  | "--control-select-bg"
  | "--control-input-bg"
  | "--control-border"
  | "--control-hover-bg"
  | "--control-active-bg"
  | "--control-disabled-bg"
  | "--control-disabled-opacity"
  | "--control-icon-color"
  | "--control-icon-hover-color"
  | "--control-primary-bg"
  | "--control-primary-hover"
  | "--control-primary-active"
  | "--control-primary-shadow"
  | "--control-popover-bg"
  | "--control-tab-strip-bg"
  | "--control-tab-active-bg"
  | "--control-tab-hover-bg"
  | "--nav-hover-bg"
  | "--nav-selected-bg"
  | "--nav-selected-text"
  | "--nav-accent-selected-bg"
  | "--overlay-radius"
  | "--desktop-overlay-panel-bg"
  | "--sidebar-operation-menu-bg"
  | "--sidebar-operation-menu-border"
  | "--sidebar-operation-menu-shadow"
  | "--modal-mask-bg"
  | "--panel-shadow"
  | "--panel-shadow-hover"
  | "--shell-sidebar-bg"
  | "--shell-content-bg"
  | "--shell-titlebar-bg"
  | "--shell-background-tint";

export type DesktopSkinBackground = Readonly<{
  imageUrl: string;
  position: string;
}>;

export type DesktopSkinDefinition = Readonly<{
  id: string;
  name?: string;
  version?: string;
  author?: string;
  previewImageUrl?: string;
  tokens: Readonly<Record<ResolvedThemeMode, Readonly<Partial<Record<DesktopSkinToken, string>>>>>;
  backgrounds?: Readonly<Partial<Record<ResolvedThemeMode, DesktopSkinBackground>>>;
}>;
