/**
 * PACK 59: User Control Center
 * Centralized control for privacy, incognito, passport, ads/marketing, contact preferences, and support entry
 */

import { onCall } from "firebase-functions/v2/https";
import { HttpsError } from "firebase-functions/v2/https";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

const db = getFirestore();

// ============================================================================
// TYPES & SCHEMAS
// ============================================================================

export const VisibilitySettingsSchema = z.object({
  profileVisible: z.boolean(),
  showInDiscovery: z.boolean(),
  showInMarketplace: z.boolean(),
  showOnlineStatus: z.boolean(),
  showLastSeen: z.boolean(),
});

export const IncognitoSettingsSchema = z.object({
  enabled: z.boolean(),
  hideFromRecentlyViewed: z.boolean(),
  hideFromWhoViewedMe: z.boolean(),
  hideFromNearby: z.boolean(),
});

export const PassportSettingsSchema = z.object({
  enabled: z.boolean(),
  virtualLocationEnabled: z.boolean(),
  virtualCountry: z.string().nullable().optional(),
  virtualCity: z.string().nullable().optional(),
});

export const MarketingSettingsSchema = z.object({
  allowInAppPromotions: z.boolean(),
  allowEmailMarketing: z.boolean(),
  allowPushMarketing: z.boolean(),
  consentVersion: z.string().nullable().optional(),
  consentUpdatedAt: z.any().nullable().optional(), // FirebaseTimestamp
});

export const AllowMessagesFromSchema = z.enum([
  "ANYONE",
  "MATCHES_ONLY",
  "FANS_ONLY",
  "NONE",
]);

export const ContactSettingsSchema = z.object({
  allowMessagesFrom: AllowMessagesFromSchema,
  preferredGenders: z.array(z.string()).optional(),
  preferredAgeRange: z
    .object({
      min: z.number(),
      max: z.number(),
    })
    .nullable()
    .optional(),
  preferredDistanceKm: z.number().nullable().optional(),
  allowColdPaidMessages: z.boolean(),
});

export const SupportSettingsSchema = z.object({
  allowSupportContactByEmail: z.boolean(),
  allowSupportContactInApp: z.boolean(),
});

export const UserControlProfileSchema = z.object({
  userId: z.string(),
  visibility: VisibilitySettingsSchema,
  incognito: IncognitoSettingsSchema,
  passport: PassportSettingsSchema,
  marketing: MarketingSettingsSchema,
  contacts: ContactSettingsSchema,
  support: SupportSettingsSchema,
  createdAt: z.any(),
  updatedAt: z.any(),
});

export type AllowMessagesFrom = z.infer<typeof AllowMessagesFromSchema>;
export type VisibilitySettings = z.infer<typeof VisibilitySettingsSchema>;
export type IncognitoSettings = z.infer<typeof IncognitoSettingsSchema>;
export type PassportSettings = z.infer<typeof PassportSettingsSchema>;
export type MarketingSettings = z.infer<typeof MarketingSettingsSchema>;
export type ContactSettings = z.infer<typeof ContactSettingsSchema>;
export type SupportSettings = z.infer<typeof SupportSettingsSchema>;
export type UserControlProfile = z.infer<typeof UserControlProfileSchema>;

// ============================================================================
// DEFAULTS
// ============================================================================

