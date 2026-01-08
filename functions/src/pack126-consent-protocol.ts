/**
 * PACK 126 — Universal Consent Protocol
 * 
 * Manages continuous, revokable consent across all communication channels
 * Protects both users while respecting monetization fairness
 */

import { db } from './init';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import {
  ConsentState,
  UserConsentRecord,
  ConsentStateChange,
  ConsentRequest,
  ConsentCheckResult,
  SafetyAuditLog,
} from './types/pack126-types';

const CONSENT_COLLECTION = 'user_consent_records';
const SAFETY_AUDIT_COLLECTION = 'safety_audit_logs';

// ============================================================================
// CONSENT STATE MANAGEMENT
// ============================================================================

/**
 * Initialize consent record when two users first connect
 */
export async function initializeConsent(
  userA: string,
  userB: string,
  initiatedBy: string,
  source: 'DISCOVERY' | 'SEARCH' | 'EVENT' | 'REFERRAL'
): Promise<void> {
  const recordId = getConsentRecordId(userA, userB);
  
  const record: UserConsentRecord = {
    userId: userA,
    counterpartId: userB,
    state: 'PENDING',
    createdAt: Timestamp.now(),
    lastUpdatedAt: Timestamp.now(),
    canSendMessages: false,
    canSendMedia: false,
    canMakeCalls: false,
    canSendLocation: false,
    canSendEventInvites: false,
    pendingRefunds: [],
    stateHistory: [{
      fromState: 'PENDING' as ConsentState,
      toState: 'PENDING' as ConsentState,
      changedBy: initiatedBy,
      changedAt: Timestamp.now(),
      reason: 'Initial connection',
    }],
    initiatedBy,
    connectionSource: source,
  };
  
  await db.collection(CONSENT_COLLECTION).doc(recordId).set(record);
  
  // Log for audit
  await logSafetyEvent('CONSENT_GRANTED', userA, userB, {
    state: 'PENDING',
    initiatedBy,
    source,
  });
}

/**
 * Request consent for active communication
 * Called when first message/media/call is attempted
 */
export async function requestConsent(request: ConsentRequest): Promise<{ success: boolean; message: string }> {
  const recordId = getConsentRecordId(request.fromUserId, request.toUserId);
  const recordRef = db.collection(CONSENT_COLLECTION).doc(recordId);
  
  const record = await recordRef.get();
  if (!record.exists) {
    // Initialize if doesn't exist
    await initializeConsent(
      request.fromUserId,
      request.toUserId,
      request.fromUserId,
      'DISCOVERY'
    );
  }
  
  const data = record.data() as UserConsentRecord;
  
  // If already active, no need to request again
  if (data.state === 'ACTIVE_CONSENT') {
    return { success: true, message: 'Consent already active' };
  }
  
  // Transition to active consent
  await updateConsentState(
    request.fromUserId,
    request.toUserId,
    'ACTIVE_CONSENT',
    request.fromUserId,
    'User initiated communication'
  );
  
  return { success: true, message: 'Consent granted' };
}

/**
 * Grant active consent (enable full communication)
 */
export async function grantActiveConsent(
  userId: string,
  counterpartId: string,
  grantedBy: string
): Promise<void> {
  await updateConsentState(userId, counterpartId, 'ACTIVE_CONSENT', grantedBy, 'User granted active consent');
}

/**
 * Pause consent temporarily (user needs a break)
 */
export async function pauseConsent(
  userId: string,
  counterpartId: string,
  pausedBy: string,
  reason?: string
): Promise<void> {
  await updateConsentState(
    userId,
    counterpartId,
    'PAUSED',
    pausedBy,
    reason || 'User paused communication'
  );
  
  // Log trauma-aware action
  await logSafetyEvent('CONSENT_PAUSED', userId, counterpartId, {
    pausedBy,
    reason,
    traumaAware: true,
  });
}

/**
 * Revoke consent permanently (no more communication)
 */
export async function revokeConsent(
  userId: string,
  counterpartId: string,
  revokedBy: string,
  reason?: string
): Promise<void> {
  await updateConsentState(
    userId,
    counterpartId,
    'REVOKED',
    revokedBy,
    reason || 'User revoked consent'
  );
  
  // Log for safety tracking
  await logSafetyEvent('CONSENT_REVOKED', userId, counterpartId, {
    revokedBy,
    reason,
    permanent: true,
  });
}

/**
 * Resume consent after pause
 */
