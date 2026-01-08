
/**
 * Region Router Module
 * PHASE 31A: Global Region Routing (Hybrid Auto + Manual)
 * 
 * Handles automatic region detection and manual region changes for users.
 * Regions: EU, US, ASIA, OTHER
 * 
 * Auto-detection uses:
 * - Phone country code (highest priority)
 * - IP/geolocation (medium priority)
 * - Device locale (fallback)
 * 
 * Manual changes allowed once per 30 days.
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type AvaloRegionCode = "EU" | "US" | "ASIA" | "OTHER";

export type RegionSource = "AUTO_LOCALE" | "AUTO_IP" | "AUTO_PHONE" | "MANUAL";

export interface RegionInfo {
  code: AvaloRegionCode;
  source: RegionSource;
}

// ============================================================================
// REGION MAPPING CONSTANTS
// ============================================================================

/**
 * EU Country Codes
 * Focus on Poland as main starting point, plus major EU countries
 */
const EU_COUNTRIES = new Set([
  "PL", // Poland - primary focus
  "DE", // Germany
  "FR", // France
  "GB", "UK", // United Kingdom
  "ES", // Spain
  "IT", // Italy
  "NL", // Netherlands
  "BE", // Belgium
  "AT", // Austria
  "SE", // Sweden
  "NO", // Norway
  "DK", // Denmark
  "FI", // Finland
  "IE", // Ireland
  "PT", // Portugal
  "GR", // Greece
  "CZ", // Czech Republic
  "RO", // Romania
  "HU", // Hungary
  "SK", // Slovakia
  "BG", // Bulgaria
  "HR", // Croatia
  "SI", // Slovenia
  "LT", // Lithuania
  "LV", // Latvia
  "EE", // Estonia
]);

/**
 * US Country Codes
 */
const US_COUNTRIES = new Set([
  "US", // United States
  "CA", // Canada
]);

/**
 * ASIA Country Codes
 * Focus on Southeast Asia and East Asia
 */
const ASIA_COUNTRIES = new Set([
  "JP", // Japan
  "KR", // South Korea
  "SG", // Singapore
  "TH", // Thailand
  "VN", // Vietnam
  "ID", // Indonesia
  "MY", // Malaysia
  "PH", // Philippines
  "CN", // China
  "TW", // Taiwan
  "HK", // Hong Kong
  "IN", // India
  "AU", // Australia
  "NZ", // New Zealand
]);

/**
 * EU Locale Prefixes
 */
const EU_LOCALES = new Set([
  "pl", // Polish
  "de", // German
  "fr", // French
  "es", // Spanish
  "it", // Italian
  "nl", // Dutch
  "be", // Belgian
  "at", // Austrian
  "sv", // Swedish
  "no", // Norwegian
  "da", // Danish
  "fi", // Finnish
  "en-GB", // British English
  "en-IE", // Irish English
  "pt", // Portuguese
  "el", // Greek
  "cs", // Czech
  "ro", // Romanian
  "hu", // Hungarian
  "sk", // Slovak
  "bg", // Bulgarian
  "hr", // Croatian
  "sl", // Slovenian
  "lt", // Lithuanian
  "lv", // Latvian
  "et", // Estonian
]);

/**
 * ASIA Locale Prefixes
 */
const ASIA_LOCALES = new Set([
  "ja", // Japanese
  "ko", // Korean
  "zh", // Chinese
  "th", // Thai
  "vi", // Vietnamese
  "id", // Indonesian
  "ms", // Malay
  "fil", "tl", // Filipino/Tagalog
  "hi", // Hindi
  "en-AU", // Australian English
  "en-NZ", // New Zealand English
  "en-SG", // Singapore English
]);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Map country code to region
 */
function mapCountryToRegion(countryCode: string | null | undefined): AvaloRegionCode | null {
  if (!countryCode) return null;
  
  const code = countryCode.toUpperCase();
  
  if (EU_COUNTRIES.has(code)) return "EU";
  if (US_COUNTRIES.has(code)) return "US";
  if (ASIA_COUNTRIES.has(code)) return "ASIA";
  
  return null;
}

/**
 * Map locale string to region
 */
function mapLocaleToRegion(locale: string | null | undefined): AvaloRegionCode | null {
  if (!locale) return null;
  
  const localeLower = locale.toLowerCase();
  
  // Check exact matches first (e.g., "en-US")
  if (localeLower.startsWith("en-us")) return "US";
  if (EU_LOCALES.has(localeLower) || EU_LOCALES.has(locale)) return "EU";
  if (ASIA_LOCALES.has(localeLower) || ASIA_LOCALES.has(locale)) return "ASIA";
  
  // Check prefix matches (e.g., "pl-PL" -> "pl")
  const prefix = localeLower.split('-')[0];
  if (EU_LOCALES.has(prefix)) return "EU";
  if (ASIA_LOCALES.has(prefix)) return "ASIA";
  
  return null;
}

