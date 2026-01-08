/**
 * PACK 345 — Launch-Ready System Audit & Missing Gaps Scan
 * 
 * Production Readiness · Safety Coverage · Legal Coverage · Revenue Integrity
 * 
 * This pack introduces a Launch Readiness Engine that:
 * - verifies which core systems are ready
 * - flags missing integrations or weak points
 * - blocks production switch if any critical safety, legal, or payment condition is unmet
 * - prepares regional launch configuration per country
 */

import { Timestamp, FieldValue } from 'firebase-admin/firestore';

/**
 * Launch Readiness Status Object (Global Singleton)
 * Stored at: system/launchReadiness
 */
export interface LaunchReadinessStatus {
  environment: 'staging' | 'production';
  lastAuditAt: Timestamp;
  
  // Core system availability checks
  coreSystems: {
    auth: boolean;
    wallet: boolean;
    chat: boolean;
    voice: boolean;
    video: boolean;
    calendar: boolean;
    events: boolean;
    aiCompanions: boolean;
    feed: boolean;
    discovery: boolean;
    swipeLimits: boolean;
    moderation: boolean;
    panicButton: boolean;
  };
  
  // Monetization integrity checks
  monetizationIntegrity: {
    tokenPackPurchaseReady: boolean;
    payoutsReady: boolean;
    refundLogicReady: boolean;
    revenueSplitVerified: boolean;
    calendar80_20Verified: boolean;
    chat65_35Verified: boolean;
  };
  
  // Legal compliance checks
  legalCompliance: {
    termsAcceptedFlow: boolean;
    privacyAcceptedFlow: boolean;
    ageVerification18Plus: boolean;
    contentPolicyLive: boolean;
    gdprExportDeleteReady: boolean;
  };
  
  // Safety systems checks
  safetySystems: {
    selfieVerification: boolean;
    mismatchRefundFlow: boolean;
    panicTrackingLive: boolean;
    moderationDashboard: boolean;
    aiContentFilters: boolean;
  };
  
  // Integration checks
  integrations: {
    stripeLive: boolean;
    appleIAPLive: boolean;
    googleIAPLive: boolean;
    pushNotifications: boolean;
    emailProvider: boolean;
  };
  
  // Launch blocking
  launchBlocked: boolean;
  blockingReasons: string[];
}

/**
 * Country-Level Launch Configuration
 * Stored at: system/launchCountries/{countryCode}
 */
export interface CountryLaunchConfig {
  countryCode: string; // ISO 3166-1 alpha-2
  countryName: string;
  enabled: boolean;
  tokenSalesEnabled: boolean;
  payoutsEnabled: boolean;
  calendarEnabled: boolean;
  eventsEnabled: boolean;
  aiEnabled: boolean;
  panicRequired: boolean;
  minimumAge: number;
  launchedAt?: Timestamp;
  lastUpdated: Timestamp;
}

/**
 * Audit Check Result
 */
export interface AuditCheckResult {
  checkName: string;
  category: 'coreSystems' | 'monetizationIntegrity' | 'legalCompliance' | 'safetySystems' | 'integrations';
  passed: boolean;
  critical: boolean;
  message: string;
  timestamp: Timestamp;
  details?: Record<string, any>;
}

/**
 * Audit Run Log
 * Stored at: system/auditLogs/{auditId}
 */
export interface AuditRunLog {
  auditId: string;
  triggeredBy: 'scheduled' | 'manual' | 'admin';
  triggeredByUserId?: string;
  startedAt: Timestamp;
  completedAt?: Timestamp;
  duration?: number; // milliseconds
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  criticalFailures: number;
  checks: AuditCheckResult[];
  environmentAtAudit: 'staging' | 'production';
  launchBlockedAfterAudit: boolean;
  blockingReasonsAfterAudit: string[];
}

/**
 * Revenue Split Configuration
 */
export interface RevenueSplitConfig {
  feature: 'chat' | 'voice' | 'video' | 'calendar' | 'events' | 'tips' | 'gifts';
  creatorShare: number; // percentage (0-100)
  platformShare: number; // percentage (0-100)
  verified: boolean;
  verifiedAt?: Timestamp;
}

/**
 * Revenue split configurations
 */
export const EXPECTED_REVENUE_SPLITS: Record<string, RevenueSplitConfig> = {
  chat: {
    feature: 'chat',
    creatorShare: 65,
    platformShare: 35,
    verified: false
  },
  voice: {
    feature: 'voice',
    creatorShare: 65,
    platformShare: 35,
    verified: false
  },
  video: {
    feature: 'video',
    creatorShare: 65,
    platformShare: 35,
    verified: false
  },
  calendar: {
    feature: 'calendar',
    creatorShare: 80,
    platformShare: 20,
    verified: false
  },
  events: {
    feature: 'events',
    creatorShare: 80,
    platformShare: 20,
    verified: false
  },
  tips: {
    feature: 'tips',
    creatorShare: 90,
    platformShare: 10,
    verified: false
  },
  gifts: {
    feature: 'gifts',
    creatorShare: 90,
    platformShare: 10,
    verified: false
  }
};

