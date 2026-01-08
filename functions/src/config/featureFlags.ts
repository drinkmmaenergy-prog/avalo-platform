/**
 * Feature Flags Configuration for Avalo
 * 
 * This module defines all feature flags used across the platform for
 * controlled rollouts, A/B testing, and launch stage management.
 */

export interface FeatureFlagsConfig {
  // ============================================
  // LAUNCH STAGE FLAGS
  // ============================================
  
  /** Global platform enabled status */
  platformEnabled: boolean;
  
  /** Countries where the platform is available (ISO 3166-1 alpha-2 codes) */
  allowedCountries: string[];
  
  /** Launch wave configuration (progressive rollout) */
  launchWave: {
    /** Current launch wave (1-5) */
    wave: number;
    /** Countries included in current wave */
    countries: string[];
    /** Start date of current wave */
    startDate: string;
  };
  
  // ============================================
  // MONETIZATION FLAGS
  // ============================================
  
  /** Master switch for all monetization features */
  monetizationEnabled: boolean;
  
  /** Enable/disable token purchases */
  tokenPurchasesEnabled: boolean;
  
  /** Enable/disable creator payouts */
  payoutsEnabled: boolean;
  
  /** Enable/disable subscription purchases */
  subscriptionsEnabled: boolean;
  
  /** Enable/disable gift sending */
  giftsEnabled: boolean;
  
  /** Enable/disable premium content purchases */
  premiumContentEnabled: boolean;
  
  /** Chat price moderation settings */
  chatPriceModeration: {
    enabled: boolean;
    minPrice: number;
    maxPrice: number;
    suggestedPrice: number;
  };
  
  // ============================================
  // CREATOR/INFLUENCER FLAGS
  // ============================================
  
  /** Enable/disable all creator features */
  creatorFeaturesEnabled: boolean;
  
  /** Creator-specific feature toggles */
  creatorFeatures: {
    aiCompanions: boolean;
    digitalProducts: boolean;
    liveStreaming: boolean;
    seasonPass: boolean;
    fanChallenges: boolean;
    drops: boolean;
    analytics: boolean;
    academy: boolean;
  };
  
  /** Minimum followers required for creator features */
  creatorMinFollowers: number;
  
  // ============================================
  // CONTENT FLAGS
  // ============================================
  
  /** NSFW content settings (consent system always active) */
  nsfwContent: {
    /** Enable NSFW feed exposure */
    feedExposureEnabled: boolean;
    /** Enable NSFW stories */
    storiesEnabled: boolean;
    /** Enable NSFW in chat */
    chatEnabled: boolean;
    /** Require additional consent confirmation */
    requireExtraConsent: boolean;
  };
  
  /** Content moderation strictness (1-5, 5 = most strict) */
  moderationStrictness: number;
  
  // ============================================
  // FEATURE TOGGLES
  // ============================================
  
  features: {
    // Core Features
    chat: boolean;
    videoCalls: boolean;
    voiceCalls: boolean;
    stories: boolean;
    feed: boolean;
    
    // Discovery Features
    swipe: boolean;
    explore: boolean;
    search: boolean;
    filters: boolean;
    
    // Social Features
    likedYou: boolean;
    matches: boolean;
    boosts: boolean;
    superLikes: boolean;
    
    // Safety Features
    verification: boolean;
    panicButton: boolean;
    reporting: boolean;
    blocking: boolean;
    
    // Premium Features
    incognitoMode: boolean;
    passport: boolean;
    rewind: boolean;
    unlimitedLikes: boolean;
    
    // Advanced Features
    aiFeatures: boolean;
    calendar: boolean;
    missions: boolean;
    achievements: boolean;
    referrals: boolean;
  };
  
  // ============================================
  // REGIONAL SETTINGS
  // ============================================
  
  /** Region-specific feature availability */
  regionalSettings: {
    /** Regions with restricted features */
    restrictedRegions: {
      [countryCode: string]: {
        disabledFeatures: string[];
        reason: string;
      };
    };
  };
  
  // ============================================
  // A/B TESTING
  // ============================================
  
  /** A/B test configurations */
  experiments: {
    [experimentId: string]: {
      enabled: boolean;
      variants: string[];
      traffic: number; // Percentage of users in experiment (0-100)
    };
  };
  
  // ============================================
  // PERFORMANCE & LIMITS
  // ============================================
  
  limits: {
    /** Maximum swipes per day for free users */
    maxSwipesPerDay: number;
    /** Maximum messages per day for free users */
    maxMessagesPerDay: number;
    /** Maximum profile views per day */
    maxProfileViewsPerDay: number;
    /** Maximum file size for uploads (MB) */
    maxUploadSizeMB: number;
  };
  
  // ============================================
  // MAINTENANCE
  // ============================================
  
  maintenance: {
    /** Is platform in maintenance mode */
    enabled: boolean;
    /** Maintenance message */
    message: string;
    /** Estimated end time (ISO 8601) */
    estimatedEnd: string | null;
  };
}

// ============================================
// DEFAULT CONFIGURATION
// ============================================

