export type ThemeMode = "light" | "dark";

export const THEME_STORAGE_KEY = "agent-webclient.themeMode";

export function normalizeThemeMode(value: unknown): ThemeMode {
	return value === "dark" ? "dark" : "light";
}

export function readStoredThemeMode(): ThemeMode | null {
	if (typeof localStorage === "undefined") {
		return null;
	}
	try {
		const stored = localStorage.getItem(THEME_STORAGE_KEY);
		if (!stored) {
			return null;
		}
		return normalizeThemeMode(stored);
	} catch (_error) {
		return null;
	}
}

export function writeStoredThemeMode(themeMode: ThemeMode): void {
	if (typeof localStorage === "undefined") {
		return;
	}
	try {
		localStorage.setItem(THEME_STORAGE_KEY, themeMode);
	} catch (_error) {
		// Ignore storage write failures and keep the in-memory theme state.
	}
}

export function applyThemeModeToDocument(themeMode: ThemeMode): void {
	if (typeof document === "undefined") {
		return;
	}
	document.documentElement.setAttribute("data-theme", themeMode);
}

export function resolveInitialThemeMode(): ThemeMode {
	const storedThemeMode = readStoredThemeMode();
	if (storedThemeMode) {
		return storedThemeMode;
	}

	if (typeof document !== "undefined") {
		const attrThemeMode = document.documentElement.getAttribute("data-theme");
		if (attrThemeMode) {
			return normalizeThemeMode(attrThemeMode);
		}
	}

	return "light";
}
