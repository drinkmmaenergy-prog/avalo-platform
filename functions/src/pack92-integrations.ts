/**
 * PACK 92 — Notification Integrations
 * Integration hooks for existing systems to trigger notifications
 * 
 * This file shows how to wire notifications into:
 * - Earnings (PACK 81)
 * - Payouts (PACK 83)
 * - KYC (PACK 84)
 * - Disputes (PACK 86)
 * - Enforcement (PACK 87)
 * - Legal (PACK 89)
 * - Safety (PACK 77)
 */

import {
  sendEarningsNotification,
  sendPayoutNotification,
  sendKycNotification,
  sendDisputeNotification,
  sendEnforcementNotification,
  sendLegalUpdateNotification,
  sendSafetyNotification,
} from './pack92-notifications';
import { logger } from 'firebase-functions/v2';

// ============================================================================
// EARNINGS INTEGRATION (PACK 81)
// ============================================================================

/**
 * Called when a creator earns tokens from any source
 * Wire this into creatorEarnings.recordEarning()
 */
export async function onCreatorEarning(params: {
  creatorId: string;
  amount: number;
  source: 'gift' | 'premium story' | 'paid media' | 'paid call';
  sourceId: string;
}): Promise<void> {
  try {
    await sendEarningsNotification({
      userId: params.creatorId,
      amount: params.amount,
      source: params.source === 'premium story' ? 'unlocked your premium story' :
              params.source === 'paid media' ? 'unlocked your paid media' :
              params.source === 'gift' ? 'sent you a gift' :
              'paid for a call with you',
      sourceId: params.sourceId,
    });
  } catch (error) {
    logger.error('Failed to send earnings notification', error);
    // Don't throw - notification failures shouldn't block earnings
  }
}

// ============================================================================
// PAYOUT INTEGRATION (PACK 83)
// ============================================================================

/**
 * Called when payout request is created
 * Wire this into payout_createRequest after successful creation
 */
export async function onPayoutRequestCreated(params: {
  userId: string;
  requestId: string;
  amount: number;
}): Promise<void> {
  try {
    await sendPayoutNotification({
      userId: params.userId,
      status: 'CREATED',
      requestId: params.requestId,
      amount: params.amount,
    });
  } catch (error) {
    logger.error('Failed to send payout created notification', error);
  }
}

/**
 * Called when payout status changes
 * Wire this into payout_setStatus after status update
 */
export async function onPayoutStatusChanged(params: {
  userId: string;
  requestId: string;
  newStatus: 'APPROVED' | 'REJECTED' | 'PAID';
  amount?: number;
  reason?: string;
}): Promise<void> {
  try {
    await sendPayoutNotification({
      userId: params.userId,
      status: params.newStatus,
      requestId: params.requestId,
      amount: params.amount,
      reason: params.reason,
    });
  } catch (error) {
    logger.error('Failed to send payout status notification', error);
  }
}

// ============================================================================
// KYC INTEGRATION (PACK 84)
// ============================================================================

/**
 * Called when KYC application is submitted
 * Wire this into kyc_submitApplication_callable after successful submission
 */
export async function onKycSubmitted(params: {
  userId: string;
  documentId: string;
}): Promise<void> {
  try {
    await sendKycNotification({
      userId: params.userId,
      status: 'SUBMITTED',
      documentId: params.documentId,
    });
  } catch (error) {
    logger.error('Failed to send KYC submitted notification', error);
  }
}

/**
 * Called when KYC is approved
 * Wire this into kyc_approve_callable after approval
 */
export async function onKycApproved(params: {
  userId: string;
  documentId: string;
}): Promise<void> {
  try {
    await sendKycNotification({
      userId: params.userId,
      status: 'APPROVED',
      documentId: params.documentId,
    });
  } catch (error) {
    logger.error('Failed to send KYC approved notification', error);
  }
}

/**
 * Called when KYC is rejected
 * Wire this into kyc_reject_callable after rejection
 */
