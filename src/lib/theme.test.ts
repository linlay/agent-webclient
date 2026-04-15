import {
	normalizeThemeMode,
	resolveInitialThemeMode,
	THEME_STORAGE_KEY,
} from "./theme";

describe("theme helpers", () => {
	it("normalizes unknown theme values to light", () => {
		expect(normalizeThemeMode("dark")).toBe("dark");
		expect(normalizeThemeMode("system")).toBe("light");
		expect(normalizeThemeMode(undefined)).toBe("light");
	});

	it("prefers the stored theme over the html attribute", () => {
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
