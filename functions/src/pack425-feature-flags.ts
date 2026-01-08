/**
 * PACK 425 — Country Feature Flag Orchestration
 * Per-country feature toggles for phased rollouts
 */

import * as admin from 'firebase-admin';

export interface CountryFeatureFlags {
  // Core features
  swipeEnabled: boolean;
  calendarEnabled: boolean;
  eventsEnabled: boolean;
  aiCompanionsEnabled: boolean;
  payoutEnabled: boolean;

  // Premium features
  passportEnabled: boolean;
  incognitoEnabled: boolean;

  // Creator economy
  creatorOnboardingEnabled: boolean;
  monetizationEnabled: boolean;

  // Token & payments
  tokenStoreEnabled: boolean;
  verificationRequired: boolean;

  // Beta programs
  betaProgramEnabled: boolean;
  
  // Additional toggles
  videoCallsEnabled: boolean;
  voiceCallsEnabled: boolean;
  chatMonetizationEnabled: boolean;
  callMonetizationEnabled: boolean;
  storiesEnabled: boolean;
  feedEnabled: boolean;
  discoveryEnabled: boolean;
  matchingEnabled: boolean;
  
  // Safety & compliance
  contentModerationStrict: boolean;
  ageVerificationRequired: boolean;
  backgroundCheckRequired: boolean;
  
  // Advanced features
  aiRecommendationsEnabled: boolean;
  socialGraphEnabled: boolean;
  notificationsEnabled: boolean;
}

export const DEFAULT_FEATURE_FLAGS: CountryFeatureFlags = {
  swipeEnabled: true,
  calendarEnabled: true,
  eventsEnabled: true,
  aiCompanionsEnabled: false,
  payoutEnabled: false,
  
  passportEnabled: true,
  incognitoEnabled: true,
  
  creatorOnboardingEnabled: false,
  monetizationEnabled: false,
  
  tokenStoreEnabled: true,
  verificationRequired: false,
  
  betaProgramEnabled: false,
  
  videoCallsEnabled: true,
  voiceCallsEnabled: true,
  chatMonetizationEnabled: false,
  callMonetizationEnabled: false,
  storiesEnabled: true,
  feedEnabled: true,
  discoveryEnabled: true,
  matchingEnabled: true,
  
  contentModerationStrict: false,
  ageVerificationRequired: false,
  backgroundCheckRequired: false,
  
  aiRecommendationsEnabled: true,
  socialGraphEnabled: true,
  notificationsEnabled: true,
};

export interface CountryFeatureConfig {
  countryCode: string;
  flags: CountryFeatureFlags;
  updatedAt: FirebaseFirestore.Timestamp;
  updatedBy?: string;
  notes?: string;
}

/**
 * Get feature flags for a country
 */
export async function getCountryFlags(countryCode: string): Promise<CountryFeatureFlags> {
  const db = admin.firestore();
  const doc = await db.collection('countryFeatureFlags').doc(countryCode).get();
  
  if (!doc.exists) {
    // Return default flags if not configured
    return DEFAULT_FEATURE_FLAGS;
  }
  
  const config = doc.data() as CountryFeatureConfig;
  return config.flags;
}

/**
 * Update feature flags for a country
 */
export async function updateCountryFlags(
  countryCode: string,
  flags: Partial<CountryFeatureFlags>,
  updatedBy?: string
): Promise<void> {
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();
  
  // Get existing flags or use defaults
  const existing = await getCountryFlags(countryCode);
  const mergedFlags: CountryFeatureFlags = {
    ...existing,
    ...flags,
  };
  
  const config: CountryFeatureConfig = {
    countryCode,
    flags: mergedFlags,
    updatedAt: now,
    updatedBy,
  };
  
  await db.collection('countryFeatureFlags').doc(countryCode).set(config);
  
  // Log the change
  await db.collection('countryFeatureFlagHistory').add({
    countryCode,
    changes: flags,
    updatedAt: now,
    updatedBy,
  });
}

/**
 * Initialize feature flags for a new country (conservative defaults)
 */
export async function initializeCountryFlags(
  countryCode: string,
  overrides?: Partial<CountryFeatureFlags>
): Promise<void> {
  const conservativeDefaults: CountryFeatureFlags = {
    ...DEFAULT_FEATURE_FLAGS,
    
    // Conservative for new markets
    aiCompanionsEnabled: false,
    payoutEnabled: false,
    creatorOnboardingEnabled: false,
    monetizationEnabled: false,
    chatMonetizationEnabled: false,
    callMonetizationEnabled: false,
    betaProgramEnabled: false,
    
    // Enable basic safety
    contentModerationStrict: true,
    ...overrides,
  };
  
  await updateCountryFlags(countryCode, conservativeDefaults, 'system:init');
}