export async function resumeConsent(
  userId: string,
  counterpartId: string,
  resumedBy: string
): Promise<void> {
  const recordId = getConsentRecordId(userId, counterpartId);
  const record = await db.collection(CONSENT_COLLECTION).doc(recordId).get();
  
  if (!record.exists) {
    throw new Error('Consent record not found');
  }
  
  const data = record.data() as UserConsentRecord;
  
  if (data.state === 'REVOKED') {
    throw new Error('Cannot resume revoked consent');
  }
  
  await updateConsentState(userId, counterpartId, 'ACTIVE_CONSENT', resumedBy, 'User resumed consent');
  
  await logSafetyEvent('CONSENT_RESUMED', userId, counterpartId, {
    resumedBy,
  });
}

// ============================================================================
// CONSENT CHECKING (Used by all communication endpoints)
// ============================================================================

/**
 * Check if communication is allowed between two users
 * This is called before EVERY message, media send, call, etc.
 */
export async function checkConsent(request: ConsentRequest): Promise<ConsentCheckResult> {
  const recordId = getConsentRecordId(request.fromUserId, request.toUserId);
  const record = await db.collection(CONSENT_COLLECTION).doc(recordId).get();
  
  // No record = no consent yet
  if (!record.exists) {
    return {
      allowed: false,
      state: 'PENDING',
      reason: 'Consent not yet established',
      requiresAction: 'REQUEST_CONSENT',
    };
  }
  
  const data = record.data() as UserConsentRecord;
  
  // Check state
  switch (data.state) {
    case 'ACTIVE_CONSENT':
      // Check specific permission based on request type
      const canPerform = checkSpecificPermission(data, request.requestType);
      if (!canPerform) {
        return {
          allowed: false,
          state: data.state,
          reason: `${request.requestType} not permitted`,
        };
      }
      return {
        allowed: true,
        state: data.state,
      };
    
    case 'PAUSED':
      return {
        allowed: false,
        state: data.state,
        reason: 'Communication paused by counterpart',
        requiresAction: 'REACTIVATE_CONSENT',
      };
    
    case 'REVOKED':
      return {
        allowed: false,
        state: data.state,
        reason: 'Consent has been revoked',
      };
    
    case 'PENDING':
      return {
        allowed: false,
        state: data.state,
        reason: 'Consent pending',
        requiresAction: 'REQUEST_CONSENT',
      };
    
    default:
      return {
        allowed: false,
        state: data.state,
        reason: 'Unknown consent state',
      };
  }
}

/**
 * Batch check consent for multiple users (e.g., event invites)
 */
export async function batchCheckConsent(
  fromUserId: string,
  toUserIds: string[],
  requestType: ConsentRequest['requestType']
): Promise<Map<string, ConsentCheckResult>> {
  const results = new Map<string, ConsentCheckResult>();
  
  // Check each user
  for (const toUserId of toUserIds) {
    const result = await checkConsent({
      fromUserId,
      toUserId,
      requestType,
    });
    results.set(toUserId, result);
  }
  
  return results;
}

// ============================================================================
// REFUND MANAGEMENT (Only for non-delivered content)
// ============================================================================

/**
 * Track transaction for potential refund if consent revoked before delivery
 */
export async function trackPendingTransaction(
  buyerId: string,
  sellerId: string,
  transactionId: string
): Promise<void> {
  const recordId = getConsentRecordId(buyerId, sellerId);
  await db.collection(CONSENT_COLLECTION).doc(recordId).update({
    pendingRefunds: FieldValue.arrayUnion(transactionId),
    lastUpdatedAt: Timestamp.now(),
  });
}

/**
 * Mark transaction as delivered (no longer refundable)
 */
export async function markTransactionDelivered(
  buyerId: string,
  sellerId: string,
  transactionId: string
): Promise<void> {
  const recordId = getConsentRecordId(buyerId, sellerId);
  await db.collection(CONSENT_COLLECTION).doc(recordId).update({
    pendingRefunds: FieldValue.arrayRemove(transactionId),
    lastUpdatedAt: Timestamp.now(),
  });
}

/**
 * Process refunds when consent is revoked
 * Returns list of transaction IDs to refund
 */
