/**
 * next-intl Request Configuration
 *
 * Provides message loading for the current locale.
 * Falls back to English if the locale's messages don't exist.
 *
 * Integration:
 * - Import getRequestConfig and use it in next-intl's plugin, OR
 * - Use the getMessages() helper directly in server components.
 */

import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type SupportedLocale } from './config';

/**
 * Load messages for a given locale.
 * Falls back to English for any locale that doesn't have a dedicated JSON file.
 */
export async function getMessages(locale: string): Promise<Record<string, unknown>> {
  const validLocale = SUPPORTED_LOCALES.includes(locale as SupportedLocale) ? locale : DEFAULT_LOCALE;

  try {
    // Dynamic import — only the requested locale's file is loaded
    const messages = await import(`./messages/${validLocale}.json`);
    return messages.default ?? messages;
  } catch {
    // Fallback to English if locale file doesn't exist yet
    const fallback = await import('./messages/en.json');
    return fallback.default ?? fallback;
  }
}

/**
 * Detect the user's preferred locale from the Accept-Language header or cookie.
 * Returns a valid SupportedLocale.
 */
export function detectLocale(acceptLanguageHeader: string | null, cookieLocale?: string): SupportedLocale {
  // 1. Cookie takes priority (user explicitly chose)
  if (cookieLocale && SUPPORTED_LOCALES.includes(cookieLocale as SupportedLocale)) {
    return cookieLocale as SupportedLocale;
  }

  // 2. Parse Accept-Language header
  if (acceptLanguageHeader) {
    const preferred = acceptLanguageHeader
      .split(',')
      .map((part) => {
        const [lang] = part.trim().split(';');
        return lang.split('-')[0].toLowerCase();
      })
      .find((lang) => SUPPORTED_LOCALES.includes(lang as SupportedLocale));

    if (preferred) {
      return preferred as SupportedLocale;
    }
  }

  // 3. Default
  return DEFAULT_LOCALE;
}

