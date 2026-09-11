// Self-contained: Webpack embeds this exact module before the application
// bundle. React imports the same resolver; do not add runtime imports here.
export type ThemeMode = "light" | "dark";
export type ThemePreference = ThemeMode | "system";
export const THEME_STORAGE_KEY = "agent-webclient.themeMode";
export const APPEARANCE_STORAGE_KEY = "agent-webclient.appearance.v1";

export function readThemeParam(value: unknown): ThemeMode | null {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  return text === "light" || text === "dark" ? text : null;
}

export function readThemeModeFromUrl(search = ""): ThemeMode | null {
  const params = new URLSearchParams(search);
  return readThemeParam(params.get("theme")) || readThemeParam(params.get("hostTheme"));
}

export function resolveBootAppearance(input: {
  search: string; desktop: boolean; storedTheme: unknown; systemDark: boolean;
}) {
  const preference: ThemePreference = input.storedTheme === "system"
    ? "system" : readThemeParam(input.storedTheme) || "system";
  const routeTheme = readThemeModeFromUrl(input.search);
  // A guest never uses the Standalone preference, including on an old host.
  const resolvedTheme = routeTheme || (!input.desktop && preference !== "system"
    ? preference : input.systemDark ? "dark" : "light");
  return { preference, resolvedTheme, desktop: input.desktop };
}

export function readBootAppearance(search?: string) {
  let storedTheme: unknown;
  try { storedTheme = globalThis.localStorage?.getItem(THEME_STORAGE_KEY); } catch { /* blocked storage */ }
  const config = (globalThis as typeof globalThis & {
    __AGENT_WEBCLIENT_RUNTIME_CONFIG__?: Record<string, unknown>;
  }).__AGENT_WEBCLIENT_RUNTIME_CONFIG__;
  return resolveBootAppearance({
    search: search ?? (typeof window !== "undefined" ? window.location?.search : "") ?? "",
    desktop: config?.DESKTOP_APP === true || config?.DESKTOP_APP === "true",
    storedTheme,
    systemDark: globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches === true,
  });
}

export function applyBootAppearance() {
  const initial = readBootAppearance();
  document.documentElement.dataset.theme = initial.resolvedTheme;
  document.documentElement.dataset.pageBackground = initial.desktop ? "host-fallback" : "standalone";
  // Transparency is only enabled after a validated live host capability.
  return initial;
}
