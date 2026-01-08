/**
 * PACK 383 - Global Payment Routing, Compliance & Cross-Border Payout Engine
 * Payout Frequency & Limit Management
 * 
 * Enforces:
 * - Daily payout caps per risk tier
 * - Monthly payout caps per country
 * - Dynamic limits for new accounts
 * - Progressive unlock with clean history
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// Payout Limit Configuration
interface PayoutLimitConfig {
  riskTier: number; // 1-5
  dailyLimit: number;
  monthlyLimit: number;
  perTransactionLimit: number;
  cooldownPeriod: number; // hours between payouts
}

// Default limits by risk tier
const DEFAULT_LIMITS: Record<number, PayoutLimitConfig> = {
  1: { // Lowest risk
    riskTier: 1,
    dailyLimit: 50000,
    monthlyLimit: 500000,
    perTransactionLimit: 25000,
    cooldownPeriod: 0,
  },
  2: { // Low risk
    riskTier: 2,
    dailyLimit: 20000,
    monthlyLimit: 200000,
    perTransactionLimit: 10000,
    cooldownPeriod: 0,
  },
  3: { // Medium risk (default)
    riskTier: 3,
    dailyLimit: 5000,
    monthlyLimit: 50000,
    perTransactionLimit: 2500,
    cooldownPeriod: 6,
  },
  4: { // High risk
    riskTier: 4,
    dailyLimit: 1000,
    monthlyLimit: 10000,
    perTransactionLimit: 500,
    cooldownPeriod: 24,
  },
  5: { // Critical risk
    riskTier: 5,
    dailyLimit: 500,
    monthlyLimit: 5000,
    perTransactionLimit: 250,
    cooldownPeriod: 48,
  },
};

/**
 * Check if payout is within limits
 */
