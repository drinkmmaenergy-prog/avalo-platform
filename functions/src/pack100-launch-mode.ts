/**
 * PACK 100 — Launch Mode System
 * 
 * Controls launch phases and gates onboarding based on readiness
 * Enables controlled scaling from internal testing to global launch
 * 
 * COMPLIANCE RULES:
 * - Launch modes DO NOT affect tokenomics or pricing
 * - No special rates, bonuses, or discounts per launch phase
 * - Revenue split remains 65/35 across all modes
 * - Only controls WHO can register and WHERE they access from
 */

import { db, serverTimestamp } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logBusinessEvent, logTechEvent } from './pack90-logging';
import * as functions from 'firebase-functions';

// ============================================================================
// TYPES
// ============================================================================

export type LaunchMode = 
  | 'INTERNAL_TEST'   // Allowlist only, unrestricted regions, heavy logging
  | 'CLOSED_BETA'     // Invite codes + region allowlist, gradual scaling
  | 'SOFT_LAUNCH'     // Open signup, limited regions, production load test
  | 'GLOBAL_LAUNCH';  // Open signup, all eligible regions, full marketing

export interface LaunchModeConfig {
  mode: LaunchMode;
  description: string;
  allowedCountries: string[] | 'ALL';  // ISO country codes or ALL
  requiresInviteCode: boolean;
  requiresAllowlist: boolean;
  maxDailySignups?: number;            // Optional rate limit
  enableHeavyLogging: boolean;
  updatedAt: Timestamp;
  updatedBy: string;
  reason?: string;
}

export interface LaunchModeState {
  currentMode: LaunchMode;
  config: LaunchModeConfig;
  transitionHistory: LaunchModeTransition[];
}

export interface LaunchModeTransition {
  fromMode: LaunchMode;
  toMode: LaunchMode;
  transitionedAt: Timestamp;
  transitionedBy: string;
  reason: string;
}

export interface SignupEligibilityCheck {
  allowed: boolean;
  reason?: string;
  requiresInviteCode?: boolean;
  allowedCountries?: string[];
}

// ============================================================================
// LAUNCH MODE CONFIGURATIONS
// ============================================================================

const LAUNCH_MODE_CONFIGS: Record<LaunchMode, Omit<LaunchModeConfig, 'updatedAt' | 'updatedBy' | 'reason'>> = {
  INTERNAL_TEST: {
    mode: 'INTERNAL_TEST',
    description: 'Internal testing with allowlist only',
    allowedCountries: 'ALL',
    requiresInviteCode: false,
    requiresAllowlist: true,
    maxDailySignups: 50,
    enableHeavyLogging: true,
  },
  CLOSED_BETA: {
    mode: 'CLOSED_BETA',
    description: 'Closed beta with invite codes and selected regions',
    allowedCountries: ['PL', 'DE', 'GB', 'FR', 'ES'],  // Initial European markets
    requiresInviteCode: true,
    requiresAllowlist: false,
    maxDailySignups: 500,
    enableHeavyLogging: true,
  },
  SOFT_LAUNCH: {
    mode: 'SOFT_LAUNCH',
    description: 'Soft launch in limited regions for production testing',
    allowedCountries: ['PL', 'DE', 'GB', 'FR', 'ES', 'IT', 'NL', 'BE', 'AT', 'CH'],
    requiresInviteCode: false,
    requiresAllowlist: false,
    maxDailySignups: 2000,
    enableHeavyLogging: false,
  },
  GLOBAL_LAUNCH: {
    mode: 'GLOBAL_LAUNCH',
    description: 'Global launch with all eligible regions',
    allowedCountries: 'ALL',
    requiresInviteCode: false,
    requiresAllowlist: false,
    enableHeavyLogging: false,
  },
};

// ============================================================================
// GET CURRENT LAUNCH MODE
// ============================================================================

const LAUNCH_MODE_DOC_ID = 'current_launch_mode';

/**
 * Get current launch mode configuration
 * Public function (no auth required)
 */
