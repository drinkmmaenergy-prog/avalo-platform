/**
 * PACK 295 - Globalization & Localization
 * User Locale Profile Management
 */

import { LocaleCode } from "./locales";

/**
 * User locale profile stored in Firestore
 * Collection: userLocales/{userId}
 */
export interface UserLocaleProfile {
  userId: string;
  preferredLocale: LocaleCode; // User's chosen language
  deviceLocaleLast: LocaleCode; // Last detected device/browser locale
  regionCountry: string; // ISO 3166-1 alpha-2 country code
  timeZone: string; // IANA timezone identifier
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
}

/**
 * Create a new user locale profile
 */
export function createUserLocaleProfile(
  userId: string,
  detectedLocale: LocaleCode,
  country: string,
  timezone: string
): UserLocaleProfile {
  const now = new Date().toISOString();
  
  return {
    userId,
    preferredLocale: detectedLocale,
    deviceLocaleLast: detectedLocale,
    regionCountry: country,
    timeZone: timezone,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Update user locale profile
 */
export function updateUserLocaleProfile(
  profile: UserLocaleProfile,
  updates: Partial<Pick<UserLocaleProfile, "preferredLocale" | "deviceLocaleLast" | "regionCountry" | "timeZone">>
): UserLocaleProfile {
  return {
    ...profile,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Get effective locale for a user
 * Priority: preferredLocale > deviceLocaleLast
 */
export function getEffectiveLocale(profile: UserLocaleProfile): LocaleCode {
  return profile.preferredLocale || profile.deviceLocaleLast;
}

/**
 * Check if user has explicitly set a preferred locale
 */
export function hasPreferredLocale(profile: UserLocaleProfile): boolean {
  return profile.preferredLocale !== profile.deviceLocaleLast;
}

/**
 * Data for updating locale preferences
 */
export interface UpdateLocalePreferences {
  preferredLocale?: LocaleCode;
  timeZone?: string;
}

/**
 * Validate locale profile data
 */
export function validateLocaleProfile(profile: Partial<UserLocaleProfile>): string[] {
  const errors: string[] = [];
  
  if (!profile.userId) {
    errors.push("userId is required");
  }
  
  if (!profile.preferredLocale) {
    errors.push("preferredLocale is required");
  }
  
  if (!profile.regionCountry) {
    errors.push("regionCountry is required");
  }
  
  if (!profile.timeZone) {
    errors.push("timeZone is required");
  }
  
  return errors;
}