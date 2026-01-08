/**
 * PACK 383 - Global Payment Routing, Compliance & Cross-Border Payout Engine
 * Chargeback & Reversal Firewall
 * 
 * Features:
 * - Chargeback scoring
 * - Temporary payout freeze window
 * - Automated dispute documents
 * - Forced reserve holding for high-risk users
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// Chargeback Risk Profile
interface ChargebackRiskProfile {
  userId: string;
  riskScore: number; // 0-100
  totalChargebacks: number;
  chargebackRate: number; // percentage
  reserveAmount: number; // Amount held in reserve
  reservePercentage: number; // Percentage of payouts to hold
  freezeWindow: number; // Days to hold before payout
  lastChargebackAt?: admin.firestore.Timestamp;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

/**
 * Detect chargeback risk
 */
export const pack383_detectChargebackRisk = functions.https.onCall(
  async (data: { userId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { userId } = data;

    try {
      // Get user's transaction history
      const transactionsSnapshot = await db
        .collection('transactions')
        .where('userId', '==', userId)
        .where('type', '==', 'payment')
        .limit(100)
        .get();

      if (transactionsSnapshot.empty) {
        return {
          success: true,
          high: false,
          riskScore: 0,
          message: 'No transaction history',
        };
      }

      // Count chargebacks
      const chargebacks = transactionsSnapshot.docs.filter(
        doc => doc.data().status === 'chargeback' || doc.data().disputed === true
      );

      const chargebackRate = (chargebacks.length / transactionsSnapshot.size) * 100;

      // Calculate risk score
      let riskScore = 0;

      // Factor 1: Chargeback rate
      if (chargebackRate > 5) riskScore += 50;
      else if (chargebackRate > 2) riskScore += 30;
      else if (chargebackRate > 1) riskScore += 15;

      // Factor 2: Recent chargebacks
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const recentChargebacks = chargebacks.filter(doc => {
        const chargebackDate = doc.data().chargebackDate?.toDate();
        return chargebackDate && chargebackDate >= thirtyDaysAgo;
      });

      if (recentChargebacks.length > 3) riskScore += 30;
      else if (recentChargebacks.length > 1) riskScore += 15;

      // Factor 3: Large transaction disputes
      const largeDisputes = chargebacks.filter(doc =>
        doc.data().amount > 500
      );
      if (largeDisputes.length > 0) riskScore += 20;

      // Calculate reserve and freeze requirements
      let reservePercentage = 0;
      let freezeWindow = 0;

      if (riskScore >= 70) {
        // High risk
        reservePercentage = 30;
        freezeWindow = 14;
      } else if (riskScore >= 50) {
        // Medium-high risk
        reservePercentage = 20;
        freezeWindow = 7;
      } else if (riskScore >= 30) {
        // Medium risk
        reservePercentage = 10;
        freezeWindow = 3;
      }

      // Update/create risk profile
      const lastChargeback = chargebacks.length > 0
        ? chargebacks[chargebacks.length - 1].data().chargebackDate
        : null;

      await db.collection('chargebackRiskProfiles').doc(userId).set({
        userId,
        riskScore,
        totalChargebacks: chargebacks.length,
        chargebackRate,
        reservePercentage,
        freezeWindow,
        lastChargebackAt: lastChargeback || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      return {
        success: true,
        high: riskScore >= 50,
        riskScore,
        chargebackCount: chargebacks.length,
        chargebackRate,
        recentChargebacks: recentChargebacks.length,
        reservePercentage,
        freezeWindow,
        recommendation: riskScore >= 70
          ? 'Block payouts pending review'
          : riskScore >= 50
          ? 'Apply reserve and freeze window'
          : 'Monitor closely',
      };
    } catch (error: any) {
      console.error('Error detecting chargeback risk:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Apply payout freeze for high-risk users
 */
export const pack383_applyPayoutFreeze = functions.https.onCall(
  async (data: { userId: string; reason: string; freezeDays: number }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { userId, reason, freezeDays } = data;

    // Verify admin
    const adminDoc = await db.collection('users').doc(context.auth.uid).get();
    if (!adminDoc.exists || adminDoc.data()!.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }

    try {
      const freezeUntil = new Date();
      freezeUntil.setDate(freezeUntil.getDate() + freezeDays);

      await db.collection('userPayoutFreezes').doc(userId).set({
        userId,
        reason,
        freezeDays,
        freezeUntil: admin.firestore.Timestamp.fromDate(freezeUntil),
        appliedBy: context.auth.uid,
        appliedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Block pending payouts
      const pendingPayouts = await db
        .collection('payouts')
        .where('userId', '==', userId)
        .where('status', '==', 'pending')
        .get();

      const blockPromises = pendingPayouts.docs.map(doc =>
        doc.ref.update({
          status: 'frozen',
          frozenReason: reason,
          frozenUntil: admin.firestore.Timestamp.fromDate(freezeUntil),
        })
      );

      await Promise.all(blockPromises);

      // Create audit log
      await db.collection('auditLogs').add({
        action: 'payout_freeze_applied',
        userId: context.auth.uid,
        targetType: 'user',
        targetId: userId,
        details: {
          reason,
          freezeDays,
          affectedPayouts: pendingPayouts.size,
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        message: `Payout freeze applied for ${freezeDays} days`,
        affectedPayouts: pendingPayouts.size,
        freezeUntil: freezeUntil.toISOString(),
      };
    } catch (error: any) {
      console.error('Error applying payout freeze:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Create reserve holding for high-risk user
 */
export const pack383_createReserveHold = functions.https.onCall(
  async (data: { userId: string; percentage: number; duration: number }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { userId, percentage, duration } = data;

    // Verify admin
    const adminDoc = await db.collection('users').doc(context.auth.uid).get();
    if (!adminDoc.exists || adminDoc.data()!.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }

    try {
      if (percentage < 0 || percentage > 50) {
        throw new functions.https.HttpsError('invalid-argument', 'Reserve percentage must be between 0 and 50');
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + duration);

      await db.collection('payoutReserveHolds').doc(userId).set({
        userId,
        percentage,
        duration,
        expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
        appliedBy: context.auth.uid,
        appliedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'active',
      });

      // Update chargeback risk profile
      await db.collection('chargebackRiskProfiles').doc(userId).update({
        reservePercentage: percentage,
        reserveActive: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Create audit log
      await db.collection('auditLogs').add({
        action: 'reserve_hold_created',
        userId: context.auth.uid,
        targetType: 'user',
        targetId: userId,
        details: {
          percentage,
          duration,
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        message: `Reserve hold of ${percentage}% applied for ${duration} days`,
        expiresAt: expiresAt.toISOString(),
      };
    } catch (error: any) {
      console.error('Error creating reserve hold:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Scheduled: Release expired freezes and reserves
 */
export const pack383_releaseExpiredHolds = functions.pubsub
  .schedule('every 6 hours')
  .onRun(async (context) => {
    try {
      const now = admin.firestore.Timestamp.now();

      // Release expired freezes
      const expiredFreezesSnapshot = await db
        .collection('userPayoutFreezes')
        .where('freezeUntil', '<=', now)
        .get();

      const freezeReleasePromises = expiredFreezesSnapshot.docs.map(async (freezeDoc) => {
        const freeze = freezeDoc.data();

        // Unfreeze pending payouts
        const frozenPayouts = await db
          .collection('payouts')
          .where('userId', '==', freeze.userId)
          .where('status', '==', 'frozen')
          .get();

        const unfreezePromises = frozenPayouts.docs.map(doc =>
          doc.ref.update({
            status: 'pending',
            unfrozenAt: admin.firestore.FieldValue.serverTimestamp(),
          })
        );

        await Promise.all(unfreezePromises);

        // Delete freeze record
        await freezeDoc.ref.delete();

        console.log(`Released freeze for user ${freeze.userId}, unfroze ${frozenPayouts.size} payouts`);
      });

      await Promise.all(freezeReleasePromises);

      // Release expired reserves
      const expiredReservesSnapshot = await db
        .collection('payoutReserveHolds')
        .where('expiresAt', '<=', now)
        .where('status', '==', 'active')
        .get();

      const reserveReleasePromises = expiredReservesSnapshot.docs.map(async (reserveDoc) => {
        const reserve = reserveDoc.data();

        await reserveDoc.ref.update({
          status: 'expired',
          releasedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Update risk profile
        await db.collection('chargebackRiskProfiles').doc(reserve.userId).update({
          reservePercentage: 0,
          reserveActive: false,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log(`Released reserve hold for user ${reserve.userId}`);
      });

      await Promise.all(reserveReleasePromises);

      console.log(
        `Released ${expiredFreezesSnapshot.size} freezes and ${expiredReservesSnapshot.size} reserves`
      );

      return null;
    } catch (error) {
      console.error('Error releasing expired holds:', error);
      return null;
    }
  });

/**
 * Webhook: Handle chargeback notification
 * Called by payment processors
 */
export const pack383_handleChargebackNotification = functions.https.onRequest(
  async (req, res) => {
    // Verify webhook signature (implement based on payment processor)
    // if (!verifyWebhookSignature(req)) {
    //   res.status(401).send('Unauthorized');
    //   return;
    // }

    try {
      const {
        userId,
        transactionId,
        amount,
        currency,
        reason,
        disputeId,
      } = req.body;

      // Record chargeback
      await db.collection('chargebacks').add({
        userId,
        transactionId,
        amount,
        currency,
        reason,
        disputeId,
        status: 'received',
        receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Update transaction
      const transactionDoc = await db.collection('transactions').doc(transactionId).get();
      if (transactionDoc.exists) {
        await transactionDoc.ref.update({
          status: 'chargeback',
          disputed: true,
          chargebackDate: admin.firestore.FieldValue.serverTimestamp(),
          chargebackReason: reason,
        });
      }

      // Re-calculate chargeback risk
      const riskDetection = await pack383_detectChargebackRisk.run({ userId }, { auth: null } as any);

      // Auto-apply freeze if high risk
      if (riskDetection.riskScore >= 70) {
        await db.collection('userPayoutFreezes').doc(userId).set({
          userId,
          reason: 'Automatic freeze due to chargeback',
          freezeDays: 14,
          freezeUntil: admin.firestore.Timestamp.fromDate(
            new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
          ),
          appliedBy: 'auto_system',
          appliedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // Create audit log
      await db.collection('auditLogs').add({
        action: 'chargeback_received',
        userId: 'system',
        targetType: 'transaction',
        targetId: transactionId,
        details: {
          userId,
          amount,
          currency,
          reason,
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      res.status(200).json({ success: true, message: 'Chargeback processed' });
    } catch (error: any) {
      console.error('Error handling chargeback notification:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);