export async function getLaunchMode(): Promise<LaunchModeConfig> {
  try {
    const doc = await db.collection('system_config').doc(LAUNCH_MODE_DOC_ID).get();
    
    if (!doc.exists) {
      // Initialize with INTERNAL_TEST mode
      const initialConfig: LaunchModeConfig = {
        ...LAUNCH_MODE_CONFIGS.INTERNAL_TEST,
        updatedAt: Timestamp.now(),
        updatedBy: 'SYSTEM_INIT',
        reason: 'Initial system configuration',
      };
      
      await db.collection('system_config').doc(LAUNCH_MODE_DOC_ID).set(initialConfig);
      
      return initialConfig;
    }
    
    return doc.data() as LaunchModeConfig;
  } catch (error) {
    console.error('[LaunchMode] Error fetching launch mode:', error);
    
    // Fail safe to most restrictive mode
    return {
      ...LAUNCH_MODE_CONFIGS.INTERNAL_TEST,
      updatedAt: Timestamp.now(),
      updatedBy: 'SYSTEM_FALLBACK',
    };
  }
}

/**
 * Get current launch mode (callable function for clients)
 */
export const getLaunchMode_callable = functions.https.onCall(async () => {
  const config = await getLaunchMode();
  
  return {
    success: true,
    mode: config.mode,
    description: config.description,
    allowedCountries: config.allowedCountries,
    requiresInviteCode: config.requiresInviteCode,
  };
});

// ============================================================================
// SET LAUNCH MODE (ADMIN ONLY)
// ============================================================================

/**
 * Set launch mode (admin only)
 * Records transition history for audit trail
 */