export const pack383_enforcePayoutLimits = functions.https.onCall(
  async (data: { userId: string; requestAmount: number; currency?: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { userId, requestAmount, currency = 'USD' } = data;

    try {
      // Get user risk tier
      const userRiskProfile = await getUserRiskTier(userId);
      const limitConfig = DEFAULT_LIMITS[userRiskProfile.tier] || DEFAULT_LIMITS[3];

      // Convert request amount to USD for limit comparison
      const amountInUSD = currency === 'USD' ? requestAmount : await convertToUSD(requestAmount, currency);

      // Check per-transaction limit
      if (amountInUSD > limitConfig.perTransactionLimit) {
        return {
          allowed: false,
          reason: `Amount exceeds per-transaction limit of ${limitConfig.perTransactionLimit} USD`,
          limits: {
            perTransaction: limitConfig.perTransactionLimit,
            daily: limitConfig.dailyLimit,
            monthly: limitConfig.monthlyLimit,
          },
        };
      }

      // Check daily limit
      const dailyTotal = await getDailyPayoutTotal(userId);
      if (dailyTotal + amountInUSD > limitConfig.dailyLimit) {
        return {
          allowed: false,
          reason: `Would exceed daily limit of ${limitConfig.dailyLimit} USD`,
          currentUsage: {
            daily: dailyTotal,
            remaining: Math.max(0, limitConfig.dailyLimit - dailyTotal),
          },
        };
      }

      // Check monthly limit
      const monthlyTotal = await getMonthlyPayoutTotal(userId);
      if (monthlyTotal + amountInUSD > limitConfig.monthlyLimit) {
        return {
          allowed: false,
          reason: `Would exceed monthly limit of ${limitConfig.monthlyLimit} USD`,
          currentUsage: {
            monthly: monthlyTotal,
            remaining: Math.max(0, limitConfig.monthlyLimit - monthlyTotal),
          },
        };
      }

      // Check cooldown period
      if (limitConfig.cooldownPeriod > 0) {
        const lastPayout = await getLastPayoutTime(userId);
        if (lastPayout) {
          const hoursSinceLastPayout = (Date.now() - lastPayout.getTime()) / (1000 * 60 * 60);
          if (hoursSinceLastPayout < limitConfig.cooldownPeriod) {
            return {
              allowed: false,
              reason: `Cooldown period not met. Must wait ${limitConfig.cooldownPeriod} hours between payouts`,
              hoursRemaining: Math.ceil(limitConfig.cooldownPeriod - hoursSinceLastPayout),
            };
          }
        }
      }

      // All checks passed
      return {
        allowed: true,
        limits: {
          perTransaction: limitConfig.perTransactionLimit,
          daily: limitConfig.dailyLimit,
          monthly: limitConfig.monthlyLimit,
        },
        currentUsage: {
          daily: dailyTotal,
          monthly: monthlyTotal,
        },
        remaining: {
          dailyAmount: limitConfig.dailyLimit - dailyTotal - amountInUSD,
          monthlyAmount: limitConfig.monthlyLimit - monthlyTotal - amountInUSD,
        },
      };
    } catch (error: any) {
      console.error('Error enforcing payout limits:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Get user payout limits
 */
export const pack383_getUserPayoutLimits = functions.https.onCall(
  async (data: { userId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { userId } = data;

    // Verify user can access this information
    if (context.auth.uid !== userId) {
      const userDoc = await db.collection('users').doc(context.auth.uid).get();
      if (!userDoc.exists || userDoc.data()!.role !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 'Cannot access another user\'s limits');
      }
    }

    try {
      const userRiskProfile = await getUserRiskTier(userId);
      const limitConfig = DEFAULT_LIMITS[userRiskProfile.tier] || DEFAULT_LIMITS[3];

      const dailyTotal = await getDailyPayoutTotal(userId);
      const monthlyTotal = await getMonthlyPayoutTotal(userId);
      const lastPayout = await getLastPayoutTime(userId);

      return {
        success: true,
        riskTier: userRiskProfile.tier,
        limits: {
          perTransaction: limitConfig.perTransactionLimit,
          daily: limitConfig.dailyLimit,
          monthly: limitConfig.monthlyLimit,
          cooldownPeriod: limitConfig.cooldownPeriod,
        },
        currentUsage: {
          daily: dailyTotal,
          monthly: monthlyTotal,
        },
        remaining: {
          daily: Math.max(0, limitConfig.dailyLimit - dailyTotal),
          monthly: Math.max(0, limitConfig.monthlyLimit - monthlyTotal),
        },
        lastPayoutAt: lastPayout?.toISOString() || null,
        eligibleForPayout: lastPayout 
          ? (Date.now() - lastPayout.getTime()) / (1000 * 60 * 60) >= limitConfig.cooldownPeriod
          : true,
      };
    } catch (error: any) {
      console.error('Error getting user payout limits:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Upgrade user risk tier (progressive unlock)
 * Called by admin or automated system based on clean history
 */
export const pack383_upgradeUserRiskTier = functions.https.onCall(
  async (data: { userId: string; newTier: number; reason: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { userId, newTier, reason } = data;

    // Verify admin
    const adminDoc = await db.collection('users').doc(context.auth.uid).get();
    if (!adminDoc.exists || adminDoc.data()!.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }

    try {
      if (newTier < 1 || newTier > 5) {
        throw new functions.https.HttpsError('invalid-argument', 'Risk tier must be between 1 and 5');
      }

      const currentProfile = await getUserRiskTier(userId);

      await db.collection('userRiskProfiles').doc(userId).set({
        userId,
        tier: newTier,
        previousTier: currentProfile.tier,
        updatedBy: context.auth.uid,
        updateReason: reason,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      // Create audit log
      await db.collection('auditLogs').add({
        action: 'risk_tier_updated',
        userId: context.auth.uid,
        targetType: 'user_risk_profile',
        targetId: userId,
        details: {
          previousTier: currentProfile.tier,
          newTier,
          reason,
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        message: `Risk tier updated from ${currentProfile.tier} to ${newTier}`,
        newLimits: DEFAULT_LIMITS[newTier],
      };
    } catch (error: any) {
      console.error('Error upgrading user risk tier:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Scheduled: Auto-upgrade risk tiers for users with clean history
 */
export const pack383_autoUpgradeRiskTiers = functions.pubsub
  .schedule('0 0 * * 0') // Weekly on Sunday at midnight
  .onRun(async (context) => {
    try {
      // Get users at risk tier 3-5 (eligible for upgrade)
      const usersSnapshot = await db
        .collection('userRiskProfiles')
        .where('tier', '>=', 3)
        .get();

      if (usersSnapshot.empty) {
        console.log('No users eligible for risk tier upgrade');
        return null;
      }

      const upgradePromises = usersSnapshot.docs.map(async (profileDoc) => {
        const profile = profileDoc.data();
        const userId = profile.userId;

        try {
          // Check payout history
          const threeMonthsAgo = new Date();
          threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

          const payoutsSnapshot = await db
            .collection('payouts')
            .where('userId', '==', userId)
            .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(threeMonthsAgo))
            .get();

          if (payoutsSnapshot.empty) {
            return; // Not enough history
          }

          // Check for failed/blocked payouts
          const failedCount = payoutsSnapshot.docs.filter(doc => {
            const status = doc.data().status;
            return status === 'failed' || status === 'blocked';
          }).length;

          const successRate = (payoutsSnapshot.size - failedCount) / payoutsSnapshot.size;

          // Check for fraud flags
          const fraudSnapshot = await db
            .collection('fraudDetectionLogs')
            .where('userId', '==', userId)
            .where('flagged', '==', true)
            .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(threeMonthsAgo))
            .get();

          // Upgrade criteria:
          // - At least 10 successful payouts
          // - 95%+ success rate
          // - No fraud flags in last 3 months
          if (payoutsSnapshot.size >= 10 && successRate >= 0.95 && fraudSnapshot.empty) {
            const currentTier = profile.tier;
            const newTier = Math.max(1, currentTier - 1); // Move down one tier (lower is better)

            if (newTier < currentTier) {
              await db.collection('userRiskProfiles').doc(userId).update({
                tier: newTier,
                previousTier: currentTier,
                updatedBy: 'auto_system',
                updateReason: 'Clean payment history - auto-upgraded',
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });

              console.log(`Auto-upgraded user ${userId} from tier ${currentTier} to ${newTier}`);
            }
          }
        } catch (error) {
          console.error(`Error processing user ${userId}:`, error);
        }
      });

      await Promise.all(upgradePromises);

      console.log(`Processed ${usersSnapshot.size} users for risk tier auto-upgrade`);
      return null;
    } catch (error) {
      console.error('Error in auto risk tier upgrade:', error);
      return null;
    }
  });

// ============================================================================
// Helper Functions
// ============================================================================

async function getUserRiskTier(userId: string): Promise<{ tier: number; score: number }> {
  const riskDoc = await db.collection('userRiskProfiles').doc(userId).get();
  if (riskDoc.exists) {
    const data = riskDoc.data()!;
    return { tier: data.tier || 3, score: data.score || 50 };
  }

  // Create default risk profile
  await db.collection('userRiskProfiles').doc(userId).set({
    userId,
    tier: 3, // Default medium risk
    score: 50,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { tier: 3, score: 50 };
}

async function getDailyPayoutTotal(userId: string): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const payoutsSnapshot = await db
    .collection('payouts')
    .where('userId', '==', userId)
    .where('status', 'in', ['pending', 'processing', 'completed'])
    .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(today))
    .get();

  let total = 0;
  for (const doc of payoutsSnapshot.docs) {
    const payout = doc.data();
    const amountInUSD = await convertToUSD(payout.grossAmount || 0, payout.currency || 'USD');
    total += amountInUSD;
  }

  return total;
}

async function getMonthlyPayoutTotal(userId: string): Promise<number> {
  const firstDayOfMonth = new Date();
  firstDayOfMonth.setDate(1);
  firstDayOfMonth.setHours(0, 0, 0, 0);

  const payoutsSnapshot = await db
    .collection('payouts')
    .where('userId', '==', userId)
    .where('status', 'in', ['pending', 'processing', 'completed'])
    .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(firstDayOfMonth))
    .get();

  let total = 0;
  for (const doc of payoutsSnapshot.docs) {
    const payout = doc.data();
    const amountInUSD = await convertToUSD(payout.grossAmount || 0, payout.currency || 'USD');
    total += amountInUSD;
  }

  return total;
}

async function getLastPayoutTime(userId: string): Promise<Date | null> {
  const lastPayoutSnapshot = await db
    .collection('payouts')
    .where('userId', '==', userId)
    .where('status', '==', 'completed')
    .orderBy('completedAt', 'desc')
    .limit(1)
    .get();

  if (lastPayoutSnapshot.empty) {
    return null;
  }

  const lastPayout = lastPayoutSnapshot.docs[0].data();
  return lastPayout.completedAt?.toDate() || null;
}

async function convertToUSD(amount: number, fromCurrency: string): Promise<number> {
  if (fromCurrency === 'USD') {
    return amount;
  }

  // Get latest FX rate
  const fxSnapshot = await db
    .collection('fxRates')
    .where('from', '==', fromCurrency)
    .where('to', '==', 'USD')
    .orderBy('timestamp', 'desc')
    .limit(1)
    .get();

  if (!fxSnapshot.empty) {
    const rate = fxSnapshot.docs[0].data().rate;
    return amount * rate;
  }

  // Fallback: simplified conversion
  const simplifiedRates: Record<string, number> = {
    'PLN': 0.25,
    'EUR': 1.09,
    'GBP': 1.27,
    'CAD': 0.74,
    'AUD': 0.68,
  };

  return amount * (simplifiedRates[fromCurrency] || 1);
}
