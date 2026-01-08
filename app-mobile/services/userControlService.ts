/**
 * PACK 59: User Control Service
 * Mobile service for managing user control profile (privacy, incognito, passport, ads, contacts, support)
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase";

// ============================================================================
// TYPES
// ============================================================================

export type AllowMessagesFrom =
  | "ANYONE"
  | "MATCHES_ONLY"
  | "FANS_ONLY"
  | "NONE";

export interface VisibilitySettings {
  profileVisible: boolean;
  showInDiscovery: boolean;
  showInMarketplace: boolean;
  showOnlineStatus: boolean;
  showLastSeen: boolean;
}

export interface IncognitoSettings {
  enabled: boolean;
  hideFromRecentlyViewed: boolean;
  hideFromWhoViewedMe: boolean;
  hideFromNearby: boolean;
}

export interface PassportSettings {
  enabled: boolean;
  virtualLocationEnabled: boolean;
  virtualCountry?: string | null;
  virtualCity?: string | null;
}

export interface MarketingSettings {
  allowInAppPromotions: boolean;
  allowEmailMarketing: boolean;
  allowPushMarketing: boolean;
  consentVersion?: string | null;
  consentUpdatedAt?: any | null;
}

export interface ContactSettings {
  allowMessagesFrom: AllowMessagesFrom;
  preferredGenders?: string[];
  preferredAgeRange?: { min: number; max: number } | null;
  preferredDistanceKm?: number | null;
  allowColdPaidMessages: boolean;
}

export interface SupportSettings {
  allowSupportContactByEmail: boolean;
  allowSupportContactInApp: boolean;
}

export interface UserControlProfile {
  userId: string;
  visibility: VisibilitySettings;
  incognito: IncognitoSettings;
  passport: PassportSettings;
  marketing: MarketingSettings;
  contacts: ContactSettings;
  support: SupportSettings;
  createdAt?: any;
  updatedAt?: any;
}

export interface SupportMeta {
  faqUrl: string;
  supportEmail: string;
  canOpenDisputes: boolean;
  canOpenContentReports: boolean;
}

// ============================================================================
// STORAGE KEYS
// ============================================================================

const STORAGE_PREFIX = "user_control_profile_v1_";

function getStorageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

// ============================================================================
// DEFAULTS
// ============================================================================

export function getDefaultUserControlProfile(
  userId: string
): UserControlProfile {
  return {
    userId,
    visibility: {
      profileVisible: true,
      showInDiscovery: true,
      showInMarketplace: true,
      showOnlineStatus: true,
      showLastSeen: true,
    },
    incognito: {
      enabled: false,
      hideFromRecentlyViewed: false,
      hideFromWhoViewedMe: false,
      hideFromNearby: false,
    },
    passport: {
      enabled: false,
      virtualLocationEnabled: false,
      virtualCountry: null,
      virtualCity: null,
    },
    marketing: {
      allowInAppPromotions: true,
      allowEmailMarketing: false,
      allowPushMarketing: false,
      consentVersion: null,
      consentUpdatedAt: null,
    },
    contacts: {
      allowMessagesFrom: "ANYONE",
      preferredGenders: undefined,
      preferredAgeRange: null,
      preferredDistanceKm: null,
      allowColdPaidMessages: true,
    },
    support: {
      allowSupportContactByEmail: true,
      allowSupportContactInApp: true,
    },
  };
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Fetch user control profile from backend with caching
 */
export async function fetchUserControlProfile(
  userId: string,
  forceRefresh: boolean = false
): Promise<UserControlProfile> {
  try {
    // Try cache first unless force refresh
    if (!forceRefresh) {
      const cached = await getFromCache(userId);
      if (cached) {
        return cached;
      }
    }

    // Fetch from backend
    const getUserControlProfileFn = httpsCallable<
      { userId?: string },
      { success: boolean; profile: UserControlProfile }
    >(functions, "getUserControlProfileEndpoint");

    const result = await getUserControlProfileFn({ userId });

    if (!result.data.success) {
      throw new Error("Failed to fetch user control profile");
    }

    const profile = result.data.profile;

    // Cache the result
    await saveToCache(userId, profile);

    return profile;
  } catch (error) {
    console.error("Error fetching user control profile:", error);
    // Return defaults on error
    return getDefaultUserControlProfile(userId);
  }
}

