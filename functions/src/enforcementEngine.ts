/**
 * PACK 87 — Enforcement & Account State Machine
 * Core enforcement logic and state management
 */

import { db, serverTimestamp, generateId } from './init';
import { onManualEnforcementAction } from './moderationCaseHooks';
import {
  AccountStatus,
  VisibilityTier,
  FeatureCode,
  ReasonCode,
  UserEnforcementState,
  EnforcementAudit,
  PermissionCheckResult,
  ActionCode,
  EnforcementLevel,
  DEFAULT_ENFORCEMENT_CONFIG,
  ACTION_TO_FEATURE_MAP,
} from './types/enforcement.types';
import type { Timestamp } from 'firebase-admin/firestore';

// ========================================================================
// CONSTANTS
// ========================================================================

const COLLECTIONS = {
  ENFORCEMENT_STATE: 'user_enforcement_state',
  ENFORCEMENT_AUDIT: 'enforcement_audit',
  TRUST_PROFILE: 'user_trust_profile',
  KYC_STATUS: 'user_kyc_status',
} as const;

const CONFIG = DEFAULT_ENFORCEMENT_CONFIG;

// ========================================================================
// CORE ENFORCEMENT LOGIC
// ========================================================================

/**
 * Determine account status based on risk score and flags
 */
function determineAccountStatus(riskScore: number, flags: string[]): AccountStatus {
  // Check flag-based overrides first
  for (const flag of flags) {
    if (CONFIG.flagToAccountStatus[flag]) {
      return CONFIG.flagToAccountStatus[flag];
    }
  }

  // Check risk score thresholds
  if (riskScore >= CONFIG.riskThresholds.suspended) {
    return 'SUSPENDED';
  } else if (riskScore >= CONFIG.riskThresholds.hardRestricted) {
    return 'HARD_RESTRICTED';
  } else if (riskScore >= CONFIG.riskThresholds.softRestricted) {
    return 'SOFT_RESTRICTED';
  }

  return 'ACTIVE';
}

/**
 * Determine feature locks based on flags
 */
function determineFeatureLocks(flags: string[], kycStatus?: string): FeatureCode[] {
  const locks = new Set<FeatureCode>();

  // Apply flag-based locks
  for (const flag of flags) {
    const flagLocks = CONFIG.flagToFeatureLocks[flag];
    if (flagLocks) {
      flagLocks.forEach(lock => locks.add(lock));
    }
  }

  // Apply KYC-based locks
  if (kycStatus === 'BLOCKED' || kycStatus === 'REJECTED') {
    locks.add('REQUEST_PAYOUTS');
  }

  return Array.from(locks);
}

/**
 * Determine visibility tier based on risk score and flags
 */
function determineVisibilityTier(riskScore: number, flags: string[]): VisibilityTier {
  // Check flag-based visibility
  for (const flag of flags) {
    if (CONFIG.flagToVisibilityTier[flag]) {
      // If any flag requires LOW visibility, use that
      if (CONFIG.flagToVisibilityTier[flag] === 'LOW') {
        return 'LOW';
      }
    }
  }

  // High risk score = low visibility
  if (riskScore >= CONFIG.riskThresholds.hardRestricted) {
    return 'LOW';
  } else if (riskScore >= CONFIG.riskThresholds.softRestricted) {
    return 'LOW';
  }

  return 'NORMAL';
}

/**
 * Extract reason codes from trust flags
 */
function extractReasonCodes(flags: string[], riskScore: number, kycStatus?: string): ReasonCode[] {
  const reasons = new Set<ReasonCode>();

  // Risk score based
  if (riskScore >= CONFIG.riskThresholds.hardRestricted) {
    reasons.add('RISK_SCORE_HIGH');
  }

  // KYC based
  if (kycStatus === 'BLOCKED') {
    reasons.add('KYC_BLOCKED');
  } else if (kycStatus === 'REJECTED') {
    reasons.add('KYC_REJECTED');
  }

  // Trust flag based
  const flagMap: Record<string, ReasonCode> = {
    'POTENTIAL_SPAMMER': 'POTENTIAL_SPAMMER',
    'POTENTIAL_SCAMMER': 'POTENTIAL_SCAMMER',
    'PAYMENT_FRAUD_RISK': 'PAYMENT_FRAUD_RISK',
    'HIGH_REPORT_RATE': 'HIGH_REPORT_RATE',
    'AGGRESSIVE_SENDER': 'AGGRESSIVE_SENDER',
  };

  for (const flag of flags) {
    if (flagMap[flag]) {
      reasons.add(flagMap[flag]);
    }
  }

  return Array.from(reasons);
}

