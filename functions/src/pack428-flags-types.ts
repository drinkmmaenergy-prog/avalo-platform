/**
 * PACK 428 — Feature Flags, Kill-Switch & Experimentation Layer
 * 
 * Type definitions for feature flags, experiments, and kill switches
 * 
 * Hard Rules:
 * - MUST NOT change tokenomics, pricing, revenue splits, or refund logic
 * - Only controls feature exposure, safety switches, and controlled rollouts
 */

import { Timestamp } from 'firebase-admin/firestore';

/**
 * User Segment Types for Targeting
 */
export type UserSegment = 
  | 'ALL'
  | 'NEW'        // Users < 7 days old
  | 'ACTIVE'     // Users with activity in last 30 days
  | 'VIP'        // VIP subscription tier
  | 'ROYAL'      // Royal Club members
  | 'CREATOR';   // Users with creator profiles

/**
 * Platform Types
 */
export type Platform = 
  | 'ALL'
  | 'IOS'
  | 'ANDROID'
  | 'WEB';

/**
 * Region Codes
 */
export type RegionCode = 
  | 'ALL'
  | 'NA'    // North America
  | 'EU'    // Europe
  | 'APAC'  // Asia Pacific
  | 'LATAM' // Latin America
  | 'MEA';  // Middle East & Africa

/**
 * Core Feature Flag
 */
export interface FeatureFlag {
  /** Unique feature key (e.g., 'CHAT_REACTIONS', 'NEW_DISCOVERY_UI') */
  key: string;
  
  /** Display name for admin panel */
  name: string;
  
  /** Description of what this flag controls */
  description: string;
  
  /** Master switch - if false, feature is disabled for everyone */
  enabled: boolean;
  
  /** Regions where this feature is enabled */
  regions: RegionCode | RegionCode[];
  
  /** Platforms where this feature is enabled */
  platforms: Platform | Platform[];
  
  /** User segments that can access this feature */
  userSegments: UserSegment | UserSegment[];
  
  /** Percentage of eligible users who get the feature (0-100) */
  rolloutPercentage: number;
  
  /** Optional: Schedule when feature becomes active */
  startAt?: Timestamp | null;
  
  /** Optional: Schedule when feature becomes inactive */
  endAt?: Timestamp | null;
  
  /** Emergency kill switch - if true, feature is disabled immediately (overrides all) */
  killSwitch: boolean;
  
  /** Admin who last updated this flag */
  updatedBy: string;
  
  /** Last update timestamp */
  updatedAt: Timestamp;
  
  /** Creation timestamp */
  createdAt: Timestamp;
  
  /** Optional: Related experiment key if this flag is part of an A/B test */
  experimentKey?: string | null;
}

/**
 * Experiment Variant Configuration
 */
export interface ExperimentVariant {
  /** Unique variant identifier (typically A, B, C, etc.) */
  variantKey: string;
  
  /** Display name for this variant */
  name: string;
  
  /** Description of what this variant does */
  description: string;
  
  /** Percentage of users assigned to this variant (must sum to 100 across all variants) */
  rolloutPercentage: number;
  
  /** Feature flag overrides specific to this variant */
  featureOverrides: Record<string, any>;
  
  /** Whether this variant is active */
  enabled: boolean;
  
  /** Creation timestamp */
  createdAt: Timestamp;
}

/**
 * Experiment Configuration
 */
export interface Experiment {
  /** Unique experiment key */
  experimentKey: string;
  
  /** Display name */
  name: string;
  
  /** What is being tested */
  hypothesis: string;
  
  /** Experiment status */
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  
  /** Regions where experiment runs */
  regions: RegionCode | RegionCode[];
  
  /** Platforms where experiment runs */
  platforms: Platform | Platform[];
  
  /** User segments eligible for experiment */
  userSegments: UserSegment | UserSegment[];
  
  /** Metrics being tracked */
  metricsTracked: MetricType[];
  
  /** Start date */
  startAt: Timestamp;
  
  /** End date */
  endAt: Timestamp;
  
  /** Admin who created the experiment */
  createdBy: string;
  
  /** Creation timestamp */
  createdAt: Timestamp;
  
  /** Last update timestamp */
  updatedAt: Timestamp;
  
  /** Auto-disable if fraud spike detected */
  autoDisableOnFraud: boolean;
  
  /** Auto-disable if crash rate increases */
  autoDisableOnCrash: boolean;
  
  /** Minimum sample size before evaluating results */
  minSampleSize: number;
}

/**
 * Metric Types for A/B Testing
 */
export type MetricType =
  | 'CTR'              // Click-through rate
  | 'CHAT_START'       // Swipe → Chat conversion
  | 'PAID_CHAT'        // Paid chat activation
  | 'TOKEN_PURCHASE'   // Token purchase conversion
  | 'RETENTION_D1'     // Day 1 retention
  | 'RETENTION_D7'     // Day 7 retention
  | 'RETENTION_D30'    // Day 30 retention
  | 'EVENT_BOOKING'    // Calendar event bookings
  | 'AI_COMPANION'     // AI companion interactions
  | 'SUBSCRIPTION';    // Subscription conversions

/**
 * User's Experiment Assignment
 */
export interface ExperimentAssignment {
  /** User ID */
  userId: string;
  
  /** Experiment key */
  experimentKey: string;
  