/**
 * Update user control profile
 */
export async function updateUserControlProfile(
  userId: string,
  updates: Partial<Omit<UserControlProfile, "userId">>
): Promise<UserControlProfile> {
  try {
    const updateUserControlProfileFn = httpsCallable<
      any,
      { success: boolean; profile: UserControlProfile }
    >(functions, "updateUserControlProfileEndpoint");

    const result = await updateUserControlProfileFn({
      userId,
      ...updates,
    });

    if (!result.data.success) {
      throw new Error("Failed to update user control profile");
    }

    const profile = result.data.profile;

    // Update cache
    await saveToCache(userId, profile);

    return profile;
  } catch (error: any) {
    console.error("Error updating user control profile:", error);
    throw error;
  }
}

/**
 * Get support metadata
 */
export async function getSupportMeta(): Promise<SupportMeta> {
  try {
    const getSupportMetaFn = httpsCallable<
      {},
      { success: boolean; meta: SupportMeta }
    >(functions, "getSupportMetaEndpoint");

    const result = await getSupportMetaFn({});

    if (!result.data.success) {
      throw new Error("Failed to fetch support metadata");
    }

    return result.data.meta;
  } catch (error) {
    console.error("Error fetching support meta:", error);
    // Return defaults on error
    return {
      faqUrl: "https://avalo.app/help",
      supportEmail: "support@avalo.app",
      canOpenDisputes: true,
      canOpenContentReports: true,
    };
  }
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

async function getFromCache(
  userId: string
): Promise<UserControlProfile | null> {
  try {
    const key = getStorageKey(userId);
    const cached = await AsyncStorage.getItem(key);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (error) {
    console.error("Error reading from cache:", error);
  }
  return null;
}

async function saveToCache(
  userId: string,
  profile: UserControlProfile
): Promise<void> {
  try {
    const key = getStorageKey(userId);
    await AsyncStorage.setItem(key, JSON.stringify(profile));
  } catch (error) {
    console.error("Error saving to cache:", error);
  }
}

/**
 * Clear cached profile
 */
export async function clearUserControlProfileCache(
  userId: string
): Promise<void> {
  try {
    const key = getStorageKey(userId);
    await AsyncStorage.removeItem(key);
  } catch (error) {
    console.error("Error clearing cache:", error);
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Update visibility settings only
 */
export async function updateVisibilitySettings(
  userId: string,
  visibility: Partial<VisibilitySettings>
): Promise<UserControlProfile> {
  return updateUserControlProfile(userId, { visibility } as any);
}

/**
 * Update incognito settings only
 */
export async function updateIncognitoSettings(
  userId: string,
  incognito: Partial<IncognitoSettings>
): Promise<UserControlProfile> {
  return updateUserControlProfile(userId, { incognito } as any);
}

/**
 * Update passport settings only
 */
export async function updatePassportSettings(
  userId: string,
  passport: Partial<PassportSettings>
): Promise<UserControlProfile> {
  return updateUserControlProfile(userId, { passport } as any);
}

/**
 * Update marketing settings only
 */
export async function updateMarketingSettings(
  userId: string,
  marketing: Partial<MarketingSettings>
): Promise<UserControlProfile> {
  return updateUserControlProfile(userId, { marketing } as any);
}

/**
 * Update contact settings only
 */
export async function updateContactSettings(
  userId: string,
  contacts: Partial<ContactSettings>
): Promise<UserControlProfile> {
  return updateUserControlProfile(userId, { contacts } as any);
}

/**
 * Update support settings only
 */
export async function updateSupportSettings(
  userId: string,
  support: Partial<SupportSettings>
): Promise<UserControlProfile> {
  return updateUserControlProfile(userId, { support } as any);
}

/**
 * Toggle incognito mode
 */
export async function toggleIncognito(
  userId: string,
  enabled: boolean
): Promise<UserControlProfile> {
  return updateIncognitoSettings(userId, { enabled });
}

/**
 * Toggle passport/virtual location
 */
export async function togglePassport(
  userId: string,
  enabled: boolean
): Promise<UserControlProfile> {
  return updatePassportSettings(userId, { virtualLocationEnabled: enabled });
}