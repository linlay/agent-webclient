import {
	normalizeThemeMode,
	resolveInitialThemeMode,
	THEME_STORAGE_KEY,
} from "@/shared/styles/theme";

describe("theme helpers", () => {
	const originalWindow = globalThis.window;

	afterEach(() => {
		if (originalWindow) {
			Object.defineProperty(globalThis, "window", {
				configurable: true,
				value: originalWindow,
			});
		} else {
			delete (globalThis as Record<string, unknown>).window;
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
					search: "?desktopApp=1&hostTheme=dark",
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

	it("falls back to the stored theme when no host theme is provided", () => {
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: {
				location: {
					search: "?desktopApp=1",
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
