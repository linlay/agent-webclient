export type ThemeMode = "light" | "dark";

export const THEME_STORAGE_KEY = "agent-webclient.themeMode";

export function normalizeThemeMode(value: unknown): ThemeMode {
	return value === "dark" ? "dark" : "light";
}

export function readThemeParam(value: unknown): ThemeMode | null {
	const normalized = String(value || "").trim().toLowerCase();
	if (normalized === "dark" || normalized === "light") {
		return normalized;
	}
	return null;
}

export function readThemeModeFromUrl(search?: string): ThemeMode | null {
	try {
		const params = new URLSearchParams(
			search ?? (typeof window !== "undefined" ? window.location?.search || "" : ""),
		);
		const hostTheme = params.get("hostTheme");
		return readThemeParam(params.get("theme")) || (hostTheme ? normalizeThemeMode(hostTheme) : null);
	} catch (_error) {
		return null;
	}
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
		if (localStorage.getItem(THEME_STORAGE_KEY) === themeMode) {
			return;
		}
		localStorage.setItem(THEME_STORAGE_KEY, themeMode);
	} catch (_error) {
		// Ignore storage write failures and keep the in-memory theme state.
	}
}

export function applyThemeModeToDocument(themeMode: ThemeMode): void {
	if (typeof document === "undefined") {
		return;
	}
	const root = document.documentElement;
	if (typeof root.setAttribute !== "function") {
		return;
	}
	if (
		typeof root.getAttribute === "function" &&
		root.getAttribute("data-theme") === themeMode
	) {
		return;
	}
	root.setAttribute("data-theme", themeMode);
}

export function syncThemeMode(themeMode: ThemeMode): ThemeMode {
	const normalizedThemeMode = normalizeThemeMode(themeMode);
	applyThemeModeToDocument(normalizedThemeMode);
	writeStoredThemeMode(normalizedThemeMode);
	return normalizedThemeMode;
}

export function resolveInitialThemeMode(search?: string): ThemeMode {
	const urlThemeMode = readThemeModeFromUrl(search);
	if (urlThemeMode) {
		return urlThemeMode;
	}

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
