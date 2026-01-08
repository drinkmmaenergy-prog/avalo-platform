/**
 * ✅ PACK 366 — Public Launch Orchestration, Store Readiness & Country Rollout Controller
 * Phase: ETAP C — Public Launch & Market Expansion
 * Type: Mandatory Global Launch Control Layer
 */

/**
 * Country Launch Configuration Model
 * Stored in: /ops/countryLaunch/{isoCode}
 */
export interface CountryLaunchConfig {
  isoCode: string;              // "PL", "DE", "UA", etc.
  enabled: boolean;             // Can users register & pay
  discoveryVisible: boolean;    // Profiles visible globally
  paymentsEnabled: boolean;
  withdrawalsEnabled: boolean;
  adsEnabled: boolean;
  launchStage:
    | "locked"      // Country completely blocked
    | "soft"        // Limited traffic, invite-only
    | "vip"         // VIP / Royal early access
    | "public";     // Full scale release
  maxNewUsersPerDay?: number;   // Daily registration cap
  timezone: string;             // Country timezone
  createdAt: number;
  updatedAt: number;
  launchedAt?: number;          // Timestamp of public launch
  lockedReason?: string;        // Why country is locked
}

/**
 * App Store Readiness Gates
 * Stored in: /ops/storeReadiness
 */
export interface StoreReadinessConfig {
  android: {
    ready: boolean;             // Google Play ready
    minVersion: string;         // Minimum required version
    currentVersion: string;     // Latest published version
    releaseDate?: number;
    reviewStatus?: "pending" | "approved" | "rejected";
    blockedReasons?: string[];
  };
  ios: {
    ready: boolean;             // App Store ready
    minVersion: string;         // Minimum required version
    currentVersion: string;     // Latest published version
    releaseDate?: number;
    reviewStatus?: "pending" | "approved" | "rejected";
    blockedReasons?: string[];
  };
  webApp: {
    ready: boolean;
    version: string;
    deployedAt?: number;
  };
  globalLock: boolean;          // Emergency kill switch
  lockReason?: string;
}

/**
 * VIP & Royal Pre-Launch Access Configuration
 * Stored in: /ops/vipAccess
 */
export interface VIPAccessConfig {
  vipPreAccessEnabled: boolean;
  royalPreAccessEnabled: boolean;
  vipEarlyAccessHours: number;  // Default: 48-72h before public
  royalEarlyAccessHours: number; // Default: 72-96h before public
  betaFoundersEnabled: boolean;
  whitelistedUserIds: string[]; // Override access regardless of membership
  blacklistedUserIds: string[]; // Block access even with membership
  startAt?: number;             // When VIP access begins
  publicAt?: number;            // When public access begins
}

/**
 * Traffic Flood Protection Configuration
 * Stored in: /ops/trafficLimits/global
 */
export interface TrafficLimitsConfig {
  maxRegistrationsPerHour: number;
  maxChatsPerSecond: number;
  maxWalletPurchasesPerMinute: number;
  maxProfileViewsPerSecond: number;
  dynamicQueueEnabled: boolean;
  queueMaxWaitMinutes: number;
  alertThresholds: {
    registrations: number;      // Alert if exceeded
    chats: number;
    purchases: number;
    profileViews: number;
  };
  rateLimitByCountry: {
    [isoCode: string]: {
      registrationsPerHour: number;
      enabled: boolean;
    };
  };
  updatedAt: number;
}

/**
 * Ad Campaign Launch Window
 * Stored in: /ops/adCampaigns/{campaignId}
 */
export interface AdLaunchWindow {
  id: string;
  platform: "meta" | "google" | "tiktok" | "snap";
  country: string;              // ISO code
  startAt: number;              // Campaign start timestamp
  endAt: number;                // Campaign end timestamp
  expectedCPI: number;          // Expected cost per install
  dailyBudget: number;          // Daily ad spend budget
  totalBudget: number;
  spentToDate: number;
  installsToDate: number;
  active: boolean;
  autoSync: boolean;            // Auto-sync with country launch stage
  createdAt: number;
  updatedAt: number;
}

/**
 * App Version Enforcement
 * Stored in: /ops/appVersions
 */
export interface AppVersionEnforcement {
  minAndroidVersion: string;
  minIosVersion: string;
  deprecatedVersions: string[]; // Versions to force upgrade
  forceUpgradeModal: boolean;   // Show modal to users
  revenueDisabledVersions: string[]; // No purchases allowed
  gracePeriodDays: number;      // Days before forced upgrade
  updatedAt: number;
}

/**
 * Global Rollback System
 * Stored in: /ops/rollback/status
 */
export interface RollbackStatus {
  active: boolean;
  triggeredAt?: number;
  triggeredBy: "auto" | "manual";
  reason: string;
  affectedCountries: string[];  // ISO codes of frozen countries
  metrics: {
    crashRate?: number;
    paymentFailureRate?: number;
    fraudAlertSpike?: number;
    panicUsageAnomaly?: number;
  };
  thresholds: {
    crashRate: number;          // Trigger if exceeded (e.g., 0.05 = 5%)
    paymentFailureRate: number;
    fraudAlertIncrease: number; // Percentage increase
    panicUsageIncrease: number;
  };
  actions: {
    countriesFrozen: boolean;
    paidChatDisabled: boolean;
    supportActive: boolean;
    panicActive: boolean;
    incidentTicketId?: string;  // From PACK 300A
  };
  resolvedAt?: number;
}

/**
 * Launch Stage Transition Event
 * Stored in: /ops/launchEvents/{eventId}
 */
export interface LaunchStageEvent {
  id: string;
  country: string;
  previousStage: CountryLaunchConfig["launchStage"];
  newStage: CountryLaunchConfig["launchStage"];
  triggeredBy: "admin" | "auto" | "ad_campaign";
  triggeredByUserId?: string;
  reason: string;
  timestamp: number;
  metrics?: {
    activeUsers: number;
    registrationsToday: number;
    revenueToday: number;
  };
}

/**
 * Launch Readiness Check Result
 */
export interface LaunchReadinessCheck {
  ready: boolean;
  checks: {
    storeReady: boolean;
    countriesConfigured: boolean;
    trafficLimitsSet: boolean;
    vipAccessConfigured: boolean;
    rollbackSystemActive: boolean;
  };
  blockers: string[];           // List of issues preventing launch
  warnings: string[];           // Non-blocking issues
  checkedAt: number;
}

/**
 * Country Launch Statistics
 * Stored in: /analytics/countryLaunch/{isoCode}/{date}
 */
export interface CountryLaunchStats {
  isoCode: string;
  date: string;                 // YYYY-MM-DD
  launchStage: CountryLaunchConfig["launchStage"];
  registrations: number;
  activeUsers: number;
  revenue: number;
  chatsSent: number;
  profileViews: number;
  walletPurchases: number;
  rateLimitHits: number;
  queuedUsers: number;
  averageQueueTimeSeconds: number;
}

/**
 * Launch Priority Queue Entry
 * Stored in: /ops/launchQueue/{userId}
 */
export interface LaunchQueueEntry {
  userId: string;
  country: string;
  enqueuedAt: number;
  estimatedWaitSeconds: number;
  position: number;
  membershipTier?: "standard" | "vip" | "royal";
  priority: number;             // Higher = served first
  status: "waiting" | "processing" | "admitted" | "expired";
  admittedAt?: number;
  expiredAt?: number;
}
