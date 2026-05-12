function readFeatureFlagValue(key: string): unknown {
  return (globalThis as Record<string, unknown>)[key];
}

export function parseFeatureFlag(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  return value.trim().toLowerCase() === "true";
}

export function isDebugPanelEnabled(): boolean {
  return parseFeatureFlag(readFeatureFlagValue("__APP_DEBUG_PANEL_ENABLED__"));
}

export function isSettingsMenuEnabled(): boolean {
  return parseFeatureFlag(readFeatureFlagValue("__APP_SETTINGS_MENU_ENABLED__"));
}
