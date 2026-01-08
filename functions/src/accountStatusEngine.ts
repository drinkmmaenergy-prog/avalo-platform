/**
 * Account Status & Automatic Sanctions Engine
 * Phase 30C-1: Backend-only account status management
 * 
 * CRITICAL: This module is 100% ADDITIVE.
 * - NO changes to monetization logic
 * - NO changes to existing features
 * - Automatic escalation based on violation counts
 * - Immediate bans for HIGH/CRITICAL violations
 * 
 * @module accountStatusEngine
 */

import { db, serverTimestamp, increment } from './init';
import * as functions from 'firebase-functions';

// Simple logger
const logger = {
  info: (..._args: any[]) => {},
  warn: (..._args: any[]) => {},
  error: (..._args: any[]) => {},
};

// ============================================================================
// TYPES
// ============================================================================

export type AccountStatus =
  | 'ACTIVE'
  | 'WARNING'
  | 'RESTRICTED'
  | 'SUSPENDED'
  | 'BANNED_PERMANENT'
  | 'SHADOW_RESTRICTED'
  | 'REVIEW';

export interface AccountStatusRecord {
  status: AccountStatus;
  statusExpiresAt: number | null;
  reason?: string;
  violationCount?: number;
  lastUpdatedAt: any; // Timestamp
}