/**
 * Manual Override Log
 * Stored at: system/launchOverrides/{overrideId}
 */
export interface LaunchOverrideLog {
  overrideId: string;
  timestamp: Timestamp;
  adminUserId: string;
  adminEmail: string;
  action: 'force_launch' | 'force_block' | 'bypass_check' | 'restore_check';
  reason: string;
  affectedChecks?: string[];
  previousState: Partial<LaunchReadinessStatus>;
  newState: Partial<LaunchReadinessStatus>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Compliance Enforcement Record
 * Stored in user document as: users/{userId}/compliance
 */
export interface UserComplianceStatus {
  userId: string;
  latestTermsAccepted: boolean;
  latestTermsVersion?: string;
  latestTermsAcceptedAt?: Timestamp;
  latestPrivacyAccepted: boolean;
  latestPrivacyVersion?: string;
  latestPrivacyAcceptedAt?: Timestamp;
  ageVerified: boolean;
  ageVerifiedAt?: Timestamp;
  age?: number;
  complianceLocked: boolean; // true if user cannot access app until compliance complete
  lastCheckedAt: Timestamp;
}

/**
 * Feature Endpoint Status
 */
export interface EndpointHealthCheck {
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  expectedStatus: number;
  lastCheckedAt?: Timestamp;
  isHealthy: boolean;
  responseTime?: number; // milliseconds
  errorMessage?: string;
}

/**
 * System endpoints to check
 */
export const CRITICAL_ENDPOINTS: EndpointHealthCheck[] = [
  {
    endpoint: '/wallet/balance',
    method: 'GET',
    expectedStatus: 200,
    isHealthy: false
  },
  {
    endpoint: '/chat/send',
    method: 'POST',
    expectedStatus: 200,
    isHealthy: false
  },
  {
    endpoint: '/panic/trigger',
    method: 'POST',
    expectedStatus: 200,
    isHealthy: false
  },
  {
    endpoint: '/moderation/queue',
    method: 'GET',
    expectedStatus: 200,
    isHealthy: false
  },
  {
    endpoint: '/calendar/create',
    method: 'POST',
    expectedStatus: 200,
    isHealthy: false
  },
  {
    endpoint: '/events/create',
    method: 'POST',
    expectedStatus: 200,
    isHealthy: false
  }
];

/**
 * Initial launch countries (Phase 1)
 */
export const INITIAL_LAUNCH_COUNTRIES: Partial<CountryLaunchConfig>[] = [
  {
    countryCode: 'PL',
    countryName: 'Poland',
    enabled: true,
    tokenSalesEnabled: true,
    payoutsEnabled: true,
    calendarEnabled: true,
    eventsEnabled: true,
    aiEnabled: true,
    panicRequired: true,
    minimumAge: 18
  },
  {
    countryCode: 'RO',
    countryName: 'Romania',
    enabled: true,
    tokenSalesEnabled: true,
    payoutsEnabled: true,
    calendarEnabled: true,
    eventsEnabled: true,
    aiEnabled: true,
    panicRequired: true,
    minimumAge: 18
  },
  {
    countryCode: 'UA',
    countryName: 'Ukraine',
    enabled: true,
    tokenSalesEnabled: true,
    payoutsEnabled: false, // Start with disabled payouts
    calendarEnabled: true,
    eventsEnabled: true,
    aiEnabled: true,
    panicRequired: true,
    minimumAge: 18
  }
];

/**
 * Refund consistency checks
 */
export interface RefundPolicyCheck {
  feature: string;
  policyName: string;
  description: string;
  implemented: boolean;
  verifiedAt?: Timestamp;
  notes?: string;
}

export const REFUND_POLICY_CHECKS: RefundPolicyCheck[] = [
  {
    feature: 'chat',
    policyName: 'unused_word_refund',
    description: 'User gets refund for unused words/messages in chat',
    implemented: false
  },
  {
    feature: 'calendar',
    policyName: 'mismatch_selfie_refund',
    description: 'User gets full refund if creator fails selfie verification at meeting',
    implemented: false
  },
  {
    feature: 'calendar',
    policyName: 'user_cancel_no_refund',
    description: 'User cancellation = no refund (fee kept)',
    implemented: false
  },
  {
    feature: 'calendar',
    policyName: 'creator_cancel_full_refund',
    description: 'Creator cancellation = full refund including Avalo fee',
    implemented: false
  },
  {
    feature: 'events',
    policyName: 'creator_cancel_event_refund',
    description: 'Event cancelled by creator = full ticket refund',
    implemented: false
  }
];

// Export type guards
export function isLaunchReadinessStatus(obj: any): obj is LaunchReadinessStatus {
  return obj && typeof obj === 'object' && 'environment' in obj && 'coreSystems' in obj;
}

export function isCountryLaunchConfig(obj: any): obj is CountryLaunchConfig {
  return obj && typeof obj === 'object' && 'countryCode' in obj && 'enabled' in obj;
}
