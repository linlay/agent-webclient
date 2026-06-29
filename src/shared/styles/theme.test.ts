import {
	normalizeThemeMode,
	readThemeModeFromUrl,
	resolveInitialThemeMode,
	syncThemeMode,
	THEME_STORAGE_KEY,
} from "@/shared/styles/theme";

describe("theme helpers", () => {
	const originalWindow = globalThis.window;
	const originalDocument = globalThis.document;
	const originalLocalStorage = globalThis.localStorage;

	afterEach(() => {
		if (originalWindow) {
			Object.defineProperty(globalThis, "window", {
				configurable: true,
				value: originalWindow,
			});
		} else {
			delete (globalThis as Record<string, unknown>).window;
		}
		if (originalDocument) {
			Object.defineProperty(globalThis, "document", {
				configurable: true,
				value: originalDocument,
			});
		} else {
			delete (globalThis as Record<string, unknown>).document;
		}
		if (originalLocalStorage) {
			Object.defineProperty(globalThis, "localStorage", {
				configurable: true,
				value: originalLocalStorage,
			});
		} else {
			delete (globalThis as Record<string, unknown>).localStorage;
		}
	});

	it("normalizes unknown theme values to light", () => {
		expect(normalizeThemeMode("dark")).toBe("dark");
		expect(normalizeThemeMode("system")).toBe("light");
		expect(normalizeThemeMode(undefined)).toBe("light");
	});

	it("prefers the host theme query over the stored theme and html attribute", () => {
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: {
				location: {
					search: "?hostTheme=dark",
				},
			},
		});
		Object.defineProperty(globalThis, "localStorage", {
			configurable: true,
			value: {
				getItem: (key: string) =>
					key === THEME_STORAGE_KEY ? "light" : null,
			},
		});
		Object.defineProperty(globalThis, "document", {
			configurable: true,
			value: {
				documentElement: {
					getAttribute: () => "light",
				},
			},
		});

		expect(resolveInitialThemeMode()).toBe("dark");
	});

	it("prefers the route theme query over host theme, stored theme, and html attribute", () => {
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: {
				location: {
					search: "?theme=light&hostTheme=dark",
				},
			},
		});
		Object.defineProperty(globalThis, "localStorage", {
			configurable: true,
			value: {
				getItem: (key: string) =>
					key === THEME_STORAGE_KEY ? "dark" : null,
			},
		});
		Object.defineProperty(globalThis, "document", {
			configurable: true,
			value: {
				documentElement: {
					getAttribute: () => "dark",
				},
			},
		});

		expect(resolveInitialThemeMode()).toBe("light");
	});

	it("reads the route theme query before host theme from URL params", () => {
		expect(readThemeModeFromUrl("?theme=dark&hostTheme=light")).toBe("dark");
		expect(readThemeModeFromUrl("?theme=system&hostTheme=dark")).toBe("dark");
	});

	it("syncs the resolved URL theme to storage and the document", () => {
		const stored = new Map<string, string>([[THEME_STORAGE_KEY, "light"]]);
		const documentElement = {
			theme: "light",
			getAttribute(key: string) {
				return key === "data-theme" ? this.theme : null;
			},
			setAttribute(key: string, value: string) {
				if (key === "data-theme") {
					this.theme = value;
				}
			},
		};
		Object.defineProperty(globalThis, "localStorage", {
			configurable: true,
			value: {
				getItem: (key: string) => stored.get(key) || null,
				setItem: (key: string, value: string) => {
					stored.set(key, value);
				},
			},
		});
		Object.defineProperty(globalThis, "document", {
			configurable: true,
			value: { documentElement },
		});

		const themeMode = syncThemeMode(
			resolveInitialThemeMode("?theme=dark&hostTheme=light"),
		);

		expect(themeMode).toBe("dark");
		expect(stored.get(THEME_STORAGE_KEY)).toBe("dark");
		expect(documentElement.theme).toBe("dark");
	});

	it("falls back to the stored theme when no host theme is provided", () => {
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: {
				location: {
					search: "",
				},
			},
		});
		Object.defineProperty(globalThis, "localStorage", {
			configurable: true,
			value: {
				getItem: (key: string) =>
					key === THEME_STORAGE_KEY ? "dark" : null,
			},
		});
		Object.defineProperty(globalThis, "document", {
			configurable: true,
			value: {
				documentElement: {
					getAttribute: () => "light",
				},
			},
		});

		expect(resolveInitialThemeMode()).toBe("dark");
	});
});
