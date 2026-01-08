/**
 * PACK 295 - Globalization & Localization
 * i18n Engine and Translation System
 */

import i18next, { InitOptions, TFunction } from "i18next";
import { LocaleCode, normalizeLocale, DEFAULT_LOCALE } from "./locales";

/**
 * Translation namespace structure
 */
export type TranslationNamespace = 
  | "common"
  | "nav"
  | "auth"
  | "profile"
  | "chat"
  | "calendar"
  | "events"
  | "wallet"
  | "subscriptions"
  | "notifications"
  | "safety"
  | "legal"
  | "errors";

/**
 * i18n configuration options
 */
export interface I18nConfig {
  locale: LocaleCode;
  fallbackLocale: LocaleCode;
  translations: Record<string, Record<string, string>>;
  onMissingTranslation?: (key: string) => void;
}

/**
 * Translation key interpolation parameters
 */
export type TranslationParams = Record<string, string | number>;

/**
 * Initialize i18n system
 */
export async function initI18n(config: I18nConfig): Promise<void> {
  const options: InitOptions = {
    lng: config.locale,
    fallbackLng: config.fallbackLocale,
    defaultNS: "common",
    ns: [
      "common",
      "nav",
      "auth",
      "profile",
      "chat",
      "calendar",
      "events",
      "wallet",
      "subscriptions",
      "notifications",
      "safety",
      "legal",
      "errors",
    ],
    resources: {
      [config.locale]: config.translations,
    },
    interpolation: {
      escapeValue: false, // React already escapes
    },
    react: {
      useSuspense: false,
    },
    missingKeyHandler: (lngs, ns, key) => {
      if (config.onMissingTranslation) {
        config.onMissingTranslation(`${ns}.${key}`);
      }
    },
  };
  
  await i18next.init(options);
}

/**
 * Change current language
 */
export async function changeLanguage(locale: LocaleCode): Promise<void> {
  await i18next.changeLanguage(locale);
}

/**
 * Get current language
 */
export function getCurrentLanguage(): LocaleCode {
  return normalizeLocale(i18next.language || DEFAULT_LOCALE);
}

/**
 * Load additional translations dynamically
 */
export async function loadTranslations(
  locale: LocaleCode,
  namespace: TranslationNamespace,
  translations: Record<string, string>
): Promise<void> {
  i18next.addResourceBundle(locale, namespace, translations, true, true);
}

/**
 * Get translation function
 */
export function getTranslationFunction(): TFunction {
  return i18next.t;
}

/**
 * Translation helper with type safety
 */
export function t(key: string, params?: TranslationParams): string {
  return i18next.t(key, params);
}

/**
 * Check if a translation key exists
 */
export function hasTranslation(key: string): boolean {
  return i18next.exists(key);
}

/**
 * Get all loaded languages
 */
export function getLoadedLanguages(): string[] {
  return i18next.languages;
}

/**
 * Translation loader for remote or async sources
 */
export interface TranslationLoader {
  load(locale: LocaleCode, namespace: TranslationNamespace): Promise<Record<string, string>>;
}

/**
 * Default translation loader (loads from bundled resources)
 */
export class BundledTranslationLoader implements TranslationLoader {
  constructor(private translationMap: Map<string, Record<string, string>>) {}
  
  async load(locale: LocaleCode, namespace: TranslationNamespace): Promise<Record<string, string>> {
    const key = `${locale}:${namespace}`;
    return this.translationMap.get(key) || {};
  }
}

/**
 * Remote translation loader (loads from API/CDN)
 */
export class RemoteTranslationLoader implements TranslationLoader {
  constructor(private baseUrl: string) {}
  
  async load(locale: LocaleCode, namespace: TranslationNamespace): Promise<Record<string, string>> {
    try {
      const response = await fetch(`${this.baseUrl}/${locale}/${namespace}.json`);
      if (!response.ok) {
        throw new Error(`Failed to load translations: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`Failed to load remote translations for ${locale}:${namespace}`, error);
      return {};
    }
  }
}

/**
 * Preload translations for multiple namespaces
 */
export async function preloadTranslations(
  locale: LocaleCode,
  namespaces: TranslationNamespace[],
  loader: TranslationLoader
): Promise<void> {
  const promises = namespaces.map(async (ns) => {
    const translations = await loader.load(locale, ns);
    await loadTranslations(locale, ns, translations);
  });
  
  await Promise.all(promises);
}