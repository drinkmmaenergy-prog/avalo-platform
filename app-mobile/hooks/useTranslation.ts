import { useMemo } from 'react';
import { useLocale, Locale } from './useLocale';
import enStrings from '../i18n/strings.en.json';
import plStrings from '../i18n/strings.pl.json';

type TranslationStrings = typeof enStrings;
type DeepKeyOf<T> = T extends object
  ? {
      [K in keyof T]: K extends string
        ? T[K] extends object
          ? `${K}.${DeepKeyOf<T[K]>}`
          : K
        : never;
    }[keyof T]
  : never;

export type TranslationKey = DeepKeyOf<TranslationStrings>;

const translations: Record<Locale, TranslationStrings> = {
  en: enStrings,
  pl: plStrings,
};

/**
 * Get a nested value from an object using a dot-notated path
 */
const getNestedValue = (obj: any, path: string): string | undefined => {
  const keys = path.split('.');
  let current = obj;

  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = current[key];
    } else {
      return undefined;
    }
  }

  return typeof current === 'string' ? current : undefined;
};

/**
 * Replace placeholders in a string with values
 * Example: "Hello {{name}}" with {name: "John"} becomes "Hello John"
 */
const interpolate = (text: string, values?: Record<string, string | number>): string => {
  if (!values) return text;

  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = values[key];
    return value !== undefined ? String(value) : match;
  });
};

/**
 * Hook for translating text based on the current locale
 */
export const useTranslation = () => {
  const { locale } = useLocale();

  /**
   * Translate a key to the current locale
   * Supports nested keys using dot notation (e.g., "common.welcome")
   * Supports placeholders (e.g., "{{name}}")
   * Falls back to English if translation not found
   * Falls back to the key itself if neither translation exists
   */
  const t = useMemo(() => {
    return (key: string, values?: Record<string, string | number>): string => {
      // Try current locale first
      let translation = getNestedValue(translations[locale], key);

      // Fallback to English if not found
      if (!translation && locale !== 'en') {
        translation = getNestedValue(translations.en, key);
      }

      // Fallback to key itself if still not found
      if (!translation) {
        console.warn(`Translation missing for key: ${key}`);
        return key;
      }

      // Interpolate values if provided
      return interpolate(translation, values);
    };
  }, [locale]);

  /**
   * Check if a translation key exists
   */
  const hasTranslation = useMemo(() => {
    return (key: string): boolean => {
      const translation = getNestedValue(translations[locale], key);
      return translation !== undefined;
    };
  }, [locale]);

  /**
   * Get all translations for a specific namespace
   * Example: getNamespace("common") returns all common.* translations
   */
  const getNamespace = useMemo(() => {
    return (namespace: string): Record<string, string> => {
      const namespaceObj = getNestedValue(translations[locale], namespace);
      
      if (typeof namespaceObj === 'object' && namespaceObj !== null) {
        return namespaceObj as Record<string, string>;
      }
      
      return {};
    };
  }, [locale]);

  /**
   * Translate with pluralization support
   * Example: tp("items", 1) => "1 item", tp("items", 5) => "5 items"
   */
  const tp = useMemo(() => {
    return (key: string, count: number, values?: Record<string, string | number>): string => {
      const pluralKey = count === 1 ? `${key}.singular` : `${key}.plural`;
      
      // Try to find plural-specific translation
      let translation = getNestedValue(translations[locale], pluralKey);
      
      // Fallback to base key
      if (!translation) {
        translation = getNestedValue(translations[locale], key);
      }
      
      // Fallback to English
      if (!translation && locale !== 'en') {
        translation = getNestedValue(translations.en, pluralKey) || getNestedValue(translations.en, key);
      }
      
      // Fallback to key
      if (!translation) {
        console.warn(`Translation missing for key: ${key}`);
        return key;
      }
      
      // Always include count in values
      const finalValues = { count, ...values };
      return interpolate(translation, finalValues);
    };
  }, [locale]);

  return {
    t,
    tp,
    hasTranslation,
    getNamespace,
    locale,
  };
};

/**
 * Helper function to get translation outside of React components
 * Use this sparingly - prefer the hook when possible
 */
export const translate = (key: string, locale: Locale = 'en', values?: Record<string, string | number>): string => {
  let translation = getNestedValue(translations[locale], key);
  
  if (!translation && locale !== 'en') {
    translation = getNestedValue(translations.en, key);
  }
  
  if (!translation) {
    console.warn(`Translation missing for key: ${key}`);
    return key;
  }
  
  return interpolate(translation, values);
};