export const DEFAULT_FEATURE_FLAGS: FeatureFlagsConfig = {
  // Launch Stage
  platformEnabled: true,
  allowedCountries: ['US', 'CA', 'GB', 'AU', 'NZ', 'IE'], // Wave 1
  launchWave: {
    wave: 1,
    countries: ['US', 'CA', 'GB', 'AU', 'NZ', 'IE'],
    startDate: '2025-12-01T00:00:00Z',
  },
  
  // Monetization
  monetizationEnabled: true,
  tokenPurchasesEnabled: true,
  payoutsEnabled: false, // Disabled until launch wave 2
  subscriptionsEnabled: true,
  giftsEnabled: true,
  premiumContentEnabled: true,
  chatPriceModeration: {
    enabled: true,
    minPrice: 1,
    maxPrice: 100,
    suggestedPrice: 5,
  },
  
  // Creator Features
  creatorFeaturesEnabled: true,
  creatorFeatures: {
    aiCompanions: true,
    digitalProducts: true,
    liveStreaming: false, // Enable in wave 2
    seasonPass: true,
    fanChallenges: true,
    drops: true,
    analytics: true,
    academy: true,
  },
  creatorMinFollowers: 100,
  
  // Content
  nsfwContent: {
    feedExposureEnabled: true,
    storiesEnabled: true,
    chatEnabled: true,
    requireExtraConsent: true,
  },
  moderationStrictness: 3,
  
  // Features
  features: {
    // Core
    chat: true,
    videoCalls: true,
    voiceCalls: true,
    stories: true,
    feed: true,
    
    // Discovery
    swipe: true,
    explore: true,
    search: true,
    filters: true,
    
    // Social
    likedYou: true,
    matches: true,
    boosts: true,
    superLikes: true,
    
    // Safety
    verification: true,
    panicButton: true,
    reporting: true,
    blocking: true,
    
    // Premium
    incognitoMode: true,
    passport: true,
    rewind: true,
    unlimitedLikes: true,
    
    // Advanced
    aiFeatures: true,
    calendar: true,
    missions: true,
    achievements: true,
    referrals: true,
  },
  
  // Regional Settings
  regionalSettings: {
    restrictedRegions: {
      // Example: China restrictions
      CN: {
        disabledFeatures: ['livestreaming', 'videocalls'],
        reason: 'regulatory_compliance',
      },
    },
  },
  
  // A/B Testing
  experiments: {
    newOnboardingFlow: {
      enabled: false,
      variants: ['control', 'variant_a', 'variant_b'],
      traffic: 0,
    },
  },
  
  // Limits
  limits: {
    maxSwipesPerDay: 100,
    maxMessagesPerDay: 50,
    maxProfileViewsPerDay: 200,
    maxUploadSizeMB: 50,
  },
  
  // Maintenance
  maintenance: {
    enabled: false,
    message: '',
    estimatedEnd: null,
  },
};

// ============================================
// LAUNCH WAVE CONFIGURATIONS
// ============================================

export const LAUNCH_WAVES = {
  wave1: {
    countries: ['US', 'CA', 'GB', 'AU', 'NZ', 'IE'],
    description: 'English-speaking markets',
    features: {
      payoutsEnabled: false,
      liveStreaming: false,
    },
  },
  wave2: {
    countries: ['DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'AT', 'CH'],
    description: 'Western Europe',
    features: {
      payoutsEnabled: true,
      liveStreaming: true,
    },
  },
  wave3: {
    countries: ['SE', 'NO', 'DK', 'FI', 'PL', 'CZ', 'PT'],
    description: 'Northern & Central Europe',
    features: {
      payoutsEnabled: true,
      liveStreaming: true,
    },
  },
  wave4: {
    countries: ['BR', 'MX', 'AR', 'CL', 'CO'],
    description: 'Latin America',
    features: {
      payoutsEnabled: true,
      liveStreaming: true,
    },
  },
  wave5: {
    countries: ['JP', 'KR', 'SG', 'TH', 'ID'],
    description: 'Asia Pacific',
    features: {
      payoutsEnabled: true,
      liveStreaming: true,
    },
  },
} as const;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if a country is allowed in current launch wave
 */
export function isCountryAllowed(
  countryCode: string,
  flags: FeatureFlagsConfig
): boolean {
  return flags.allowedCountries.includes(countryCode.toUpperCase());
}

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(
  featureName: keyof FeatureFlagsConfig['features'],
  flags: FeatureFlagsConfig
): boolean {
  return flags.features[featureName] === true;
}

/**
 * Check if monetization is enabled for user's country
 */
export function isMonetizationAvailable(
  countryCode: string,
  flags: FeatureFlagsConfig
): boolean {
  return (
    flags.monetizationEnabled &&
    isCountryAllowed(countryCode, flags) &&
    !flags.maintenance.enabled
  );
}

/**
 * Get regional restrictions for a country
 */
export function getRegionalRestrictions(
  countryCode: string,
  flags: FeatureFlagsConfig
): string[] {
  const restrictions = flags.regionalSettings.restrictedRegions[countryCode];
  return restrictions?.disabledFeatures || [];
}

/**
 * Check if creator features are available
 */
export function areCreatorFeaturesAvailable(
  flags: FeatureFlagsConfig,
  followerCount: number = 0
): boolean {
  return (
    flags.creatorFeaturesEnabled &&
    followerCount >= flags.creatorMinFollowers
  );
}