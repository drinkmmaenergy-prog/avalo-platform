/**
 * PACK 295 - Globalization & Localization
 * Locale Detection Utilities
 */

import { LocaleCode, normalizeLocale, DEFAULT_LOCALE } from "./locales";

/**
 * Result of locale detection
 */
export interface LocaleDetectionResult {
  locale: LocaleCode;
  country: string; // ISO 3166-1 alpha-2
  timezone: string;
  confidence: "high" | "medium" | "low";
}

/**
 * Detect locale from browser
 * Works in web environments
 */
export function detectBrowserLocale(): LocaleDetectionResult {
  if (typeof window === "undefined" || !navigator) {
    return {
      locale: DEFAULT_LOCALE,
      country: "US",
      timezone: "UTC",
      confidence: "low",
    };
  }
  
  // Try to get browser language
  const browserLang = navigator.language || (navigator as any).userLanguage || DEFAULT_LOCALE;
  const locale = normalizeLocale(browserLang);
  
  // Try to extract country from locale
  const country = locale.split("-")[1] || "US";
  
  // Get timezone
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  
  return {
    locale,
    country,
    timezone,
    confidence: "medium",
  };
}

/**
 * Detect locale from device (React Native)
 * Works in mobile environments
 */
export function detectDeviceLocale(): LocaleDetectionResult {
  // This would use react-native's libraries in actual implementation
  // For now, return default
  
  // In real implementation, would use:
  // import * as Localization from 'expo-localization';
  // const locale = normalizeLocale(Localization.locale);
  // const timezone = Localization.timezone;
  
  return {
    locale: DEFAULT_LOCALE,
    country: "US",
    timezone: "UTC",
    confidence: "low",
  };
}

/**
 * Detect region from IP address
 * Requires backend API call
 */
export async function detectRegionFromIP(
  ipAddress?: string
): Promise<{ country: string; confidence: "high" | "medium" | "low" }> {
  try {
    // In production, this would call a geolocation API
    // Example: ipapi.co, ipinfo.io, or custom backend endpoint
    
    if (!ipAddress) {
      // If no IP provided, try to get it from a service
      // This is a placeholder - in real implementation would call actual service
      return {
        country: "US",
        confidence: "low",
      };
    }
    
    // Placeholder for actual API call
    // const response = await fetch(`https://api.avalo.app/geo/ip/${ipAddress}`);
    // const data = await response.json();
    // return { country: data.countryCode, confidence: "high" };
    
    return {
      country: "US",
      confidence: "low",
    };
  } catch (error) {
    return {
      country: "US",
      confidence: "low",
    };
  }
}

/**
 * Detect user's timezone
 */
export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch (error) {
    return "UTC";
  }
}

/**
 * Comprehensive locale detection combining multiple sources
 */
export async function detectUserLocale(
  platform: "web" | "mobile",
  ipAddress?: string
): Promise<LocaleDetectionResult> {
  // Detect based on platform
  const platformDetection = platform === "web" 
    ? detectBrowserLocale()
    : detectDeviceLocale();
  
  // Try to enhance with IP-based region detection
  try {
    const ipDetection = await detectRegionFromIP(ipAddress);
    
    if (ipDetection.confidence === "high") {
      return {
        ...platformDetection,
        country: ipDetection.country,
        confidence: "high",
      };
    }
  } catch (error) {
    // Continue with platform detection
  }
  
  return platformDetection;
}

/**
 * Validate detected locale against user's stored preferences
 * Returns the most appropriate locale to use
 */
export function resolveLocale(
  detectedLocale: LocaleCode,
  userPreferredLocale: LocaleCode | null
): LocaleCode {
  // User preference always wins
  if (userPreferredLocale) {
    return userPreferredLocale;
  }
  
  // Otherwise use detected locale
  return detectedLocale;
}