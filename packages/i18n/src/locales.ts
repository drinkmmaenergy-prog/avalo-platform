/**
 * PACK 295 - Globalization & Localization
 * Supported Locales and Locale Configuration
 */

export const SUPPORTED_LOCALES = [
  "pl-PL",
  "en-US",
  "en-GB",
  "de-DE",
  "fr-FR",
  "es-ES",
  "it-IT",
  "pt-PT",
  "pt-BR",
  "ru-RU",
  "uk-UA",
  "cs-CZ",
  "sk-SK",
  "sl-SI",
  "hr-HR",
  "sr-RS",
  "ro-RO",
  "bg-BG",
  "lt-LT",
  "lv-LV",
  "et-EE",
  "el-GR",
  "nl-NL",
  "da-DK",
  "sv-SE",
  "fi-FI",
  "no-NO",
  "hu-HU",
  "tr-TR",
  "ar-SA",
  "ja-JP",
  "ko-KR",
  "zh-CN",
  "zh-TW",
] as const;

export type LocaleCode = typeof SUPPORTED_LOCALES[number];

export const FALLBACK_LOCALE_ORDER: LocaleCode[] = [
  "en-US",
  "en-GB"
];

export const DEFAULT_LOCALE: LocaleCode = "en-US";

/**
 * Locale metadata for display in UI
 */
export const LOCALE_METADATA: Record<LocaleCode, {
  nativeName: string;
  englishName: string;
  direction: "ltr" | "rtl";
}> = {
  "pl-PL": { nativeName: "Polski (Polska)", englishName: "Polish (Poland)", direction: "ltr" },
  "en-US": { nativeName: "English (United States)", englishName: "English (United States)", direction: "ltr" },
  "en-GB": { nativeName: "English (United Kingdom)", englishName: "English (United Kingdom)", direction: "ltr" },
  "de-DE": { nativeName: "Deutsch (Deutschland)", englishName: "German (Germany)", direction: "ltr" },
  "fr-FR": { nativeName: "Français (France)", englishName: "French (France)", direction: "ltr" },
  "es-ES": { nativeName: "Español (España)", englishName: "Spanish (Spain)", direction: "ltr" },
  "it-IT": { nativeName: "Italiano (Italia)", englishName: "Italian (Italy)", direction: "ltr" },
  "pt-PT": { nativeName: "Português (Portugal)", englishName: "Portuguese (Portugal)", direction: "ltr" },
  "pt-BR": { nativeName: "Português (Brasil)", englishName: "Portuguese (Brazil)", direction: "ltr" },
  "ru-RU": { nativeName: "Русский (Россия)", englishName: "Russian (Russia)", direction: "ltr" },
  "uk-UA": { nativeName: "Українська (Україна)", englishName: "Ukrainian (Ukraine)", direction: "ltr" },
  "cs-CZ": { nativeName: "Čeština (Česko)", englishName: "Czech (Czechia)", direction: "ltr" },
  "sk-SK": { nativeName: "Slovenčina (Slovensko)", englishName: "Slovak (Slovakia)", direction: "ltr" },
  "sl-SI": { nativeName: "Slovenščina (Slovenija)", englishName: "Slovenian (Slovenia)", direction: "ltr" },
  "hr-HR": { nativeName: "Hrvatski (Hrvatska)", englishName: "Croatian (Croatia)", direction: "ltr" },
  "sr-RS": { nativeName: "Српски (Србија)", englishName: "Serbian (Serbia)", direction: "ltr" },
  "ro-RO": { nativeName: "Română (România)", englishName: "Romanian (Romania)", direction: "ltr" },
  "bg-BG": { nativeName: "Български (България)", englishName: "Bulgarian (Bulgaria)", direction: "ltr" },
  "lt-LT": { nativeName: "Lietuvių (Lietuva)", englishName: "Lithuanian (Lithuania)", direction: "ltr" },
  "lv-LV": { nativeName: "Latviešu (Latvija)", englishName: "Latvian (Latvia)", direction: "ltr" },
  "et-EE": { nativeName: "Eesti (Eesti)", englishName: "Estonian (Estonia)", direction: "ltr" },
  "el-GR": { nativeName: "Ελληνικά (Ελλάδα)", englishName: "Greek (Greece)", direction: "ltr" },
  "nl-NL": { nativeName: "Nederlands (Nederland)", englishName: "Dutch (Netherlands)", direction: "ltr" },
  "da-DK": { nativeName: "Dansk (Danmark)", englishName: "Danish (Denmark)", direction: "ltr" },
  "sv-SE": { nativeName: "Svenska (Sverige)", englishName: "Swedish (Sweden)", direction: "ltr" },
  "fi-FI": { nativeName: "Suomi (Suomi)", englishName: "Finnish (Finland)", direction: "ltr" },
  "no-NO": { nativeName: "Norsk (Norge)", englishName: "Norwegian (Norway)", direction: "ltr" },
  "hu-HU": { nativeName: "Magyar (Magyarország)", englishName: "Hungarian (Hungary)", direction: "ltr" },
  "tr-TR": { nativeName: "Türkçe (Türkiye)", englishName: "Turkish (Turkey)", direction: "ltr" },
  "ar-SA": { nativeName: "العربية (السعودية)", englishName: "Arabic (Saudi Arabia)", direction: "rtl" },
  "ja-JP": { nativeName: "日本語 (日本)", englishName: "Japanese (Japan)", direction: "ltr" },
  "ko-KR": { nativeName: "한국어 (대한민국)", englishName: "Korean (South Korea)", direction: "ltr" },
  "zh-CN": { nativeName: "简体中文 (中国)", englishName: "Simplified Chinese (China)", direction: "ltr" },
  "zh-TW": { nativeName: "繁體中文 (台灣)", englishName: "Traditional Chinese (Taiwan)", direction: "ltr" },
};

/**
 * Map browser/OS locale codes to our supported locales
 */
export function normalizeLocale(locale: string): LocaleCode {
  // Normalize the input (lowercase and replace _ with -)
  const normalized = locale.toLowerCase().replace("_", "-");
  
  // Try exact match first
  const exactMatch = SUPPORTED_LOCALES.find(l => l.toLowerCase() === normalized);
  if (exactMatch) return exactMatch;
  
  // Try language-only match (e.g., "en" -> "en-US")
  const languageCode = normalized.split("-")[0];
  const languageMatch = SUPPORTED_LOCALES.find(l => l.toLowerCase().startsWith(languageCode + "-"));
  if (languageMatch) return languageMatch;
  
  // Fallback to default
  return DEFAULT_LOCALE;
}

/**
 * Check if a locale is supported
 */
export function isSupportedLocale(locale: string): locale is LocaleCode {
  return SUPPORTED_LOCALES.includes(locale as LocaleCode);
}

/**
 * Get fallback locale for a given locale
 */
export function getFallbackLocale(locale: LocaleCode): LocaleCode {
  // If it's already a fallback locale, return first fallback
  if (FALLBACK_LOCALE_ORDER.includes(locale)) {
    return FALLBACK_LOCALE_ORDER[0];
  }
  
  // Try to find a similar language in fallbacks
  const languageCode = locale.split("-")[0];
  const similarFallback = FALLBACK_LOCALE_ORDER.find(l => l.startsWith(languageCode));
  if (similarFallback) return similarFallback;
  
  return FALLBACK_LOCALE_ORDER[0];
}