export async function onKycRejectedNotification(params: {
  userId: string;
  documentId: string;
  reason: string;
}): Promise<void> {
  try {
    await sendKycNotification({
      userId: params.userId,
      status: 'REJECTED',
      documentId: params.documentId,
      reason: params.reason,
    });
  } catch (error) {
    logger.error('Failed to send KYC rejected notification', error);
  }
}

// ============================================================================
// DISPUTE INTEGRATION (PACK 86)
// ============================================================================

/**
 * Called when a dispute/report is created
 * Wire this into dispute creation logic
 */
export async function onDisputeCreated(params: {
  reporterId: string;
  reportedUserId: string;
  disputeId: string;
}): Promise<void> {
  try {
    // Notify reporter
    await sendDisputeNotification({
      userId: params.reporterId,
      disputeId: params.disputeId,
      role: 'REPORTER',
    });

    // Optionally notify reported user (depending on policy)
    // Uncomment if you want to notify the reported user:
    // await sendDisputeNotification({
    //   userId: params.reportedUserId,
    //   disputeId: params.disputeId,
    //   role: 'REPORTED',
    // });
  } catch (error) {
    logger.error('Failed to send dispute notifications', error);
  }
}

// ============================================================================
// ENFORCEMENT INTEGRATION (PACK 87)
// ============================================================================

/**
 * Called when enforcement level changes
 * Wire this into enforcement engine when level is updated
 */
export async function onEnforcementLevelChanged(params: {
  userId: string;
  level: 'SOFT' | 'HARD' | 'SUSPENDED';
  reason: string;
}): Promise<void> {
  try {
    await sendEnforcementNotification({
      userId: params.userId,
      level: params.level,
      reason: params.reason,
    });
  } catch (error) {
    logger.error('Failed to send enforcement notification', error);
  }
}

// ============================================================================
// LEGAL INTEGRATION (PACK 89)
// ============================================================================

/**
 * Called when new legal terms require acceptance
 * Wire this into legal center when new version is published
 */
export async function onLegalUpdateRequired(params: {
  userId: string;
  documentType: 'TOS' | 'PRIVACY' | 'PAYOUT_TERMS';
  version: string;
}): Promise<void> {
  try {
    await sendLegalUpdateNotification({
      userId: params.userId,
      documentType: params.documentType,
      version: params.version,
    });
  } catch (error) {
    logger.error('Failed to send legal update notification', error);
  }
}

/**
 * Batch notify all users about legal update
 * Call this when publishing a new legal document version
 */
export async function notifyAllUsersLegalUpdate(params: {
  documentType: 'TOS' | 'PRIVACY' | 'PAYOUT_TERMS';
  version: string;
  userIds: string[];
}): Promise<void> {
  logger.info(`Sending legal update notifications to ${params.userIds.length} users`);

  const promises = params.userIds.map((userId) =>
    onLegalUpdateRequired({
      userId,
      documentType: params.documentType,
      version: params.version,
    })
  );

  // Process in batches of 100
  const batchSize = 100;
  for (let i = 0; i < promises.length; i += batchSize) {
    const batch = promises.slice(i, i + batchSize);
    await Promise.all(batch);
    logger.info(`Processed ${Math.min(i + batchSize, promises.length)} of ${promises.length} legal update notifications`);
  }
}

// ============================================================================
// SAFETY INTEGRATION (PACK 77)
// ============================================================================

/**
 * Called when safety timer is about to expire (5 min warning)
 * Wire this into safety timer scheduler
 */
export async function onSafetyTimerExpiring(params: {
  userId: string;
  timerId: string;
}): Promise<void> {
  try {
    await sendSafetyNotification({
      userId: params.userId,
      type: 'TIMER_EXPIRING',
      timerId: params.timerId,
    });
  } catch (error) {
    logger.error('Failed to send timer expiring notification', error);
  }
}

/**
 * Called when safety timer expires without check-in
 * Wire this into checkExpiredSafetyTimers scheduler
 */
