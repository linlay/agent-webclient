import { isEmbedMode } from "@/shared/config/embed";
import { readRuntimeConfigValue } from "@/shared/config/runtimeConfig";

export const APP_UI_BASE = '/';

function parseRuntimeFlag(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return false;
  return value === 'true';
}

export function isDesktopAppMode(): boolean {
  return !isEmbedMode() && parseRuntimeFlag(readRuntimeConfigValue('DESKTOP_APP'));
}

export function isAppMode(
  pathname: string = typeof window !== 'undefined' ? window.location.pathname : '',
): boolean {
  return pathname.startsWith(APP_UI_BASE) && isDesktopAppMode();
}