  /** Assigned variant */
  variantKey: string;
  
  /** Assignment timestamp (users are sticky once assigned) */
  assignedAt: Timestamp;
  
  /** First exposure timestamp */
  firstExposureAt?: Timestamp | null;
  
  /** Number of times user saw this variant */
  exposureCount: number;
  
  /** Last exposure timestamp */
  lastExposureAt?: Timestamp | null;
}

/**
 * Experiment Exposure Event (for analytics)
 */
export interface ExperimentExposure {
  /** Unique exposure ID */
  exposureId: string;
  
  /** User ID */
  userId: string;
  
  /** Experiment key */
  experimentKey: string;
  
  /** Variant the user saw */
  variantKey: string;
  
  /** Timestamp of exposure */
  timestamp: Timestamp;
  
  /** Platform where exposure occurred */
  platform: Platform;
  
  /** Region where exposure occurred */
  region: RegionCode;
  
  /** Additional context */
  context?: Record<string, any>;
}

/**
 * Kill Switch Definition
 */
export interface KillSwitch {
  /** Unique kill switch key */
  key: string;
  
  /** Display name */
  name: string;
  
  /** What system/feature this controls */
  description: string;
  
  /** Whether kill switch is active (true = system is OFF) */
  active: boolean;
  
  /** Reason for activation */
  reason?: string | null;
  
  /** Admin who activated/deactivated */
  updatedBy: string;
  
  /** Timestamp of last change */
  updatedAt: Timestamp;
  
  /** Timestamp of activation (if currently active) */
  activatedAt?: Timestamp | null;
  
  /** Notification settings when activated */
  notifyOps: boolean;
  
  /** Related incident ID (from monitoring system) */
  incidentId?: string | null;
}

/**
 * Predefined Kill Switch Keys
 */
export enum KillSwitchKey {
  CHAT_GLOBAL = 'CHAT_GLOBAL',
  PAYMENTS_GLOBAL = 'PAYMENTS_GLOBAL',
  WITHDRAWALS_GLOBAL = 'WITHDRAWALS_GLOBAL',
  AI_COMPANIONS_GLOBAL = 'AI_COMPANIONS_GLOBAL',
  CALENDAR_BOOKINGS_GLOBAL = 'CALENDAR_BOOKINGS_GLOBAL',
  EVENTS_GLOBAL = 'EVENTS_GLOBAL',
  DISCOVERY_GLOBAL = 'DISCOVERY_GLOBAL',
  PUSH_NOTIFICATIONS_GLOBAL = 'PUSH_NOTIFICATIONS_GLOBAL',
}

/**
 * User Context for Feature Flag Evaluation
 */
export interface UserContext {
  userId: string;
  region: RegionCode;
  platform: Platform;
  userSegment: UserSegment;
  subscriptionTier?: 'FREE' | 'VIP' | 'ROYAL';
  createdAt: Timestamp;
  isCreator: boolean;
  isVip: boolean;
  isRoyal: boolean;
}

/**
 * Feature Flag Evaluation Result
 */
export interface FlagEvaluationResult {
  /** Flag key that was evaluated */
  flagKey: string;
  
  /** Whether the feature is enabled for this user */
  enabled: boolean;
  
  /** Reason for the result (for debugging) */
  reason: string;
  
  /** Related experiment variant (if any) */
  variantKey?: string | null;
  
  /** Timestamp of evaluation */
  evaluatedAt: Timestamp;
}

/**
 * Feature Flags Cache (Client-Side)
 */
export interface FeatureFlagsCache {
  /** User ID */
  userId: string;
  
  /** Cached flags */
  flags: Record<string, boolean>;
  
  /** Active experiment assignments */
  experiments: Record<string, string>; // experimentKey -> variantKey
  
  /** Cache timestamp */
  cachedAt: number;
  
  /** TTL in seconds (default: 900 = 15 minutes) */
  ttl: number;
}

/**
 * Experiment Metrics Snapshot
 */
export interface ExperimentMetrics {
  /** Experiment key */
  experimentKey: string;
  
  /** Variant key */
  variantKey: string;
  
  /** Sample size */
  sampleSize: number;
  
  /** Metrics by type */
  metrics: {
    [K in MetricType]?: {
      count: number;
      rate: number;
      conversionRate?: number;
    };
  };
  
  /** Statistical significance (if calculated) */
  significance?: number;
  
  /** Timestamp of snapshot */
  snapshotAt: Timestamp;
}

/**
 * Fraud/Crash Auto-Disable Event
 */
export interface AutoDisableEvent {
  /** Event ID */
  eventId: string;
  
  /** Experiment or flag that was disabled */
  targetKey: string;
  
  /** Type of target */
  targetType: 'EXPERIMENT' | 'FLAG';
  
  /** Variant that was disabled (if experiment) */
  variantKey?: string | null;
  
  /** Reason for auto-disable */
  reason: 'FRAUD_SPIKE' | 'CRASH_RATE_SPIKE' | 'SPAM_INCREASE' | 'CHARGEBACK_SPIKE';
  
  /** Metrics that triggered the disable */
  triggerMetrics: Record<string, number>;
  
  /** Timestamp of disable */
  disabledAt: Timestamp;
  
  /** Notification sent */
  notificationSent: boolean;
  
  /** Audit log entry ID */
  auditLogId: string;
}
