/**
 * PACK 295 - Globalization & Localization
 * Region Configuration and Content Rules
 */

import { CurrencyCode } from "./currencies";

/**
 * Region-specific configuration
 * Controls content visibility, legal requirements, and payout settings per country
 */
export type RegionConfig = {
  country: string; // ISO 3166-1 alpha-2 code
  
  // Content rules (high-level)
  allowBikini: boolean;
  allowLingerie: boolean;
  allowSoftEroticPhoto: boolean; // within adult rules & store policy
  allowAdultWebContent: boolean; // if web vertical pushes boundaries
  
  // Store rules
  allowExplicitAdultPaidContent: boolean; // must stay false for mobile apps
  
  // Legal flags
  requiresExtraConsentForData: boolean;
  requiresSpecificCookiesConsent: boolean;
  requiresAgeVerificationDocuments: boolean;
  
  // Payout
  payoutCurrency: CurrencyCode;
  
  // Age restriction (always 18+ globally, but some regions may have higher)
  minimumAge: number;
};

/**
 * Default region configuration
 */
const DEFAULT_REGION_CONFIG: RegionConfig = {
  country: "DEFAULT",
  allowBikini: true,
  allowLingerie: true,
  allowSoftEroticPhoto: true,
  allowAdultWebContent: false,
  allowExplicitAdultPaidContent: false,
  requiresExtraConsentForData: false,
  requiresSpecificCookiesConsent: false,
  requiresAgeVerificationDocuments: false,
  payoutCurrency: "EUR",
  minimumAge: 18,
};

/**
 * Region-specific configurations
 */
export const REGION_CONFIG: Record<string, RegionConfig> = {
  // Poland - Home market, balanced approach
  "PL": {
    country: "PL",
    allowBikini: true,
    allowLingerie: true,
    allowSoftEroticPhoto: true,
    allowAdultWebContent: false,
    allowExplicitAdultPaidContent: false,
    requiresExtraConsentForData: false,
    requiresSpecificCookiesConsent: true,
    requiresAgeVerificationDocuments: false,
    payoutCurrency: "PLN",
    minimumAge: 18,
  },
  
  // Germany - Strict GDPR, moderate content
  "DE": {
    country: "DE",
    allowBikini: true,
    allowLingerie: true,
    allowSoftEroticPhoto: true,
    allowAdultWebContent: false,
    allowExplicitAdultPaidContent: false,
    requiresExtraConsentForData: true,
    requiresSpecificCookiesConsent: true,
    requiresAgeVerificationDocuments: false,
    payoutCurrency: "EUR",
    minimumAge: 18,
  },
  
  // France - Similar to Germany
  "FR": {
    country: "FR",
    allowBikini: true,
    allowLingerie: true,
    allowSoftEroticPhoto: true,
    allowAdultWebContent: false,
    allowExplicitAdultPaidContent: false,
    requiresExtraConsentForData: true,
    requiresSpecificCookiesConsent: true,
    requiresAgeVerificationDocuments: false,
    payoutCurrency: "EUR",
    minimumAge: 18,
  },
  
  // United Kingdom - Post-Brexit, may have specific rules
  "GB": {
    country: "GB",
    allowBikini: true,
    allowLingerie: true,
    allowSoftEroticPhoto: true,
    allowAdultWebContent: false,
    allowExplicitAdultPaidContent: false,
    requiresExtraConsentForData: true,
    requiresSpecificCookiesConsent: true,
    requiresAgeVerificationDocuments: true,
    payoutCurrency: "GBP",
    minimumAge: 18,
  },
  
  // United States - Varies by state, conservative baseline
  "US": {
    country: "US",
    allowBikini: true,
    allowLingerie: true,
    allowSoftEroticPhoto: true,
    allowAdultWebContent: false,
    allowExplicitAdultPaidContent: false,
    requiresExtraConsentForData: false,
    requiresSpecificCookiesConsent: false,
    requiresAgeVerificationDocuments: false,
    payoutCurrency: "USD",
    minimumAge: 18,
  },
  
  // Spain - Permissive
  "ES": {
    country: "ES",
    allowBikini: true,
    allowLingerie: true,
    allowSoftEroticPhoto: true,
    allowAdultWebContent: false,
    allowExplicitAdultPaidContent: false,
    requiresExtraConsentForData: true,
    requiresSpecificCookiesConsent: true,
    requiresAgeVerificationDocuments: false,
    payoutCurrency: "EUR",
    minimumAge: 18,
  },
  
  // Italy - Moderate
  "IT": {
    country: "IT",
    allowBikini: true,
    allowLingerie: true,
    allowSoftEroticPhoto: true,
    allowAdultWebContent: false,
    allowExplicitAdultPaidContent: false,
    requiresExtraConsentForData: true,
    requiresSpecificCookiesConsent: true,
    requiresAgeVerificationDocuments: false,
    payoutCurrency: "EUR",
    minimumAge: 18,
  },
  
  // Netherlands - Liberal
  "NL": {
    country: "NL",
    allowBikini: true,
    allowLingerie: true,
    allowSoftEroticPhoto: true,
    allowAdultWebContent: false,
    allowExplicitAdultPaidContent: false,
    requiresExtraConsentForData: true,
    requiresSpecificCookiesConsent: true,
    requiresAgeVerificationDocuments: false,
    payoutCurrency: "EUR",
    minimumAge: 18,
  },
  
  // Czech Republic
  "CZ": {
    country: "CZ",
    allowBikini: true,
    allowLingerie: true,
    allowSoftEroticPhoto: true,
    allowAdultWebContent: false,
    allowExplicitAdultPaidContent: false,
    requiresExtraConsentForData: true,
    requiresSpecificCookiesConsent: true,
    requiresAgeVerificationDocuments: false,
    payoutCurrency: "CZK",
    minimumAge: 18,
  },
  
  // Romania
  "RO": {
    country: "RO",
    allowBikini: true,
    allowLingerie: true,
    allowSoftEroticPhoto: true,
    allowAdultWebContent: false,
    allowExplicitAdultPaidContent: false,
    requiresExtraConsentForData: true,
    requiresSpecificCookiesConsent: true,
    requiresAgeVerificationDocuments: false,
    payoutCurrency: "RON",
    minimumAge: 18,
  },
  
  // Ukraine
  "UA": {
    country: "UA",
    allowBikini: true,
    allowLingerie: true,
    allowSoftEroticPhoto: true,
    allowAdultWebContent: false,
    allowExplicitAdultPaidContent: false,
    requiresExtraConsentForData: false,
    requiresSpecificCookiesConsent: false,
    requiresAgeVerificationDocuments: false,
    payoutCurrency: "UAH",
    minimumAge: 18,
  },
  
  // Russia
  "RU": {
    country: "RU",
    allowBikini: true,
    allowLingerie: false, // More conservative
    allowSoftEroticPhoto: false,
    allowAdultWebContent: false,
    allowExplicitAdultPaidContent: false,
    requiresExtraConsentForData: false,
    requiresSpecificCookiesConsent: false,
    requiresAgeVerificationDocuments: false,
    payoutCurrency: "RUB",
    minimumAge: 18,
  },
  
  // Saudi Arabia - Very conservative
  "SA": {
    country: "SA",
    allowBikini: false,
    allowLingerie: false,
    allowSoftEroticPhoto: false,
    allowAdultWebContent: false,
    allowExplicitAdultPaidContent: false,
    requiresExtraConsentForData: false,
    requiresSpecificCookiesConsent: false,
    requiresAgeVerificationDocuments: false,
    payoutCurrency: "SAR",
    minimumAge: 21, // Higher age requirement
  },
  
  // Turkey - Conservative
  "TR": {
    country: "TR",
    allowBikini: true,
    allowLingerie: false,
    allowSoftEroticPhoto: false,
    allowAdultWebContent: false,
    allowExplicitAdultPaidContent: false,
    requiresExtraConsentForData: false,
    requiresSpecificCookiesConsent: false,
    requiresAgeVerificationDocuments: false,
    payoutCurrency: "TRY",
    minimumAge: 18,
  },
  
  // Japan - Unique content standards
  "JP": {
    country: "JP",
    allowBikini: true,
    allowLingerie: true,
    allowSoftEroticPhoto: true,
    allowAdultWebContent: false,
    allowExplicitAdultPaidContent: false,
    requiresExtraConsentForData: false,
    requiresSpecificCookiesConsent: false,
    requiresAgeVerificationDocuments: false,
    payoutCurrency: "JPY",
    minimumAge: 20, // Japan's age of majority
  },
  
  // South Korea
  "KR": {
    country: "KR",
    allowBikini: true,
    allowLingerie: true,
    allowSoftEroticPhoto: true,
    allowAdultWebContent: false,
    allowExplicitAdultPaidContent: false,
    requiresExtraConsentForData: false,
    requiresSpecificCookiesConsent: false,
    requiresAgeVerificationDocuments: true,
    payoutCurrency: "KRW",
    minimumAge: 19, // South Korea's age of majority
  },
  
  // China - Very restricted (if operating there)
  "CN": {
    country: "CN",
    allowBikini: true,
    allowLingerie: false,
    allowSoftEroticPhoto: false,
    allowAdultWebContent: false,
    allowExplicitAdultPaidContent: false,
    requiresExtraConsentForData: false,
    requiresSpecificCookiesConsent: false,
    requiresAgeVerificationDocuments: true,
    payoutCurrency: "CNY",
    minimumAge: 18,
  },
};

