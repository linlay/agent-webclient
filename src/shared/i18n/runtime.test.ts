import {
	buildI18nRuntimeConfig,
	configureI18nRuntime,
	getI18nRuntimeConfig,
	hasTranslation,
	I18N_LOCALE_STORAGE_KEY,
	readUrlLocale,
	resolveInitialLocale,
	tOrFallback,
} from "@/shared/i18n";

describe("i18n runtime locale resolution", () => {
	const originalWindow = globalThis.window;
	const originalNavigator = globalThis.navigator;
	const originalRuntimeConfig = getI18nRuntimeConfig();

	afterEach(() => {
		configureI18nRuntime(originalRuntimeConfig);

    if (originalWindow) {
      (globalThis as Record<string, unknown>).window = originalWindow;
    } else {
      delete (globalThis as Record<string, unknown>).window;
    }

    if (originalNavigator) {
      (globalThis as Record<string, unknown>).navigator = originalNavigator;
    } else {
      delete (globalThis as Record<string, unknown>).navigator;
    }
	});

	it("uses translated dynamic labels and safely falls back for unknown values", () => {
		const config = buildI18nRuntimeConfig({ locale: "en-US" });
		configureI18nRuntime(config);

		expect(hasTranslation("topNav.status.idle")).toBe(true);
		expect(tOrFallback("topNav.status.idle", "idle")).toBe("idle");
		expect(tOrFallback("composer.reasoning.future_mode", "Future mode")).toBe(
			"Future mode",
		);
	});

  it("uses the lang query and stores it as the next default", () => {
    const setItem = jest.fn();
    (globalThis as Record<string, unknown>).window = {
      location: {
        search: "?lang=en-US",
      },
      localStorage: {
        getItem: () => "zh-CN",
        setItem,
      },
    };
    (globalThis as Record<string, unknown>).navigator = {
      language: "zh-CN",
    };

    expect(readUrlLocale("?lang=en-US")).toBe("en-US");
    expect(resolveInitialLocale("zh-CN")).toBe("en-US");
    expect(setItem).toHaveBeenCalledWith(I18N_LOCALE_STORAGE_KEY, "en-US");
  });

  it("falls back to stored locale, navigator language, then fallback locale", () => {
    (globalThis as Record<string, unknown>).window = {
      location: {
        search: "",
      },
      localStorage: {
        getItem: (key: string) =>
          key === I18N_LOCALE_STORAGE_KEY ? "en-US" : null,
      },
    };
    (globalThis as Record<string, unknown>).navigator = {
      language: "zh-CN",
    };

    expect(resolveInitialLocale("zh-CN")).toBe("en-US");

    (globalThis as Record<string, unknown>).window = {
      location: {
        search: "",
      },
      localStorage: {
        getItem: () => "",
      },
    };

    expect(resolveInitialLocale("en-US")).toBe("zh-CN");

    (globalThis as Record<string, unknown>).navigator = {
      language: "",
    };

    expect(resolveInitialLocale("en-US")).toBe("en-US");
  });
});