export async function processPendingRefunds(
  userId: string,
  counterpartId: string
): Promise<string[]> {
  const recordId = getConsentRecordId(userId, counterpartId);
  const record = await db.collection(CONSENT_COLLECTION).doc(recordId).get();
  
  if (!record.exists) {
    return [];
  }
  
  const data = record.data() as UserConsentRecord;
  
  // Only refund if content wasn't delivered yet
  const toRefund = [...data.pendingRefunds];
  
  // Clear pending refunds
  await db.collection(CONSENT_COLLECTION).doc(recordId).update({
    pendingRefunds: [],
    lastUpdatedAt: Timestamp.now(),
  });
  
  return toRefund;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate consistent record ID for user pair
 */
function getConsentRecordId(userA: string, userB: string): string {
  // Always use same order to ensure consistency
  const [first, second] = [userA, userB].sort();
  return `${first}_${second}`;
}

/**
 * Update consent state with history tracking
 */
async function updateConsentState(
  userId: string,
  counterpartId: string,
  newState: ConsentState,
  changedBy: string,
  reason: string
): Promise<void> {
  const recordId = getConsentRecordId(userId, counterpartId);
  const recordRef = db.collection(CONSENT_COLLECTION).doc(recordId);
  
  const record = await recordRef.get();
  if (!record.exists) {
    throw new Error('Consent record not found');
  }
  
  const data = record.data() as UserConsentRecord;
  const oldState = data.state;
  
  // Create state change record
  const stateChange: ConsentStateChange = {
    fromState: oldState,
    toState: newState,
    changedBy,
    changedAt: Timestamp.now(),
    reason,
  };
  
  // Update capabilities based on state
  const capabilities = getCapabilitiesForState(newState);
  
  // Update record
  await recordRef.update({
    state: newState,
    ...capabilities,
    ...(newState === 'ACTIVE_CONSENT' && { activeConsentGrantedAt: Timestamp.now() }),
    ...(newState === 'PAUSED' && { pausedAt: Timestamp.now() }),
    ...(newState === 'REVOKED' && { revokedAt: Timestamp.now() }),
    lastUpdatedAt: Timestamp.now(),
    stateHistory: FieldValue.arrayUnion(stateChange),
  });
}

/**
 * Get communication capabilities for a consent state
 */
function getCapabilitiesForState(state: ConsentState) {
  switch (state) {
    case 'ACTIVE_CONSENT':
      return {
        canSendMessages: true,
        canSendMedia: true,
        canMakeCalls: true,
        canSendLocation: true,
        canSendEventInvites: true,
      };
    
    case 'PENDING':
    case 'PAUSED':
    case 'REVOKED':
    default:
      return {
        canSendMessages: false,
        canSendMedia: false,
        canMakeCalls: false,
        canSendLocation: false,
        canSendEventInvites: false,
      };
  }
}

/**
 * Check if specific action is permitted
 */
function checkSpecificPermission(
  record: UserConsentRecord,
  requestType: ConsentRequest['requestType']
): boolean {
  switch (requestType) {
    case 'MESSAGE':
      return record.canSendMessages;
    case 'MEDIA':
      return record.canSendMedia;
    case 'CALL':
      return record.canMakeCalls;
    case 'LOCATION':
      return record.canSendLocation;
    case 'EVENT_INVITE':
      return record.canSendEventInvites;
    default:
      return false;
  }
}

/**
 * Log safety event for audit trail
 */
async function logSafetyEvent(
  eventType: SafetyAuditLog['eventType'],
  userId: string,
  affectedUserId: string,
  details: Record<string, any>
): Promise<void> {
  const log: SafetyAuditLog = {
    logId: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    eventType,
    userId,
    affectedUserId,
    details,
    timestamp: Timestamp.now(),
    gdprCompliant: true,
    retentionPeriod: 90,  // 90 days
  };
  
  await db.collection(SAFETY_AUDIT_COLLECTION).add(log);
}

// ============================================================================
// QUERY FUNCTIONS
// ============================================================================

/**
 * Get consent record between two users
 */
export async function getConsentRecord(
  userId: string,
  counterpartId: string
): Promise<UserConsentRecord | null> {
  const recordId = getConsentRecordId(userId, counterpartId);
  const record = await db.collection(CONSENT_COLLECTION).doc(recordId).get();
  
  if (!record.exists) {
    return null;
  }
  
  return record.data() as UserConsentRecord;
}

/**
 * Get all consent records for a user
 */
export async function getUserConsentRecords(userId: string): Promise<UserConsentRecord[]> {
  // Query where user is either userId or counterpartId
  const query1 = await db.collection(CONSENT_COLLECTION)
    .where('userId', '==', userId)
    .get();
  
  const query2 = await db.collection(CONSENT_COLLECTION)
    .where('counterpartId', '==', userId)
    .get();
  
  const records: UserConsentRecord[] = [];
  
  query1.forEach(doc => records.push(doc.data() as UserConsentRecord));
  query2.forEach(doc => records.push(doc.data() as UserConsentRecord));
  
  return records;
}

/**
 * Get consent records by state for a user
 */
export async function getUserConsentRecordsByState(
  userId: string,
  state: ConsentState
): Promise<UserConsentRecord[]> {
  const allRecords = await getUserConsentRecords(userId);
  return allRecords.filter(r => r.state === state);
}