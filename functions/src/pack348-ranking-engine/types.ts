/**
 * PACK 348 — Discovery & Feed Algorithm Control Panel
 * 
 * Real-Time Ranking Governance · Bias Control · Market-Specific Tuning · Growth Safety
 * 
 * Goal: Give Avalo full, centralized control over how Discovery, Feed, Swipe, AI, 
 * and Creator visibility are ranked — without touching tokenomics, refunds, or safety law.
 */

export interface RankingEngineConfig {
  discovery: {
    distanceWeight: number;
    activityWeight: number;
    ratingWeight: number;
    earningsWeight: number;
    refundPenaltyWeight: number;
    mismatchPenaltyWeight: number;
  };

  feed: {
    recencyWeight: number;
    engagementWeight: number;
    viralWeight: number;
    boostWeight: number;
  };

  swipe: {
    attractivenessWeight: number;
    responseTimeWeight: number;
    activityWeight: number;
    reportPenaltyWeight: number;
  };

  ai: {
    ratingWeight: number;
    voiceUsageWeight: number;
    chatUsageWeight: number;
    abusePenaltyWeight: number;
  };

  decay: {
    inactivityDecayPerDay: number;
    refundDecayPerEvent: number;
  };
}

export interface CountryRankingOverride extends Partial<RankingEngineConfig> {
  countryCode: string;
  enabled: boolean;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface SafetyPenaltyConfig {
  refundRatioThreshold: number;        // e.g., 0.15 = 15%
  refundRatioPenalty: number;          // Score multiplier (0-1)
  
  mismatchRateThreshold: number;       // e.g., 0.20 = 20%
  mismatchRatePenalty: number;
  
  panicUsageThreshold: number;         // Number of panic events
  panicUsagePenalty: number;
  
  blockingRateThreshold: number;       // e.g., 0.10 = 10%
  blockingRatePenalty: number;
  
  reportFrequencyThreshold: number;    // Reports per 30 days
  reportFrequencyPenalty: number;
  
  enableAutoSuppression: boolean;      // Auto-demote dangerous accounts
}

export interface TierRoutingConfig {
  royal: {
    discoveryPriority: boolean;        // ❌ Should be false (no free discovery boost)
    paidSurfacesPriority: boolean;     // ✅ Should be true
    boostPriceMultiplier: number;      // Price reduction for Royal boosts
    aiSearchPriority: boolean;         // ❌ Should be false
  };
  
  vip: {
    discoveryPriority: boolean;        // ❌ Should be false
    voiceSuggestionPriority: boolean;  // ✅ Only in voice/video surfaces
    boostPriceMultiplier: number;
    aiSearchPriority: boolean;         // ❌ Should be false
  };
  
  standard: {
    // Fully metric-based ranking only
    noArtificialBoost: boolean;        // ✅ Should be true
  };
}

export interface ABTestConfig {
  testId: string;
  name: string;
  description: string;
  enabled: boolean;
  
  // Percentage of users in test group (0-100)
  testGroupPercentage: number;
  
  // Control vs Test configuration
  controlConfig: Partial<RankingEngineConfig>;
  testConfig: Partial<RankingEngineConfig>;
  
  // Which segments to apply test to
  targetSegments?: string[];          // e.g., ["new_users", "eastern_europe"]
  
  // Exclusions - never test these
  excludedFromTest: {
    revenueChanges: boolean;           // ✅ Always true
    payoutChanges: boolean;            // ✅ Always true
    refundPolicyChanges: boolean;      // ✅ Always true
    safetyChanges: boolean;            // ✅ Always true
  };
  
  startDate: number;
  endDate: number;
  createdAt: number;
  createdBy: string;
}

export interface RankingAuditLog {
  id: string;
  timestamp: number;
  adminId: string;
  adminEmail: string;
  action: 'update_global' | 'update_country' | 'create_test' | 'disable_test' | 'safety_threshold_change';
  
  before: any;
  after: any;
  
