/**
 * PACK 295 - Globalization & Localization
 * Main exports for @avalo/i18n package
 */

// Locales
export {
  SUPPORTED_LOCALES,
  FALLBACK_LOCALE_ORDER,
  DEFAULT_LOCALE,
  LOCALE_METADATA,
  type LocaleCode,
  normalizeLocale,
  isSupportedLocale,
  getFallbackLocale,
} from "./locales";

// Currencies
export {
  SUPPORTED_CURRENCIES,
  REGION_DEFAULT_CURRENCY,
  CURRENCY_METADATA,
  type CurrencyCode,
  getCurrencyForRegion,
  isSupportedCurrency,
} from "./currencies";

// Formatting
export {
  formatCurrency,
  formatNumber,
  formatDateTime,
  formatDate,
  formatTime,
  formatRelativeTime,
  formatPercent,
  formatCompactNumber,
  formatTokens,
} from "./formatting";

// Regions
export {
  type RegionConfig,
  REGION_CONFIG,
  getRegionConfig,
  isContentAllowed,
  getMinimumAge,
  meetsAgeRequirement,
} from "./regions";

// Legal
export {
  type LegalDocType,
  type LegalDocument,
  type LegalAcceptance,
  type UserLegalAcceptances,
  selectLegalDocument,
  hasAcceptedDocument,
  needsLegalAcceptance,
  createAcceptanceRecord,
  getLegalDocTitle,
} from "./legal";

// i18n
export {
  type TranslationNamespace,
  type I18nConfig,
  type TranslationParams,
  type TranslationLoader,
  initI18n,
  changeLanguage,
  getCurrentLanguage,
  loadTranslations,
  getTranslationFunction,
  t,
  hasTranslation,
  getLoadedLanguages,
  BundledTranslationLoader,
  RemoteTranslationLoader,
  preloadTranslations,
} from "./i18n";

// Locale detection
export {
  type LocaleDetectionResult,
  detectBrowserLocale,
  detectDeviceLocale,
  detectRegionFromIP,
  detectTimezone,
} from "./detection";

// User locale profile
export {
  type UserLocaleProfile,
  createUserLocaleProfile,
  updateUserLocaleProfile,
} from "./user-locale";