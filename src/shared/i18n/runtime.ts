import { enUSMessages } from "@/shared/i18n/locales/en-US";
import { zhCNMessages } from "@/shared/i18n/locales/zh-CN";
import type {
  I18nLocaleMap,
  I18nRuntimeConfig,
  I18nTerms,
  Locale,
  TranslateParams,
} from "@/shared/i18n/types";
import {
  DEFAULT_LOCALE,
  I18N_LOCALE_STORAGE_KEY,
} from "@/shared/i18n/types";

const DEFAULT_LOCALES: I18nLocaleMap = {
  "en-US": enUSMessages,
  "zh-CN": zhCNMessages,
};

const DEFAULT_TERMS: Record<Locale, I18nTerms> = {
  "en-US": {
    agentLabel: "agent",
    agentPluralLabel: "agents",
    teamLabel: "team",
    teamPluralLabel: "teams",
    conversationLabel: "conversation",
  },
  "zh-CN": {
    agentLabel: "智能体",
    agentPluralLabel: "智能体",
    teamLabel: "团队",
    teamPluralLabel: "团队",
    conversationLabel: "会话",
  },
};

let runtimeConfig: I18nRuntimeConfig = {
  locale: DEFAULT_LOCALE,
  fallbackLocale: DEFAULT_LOCALE,
  locales: DEFAULT_LOCALES,
  terms: DEFAULT_TERMS[DEFAULT_LOCALE],
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object";
}

export function normalizeLocale(
  value: unknown,
  locales: Partial<I18nLocaleMap> = DEFAULT_LOCALES,
): Locale {
  const normalized = String(value || "").trim();
  const available = Object.keys(locales) as Locale[];
  if (available.includes(normalized as Locale)) {
    return normalized as Locale;
  }

  const normalizedLower = normalized.toLowerCase();
  const prefixMatch = available.find((locale) =>
    locale.toLowerCase().startsWith(normalizedLower.split("-")[0] || ""),
  );
  return prefixMatch || DEFAULT_LOCALE;
}

export function resolveInitialLocale(
  fallbackLocale: Locale = DEFAULT_LOCALE,
  locales: Partial<I18nLocaleMap> = DEFAULT_LOCALES,
): Locale {
  if (typeof window !== "undefined") {
    const queryLocale = new URLSearchParams(window.location.search).get("lang");
    if (queryLocale) {
      return normalizeLocale(queryLocale, locales);
    }

    const storedLocale = window.localStorage?.getItem(I18N_LOCALE_STORAGE_KEY);
    if (storedLocale) {
      return normalizeLocale(storedLocale, locales);
    }
  }

  if (typeof navigator !== "undefined" && navigator.language) {
    return normalizeLocale(navigator.language, locales);
  }

  return normalizeLocale(fallbackLocale, locales);
}

export function getDefaultTermsForLocale(locale: Locale): I18nTerms {
  return { ...DEFAULT_TERMS[locale] };
}

function interpolateMessage(
  template: string,
  params: TranslateParams,
): string {
  return template.replace(/\{([^}]+)\}/g, (_, rawKey: string) => {
    const key = String(rawKey || "").trim();
    const value = params[key];
    return value == null ? "" : String(value);
  });
}

function resolveMessage(
  key: string,
  config: I18nRuntimeConfig,
): string {
  return (
    config.locales[config.locale]?.[key] ||
    config.locales[config.fallbackLocale]?.[key] ||
    key
  );
}

export function configureI18nRuntime(
  updates: Partial<I18nRuntimeConfig>,
): I18nRuntimeConfig {
  runtimeConfig = {
    ...runtimeConfig,
    ...updates,
  };
  return runtimeConfig;
}

export function getI18nRuntimeConfig(): I18nRuntimeConfig {
  return runtimeConfig;
}

export function resolveI18nTerms(
  locale: Locale,
  terms?: Partial<I18nTerms>,
): I18nTerms {
  return {
    ...getDefaultTermsForLocale(locale),
    ...(terms || {}),
  };
}

export function translateMessage(
  key: string,
  params: TranslateParams = {},
  config: I18nRuntimeConfig = runtimeConfig,
): string {
  const template = resolveMessage(key, config);
  return interpolateMessage(template, {
    ...config.terms,
    ...params,
  });
}

export function t(key: string, params?: TranslateParams): string {
  return translateMessage(key, params, runtimeConfig);
}

export function buildI18nRuntimeConfig(input: {
  locale?: Locale;
  fallbackLocale?: Locale;
  locales?: Partial<I18nLocaleMap>;
  terms?: Partial<I18nTerms>;
} = {}): I18nRuntimeConfig {
  const locales = {
    ...DEFAULT_LOCALES,
    ...(input.locales || {}),
  } as I18nLocaleMap;
  const fallbackLocale = normalizeLocale(
    input.fallbackLocale || DEFAULT_LOCALE,
    locales,
  );
  const locale = normalizeLocale(
    input.locale || resolveInitialLocale(fallbackLocale, locales),
    locales,
  );

  return {
    locale,
    fallbackLocale,
    locales,
    terms: resolveI18nTerms(locale, input.terms),
  };
}

export function isHanTextAllowedFile(pathname: string, allowlist: string[]): boolean {
  return allowlist.includes(pathname);
}

export function isLocaleMap(value: unknown): value is Partial<I18nLocaleMap> {
  return isObjectRecord(value);
}

export { DEFAULT_LOCALES };
