import { readRuntimeConfigValue } from "@/shared/config/runtimeConfig";

export function parseFeatureFlag(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  return value.trim().toLowerCase() === "true";
}

export function isDebugPanelEnabled(): boolean {
  return parseFeatureFlag(readRuntimeConfigValue("DEBUG_PANEL_ENABLED"));
}

export function isSettingsMenuEnabled(): boolean {
  return parseFeatureFlag(readRuntimeConfigValue("SETTINGS_MENU_ENABLED"));
}

export function isQuickActionsEnabled(): boolean {
  return parseFeatureFlag(readRuntimeConfigValue("QUICK_ACTIONS_ENABLED"));
}