export const admin_setLaunchMode = functions.https.onCall(async (data, context) => {
  // Require authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const adminUserId = context.auth.uid;
  
  // Check admin privileges
  const adminDoc = await db.collection('admin_users').doc(adminUserId).get();
  if (!adminDoc.exists || adminDoc.data()?.role !== 'ADMIN') {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }
  
  const { mode, reason } = data as { mode: LaunchMode; reason: string };
  
  // Validate mode
  if (!['INTERNAL_TEST', 'CLOSED_BETA', 'SOFT_LAUNCH', 'GLOBAL_LAUNCH'].includes(mode)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid launch mode');
  }
  
  if (!reason || reason.trim().length < 10) {
    throw new functions.https.HttpsError('invalid-argument', 'Reason must be at least 10 characters');
  }
  
  try {
    // Get current mode
    const currentConfig = await getLaunchMode();
    const previousMode = currentConfig.mode;
    
    // Don't allow transition if already in target mode
    if (previousMode === mode) {
      throw new functions.https.HttpsError('failed-precondition', `Already in ${mode} mode`);
    }
    
    // Create new config
    const newConfig: LaunchModeConfig = {
      ...LAUNCH_MODE_CONFIGS[mode],
      updatedAt: Timestamp.now(),
      updatedBy: adminUserId,
      reason: reason.trim(),
    };
    
    // Record transition
    const transition: LaunchModeTransition = {
      fromMode: previousMode,
      toMode: mode,
      transitionedAt: Timestamp.now(),
      transitionedBy: adminUserId,
      reason: reason.trim(),
    };
    
    // Update Firestore
    await db.runTransaction(async (transaction) => {
      const configRef = db.collection('system_config').doc(LAUNCH_MODE_DOC_ID);
      const historyRef = db.collection('launch_mode_history').doc();
      
      transaction.set(configRef, newConfig);
      transaction.set(historyRef, transition);
    });
    
    // Log business event
    await logBusinessEvent({
      eventType: 'ACCOUNT_STATUS_CHANGED',
      actorUserId: adminUserId,
      metadata: {
        action: 'LAUNCH_MODE_CHANGE',
        previousMode,
        newMode: mode,
        reason: reason.trim(),
      },
      source: 'ADMIN_PANEL',
      functionName: 'admin_setLaunchMode',
    });
    
    console.log(`[LaunchMode] Transitioned from ${previousMode} to ${mode} by admin ${adminUserId}`);
    
    return {
      success: true,
      previousMode,
      newMode: mode,
      config: newConfig,
    };
  } catch (error: any) {
    console.error('[LaunchMode] Error setting launch mode:', error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// SIGNUP ELIGIBILITY CHECKS
// ============================================================================

/**
 * Check if a user is eligible to sign up given current launch mode
 */
export async function checkSignupEligibility(
  countryCode: string,
  inviteCode?: string,
  userId?: string
): Promise<SignupEligibilityCheck> {
  try {
    const config = await getLaunchMode();
    
    // Check allowlist (for INTERNAL_TEST mode)
    if (config.requiresAllowlist) {
      if (!userId) {
        return {
          allowed: false,
          reason: 'ALLOWLIST_REQUIRED',
        };
      }
      
      const allowlistDoc = await db.collection('beta_allowlist').doc(userId).get();
      if (!allowlistDoc.exists) {
        return {
          allowed: false,
          reason: 'NOT_ON_ALLOWLIST',
        };
      }
    }
    
    // Check invite code (for CLOSED_BETA mode)
    if (config.requiresInviteCode) {
      if (!inviteCode) {
        return {
          allowed: false,
          reason: 'INVITE_CODE_REQUIRED',
          requiresInviteCode: true,
        };
      }
      
      const inviteDoc = await db.collection('invite_codes').doc(inviteCode).get();
      if (!inviteDoc.exists) {
        return {
          allowed: false,
          reason: 'INVALID_INVITE_CODE',
          requiresInviteCode: true,
        };
      }
      
      const inviteData = inviteDoc.data();
      if (inviteData?.used || (inviteData?.maxUses && inviteData.usedCount >= inviteData.maxUses)) {
        return {
          allowed: false,
          reason: 'INVITE_CODE_DEPLETED',
          requiresInviteCode: true,
        };
      }
    }
    
    // Check country restrictions
    if (config.allowedCountries !== 'ALL') {
      if (!config.allowedCountries.includes(countryCode)) {
        return {
          allowed: false,
          reason: 'COUNTRY_NOT_ALLOWED',
          allowedCountries: config.allowedCountries,
        };
      }
    }
    
    // Check daily signup limit (if configured)
    if (config.maxDailySignups) {
      const today = new Date().toISOString().split('T')[0];
      const dailyCountDoc = await db.collection('daily_signup_counts').doc(today).get();
      
      if (dailyCountDoc.exists) {
        const count = dailyCountDoc.data()?.count || 0;
        if (count >= config.maxDailySignups) {
          return {
            allowed: false,
            reason: 'DAILY_LIMIT_REACHED',
          };
        }
      }
    }
    
    return {
      allowed: true,
    };
  } catch (error) {
    console.error('[LaunchMode] Error checking signup eligibility:', error);
    
    // Fail safe - deny access
    return {
      allowed: false,
      reason: 'SYSTEM_ERROR',
    };
  }
}

/**
 * Record a successful signup (for daily limits)
 */
export async function recordSignup(): Promise<void> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const dailyCountRef = db.collection('daily_signup_counts').doc(today);
    
    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(dailyCountRef);
      
      if (doc.exists) {
        transaction.update(dailyCountRef, {
          count: (doc.data()?.count || 0) + 1,
          updatedAt: serverTimestamp(),
        });
      } else {
        transaction.set(dailyCountRef, {
          date: today,
          count: 1,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    });
  } catch (error) {
    console.error('[LaunchMode] Error recording signup:', error);
    // Non-blocking
  }
}

// ============================================================================
// GET LAUNCH MODE HISTORY
// ============================================================================

/**
 * Get launch mode transition history (admin only)
 */
export const admin_getLaunchModeHistory = functions.https.onCall(async (data, context) => {
  // Require authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  // Check admin privileges
  const adminDoc = await db.collection('admin_users').doc(context.auth.uid).get();
  if (!adminDoc.exists || adminDoc.data()?.role !== 'ADMIN') {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }
  
  try {
    const snapshot = await db.collection('launch_mode_history')
      .orderBy('transitionedAt', 'desc')
      .limit(50)
      .get();
    
    const history = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      transitionedAt: doc.data().transitionedAt.toMillis(),
    }));
    
    return {
      success: true,
      history,
    };
  } catch (error: any) {
    console.error('[LaunchMode] Error fetching history:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});