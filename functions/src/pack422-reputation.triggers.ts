/**
 * PACK 422 — Global Trust, Reputation & Moderation Intelligence (Tier-2)
 * 
 * Reputation Update Triggers
 * Automatically recalculate reputation when key events occur
 */

import * as functions from 'firebase-functions';
import admin from 'firebase-admin';
import { recalculateReputation } from './pack422-reputation.service';
import { sendMetric } from './pack421-metrics.service';
import { HttpsError, auth, onCall, onDocumentCreated, onDocumentUpdated, onDocumentWritten } from './runtime';

const db = admin.firestore();

// Debounce cache to prevent too-frequent updates
const reputationUpdateCache = new Map<string, number>();
const DEBOUNCE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Check if user reputation should be updated (respects debounce)
 */
function shouldUpdateReputation(userId: string): boolean {
  const lastUpdate = reputationUpdateCache.get(userId);
  if (!lastUpdate) return true;
  
  const now = Date.now();
  if (now - lastUpdate > DEBOUNCE_WINDOW_MS) {
    return true;
  }
  
  return false;
}

/**
 * Update reputation with debouncing
 */
async function updateReputationDebounced(userId: string, triggerType: string): Promise<void> {
  if (!shouldUpdateReputation(userId)) {
    console.log(`[PACK422] Skipping reputation update for ${userId} (debounced)`);
    return;
  }
  
  reputationUpdateCache.set(userId, Date.now());
  
  try {
    await recalculateReputation(userId, { triggerType });
    
    // Emit metric
    await sendMetric({
      name: 'product.reputation.recalc.count',
      value: 1,
      tags: { trigger: triggerType },
    });
  } catch (error) {
    console.error(`[PACK422] Error updating reputation for ${userId}:`, error);
    throw error;
  }
}

// ============================================================================
// CHAT & CALL TRIGGERS (PACK 273–280)
// ============================================================================

/**
 * Trigger on billing events (message/call completion)
 */
export const onBillingEvent = onDocumentWritten('billing/{billingId}', async (event) => {
  const change = event.data;
  if (!change) return;
    const after = change.after.exists ? change.after.data() : null;
    
    if (!after) return;
    
    const userId = after.userId;
    if (!userId) return;
    
    // Trigger on completed or failed transactions
    if (after.status === 'COMPLETED' || after.status === 'FAILED') {
      await updateReputationDebounced(userId, 'BILLING');
    }
  });

/**
 * Trigger on abuse reports
 */
export const onAbuseReport = onDocumentCreated('reports/{reportId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
    const data = snap.data();
    const reportedUserId = data.reportedUserId;
    
    if (!reportedUserId) return;
    
    await updateReputationDebounced(reportedUserId, 'ABUSE_REPORT');
  });

// ============================================================================
// MEETING TRIGGERS (PACK 240+)
// ============================================================================

/**
 * Trigger on meeting status changes
 */
export const onMeetingStatusChange = onDocumentUpdated('meetings/{meetingId}', async (event) => {
  const change = event.data;
  if (!change) return;
    const before = change.before.data();
    const after = change.after.data();
    
    // Status changed to completed, cancelled, or no-show
    if (before.status !== after.status) {
      const participantIds = after.participantIds || [];
      
      // Update reputation for all participants
      for (const userId of participantIds) {
        await updateReputationDebounced(userId, 'MEETING');
      }
    }
  });

/**
 * Trigger on QR verification
 */
export const onQRVerification = onDocumentCreated('meetings/{meetingId}/verifications/{verificationId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
    const data = snap.data();
    const userId = data.userId;
    
    if (!userId) return;
    
    await updateReputationDebounced(userId, 'QR_VERIFICATION');
  });

// ============================================================================
// WALLET & PAYMENT TRIGGERS (PACK 255/277)
// ============================================================================

/**
 * Trigger on transaction completion
 */
export const onTransactionComplete = onDocumentUpdated('transactions/{transactionId}', async (event) => {
  const change = event.data;
  if (!change) return;
    const before = change.before.data();
    const after = change.after.data();
    
    // Status changed to completed or failed
    if (before.status !== after.status && 
        (after.status === 'COMPLETED' || after.status === 'FAILED')) {
      const userId = after.userId;
      if (userId) {
        await updateReputationDebounced(userId, 'PAYMENT');
      }
    }
  });

/**
 * Trigger on dispute creation
 */
export const onDisputeCreated = onDocumentCreated('disputes/{disputeId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
    const data = snap.data();
    
    // Update reputation for both parties
    if (data.providerId) {
      await updateReputationDebounced(data.providerId, 'DISPUTE');
    }
    if (data.clientId) {
      await updateReputationDebounced(data.clientId, 'DISPUTE');
    }
  });

/**
 * Trigger on fraud alert
 */