// ============================================================================
// EXPORTED FUNCTIONS
// ============================================================================

/**
 * Infer region from multiple signals
 * Priority: Phone > IP > Locale
 * 
 * @param params - Detection signals
 * @returns RegionInfo with detected region and source
 */
export function inferRegionFromSignals(params: {
  locale?: string | null;
  countryFromIp?: string | null;
  phoneCountryCode?: string | null;
}): RegionInfo {
  const { locale, countryFromIp, phoneCountryCode } = params;
  
  // Priority 1: Phone country code
  if (phoneCountryCode) {
    const region = mapCountryToRegion(phoneCountryCode);
    if (region) {
      return {
        code: region,
        source: "AUTO_PHONE",
      };
    }
  }
  
  // Priority 2: IP-based country
  if (countryFromIp) {
    const region = mapCountryToRegion(countryFromIp);
    if (region) {
      return {
        code: region,
        source: "AUTO_IP",
      };
    }
  }
  
  // Priority 3: Device locale
  if (locale) {
    const region = mapLocaleToRegion(locale);
    if (region) {
      return {
        code: region,
        source: "AUTO_LOCALE",
      };
    }
  }
  
  // Fallback: OTHER
  return {
    code: "OTHER",
    source: "AUTO_LOCALE", // Use locale as source even for fallback
  };
}

/**
 * Check if user can change region manually
 * Users can change region once every 30 days
 * 
 * @param lastManualOverrideAt - Last manual override timestamp
 * @param now - Current timestamp
 * @returns true if user can change region
 */
export function canUserChangeRegion(
  lastManualOverrideAt: Timestamp | null | undefined,
  now: Timestamp
): boolean {
  // No previous override - allow change
  if (!lastManualOverrideAt) {
    return true;
  }
  
  // Calculate 30 days in milliseconds
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  
  // Get timestamps in milliseconds
  const lastOverrideMs = lastManualOverrideAt.toMillis();
  const nowMs = now.toMillis();
  
  // Check if 30 days have passed
  const timeSinceLastChange = nowMs - lastOverrideMs;
  
  return timeSinceLastChange >= THIRTY_DAYS_MS;
}

/**
 * Get default region for a new user
 * Wrapper around inferRegionFromSignals with clear semantics
 * 
 * @param signals - Detection signals
 * @returns RegionInfo with detected region
 */
export function getDefaultRegionForNewUser(signals: {
  locale?: string | null;
  countryFromIp?: string | null;
  phoneCountryCode?: string | null;
}): RegionInfo {
  return inferRegionFromSignals(signals);
}

/**
 * Get region from user document
 * Returns stored region or infers from available data
 * 
 * @param userDoc - Firestore user document snapshot
 * @returns Region code
 */
export function getRegionFromUserDoc(
  userDoc: FirebaseFirestore.DocumentSnapshot
): AvaloRegionCode {
  if (!userDoc.exists) {
    return "OTHER";
  }
  
  const userData = userDoc.data();
  
  // Check if region is already stored
  if (userData?.region?.code) {
    return userData.region.code as AvaloRegionCode;
  }
  
  // Try to infer from available fields
  const phoneCountryCode = userData?.phoneCountryCode || userData?.country || null;
  const locale = userData?.locale || null;
  
  const inferred = inferRegionFromSignals({
    phoneCountryCode,
    countryFromIp: null, // Not typically stored in user doc
    locale,
  });
  
  return inferred.code;
}

/**
 * Calculate next allowed region change timestamp
 * 
 * @param lastManualOverrideAt - Last manual override timestamp
 * @returns Timestamp in milliseconds when next change is allowed
 */
export function getNextAllowedChangeTime(
  lastManualOverrideAt: Timestamp | null | undefined
): number {
  if (!lastManualOverrideAt) {
    // Can change immediately
    return Date.now();
  }
  
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  return lastManualOverrideAt.toMillis() + THIRTY_DAYS_MS;
}

// ============================================================================
// CONSTANTS EXPORT
// ============================================================================

/**
 * Valid region codes
 */
export const VALID_REGIONS: AvaloRegionCode[] = ["EU", "US", "ASIA", "OTHER"];

/**
 * 30 days cooldown period in milliseconds
 */
export const REGION_CHANGE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;