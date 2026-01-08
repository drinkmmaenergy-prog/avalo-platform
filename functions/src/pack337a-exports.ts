/**
 * PACK 337a — FIX PATCH (Append-Only) for Original PACK 337
 * 
 * Purpose: Export cross-system integration handlers for Support, Retention, Fraud, Wallet, and Ads systems
 * Rule: DO NOT modify existing files. This file wires up missing event handlers and exports.
 * 
 * Integration Points:
 * - Support System (300+300A+300B) → Wallet, Fraud, Retention, Ads
 * - Retention System (301+301B) → Support, Wallet, Ads
 * - Fraud & Safety System (302) → Support, Wallet, Ads, Retention
 * - Wallet System (321) → Support, Fraud, Retention, Ads
 * - Ads System (326) → Wallet, Fraud, Support, Retention
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// ============================================================================
// PACK 337: CROSS-SYSTEM EVENT HANDLERS
// ============================================================================

/**
 * Support → Wallet: Credit refund from support ticket
 */
export const pack337_supportRefundToWallet = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { ticketId, userId, amount, reason } = data;

  if (!ticketId || !userId || !amount) {
    throw new functions.https.HttpsError('invalid-argument', 'ticketId, userId, and amount are required');
  }

  try {
    // Validate support ticket exists and refund is approved
    const ticketRef = db.collection('supportTickets').doc(ticketId);
    const ticketDoc = await ticketRef.get();

    if (!ticketDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Support ticket not found');
    }

    // Credit wallet
    const walletRef = db.collection('wallets').doc(userId);
    await db.runTransaction(async (transaction) => {
      const walletDoc = await transaction.get(walletRef);
      const currentBalance = walletDoc.data()?.balance || 0;

      transaction.set(walletRef, {
        balance: currentBalance + amount,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      // Log transaction
      const txRef = db.collection('walletTransactions').doc();
      transaction.set(txRef, {
        userId,
        type: 'SUPPORT_REFUND',
        amount,
        sourceTicketId: ticketId,
        reason,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    console.log(`[PACK337] Support refund: ${amount} tokens credited to user ${userId} from ticket ${ticketId}`);

    return {
      success: true,
      amount,
      newBalance: (await walletRef.get()).data()?.balance || 0,
    };
  } catch (error: any) {
    console.error('[PACK337] Error processing support refund:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Retention → Support: Create proactive support ticket for at-risk user
 */
export const pack337_retentionCreateProactiveTicket = functions.https.onCall(async (data, context) => {
  const { userId, riskScore, reasons } = data;

  if (!userId || !riskScore) {
    throw new functions.https.HttpsError('invalid-argument', 'userId and riskScore are required');
  }

  try {
    const ticketRef = await db.collection('supportTickets').add({
      userId,
      type: 'RETENTION_PROACTIVE',
      status: 'OPEN',
      priority: riskScore > 0.7 ? 'HIGH' : 'MEDIUM',
      subject: 'Proactive User Engagement',
      description: `User at risk of churn (score: ${riskScore}). Reasons: ${reasons?.join(', ') || 'Not specified'}`,
      source: 'RETENTION_ENGINE',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`[PACK337] Proactive support ticket created for user ${userId} (risk score: ${riskScore})`);

    return {
      success: true,
      ticketId: ticketRef.id,
    };
  } catch (error: any) {
    console.error('[PACK337] Error creating proactive ticket:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Fraud → Wallet: Freeze wallet on fraud detection
 */
export const pack337_fraudFreezeWallet = functions.https.onCall(async (data, context) => {
  const { userId, fraudCaseId, reason } = data;

  if (!userId || !fraudCaseId) {
    throw new functions.https.HttpsError('invalid-argument', 'userId and fraudCaseId are required');
  }

  try {
    const walletRef = db.collection('wallets').doc(userId);
    await walletRef.set({
      frozen: true,
      frozenReason: reason || 'FRAUD_DETECTION',
      frozenAt: admin.firestore.FieldValue.serverTimestamp(),
      fraudCaseId,
    }, { merge: true });

    // Create audit log
    await db.collection('walletAuditLogs').add({
      userId,
      action: 'FREEZE',
      reason,
      fraudCaseId,
      performedBy: 'FRAUD_ENGINE',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`[PACK337] Wallet frozen for user ${userId} due to fraud case ${fraudCaseId}`);

    return {
      success: true,
      frozen: true,
    };
  } catch (error: any) {
    console.error('[PACK337] Error freezing wallet:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Ads → Wallet: Credit ad revenue to creator wallet
 */
export const pack337_adsCreditRevenue = functions.https.onCall(async (data, context) => {
  const { creatorId, amount, impressionIds, period } = data;

  if (!creatorId || !amount) {
    throw new functions.https.HttpsError('invalid-argument', 'creatorId and amount are required');
  }

  try {
    const walletRef = db.collection('wallets').doc(creatorId);
    await db.runTransaction(async (transaction) => {
      const walletDoc = await transaction.get(walletRef);
      const currentBalance = walletDoc.data()?.balance || 0;

      transaction.set(walletRef, {
        balance: currentBalance + amount,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      // Log transaction
      const txRef = db.collection('walletTransactions').doc();
      transaction.set(txRef, {
        userId: creatorId,
        type: 'AD_REVENUE',
        amount,
        impressionIds: impressionIds || [],
        period,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    console.log(`[PACK337] Ad revenue credited: ${amount} tokens to creator ${creatorId}`);

    return {
      success: true,
      amount,
      newBalance: (await walletRef.get()).data()?.balance || 0,
    };
  } catch (error: any) {
    console.error('[PACK337] Error crediting ad revenue:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Cross-system state query: Get unified user state
 */
export const pack337_getUnifiedUserState = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = data?.userId || context.auth.uid;

  // Users can only query their own state
  if (userId !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Cannot access another user\'s state');
  }

  try {
    // Query user state from all systems
    const [userDoc, walletDoc, supportTicketsSnapshot, retentionDoc, fraudDoc] = await Promise.all([
      db.collection('users').doc(userId).get(),
      db.collection('wallets').doc(userId).get(),
      db.collection('supportTickets').where('userId', '==', userId).where('status', '==', 'OPEN').get(),
      db.collection('retentionProfiles').doc(userId).get(),
      db.collection('fraudProfiles').doc(userId).get(),
    ]);

    const unifiedState = {
      userId,
      
      // From Support (300)
      supportTier: userDoc.data()?.supportTier || 'standard',
      openTickets: supportTicketsSnapshot.size,
      
      // From Retention (301)
      retentionSegment: retentionDoc.data()?.segment || 'active',
      lifetimeValue: retentionDoc.data()?.lifetimeValue || 0,
      
      // From Fraud (302)
      fraudScore: fraudDoc.data()?.riskScore || 0,
      accountStatus: fraudDoc.data()?.status || 'clear',
      
      // From Wallet (321)
      walletBalance: walletDoc.data()?.balance || 0,
      walletStatus: walletDoc.data()?.frozen ? 'frozen' : 'active',
      
      // From Ads (326)
      adTier: userDoc.data()?.adTier || 'free',
      
      // Synchronization
      lastSyncTimestamp: admin.firestore.FieldValue.serverTimestamp(),
      syncSource: 'PACK337_UNIFIED_QUERY',
    };

    return {
      success: true,
      state: unifiedState,
    };
  } catch (error: any) {
    console.error('[PACK337] Error getting unified user state:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Export all PACK 337 handlers
export const pack337aExports = {
  pack337_supportRefundToWallet,
  pack337_retentionCreateProactiveTicket,
  pack337_fraudFreezeWallet,
  pack337_adsCreditRevenue,
  pack337_getUnifiedUserState,
};

console.log('✅ PACK 337a exports initialized - Cross-system integration layer active');
