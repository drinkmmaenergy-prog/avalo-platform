/**
 * i18n Configuration — 42-language scaffold
 *
 * Uses next-intl for locale routing and message loading.
 * Default locale: 'en'.
 *
 * STRUCTURE:
 * - src/i18n/config.ts          — this file (locale list, default locale)
 * - src/i18n/messages/en.json   — English messages (scaffolded)
 * - src/i18n/request.ts         — next-intl request config
 * - src/components/LanguageSwitcher.tsx — UI component
 *
 * To add a new language:
 * 1. Add the locale code to SUPPORTED_LOCALES below.
 * 2. Create src/i18n/messages/{locale}.json (copy en.json as template).
 * 3. No code changes required — routing picks it up automatically.
 */

/** All 42 supported locale codes. Only 'en' has messages initially. */
export const SUPPORTED_LOCALES = [
  'en', 'pl', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'sv', 'da',
  'no', 'fi', 'cs', 'sk', 'hu', 'ro', 'bg', 'hr', 'sl', 'el',
  'tr', 'ar', 'he', 'hi', 'ja', 'ko', 'zh', 'th', 'vi', 'id',
  'ms', 'tl', 'uk', 'ru', 'lt', 'lv', 'et', 'sr', 'bs', 'mk',
  'sq', 'ka',
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = 'en';

/** Display names for the language switcher. */
export const LOCALE_DISPLAY_NAMES: Record<SupportedLocale, string> = {
  en: 'English',
  pl: 'Polski',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  it: 'Italiano',
  pt: 'Português',
  nl: 'Nederlands',
  sv: 'Svenska',
  da: 'Dansk',
  no: 'Norsk',
  fi: 'Suomi',
  cs: 'Čeština',
  sk: 'Slovenčina',
  hu: 'Magyar',
  ro: 'Română',
  bg: 'Български',
  hr: 'Hrvatski',
  sl: 'Slovenščina',
  el: 'Ελληνικά',
  tr: 'Türkçe',
  ar: 'العربية',
  he: 'עברית',
  hi: 'हिन्दी',
  ja: '日本語',
  ko: '한국어',
  zh: '中文',
  th: 'ไทย',
  vi: 'Tiếng Việt',
  id: 'Bahasa Indonesia',
  ms: 'Bahasa Melayu',
  tl: 'Filipino',
  uk: 'Українська',
  ru: 'Русский',
  lt: 'Lietuvių',
  lv: 'Latviešu',
  et: 'Eesti',
  sr: 'Српски',
  bs: 'Bosanski',
  mk: 'Македонски',
  sq: 'Shqip',
  ka: 'ქართული',
};

