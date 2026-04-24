export type Locale = "en-US" | "zh-CN";

export interface I18nTerms {
  agentLabel: string;
  agentPluralLabel: string;
  teamLabel: string;
  teamPluralLabel: string;
  conversationLabel: string;
}

export type I18nMessages = Record<string, string>;

export type I18nLocaleMap = Record<Locale, I18nMessages>;

export interface TranslateParams extends Record<string, unknown> {}

export interface I18nRuntimeConfig {
  locale: Locale;
  fallbackLocale: Locale;
  locales: I18nLocaleMap;
  terms: I18nTerms;
}

export const DEFAULT_LOCALE: Locale = "en-US";
export const I18N_LOCALE_STORAGE_KEY = "agent-webclient.locale";