  countryCode?: string;
  testId?: string;
  
  notes?: string;
  reversible: boolean;
}

export interface CreatorRankingScore {
  userId: string;
  
  // Base scores (0-100)
  discoveryScore: number;
  feedScore: number;
  swipeScore: number;
  aiScore: number;
  
  // Penalties applied
  safetyPenalties: {
    refundPenalty: number;
    mismatchPenalty: number;
    panicPenalty: number;
    blockingPenalty: number;
    reportPenalty: number;
    totalPenalty: number;           // Multiplier (0-1)
  };
  
  // Final weighted scores
  finalDiscoveryScore: number;
  finalFeedScore: number;
  finalSwipeScore: number;
  finalAiScore: number;
  
  // Metadata
  calculatedAt: number;
  countryCode: string;
  tierOverride?: 'royal' | 'vip' | 'standard';
  abTestGroup?: string;
}

export interface RankingMetrics {
  // Input metrics for scoring
  distance?: number;
  activityCount: number;
  averageRating: number;
  totalEarnings: number;
  refundCount: number;
  mismatchCount: number;
  
  recency?: number;                   // For feed items
  engagementCount?: number;
  shareCount?: number;
  boostActive?: boolean;
  
  attractivenessScore?: number;       // For swipe
  averageResponseTime?: number;
  reportCount?: number;
  
  voiceCallCount?: number;            // For AI companions
  chatMessageCount?: number;
  abuseReportCount?: number;
  
  daysInactive?: number;
  totalTransactions?: number;
}

export const DEFAULT_RANKING_CONFIG: RankingEngineConfig = {
  discovery: {
    distanceWeight: 0.30,
    activityWeight: 0.25,
    ratingWeight: 0.20,
    earningsWeight: 0.15,
    refundPenaltyWeight: 0.05,
    mismatchPenaltyWeight: 0.05,
  },
  
  feed: {
    recencyWeight: 0.35,
    engagementWeight: 0.30,
    viralWeight: 0.25,
    boostWeight: 0.10,
  },
  
  swipe: {
    attractivenessWeight: 0.40,
    responseTimeWeight: 0.25,
    activityWeight: 0.20,
    reportPenaltyWeight: 0.15,
  },
  
  ai: {
    ratingWeight: 0.40,
    voiceUsageWeight: 0.25,
    chatUsageWeight: 0.25,
    abusePenaltyWeight: 0.10,
  },
  
  decay: {
    inactivityDecayPerDay: 0.02,       // 2% per day
    refundDecayPerEvent: 0.05,         // 5% per refund
  },
};

export const DEFAULT_SAFETY_PENALTIES: SafetyPenaltyConfig = {
  refundRatioThreshold: 0.15,
  refundRatioPenalty: 0.30,
  
  mismatchRateThreshold: 0.20,
  mismatchRatePenalty: 0.25,
  
  panicUsageThreshold: 2,
  panicUsagePenalty: 0.50,
  
  blockingRateThreshold: 0.10,
  blockingRatePenalty: 0.20,
  
  reportFrequencyThreshold: 5,
  reportFrequencyPenalty: 0.40,
  
  enableAutoSuppression: true,
};

export const DEFAULT_TIER_ROUTING: TierRoutingConfig = {
  royal: {
    discoveryPriority: false,          // ❌ No free discovery cheating
    paidSurfacesPriority: true,        // ✅ Only paid surfaces
    boostPriceMultiplier: 0.80,        // 20% discount
    aiSearchPriority: false,           // ❌ Must earn AI visibility
  },
  
  vip: {
    discoveryPriority: false,          // ❌ No free discovery cheating
    voiceSuggestionPriority: true,     // ✅ Voice/video only
    boostPriceMultiplier: 0.90,        // 10% discount
    aiSearchPriority: false,           // ❌ Must earn AI visibility
  },
  
  standard: {
    noArtificialBoost: true,           // ✅ Pure meritocracy
  },
};
