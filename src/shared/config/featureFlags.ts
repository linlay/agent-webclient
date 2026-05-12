import { readRuntimeConfigValue } from "@/shared/config/runtimeConfig";

export function parseFeatureFlag(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  return value.trim().toLowerCase() === "true";
}

export function isDebugPanelEnabled(): boolean {
  return parseFeatureFlag(readRuntimeConfigValue("APP_DEBUG_PANEL_ENABLED"));
}

export function isSettingsMenuEnabled(): boolean {
  return parseFeatureFlag(readRuntimeConfigValue("APP_SETTINGS_MENU_ENABLED"));
}
