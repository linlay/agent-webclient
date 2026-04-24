import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  I18nLocaleMap,
  I18nTerms,
  Locale,
  TranslateParams,
} from "@/shared/i18n/types";
import {
  buildI18nRuntimeConfig,
  configureI18nRuntime,
  resolveI18nTerms,
  translateMessage,
} from "@/shared/i18n/runtime";
import { I18N_LOCALE_STORAGE_KEY } from "@/shared/i18n/types";

export interface I18nProviderProps {
  children: React.ReactNode;
  locale?: Locale;
  fallbackLocale?: Locale;
  locales?: Partial<I18nLocaleMap>;
  terms?: Partial<I18nTerms>;
  persistLocale?: boolean;
}

export interface I18nContextValue {
  locale: Locale;
  fallbackLocale: Locale;
  terms: I18nTerms;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: TranslateParams) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export const I18nProvider: React.FC<I18nProviderProps> = ({
  children,
  locale,
  fallbackLocale,
  locales,
  terms,
  persistLocale = true,
}) => {
  const initialConfig = useMemo(
    () =>
      buildI18nRuntimeConfig({
        locale,
        fallbackLocale,
        locales,
        terms,
      }),
    [fallbackLocale, locale, locales, terms],
  );
  const [currentLocale, setCurrentLocale] = useState<Locale>(initialConfig.locale);

  const value = useMemo<I18nContextValue>(() => {
    const nextTerms = resolveI18nTerms(currentLocale, terms);
    const config = configureI18nRuntime({
      locale: currentLocale,
      fallbackLocale: initialConfig.fallbackLocale,
      locales: initialConfig.locales,
      terms: nextTerms,
    });

    return {
      locale: config.locale,
      fallbackLocale: config.fallbackLocale,
      terms: config.terms,
      setLocale: setCurrentLocale,
      t: (key, params) => translateMessage(key, params, config),
    };
  }, [currentLocale, initialConfig.fallbackLocale, initialConfig.locales, terms]);

  useEffect(() => {
    configureI18nRuntime({
      locale: value.locale,
      fallbackLocale: value.fallbackLocale,
      locales: initialConfig.locales,
      terms: value.terms,
    });
  }, [initialConfig.locales, value.fallbackLocale, value.locale, value.terms]);

  useEffect(() => {
    if (!persistLocale || typeof window === "undefined") {
      return;
    }
    window.localStorage?.setItem(I18N_LOCALE_STORAGE_KEY, value.locale);
  }, [persistLocale, value.locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (context) {
    return context;
  }

  const config = configureI18nRuntime(buildI18nRuntimeConfig());
  return {
    locale: config.locale,
    fallbackLocale: config.fallbackLocale,
    terms: config.terms,
    setLocale: (nextLocale) => {
      configureI18nRuntime({
        locale: nextLocale,
        terms: resolveI18nTerms(nextLocale),
      });
    },
    t: (key, params) => translateMessage(key, params, config),
  };
}