export const onFraudAlert = onDocumentCreated('fraudAlerts/{alertId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
    const data = snap.data();
    const userId = data.userId;
    
    if (!userId) return;
    
    await updateReputationDebounced(userId, 'FRAUD_ALERT');
  });

// ============================================================================
// SAFETY TRIGGERS (PACK 267–268)
// ============================================================================

/**
 * Trigger on safety incident
 */
export const onSafetyIncident = onDocumentCreated('safetyIncidents/{incidentId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
    const data = snap.data();
    const userId = data.userId;
    
    if (!userId) return;
    
    await updateReputationDebounced(userId, 'SAFETY_INCIDENT');
  });

/**
 * Trigger on panic event
 */
export const onPanicEvent = onDocumentCreated('panicEvents/{eventId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
    const data = snap.data();
    const userId = data.userId;
    
    if (!userId) return;
    
    await updateReputationDebounced(userId, 'PANIC_EVENT');
  });

/**
 * Trigger on ban/restriction changes
 */
export const onUserRestrictionChange = onDocumentWritten('userRestrictions/{userId}', async (event) => {
  const change = event.data;
  if (!change) return;
    const userId = event.params.userId;
    
    if (!userId) return;
    
    await updateReputationDebounced(userId, 'RESTRICTION_CHANGE');
  });

// ============================================================================
// SUPPORT TRIGGERS (PACK 300/300A)
// ============================================================================

/**
 * Trigger on support ticket creation
 */
export const onSupportTicketCreated = onDocumentCreated('supportTickets/{ticketId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
    const data = snap.data();
    const userId = data.userId;
    
    if (!userId) return;
    
    // Only update reputation for safety/abuse tickets
    if (data.type === 'SAFETY' || data.type === 'ABUSE') {
      await updateReputationDebounced(userId, 'SUPPORT_TICKET');
    }
  });

/**
 * Trigger on support ticket update (admin notes flagged)
 */
export const onSupportTicketUpdated = onDocumentUpdated('supportTickets/{ticketId}', async (event) => {
  const change = event.data;
  if (!change) return;
    const before = change.before.data();
    const after = change.after.data();
    
    // Check if admin notes were added with flags
    if (before.adminNotes !== after.adminNotes) {
      const flaggedTerms = ['toxic', 'aggressive', 'threatening'];
      const hasFlaggedTerm = flaggedTerms.some(term => 
        after.adminNotes?.toLowerCase().includes(term)
      );
      
      if (hasFlaggedTerm) {
        const userId = after.userId;
        if (userId) {
          await updateReputationDebounced(userId, 'SUPPORT_FLAGGED');
        }
      }
    }
  });

// ============================================================================
// AI COMPANION TRIGGERS (PACK 279)
// ============================================================================

/**
 * Trigger on AI NSFW violation
 */
export const onAIViolation = onDocumentCreated('aiViolations/{violationId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
    const data = snap.data();
    const userId = data.userId;
    
    if (!userId) return;
    
    await updateReputationDebounced(userId, 'AI_VIOLATION');
  });

/**
 * Trigger on AI companion blocking user
 */
export const onAIUserBlocked = onDocumentCreated('aiCompanions/{companionId}/blockedUsers/{userId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
    const userId = event.params.userId;
    
    if (!userId) return;
    
    await updateReputationDebounced(userId, 'AI_BLOCKED');
  });

// ============================================================================
// RETENTION TRIGGERS (PACK 301–301B)
// ============================================================================

/**
 * Trigger on user churn due to negative interactions
 */
export const onUserChurn = onDocumentCreated('churnEvents/{eventId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
    const data = snap.data();
    
    // If churn reason includes negative interactions
    if (data.reason?.includes('negative_interaction')) {
      const relatedUserId = data.relatedUserId; // User who caused the churn
      if (relatedUserId) {
        await updateReputationDebounced(relatedUserId, 'CHURN_CAUSED');
      }
    }
  });

// ============================================================================
// MANUAL RECALCULATION CALLABLE FUNCTION
// ============================================================================

/**
 * Callable function for admin to force reputation recalculation
 */
export const forceReputationRecalc = functions.https.onCall(async (request) => {
  const data = request.data;
  // Verify admin auth
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const adminId = request.auth.uid;
  const adminDoc = await db.collection('adminRoles').doc(adminId).get();
  
  if (!adminDoc.exists) {
    throw new functions.https.HttpsError('permission-denied', 'Must be an admin');
  }
  
  const { userId } = data;
  if (!userId) {
    throw new functions.https.HttpsError('invalid-argument', 'userId is required');
  }
  
  // Force recalculation
  const profile = await recalculateReputation(userId, { 
    forceUpdate: true, 
    triggerType: 'ADMIN_MANUAL' 
  });
  
  return { success: true, profile };
});