export function getDefaultUserControlProfile(
  userId: string
): UserControlProfile {
  const now = Timestamp.now();
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
      allowEmailMarketing: false, // Must be opt-in
      allowPushMarketing: false, // Must be opt-in
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
    createdAt: now,
    updatedAt: now,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get user control profile with defaults if not exists
 */
export async function getUserControlProfile(
  userId: string
): Promise<UserControlProfile> {
  const docRef = db.collection("user_control_profiles").doc(userId);
  const doc = await docRef.get();

  if (!doc.exists) {
    // Return defaults without creating the document yet
    return getDefaultUserControlProfile(userId);
  }

  const data = doc.data();
  if (!data) {
    return getDefaultUserControlProfile(userId);
  }

  // Merge with defaults to handle missing fields
  const defaults = getDefaultUserControlProfile(userId);
  return {
    userId,
    visibility: { ...defaults.visibility, ...(data.visibility || {}) },
    incognito: { ...defaults.incognito, ...(data.incognito || {}) },
    passport: { ...defaults.passport, ...(data.passport || {}) },
    marketing: { ...defaults.marketing, ...(data.marketing || {}) },
    contacts: { ...defaults.contacts, ...(data.contacts || {}) },
    support: { ...defaults.support, ...(data.support || {}) },
    createdAt: data.createdAt || defaults.createdAt,
    updatedAt: data.updatedAt || defaults.updatedAt,
  };
}

/**
 * Validate control profile updates against enforcement and age rules
 */
async function validateControlProfileUpdate(
  userId: string,
  updates: Partial<Omit<UserControlProfile, "userId">>
): Promise<void> {
  // Check age gate for incognito/passport
  if (updates.incognito?.enabled || updates.passport?.virtualLocationEnabled) {
    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.data();

    if (userData?.ageGate?.age && userData.ageGate.age < 18) {
      throw new HttpsError(
        "permission-denied",
        "Incognito and Passport features require age 18+"
      );
    }
  }

  // Check enforcement status for visibility changes
  if (updates.visibility) {
    const enforcementDoc = await db
      .collection("enforcement_profiles")
      .doc(userId)
      .get();
    const enforcement = enforcementDoc.data();

    if (
      enforcement &&
      (enforcement.accountStatus === "BANNED" ||
        enforcement.accountStatus === "SUSPENDED")
    ) {
      // Banned/suspended users cannot change outward-facing visibility
      if (
        updates.visibility.profileVisible !== undefined ||
        updates.visibility.showInDiscovery !== undefined ||
        updates.visibility.showInMarketplace !== undefined
      ) {
        throw new HttpsError(
          "permission-denied",
          "Cannot change visibility settings while account is restricted"
        );
      }
    }
  }
}

// ============================================================================
// API ENDPOINTS
// ============================================================================

/**
 * GET /user-control/profile
 * Get user control profile with defaults
 */
export const getUserControlProfileEndpoint = onCall(
  { region: "europe-west3" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Must be authenticated"
      );
    }

    const { userId } = request.data;
    const requestUserId = userId || request.auth.uid;

    // Users can only access their own profile
    if (requestUserId !== request.auth.uid) {
      throw new HttpsError(
        "permission-denied",
        "Can only access own control profile"
      );
    }

    try {
      const profile = await getUserControlProfile(requestUserId);
      return { success: true, profile };
    } catch (error: any) {
      console.error("Error getting user control profile:", error);
      throw new HttpsError(
        "internal",
        error.message || "Failed to get user control profile"
      );
    }
  }
);

/**
 * POST /user-control/profile/update
 * Update user control profile with validation
 */
export const updateUserControlProfileEndpoint = onCall(
  { region: "europe-west3" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Must be authenticated"
      );
    }

    const userId = request.auth.uid;

    try {
      // Validate input
      const updateSchema = z.object({
        userId: z.string().optional(),
        visibility: VisibilitySettingsSchema.partial().optional(),
        incognito: IncognitoSettingsSchema.partial().optional(),
        passport: PassportSettingsSchema.partial().optional(),
        marketing: MarketingSettingsSchema.partial().optional(),
        contacts: ContactSettingsSchema.partial().optional(),
        support: SupportSettingsSchema.partial().optional(),
      });

      const updates = updateSchema.parse(request.data);

      // Ensure user can only update their own profile
      if (updates.userId && updates.userId !== userId) {
        throw new HttpsError(
          "permission-denied",
          "Can only update own control profile"
        );
      }

      // Validate updates
      await validateControlProfileUpdate(userId, updates);

      // Get current profile
      const currentProfile = await getUserControlProfile(userId);

      // Prepare update data
      const updateData: any = {
        userId,
        updatedAt: FieldValue.serverTimestamp(),
      };

      // Merge partial updates
      if (updates.visibility) {
        updateData.visibility = {
          ...currentProfile.visibility,
          ...updates.visibility,
        };
      }

      if (updates.incognito) {
        updateData.incognito = {
          ...currentProfile.incognito,
          ...updates.incognito,
        };
      }

      if (updates.passport) {
        updateData.passport = {
          ...currentProfile.passport,
          ...updates.passport,
        };
      }

      if (updates.marketing) {
        // Update marketing consent version if consents changed
        const marketingUpdated = {
          ...currentProfile.marketing,
          ...updates.marketing,
        };

        // If any consent changed, update version and timestamp
        if (
          updates.marketing.allowEmailMarketing !== undefined ||
          updates.marketing.allowPushMarketing !== undefined ||
          updates.marketing.allowInAppPromotions !== undefined
        ) {
          marketingUpdated.consentVersion = "v1.0"; // Reference to policy version
          marketingUpdated.consentUpdatedAt =
            FieldValue.serverTimestamp();
        }

        updateData.marketing = marketingUpdated;
      }

      if (updates.contacts) {
        updateData.contacts = {
          ...currentProfile.contacts,
          ...updates.contacts,
        };
      }

      if (updates.support) {
        updateData.support = {
          ...currentProfile.support,
          ...updates.support,
        };
      }

      // Add createdAt if this is first write
      const docRef = db.collection("user_control_profiles").doc(userId);
      const doc = await docRef.get();
      if (!doc.exists) {
        updateData.createdAt = FieldValue.serverTimestamp();
      }

      // Write to Firestore
      await docRef.set(updateData, { merge: true });

      // Return updated profile
      const updatedProfile = await getUserControlProfile(userId);
      return { success: true, profile: updatedProfile };
    } catch (error: any) {
      console.error("Error updating user control profile:", error);

      if (error instanceof HttpsError) {
        throw error;
      }

      if (error.name === "ZodError") {
        throw new HttpsError(
          "invalid-argument",
          "Invalid update data"
        );
      }

      throw new HttpsError(
        "internal",
        error.message || "Failed to update user control profile"
      );
    }
  }
);