export interface ViolationContext {
  userId: string;
  violationCategory: string;
  severity: string;
  source: string;
  metadata?: Record<string, any>;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Duration in milliseconds for different restriction types
 */
const RESTRICTION_DURATIONS = {
  RESTRICTED_7_DAYS: 7 * 24 * 60 * 60 * 1000,
  SUSPENDED_7_DAYS: 7 * 24 * 60 * 60 * 1000,
  SUSPENDED_30_DAYS: 30 * 24 * 60 * 60 * 1000,
};

/**
 * High severity categories that trigger immediate permanent ban
 */
const IMMEDIATE_BAN_CATEGORIES = [
  'CSAM',
  'EXTREMISM',
  'SELF_HARM',
  'VIOLENCE',
];

/**
 * Severity levels that trigger immediate ban
 */
const IMMEDIATE_BAN_SEVERITIES = ['HIGH', 'CRITICAL'];

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Apply sanctions based on violation context
 * This is the main function called by other engines
 */
export async function applySanctions(context: ViolationContext): Promise<void> {
  try {
    const { userId, violationCategory, severity, source } = context;
    
    logger.warn(`Applying sanctions for user ${userId}: ${violationCategory}/${severity} from ${source}`);
    
    // Check if this is an immediate ban category with HIGH/CRITICAL severity
    const shouldImmediatelyBan = 
      IMMEDIATE_BAN_CATEGORIES.includes(violationCategory) &&
      IMMEDIATE_BAN_SEVERITIES.includes(severity);
    
    if (shouldImmediatelyBan) {
      // Immediate permanent ban
      await applyStatus(userId, 'BANNED_PERMANENT', null, 
        `${violationCategory} violation - ${severity} severity`);
      logger.error(`PERMANENT BAN applied to user ${userId} for ${violationCategory}`);
      return;
    }
    
    // Get current violation count
    const statsRef = db.collection('userModerationStats').doc(userId);
    const statsSnap = await statsRef.get();
    
    let totalViolations = 0;
    
    if (statsSnap.exists) {
      const stats = statsSnap.data();
      totalViolations = (stats?.totalIncidents || 0) + 1;
    } else {
      totalViolations = 1;
    }
    
    // Apply escalation based on total violations
    await applyEscalation(userId, totalViolations, violationCategory);
    
  } catch (error: any) {
    logger.error(`Error applying sanctions for user ${context.userId}:`, error);
    throw error;
  }
}

/**
 * Apply escalation based on violation count
 */
async function applyEscalation(
  userId: string,
  violationCount: number,
  category: string
): Promise<void> {
  
  let newStatus: AccountStatus;
  let expiresAt: number | null = null;
  let reason: string;
  
  switch (violationCount) {
    case 1:
      newStatus = 'WARNING';
      reason = 'First violation detected';
      break;
      
    case 2:
      newStatus = 'RESTRICTED';
      expiresAt = Date.now() + RESTRICTION_DURATIONS.RESTRICTED_7_DAYS;
      reason = 'Second violation - 7 day restriction';
      break;
      
    case 3:
      newStatus = 'SUSPENDED';
      expiresAt = Date.now() + RESTRICTION_DURATIONS.SUSPENDED_7_DAYS;
      reason = 'Third violation - 7 day suspension';
      break;
      
    case 4:
      newStatus = 'SUSPENDED';
      expiresAt = Date.now() + RESTRICTION_DURATIONS.SUSPENDED_30_DAYS;
      reason = 'Fourth violation - 30 day suspension';
      break;
      
    case 5:
    default:
      newStatus = 'BANNED_PERMANENT';
      expiresAt = null;
      reason = 'Fifth or more violations - permanent ban';
      break;
  }
  
  await applyStatus(userId, newStatus, expiresAt, reason);
  
  logger.warn(`Escalation applied to user ${userId}: ${newStatus} (violation #${violationCount})`);
}

/**
 * Apply account status to user
 */
async function applyStatus(
  userId: string,
  status: AccountStatus,
  expiresAt: number | null,
  reason: string
): Promise<void> {
  
  const userRef = db.collection('users').doc(userId);
  
  const updates: any = {
    accountStatus: status,
    statusExpiresAt: expiresAt,
    accountStatusReason: reason,
    accountStatusUpdatedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  
  // For shadow restrictions, also set shadowbanned flag
  if (status === 'SHADOW_RESTRICTED') {
    updates.shadowbanned = true;
  }
  
  // For permanent bans, ensure all blocks are in place
  if (status === 'BANNED_PERMANENT') {
    updates.shadowbanned = true;
    updates['safety.contentCreationBlocked'] = true;
    updates['safety.safetyVisibilityBlocked'] = true;
  }
  
  await userRef.update(updates);
  
  logger.info(`Account status applied: ${userId} -> ${status}, expires: ${expiresAt ? new Date(expiresAt).toISOString() : 'never'}`);
}

/**
 * Get account status for a user
 * This is the helper function used by other modules
 */
export async function getAccountStatus(uid: string): Promise<AccountStatus> {
  try {
    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();
    
    if (!userSnap.exists) {
      return 'ACTIVE'; // Default for non-existent users
    }
    
    const userData = userSnap.data();
    const currentStatus = userData?.accountStatus || 'ACTIVE';
    const expiresAt = userData?.statusExpiresAt;
    
    // Check if temporary status has expired
    if (expiresAt && expiresAt < Date.now()) {
      // Status expired, revert to ACTIVE
      await userRef.update({
        accountStatus: 'ACTIVE',
        statusExpiresAt: null,
        accountStatusReason: 'Restriction period expired',
        accountStatusUpdatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      
      logger.info(`Status expired for user ${uid}, reverted to ACTIVE`);
      return 'ACTIVE';
    }
    
    return currentStatus as AccountStatus;
    
  } catch (error: any) {
    logger.error(`Error getting account status for ${uid}:`, error);
    return 'ACTIVE'; // Fail-safe to ACTIVE
  }
}

/**
 * Get detailed account status record
 */
export async function getAccountStatusRecord(uid: string): Promise<AccountStatusRecord> {
  try {
    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();
    
    if (!userSnap.exists) {
      return {
        status: 'ACTIVE',
        statusExpiresAt: null,
        lastUpdatedAt: serverTimestamp(),
      };
    }
    
    const userData = userSnap.data();
    const currentStatus = userData?.accountStatus || 'ACTIVE';
    const expiresAt = userData?.statusExpiresAt || null;
    
    // Check if temporary status has expired
    if (expiresAt && expiresAt < Date.now()) {
      // Status expired, revert to ACTIVE
      await userRef.update({
        accountStatus: 'ACTIVE',
        statusExpiresAt: null,
        accountStatusReason: 'Restriction period expired',
        accountStatusUpdatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      
      return {
        status: 'ACTIVE',
        statusExpiresAt: null,
        reason: 'Restriction period expired',
        lastUpdatedAt: serverTimestamp(),
      };
    }
    
    // Get violation count from moderation stats
    const statsRef = db.collection('userModerationStats').doc(uid);
    const statsSnap = await statsRef.get();
    const violationCount = statsSnap.exists ? (statsSnap.data()?.totalIncidents || 0) : 0;
    
    return {
      status: currentStatus as AccountStatus,
      statusExpiresAt: expiresAt,
      reason: userData?.accountStatusReason,
      violationCount,
      lastUpdatedAt: userData?.accountStatusUpdatedAt || serverTimestamp(),
    };
    
  } catch (error: any) {
    logger.error(`Error getting account status record for ${uid}:`, error);
    return {
      status: 'ACTIVE',
      statusExpiresAt: null,
      lastUpdatedAt: serverTimestamp(),
    };
  }
}

/**
 * Callable Cloud Function: Get account status
 */
export const account_getStatus = async (
  data: any,
  context: functions.https.CallableContext
): Promise<{ status: AccountStatus; statusExpiresAt: number | null }> => {
  
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const uid = context.auth.uid;
  
  try {
    const record = await getAccountStatusRecord(uid);
    
    return {
      status: record.status,
      statusExpiresAt: record.statusExpiresAt,
    };
  } catch (error: any) {
    logger.error('Error in account_getStatus:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
};

// ============================================================================
// INTEGRATION HOOKS
// ============================================================================

/**
 * Hook for contentModerationEngine
 * Called after content moderation detects a violation
 */
export async function onContentViolation(
  userId: string,
  category: string,
  severity: string,
  source: string
): Promise<void> {
  await applySanctions({
    userId,
    violationCategory: category,
    severity,
    source: `contentModeration:${source}`,
  });
}

/**
 * Hook for csamShield
 * Called when CSAM is detected
 */
export async function onCsamDetection(
  userId: string,
  riskLevel: string,
  source: string
): Promise<void> {
  // CSAM is always treated as CRITICAL
  await applySanctions({
    userId,
    violationCategory: 'CSAM',
    severity: riskLevel === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
    source: `csamShield:${source}`,
  });
}

/**
 * Hook for safeMeetEngine
 * Called when SOS is triggered
 */
export async function onSafeMeetSOS(
  userId: string,
  sessionId: string,
  sosType: string
): Promise<void> {
  // SOS triggers are treated as HIGH severity incidents
  await applySanctions({
    userId,
    violationCategory: 'VIOLENCE',
    severity: 'HIGH',
    source: `safeMeet:${sosType}`,
    metadata: { sessionId },
  });
}

/**
 * Hook for trustEngine CRITICAL events only
 * Called when trust engine detects critical fraud
 */
export async function onTrustCriticalEvent(
  userId: string,
  eventType: string,
  metadata?: Record<string, any>
): Promise<void> {
  // Only CRITICAL trust events trigger sanctions
  await applySanctions({
    userId,
    violationCategory: 'FRAUD',
    severity: 'CRITICAL',
    source: `trustEngine:${eventType}`,
    metadata,
  });
}

/**
 * Check if user can perform action based on status
 */
export async function canPerformAction(
  userId: string,
  action: 'chat' | 'call' | 'post' | 'meet' | 'withdrawal'
): Promise<{ allowed: boolean; reason?: string }> {
  
  const status = await getAccountStatus(userId);
  
  switch (status) {
    case 'ACTIVE':
    case 'WARNING':
      return { allowed: true };
      
    case 'RESTRICTED':
      // Restricted users can only do basic interactions
      if (action === 'withdrawal' || action === 'meet') {
        return { 
          allowed: false, 
          reason: 'Account is restricted. Limited features available.' 
        };
      }
      return { allowed: true };
      
    case 'SUSPENDED':
      // Suspended users cannot perform any actions
      return { 
        allowed: false, 
        reason: 'Account is suspended. Please check your email for details.' 
      };
      
    case 'BANNED_PERMANENT':
      return { 
        allowed: false, 
        reason: 'Account is permanently banned.' 
      };
      
    case 'SHADOW_RESTRICTED':
      // Shadow restricted users think they can act, but actions are hidden
      return { allowed: true };
      
    case 'REVIEW':
      return { 
        allowed: false, 
        reason: 'Account is under review. Please contact support.' 
      };
      
    default:
      return { allowed: true };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  applySanctions,
  getAccountStatus,
  getAccountStatusRecord,
  account_getStatus,
  onContentViolation,
  onCsamDetection,
  onSafeMeetSOS,
  onTrustCriticalEvent,
  canPerformAction,
};