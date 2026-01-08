/**
 * PACK 87 — Enforcement & Account State Machine
 * TypeScript types for enforcement system
 */

import { Timestamp } from 'firebase-admin/firestore';

// ========================================================================
// ACCOUNT STATUS
// ========================================================================

export type AccountStatus = 
  | 'ACTIVE'              // No restrictions, normal operation
  | 'SOFT_RESTRICTED'     // Soft limitations (throttling, lower visibility)
  | 'HARD_RESTRICTED'     // Many actions blocked, read-only mode
  | 'SUSPENDED';          // Cannot login or use app

// ========================================================================
// VISIBILITY TIERS
// ========================================================================

export type VisibilityTier =
  | 'NORMAL'    // Full discoverability
  | 'LOW'       // Reduced visibility in feeds
  | 'HIDDEN';   // Not shown in discovery at all

// ========================================================================
// FEATURE CODES
// ========================================================================

export type FeatureCode =
  | 'SEND_MESSAGES'
  | 'SEND_GIFTS'
  | 'SEND_PAID_MEDIA'
  | 'PUBLISH_PREMIUM_STORIES'
  | 'REQUEST_PAYOUTS'
  | 'ACCESS_DISCOVERY_FEED'
  | 'EDIT_PROFILE'
  | 'CREATE_NEW_ACCOUNTS'
  | 'START_VOICE_CALLS'
  | 'START_VIDEO_CALLS'
  | 'SEND_GEOSHARE';

// ========================================================================
// REASON CODES
// ========================================================================

export type ReasonCode =
  | 'RISK_SCORE_HIGH'
  | 'CONFIRMED_SCAM_REPORTS'
  | 'POTENTIAL_SPAMMER'
  | 'POTENTIAL_SCAMMER'
  | 'KYC_BLOCKED'
  | 'KYC_REJECTED'
  | 'PAYMENT_FRAUD_RISK'
  | 'HIGH_REPORT_RATE'
  | 'AGGRESSIVE_SENDER'
  | 'MANUAL_ADMIN_ACTION';

// ========================================================================
// ACTION CODES (for permission checks)
// ========================================================================

export type ActionCode =
  | 'ACTION_SEND_MESSAGE'
  | 'ACTION_SEND_GIFT'
  | 'ACTION_SEND_PAID_MEDIA'
  | 'ACTION_PUBLISH_PREMIUM_STORY'
  | 'ACTION_REQUEST_PAYOUT'
  | 'ACTION_ACCESS_DISCOVERY'
  | 'ACTION_EDIT_PROFILE'
  | 'ACTION_START_VOICE_CALL'
  | 'ACTION_START_VIDEO_CALL'
  | 'ACTION_SEND_GEOSHARE';

// ========================================================================
// ENFORCEMENT LEVEL (for permission check results)
// ========================================================================

export type EnforcementLevel =
  | 'NONE'        // Action allowed
  | 'SOFT_LIMIT'  // Action allowed but throttled
  | 'HARD_LIMIT'  // Action blocked
  | 'SUSPENDED';  // Account suspended

// ========================================================================
// DATA MODELS
// ========================================================================

/**
 * User Enforcement State (Firestore document)
 * Collection: user_enforcement_state
 * Document ID: userId
 */
export interface UserEnforcementState {
  userId: string;
  accountStatus: AccountStatus;
  featureLocks: FeatureCode[];
  visibilityTier: VisibilityTier;
  reasonCodes: ReasonCode[];
  trustScoreSnapshot: number;
  lastUpdatedAt: Timestamp;
  manualOverride: boolean;
  reviewerId?: string;        // Admin who set manual override
  reviewNote?: string;         // Admin note for manual override
}

/**
 * Enforcement Audit Log (optional)
 * Collection: enforcement_audit
 * Document ID: auto-generated
 */