export async function onSafetyTimerExpired(params: {
  userId: string;
  timerId: string;
  trustedContacts: string[];
  userName: string;
}): Promise<void> {
  try {
    // Notify all trusted contacts
    const promises = params.trustedContacts.map((contactId) =>
      sendSafetyNotification({
        userId: contactId,
        type: 'TIMER_EXPIRED',
        alertUserId: params.userId,
        alertUserName: params.userName,
        timerId: params.timerId,
      })
    );

    await Promise.all(promises);
  } catch (error) {
    logger.error('Failed to send timer expired notifications', error);
  }
}

/**
 * Called when panic button is triggered
 * Wire this into triggerPanic function
 */
export async function onPanicButtonTriggered(params: {
  userId: string;
  trustedContacts: string[];
  userName: string;
}): Promise<void> {
  try {
    // Notify all trusted contacts
    const promises = params.trustedContacts.map((contactId) =>
      sendSafetyNotification({
        userId: contactId,
        type: 'PANIC_BUTTON',
        alertUserId: params.userId,
        alertUserName: params.userName,
      })
    );

    await Promise.all(promises);
  } catch (error) {
    logger.error('Failed to send panic button notifications', error);
  }
}

// ============================================================================
// INTEGRATION EXAMPLE USAGE
// ============================================================================

/**
 * Example: How to integrate into creatorEarnings.ts
 * 
 * In creatorEarnings.ts, after successfully recording an earning:
 * 
 * import { onCreatorEarning } from './pack92-integrations';
 * 
 * export async function recordEarning(params) {
 *   // ... existing logic ...
 *   const ledgerRef = await db.collection('earnings_ledger').add(ledgerEntry);
 *   await updateCreatorBalance(creatorId, netTokensCreator);
 *   
 *   // PACK 92: Send notification
 *   await onCreatorEarning({
 *     creatorId,
 *     amount: netTokensCreator,
 *     source: sourceType === 'GIFT' ? 'gift' : 
 *             sourceType === 'PREMIUM_STORY' ? 'premium story' :
 *             sourceType === 'PAID_MEDIA' ? 'paid media' : 'paid call',
 *     sourceId: ledgerRef.id,
 *   });
 *   
 *   return ledgerRef.id;
 * }
 */

/**
 * Example: How to integrate into payoutRequests.ts
 * 
 * In payoutRequests.ts, after creating a payout request:
 * 
 * import { onPayoutRequestCreated, onPayoutStatusChanged } from './pack92-integrations';
 * 
 * export const payout_createRequest = onCall(async (request) => {
 *   // ... existing logic ...
 *   await db.runTransaction(async (transaction) => {
 *     // ... transaction logic ...
 *   });
 *   
 *   // PACK 92: Send notification
 *   await onPayoutRequestCreated({
 *     userId,
 *     requestId,
 *     amount: params.requestedTokens,
 *   });
 *   
 *   return { requestId };
 * });
 */

/**
 * Example: How to integrate into safetyTimers.ts
 * 
 * In safetyTimers.ts, in the scheduled function:
 * 
 * import { onSafetyTimerExpired } from './pack92-integrations';
 * 
 * export const checkExpiredSafetyTimers = functions.pubsub
 *   .schedule('every 1 minutes')
 *   .onRun(async (context) => {
 *     // ... find expired timers ...
 *     
 *     const updatePromises = expiredTimers.docs.map(async (doc) => {
 *       const timer = doc.data();
 *       
 *       // Update status...
 *       await doc.ref.update({ status: 'expired_no_checkin' });
 *       
 *       // PACK 92: Send notifications
 *       if (timer.trustedContacts && timer.trustedContacts.length > 0) {
 *         const userDoc = await db.collection('users').doc(timer.userId).get();
 *         const userName = userDoc.data()?.displayName || 'A user';
 *         
 *         await onSafetyTimerExpired({
 *           userId: timer.userId,
 *           timerId: doc.id,
 *           trustedContacts: timer.trustedContacts,
 *           userName,
 *         });
 *       }
 *     });
 *     
 *     await Promise.all(updatePromises);
 *   });
 */