/**
 * GET /support/meta
 * Get support metadata (FAQ, email, etc.)
 */
export const getSupportMetaEndpoint = onCall(
  { region: "europe-west3" },
  async (request) => {
    // No auth required - public info
    return {
      success: true,
      meta: {
        faqUrl: "https://avalo.app/help",
        supportEmail: "support@avalo.app",
        canOpenDisputes: true,
        canOpenContentReports: true,
      },
    };
  }
);

// ============================================================================
// UTILITY FUNCTIONS FOR OTHER MODULES
// ============================================================================

/**
 * Check if user visibility allows discovery
 */
export async function isUserVisibleInDiscovery(
  userId: string
): Promise<boolean> {
  const profile = await getUserControlProfile(userId);

  // If incognito enabled, treat as not visible in discovery
  if (profile.incognito.enabled) {
    return false;
  }

  return profile.visibility.profileVisible && profile.visibility.showInDiscovery;
}

/**
 * Check if user visibility allows marketplace
 */
export async function isUserVisibleInMarketplace(
  userId: string
): Promise<boolean> {
  const profile = await getUserControlProfile(userId);

  return (
    profile.visibility.profileVisible && profile.visibility.showInMarketplace
  );
}

/**
 * Check if user allows messages from another user
 */
export async function canUserReceiveMessagesFrom(
  targetUserId: string,
  senderUserId: string,
  relationship?: {
    isMatch?: boolean;
    isFan?: boolean;
  }
): Promise<boolean> {
  const profile = await getUserControlProfile(targetUserId);

  switch (profile.contacts.allowMessagesFrom) {
    case "NONE":
      return false;

    case "MATCHES_ONLY":
      return relationship?.isMatch === true;

    case "FANS_ONLY":
      return relationship?.isFan === true || relationship?.isMatch === true;

    case "ANYONE":
    default:
      return true;
  }
}

/**
 * Check if user allows cold paid messages
 */
export async function canUserReceiveColdPaidMessages(
  userId: string
): Promise<boolean> {
  const profile = await getUserControlProfile(userId);
  return profile.contacts.allowColdPaidMessages;
}

/**
 * Get user's virtual location if passport enabled
 */
export async function getUserEffectiveLocation(userId: string): Promise<{
  useVirtual: boolean;
  country?: string | null;
  city?: string | null;
}> {
  const profile = await getUserControlProfile(userId);

  if (profile.passport.enabled && profile.passport.virtualLocationEnabled) {
    return {
      useVirtual: true,
      country: profile.passport.virtualCountry || null,
      city: profile.passport.virtualCity || null,
    };
  }

  return {
    useVirtual: false,
  };
}

/**
 * Check if user allows marketing communications
 */
export async function canSendMarketingToUser(
  userId: string,
  channel: "email" | "push" | "inApp"
): Promise<boolean> {
  const profile = await getUserControlProfile(userId);

  switch (channel) {
    case "email":
      return profile.marketing.allowEmailMarketing;
    case "push":
      return profile.marketing.allowPushMarketing;
    case "inApp":
      return profile.marketing.allowInAppPromotions;
    default:
      return false;
  }
}

/**
 * Check if user is in incognito mode
 */
export async function isUserInIncognito(userId: string): Promise<boolean> {
  const profile = await getUserControlProfile(userId);
  return profile.incognito.enabled;
}

/**
 * Get incognito settings for filtering views
 */
export async function getUserIncognitoSettings(
  userId: string
): Promise<IncognitoSettings> {
  const profile = await getUserControlProfile(userId);
  return profile.incognito;
}