export interface EnforcementAudit {
  id: string;
  userId: string;
  action: 'STATE_UPDATED' | 'MANUAL_OVERRIDE' | 'AUTOMATIC_UPDATE';
  previousState: {
    accountStatus: AccountStatus;
    featureLocks: FeatureCode[];
    visibilityTier: VisibilityTier;
  };
  newState: {
    accountStatus: AccountStatus;
    featureLocks: FeatureCode[];
    visibilityTier: VisibilityTier;
  };
  reasonCodes: ReasonCode[];
  triggeredBy: string;        // 'SYSTEM' or admin userId
  createdAt: Timestamp;
}

/**
 * Permission Check Result
 */
export interface PermissionCheckResult {
  allowed: boolean;
  enforcementLevel: EnforcementLevel;
  reasonCodes: ReasonCode[];
  message?: string;
}

// ========================================================================
// CONFIGURATION
// ========================================================================

/**
 * Enforcement Configuration
 * Maps risk scores and flags to enforcement states
 */
export interface EnforcementConfig {
  // Risk score thresholds
  riskThresholds: {
    softRestricted: number;   // Default: 25
    hardRestricted: number;   // Default: 50
    suspended: number;        // Default: 75 (optional, typically uses flags)
  };

  // Feature locks based on flags
  flagToFeatureLocks: {
    [flag: string]: FeatureCode[];
  };

  // Account status based on flags (override risk score)
  flagToAccountStatus: {
    [flag: string]: AccountStatus;
  };

  // Visibility tier based on flags
  flagToVisibilityTier: {
    [flag: string]: VisibilityTier;
  };
}

// ========================================================================
// MAPPING HELPERS
// ========================================================================

/**
 * Map action codes to feature codes
 */
export const ACTION_TO_FEATURE_MAP: Record<ActionCode, FeatureCode | null> = {
  ACTION_SEND_MESSAGE: 'SEND_MESSAGES',
  ACTION_SEND_GIFT: 'SEND_GIFTS',
  ACTION_SEND_PAID_MEDIA: 'SEND_PAID_MEDIA',
  ACTION_PUBLISH_PREMIUM_STORY: 'PUBLISH_PREMIUM_STORIES',
  ACTION_REQUEST_PAYOUT: 'REQUEST_PAYOUTS',
  ACTION_ACCESS_DISCOVERY: 'ACCESS_DISCOVERY_FEED',
  ACTION_EDIT_PROFILE: 'EDIT_PROFILE',
  ACTION_START_VOICE_CALL: 'START_VOICE_CALLS',
  ACTION_START_VIDEO_CALL: 'START_VIDEO_CALLS',
  ACTION_SEND_GEOSHARE: 'SEND_GEOSHARE',
};

/**
 * Default enforcement configuration
 */
export const DEFAULT_ENFORCEMENT_CONFIG: EnforcementConfig = {
  riskThresholds: {
    softRestricted: 25,
    hardRestricted: 50,
    suspended: 75,
  },

  // Map trust flags to feature locks
  flagToFeatureLocks: {
    'POTENTIAL_SPAMMER': ['SEND_MESSAGES', 'START_VOICE_CALLS', 'START_VIDEO_CALLS'],
    'POTENTIAL_SCAMMER': ['SEND_GIFTS', 'SEND_PAID_MEDIA', 'REQUEST_PAYOUTS', 'PUBLISH_PREMIUM_STORIES'],
    'PAYMENT_FRAUD_RISK': ['REQUEST_PAYOUTS', 'SEND_GIFTS', 'SEND_PAID_MEDIA'],
    'KYC_BLOCKED': ['REQUEST_PAYOUTS'],
    'KYC_FRAUD_RISK': ['REQUEST_PAYOUTS'],
    'AGGRESSIVE_SENDER': ['SEND_MESSAGES', 'SEND_GIFTS'],
  },

  // Map trust flags to account status (overrides risk score)
  flagToAccountStatus: {
    'KYC_BLOCKED': 'HARD_RESTRICTED',
    'PAYMENT_FRAUD_RISK': 'HARD_RESTRICTED',
  },

  // Map trust flags to visibility tier
  flagToVisibilityTier: {
    'POTENTIAL_SPAMMER': 'LOW',
    'POTENTIAL_SCAMMER': 'LOW',
    'HIGH_REPORT_RATE': 'LOW',
    'AGGRESSIVE_SENDER': 'LOW',
  },
};