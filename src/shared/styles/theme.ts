import { readBootAppearance, readThemeModeFromUrl as readUrl, readThemeParam, THEME_STORAGE_KEY, type ThemeMode } from "./appearance/bootstrap";
export { THEME_STORAGE_KEY, readThemeParam };
export type { ThemeMode };

export function normalizeThemeMode(value: unknown): ThemeMode {
  return value === "dark" ? "dark" : "light";
}
export function readThemeModeFromUrl(search?: string): ThemeMode | null {
  return readUrl(search ?? (typeof window !== "undefined" ? window.location?.search : "") ?? "");
}
export function readStoredThemeMode(): ThemeMode | null {
  try { return readThemeParam(globalThis.localStorage?.getItem(THEME_STORAGE_KEY)); } catch { return null; }
}
export function writeStoredThemeMode(themeMode: ThemeMode): void {
  if (readBootAppearance().desktop) return;
  try { globalThis.localStorage?.setItem(THEME_STORAGE_KEY, themeMode); } catch { /* in-memory only */ }
}
export function applyThemeModeToDocument(themeMode: ThemeMode): void {
  if (typeof document !== "undefined") document.documentElement.setAttribute("data-theme", themeMode);
}
// Legacy utility for explicit local preferences; application runtime uses the
// appearance controller, so URL/host projections never persist through state.
export function syncThemeMode(themeMode: ThemeMode): ThemeMode {
  const normalized = normalizeThemeMode(themeMode);
  applyThemeModeToDocument(normalized);
  if (!readThemeModeFromUrl()) writeStoredThemeMode(normalized);
  return normalized;
}
export function resolveInitialThemeMode(search?: string): ThemeMode {
  return readBootAppearance(search).resolvedTheme;
}
