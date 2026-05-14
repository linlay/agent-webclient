import { readRuntimeConfigValue } from "@/shared/config/runtimeConfig";

export const APP_UI_BASE = '/';

function parseRuntimeFlag(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return false;
  return value.trim().toLowerCase() === 'true';
}

export function isDesktopAppMode(): boolean {
  return parseRuntimeFlag(readRuntimeConfigValue('DESKTOP_APP'));
}

export function isAppMode(
  pathname: string = typeof window !== 'undefined' ? window.location.pathname : '',
  search: string = typeof window !== 'undefined' ? window.location.search : '',
): boolean {
  if (!pathname.startsWith(APP_UI_BASE)) {
    return false;
  }
  try {
    const params = new URLSearchParams(search || '');
    return isDesktopAppMode() || params.has('desktopAuthContext');
  } catch {
    return false;
  }
}