/**
 * Get region configuration for a country code
 */
export function getRegionConfig(countryCode: string): RegionConfig {
  return REGION_CONFIG[countryCode.toUpperCase()] || DEFAULT_REGION_CONFIG;
}

/**
 * Check if content type is allowed in a region
 */
export function isContentAllowed(
  countryCode: string,
  contentType: "bikini" | "lingerie" | "softErotic" | "adultWeb" | "explicitPaid"
): boolean {
  const config = getRegionConfig(countryCode);
  
  switch (contentType) {
    case "bikini":
      return config.allowBikini;
    case "lingerie":
      return config.allowLingerie;
    case "softErotic":
      return config.allowSoftEroticPhoto;
    case "adultWeb":
      return config.allowAdultWebContent;
    case "explicitPaid":
      return config.allowExplicitAdultPaidContent;
    default:
      return false;
  }
}

/**
 * Get minimum age for a region
 */
export function getMinimumAge(countryCode: string): number {
  const config = getRegionConfig(countryCode);
  return config.minimumAge;
}

/**
 * Check if user meets minimum age for region
 */
export function meetsAgeRequirement(
  dateOfBirth: Date,
  countryCode: string,
  timeZone: string = "UTC"
): boolean {
  const minimumAge = getMinimumAge(countryCode);
  const today = new Date();
  
  // Calculate age considering the user's timezone
  let age = today.getFullYear() - dateOfBirth.getFullYear();
  const monthDiff = today.getMonth() - dateOfBirth.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dateOfBirth.getDate())) {
    age--;
  }
  
  return age >= minimumAge;
}