// ========================================================================
// STATE MANAGEMENT
// ========================================================================

/**
 * Recalculate enforcement state for a user
 * Called automatically after trust risk updates
 */
export async function recalculateEnforcementState(userId: string): Promise<void> {
  try {
    console.log(`[Enforcement] Recalculating state for user ${userId}`);

    // Fetch current enforcement state
    const enforcementDoc = await db.collection(COLLECTIONS.ENFORCEMENT_STATE).doc(userId).get();
    const currentState = enforcementDoc.data() as UserEnforcementState | undefined;

    // If manual override is set, only update trustScoreSnapshot
    if (currentState?.manualOverride) {
      console.log(`[Enforcement] User ${userId} has manual override, skipping automatic update`);
      
      // Still update trust score snapshot for reference
      const trustDoc = await db.collection(COLLECTIONS.TRUST_PROFILE).doc(userId).get();
      const trustProfile = trustDoc.data();
      
      if (trustProfile) {
        await db.collection(COLLECTIONS.ENFORCEMENT_STATE).doc(userId).update({
          trustScoreSnapshot: trustProfile.riskScore || 0,
          lastUpdatedAt: serverTimestamp(),
        });
      }
      
      return;
    }

    // Fetch trust profile
    const trustDoc = await db.collection(COLLECTIONS.TRUST_PROFILE).doc(userId).get();
    const trustProfile = trustDoc.data();

    // Fetch KYC status
    const kycDoc = await db.collection(COLLECTIONS.KYC_STATUS).doc(userId).get();
    const kycStatus = kycDoc.data()?.status;

    // Default values if trust profile doesn't exist yet
    const riskScore = trustProfile?.riskScore || 10; // Default base score
    const flags: string[] = trustProfile?.flags || [];

    // Calculate new state
    const accountStatus = determineAccountStatus(riskScore, flags);
    const featureLocks = determineFeatureLocks(flags, kycStatus);
    const visibilityTier = determineVisibilityTier(riskScore, flags);
    const reasonCodes = extractReasonCodes(flags, riskScore, kycStatus);

    const newState: UserEnforcementState = {
      userId,
      accountStatus,
      featureLocks,
      visibilityTier,
      reasonCodes,
      trustScoreSnapshot: riskScore,
      lastUpdatedAt: serverTimestamp() as Timestamp,
      manualOverride: false,
    };

    // Save new state
    await db.collection(COLLECTIONS.ENFORCEMENT_STATE).doc(userId).set(newState, { merge: true });

    // Log audit trail if state changed
    if (currentState && hasStateChanged(currentState, newState)) {
      await logEnforcementAudit(userId, currentState, newState, 'SYSTEM');
    }

    console.log(`[Enforcement] State updated for user ${userId}: ${accountStatus}`);
  } catch (error) {
    console.error(`[Enforcement] Error recalculating state for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Check if enforcement state has changed
 */
function hasStateChanged(oldState: UserEnforcementState, newState: UserEnforcementState): boolean {
  return (
    oldState.accountStatus !== newState.accountStatus ||
    oldState.visibilityTier !== newState.visibilityTier ||
    JSON.stringify(oldState.featureLocks.sort()) !== JSON.stringify(newState.featureLocks.sort())
  );
}

/**
 * Set manual enforcement state (admin override)
 */
export async function setManualEnforcementState(
  userId: string,
  payload: {
    accountStatus: AccountStatus;
    featureLocks?: FeatureCode[];
    visibilityTier?: VisibilityTier;
    reasonCodes?: ReasonCode[];
    reviewerId: string;
    reviewNote: string;
  }
): Promise<void> {
  try {
    console.log(`[Enforcement] Setting manual override for user ${userId} by ${payload.reviewerId}`);

    // Fetch current state
    const enforcementDoc = await db.collection(COLLECTIONS.ENFORCEMENT_STATE).doc(userId).get();
    const currentState = enforcementDoc.data() as UserEnforcementState | undefined;

    // Fetch trust score for snapshot
    const trustDoc = await db.collection(COLLECTIONS.TRUST_PROFILE).doc(userId).get();
    const trustProfile = trustDoc.data();
    const riskScore = trustProfile?.riskScore || 10;

    const newState: UserEnforcementState = {
      userId,
      accountStatus: payload.accountStatus,
      featureLocks: payload.featureLocks || [],
      visibilityTier: payload.visibilityTier || 'NORMAL',
      reasonCodes: [...(payload.reasonCodes || []), 'MANUAL_ADMIN_ACTION'],
      trustScoreSnapshot: riskScore,
      lastUpdatedAt: serverTimestamp() as Timestamp,
      manualOverride: true,
      reviewerId: payload.reviewerId,
      reviewNote: payload.reviewNote,
    };

    // Save manual state
    await db.collection(COLLECTIONS.ENFORCEMENT_STATE).doc(userId).set(newState);

    // Log audit trail
    if (currentState) {
      await logEnforcementAudit(userId, currentState, newState, payload.reviewerId);
    }

    // PACK 88: Create moderation case for enforcement action
    try {
      await onManualEnforcementAction(userId, payload.accountStatus, payload.reviewerId, payload.reviewNote);
    } catch (error) {
      console.error('Failed to create moderation case for enforcement action:', error);
      // Don't fail the enforcement if case creation fails
    }

    console.log(`[Enforcement] Manual override applied for user ${userId}`);
  } catch (error) {
    console.error(`[Enforcement] Error setting manual state for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Remove manual override and return to automatic enforcement
 */
export async function removeManualOverride(userId: string): Promise<void> {
  try {
    console.log(`[Enforcement] Removing manual override for user ${userId}`);

    // Simply set manualOverride to false and trigger recalculation
    await db.collection(COLLECTIONS.ENFORCEMENT_STATE).doc(userId).update({
      manualOverride: false,
      reviewerId: null,
      reviewNote: null,
    });

    // Recalculate state automatically
    await recalculateEnforcementState(userId);

    console.log(`[Enforcement] Manual override removed for user ${userId}`);
  } catch (error) {
    console.error(`[Enforcement] Error removing manual override for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Initialize enforcement state for a new user
 */
export async function initializeEnforcementState(userId: string): Promise<void> {
  try {
    const existingDoc = await db.collection(COLLECTIONS.ENFORCEMENT_STATE).doc(userId).get();
    
    if (existingDoc.exists) {
      console.log(`[Enforcement] State already exists for user ${userId}`);
      return;
    }

    const initialState: UserEnforcementState = {
      userId,
      accountStatus: 'ACTIVE',
      featureLocks: [],
      visibilityTier: 'NORMAL',
      reasonCodes: [],
      trustScoreSnapshot: 10,
      lastUpdatedAt: serverTimestamp() as Timestamp,
      manualOverride: false,
    };

    await db.collection(COLLECTIONS.ENFORCEMENT_STATE).doc(userId).set(initialState);
    console.log(`[Enforcement] Initialized state for new user ${userId}`);
  } catch (error) {
    console.error(`[Enforcement] Error initializing state for user ${userId}:`, error);
    throw error;
  }
}

// ========================================================================
// PERMISSION CHECKS
// ========================================================================

/**
 * Check if user can perform an action
 */
export async function canUserPerformAction(
  userId: string,
  actionCode: ActionCode
): Promise<PermissionCheckResult> {
  try {
    // Fetch enforcement state
    const enforcementDoc = await db.collection(COLLECTIONS.ENFORCEMENT_STATE).doc(userId).get();
    
    if (!enforcementDoc.exists) {
      // No enforcement state = new user = allowed
      return {
        allowed: true,
        enforcementLevel: 'NONE',
        reasonCodes: [],
      };
    }

    const state = enforcementDoc.data() as UserEnforcementState;

    // Check account status first
    if (state.accountStatus === 'SUSPENDED') {
      return {
        allowed: false,
        enforcementLevel: 'SUSPENDED',
        reasonCodes: state.reasonCodes,
        message: 'Account is suspended',
      };
    }

    // Check if specific feature is locked
    const requiredFeature = ACTION_TO_FEATURE_MAP[actionCode];
    if (requiredFeature && state.featureLocks.includes(requiredFeature)) {
      return {
        allowed: false,
        enforcementLevel: 'HARD_LIMIT',
        reasonCodes: state.reasonCodes,
        message: 'Feature is locked',
      };
    }

    // HARD_RESTRICTED blocks certain actions
    if (state.accountStatus === 'HARD_RESTRICTED') {
      const blockedActions: ActionCode[] = [
        'ACTION_SEND_MESSAGE',
        'ACTION_SEND_GIFT',
        'ACTION_SEND_PAID_MEDIA',
        'ACTION_PUBLISH_PREMIUM_STORY',
        'ACTION_REQUEST_PAYOUT',
        'ACTION_SEND_GEOSHARE',
      ];

      if (blockedActions.includes(actionCode)) {
        return {
          allowed: false,
          enforcementLevel: 'HARD_LIMIT',
          reasonCodes: state.reasonCodes,
          message: 'Account is restricted',
        };
      }
    }

    // SOFT_RESTRICTED allows actions but signals throttling
    if (state.accountStatus === 'SOFT_RESTRICTED') {
      return {
        allowed: true,
        enforcementLevel: 'SOFT_LIMIT',
        reasonCodes: state.reasonCodes,
        message: 'Account has soft restrictions',
      };
    }

    // ACTIVE = allowed
    return {
      allowed: true,
      enforcementLevel: 'NONE',
      reasonCodes: [],
    };
  } catch (error) {
    console.error(`[Enforcement] Error checking permission for user ${userId}, action ${actionCode}:`, error);
    
    // Default to allowing action if enforcement system fails
    // This ensures app doesn't break if enforcement has issues
    return {
      allowed: true,
      enforcementLevel: 'NONE',
      reasonCodes: [],
      message: 'Permission check failed, defaulting to allowed',
    };
  }
}

/**
 * Get enforcement state for a user (sanitized for client consumption)
 */
export async function getEnforcementState(userId: string): Promise<UserEnforcementState | null> {
  try {
    const doc = await db.collection(COLLECTIONS.ENFORCEMENT_STATE).doc(userId).get();
    
    if (!doc.exists) {
      return null;
    }

    return doc.data() as UserEnforcementState;
  } catch (error) {
    console.error(`[Enforcement] Error getting state for user ${userId}:`, error);
    throw error;
  }
}

// ========================================================================
// AUDIT LOGGING
// ========================================================================

/**
 * Log enforcement state change to audit trail
 */
async function logEnforcementAudit(
  userId: string,
  previousState: UserEnforcementState,
  newState: UserEnforcementState,
  triggeredBy: string
): Promise<void> {
  try {
    const auditLog: EnforcementAudit = {
      id: generateId(),
      userId,
      action: triggeredBy === 'SYSTEM' ? 'AUTOMATIC_UPDATE' : 'MANUAL_OVERRIDE',
      previousState: {
        accountStatus: previousState.accountStatus,
        featureLocks: previousState.featureLocks,
        visibilityTier: previousState.visibilityTier,
      },
      newState: {
        accountStatus: newState.accountStatus,
        featureLocks: newState.featureLocks,
        visibilityTier: newState.visibilityTier,
      },
      reasonCodes: newState.reasonCodes,
      triggeredBy,
      createdAt: serverTimestamp() as Timestamp,
    };

    await db.collection(COLLECTIONS.ENFORCEMENT_AUDIT).add(auditLog);
    console.log(`[Enforcement] Audit logged for user ${userId}`);
  } catch (error) {
    console.error(`[Enforcement] Error logging audit for user ${userId}:`, error);
    // Don't throw - audit failure shouldn't block enforcement
  }
}