/**
 * Enable creator economy features for a country
 */
export async function enableCreatorEconomy(
  countryCode: string,
  updatedBy: string
): Promise<void> {
  await updateCountryFlags(countryCode, {
    creatorOnboardingEnabled: true,
    monetizationEnabled: true,
    chatMonetizationEnabled: true,
    callMonetizationEnabled: true,
    payoutEnabled: true,
    tokenStoreEnabled: true,
  }, updatedBy);
}

/**
 * Disable creator economy features (e.g., legal restrictions)
 */
export async function disableCreatorEconomy(
  countryCode: string,
  updatedBy: string
): Promise<void> {
  await updateCountryFlags(countryCode, {
    creatorOnboardingEnabled: false,
    monetizationEnabled: false,
    chatMonetizationEnabled: false,
    callMonetizationEnabled: false,
    payoutEnabled: false,
  }, updatedBy);
}

/**
 * Get all countries with a specific feature enabled
 */
export async function getCountriesWithFeature(
  featureName: keyof CountryFeatureFlags
): Promise<string[]> {
  const db = admin.firestore();
  const snapshot = await db.collection('countryFeatureFlags').get();
  
  const countries: string[] = [];
  
  for (const doc of snapshot.docs) {
    const config = doc.data() as CountryFeatureConfig;
    if (config.flags[featureName]) {
      countries.push(config.countryCode);
    }
  }
  
  return countries;
}

/**
 * Bulk update feature flags across multiple countries
 */
export async function bulkUpdateFlags(
  countryCodes: string[],
  flags: Partial<CountryFeatureFlags>,
  updatedBy: string
): Promise<void> {
  const db = admin.firestore();
  const batch = db.batch();
  const now = admin.firestore.Timestamp.now();
  
  for (const countryCode of countryCodes) {
    const ref = db.collection('countryFeatureFlags').doc(countryCode);
    const existing = await getCountryFlags(countryCode);
    
    const mergedFlags: CountryFeatureFlags = {
      ...existing,
      ...flags,
    };
    
    const config: CountryFeatureConfig = {
      countryCode,
      flags: mergedFlags,
      updatedAt: now,
      updatedBy,
    };
    
    batch.set(ref, config);
  }
  
  await batch.commit();
  
  // Log bulk change
  await db.collection('countryFeatureFlagHistory').add({
    bulkUpdate: true,
    countryCodes,
    changes: flags,
    updatedAt: now,
    updatedBy,
  });
}

/**
 * Check if a specific feature is enabled for a country
 */
export async function isFeatureEnabled(
  countryCode: string,
  feature: keyof CountryFeatureFlags
): Promise<boolean> {
  const flags = await getCountryFlags(countryCode);
  return flags[feature];
}

/**
 * Get feature flag history for a country
 */
export async function getFeatureFlagHistory(
  countryCode: string,
  limit: number = 50
): Promise<any[]> {
  const db = admin.firestore();
  const snapshot = await db.collection('countryFeatureFlagHistory')
    .where('countryCode', '==', countryCode)
    .orderBy('updatedAt', 'desc')
    .limit(limit)
    .get();
  
  return snapshot.docs.map(doc => doc.data());
}

/**
 * Clone feature flags from one country to another
 */
export async function cloneCountryFlags(
  sourceCountry: string,
  targetCountry: string,
  updatedBy: string
): Promise<void> {
  const sourceFlags = await getCountryFlags(sourceCountry);
  await updateCountryFlags(targetCountry, sourceFlags, updatedBy);
}

/**
 * Get feature flag statistics across all countries
 */
export async function getFeatureFlagStats(): Promise<{
  [feature: string]: {
    enabled: number;
    disabled: number;
    percentage: number;
  };
}> {
  const db = admin.firestore();
  const snapshot = await db.collection('countryFeatureFlags').get();
  
  const stats: { [feature: string]: { enabled: number; disabled: number; percentage: number } } = {};
  const total = snapshot.size;
  
  if (total === 0) return stats;
  
  // Initialize stats for all features
  const sampleFlags = Object.keys(DEFAULT_FEATURE_FLAGS) as Array<keyof CountryFeatureFlags>;
  for (const feature of sampleFlags) {
    stats[feature] = { enabled: 0, disabled: 0, percentage: 0 };
  }
  
  // Count enabled/disabled for each feature
  for (const doc of snapshot.docs) {
    const config = doc.data() as CountryFeatureConfig;
    for (const feature of sampleFlags) {
      if (config.flags[feature]) {
        stats[feature].enabled++;
      } else {
        stats[feature].disabled++;
      }
    }
  }
  
  // Calculate percentages
  for (const feature of sampleFlags) {
    stats[feature].percentage = Math.round((stats[feature].enabled / total) * 100);
  }
  
  return stats;
}
