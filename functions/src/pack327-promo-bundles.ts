/**
 * ============================================================================
 * PACK 327 — Creator Promo Bundles
 * ============================================================================
 * Subscriptions + Boosts + Tokens in One Purchase
 * 
 * Revenue Model: 100% Avalo (NO creator split on bundles)
 * Integrates with:
 * - PACK 277: Wallet & Token Store
 * - PACK 107: VIP/Royal Subscriptions
 * - PACK 325: Feed Boosts
 * 
 * @version 1.0.0
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { earnTokens } from './pack277-wallet-service';
import {
  PromoBundle,
  PromoBundlePurchase,
  PurchaseBundleRequest,
  PurchaseBundleResponse,
  GetBundlesResponse,
  GetUserPurchasesResponse,
  CreateBundleRequest,
  UpdateBundleRequest,
  DEFAULT_BUNDLES,
  PACK327_CONFIG,
  SubscriptionType,
} from './pack327-types';

const db = getFirestore();

// ============================================================================
// USER-FACING ENDPOINTS
// ============================================================================

/**
 * Get all available promo bundles
 */
export const pack327_getBundles = onCall(
  { region: 'europe-west3', maxInstances: 50 },
  async (request): Promise<GetBundlesResponse> => {
    try {
      const bundlesSnapshot = await db
        .collection('promoBundles')
        .where('available', '==', true)
        .orderBy('pricePLN', 'asc')
        .get();

      const bundles: PromoBundle[] = bundlesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as PromoBundle));

      return {
        success: true,
        bundles,
      };
    } catch (error: any) {
      logger.error('Error getting bundles:', error);
      throw new HttpsError('internal', 'Failed to fetch promo bundles');
    }
  }
);

/**
 * Purchase a promo bundle
 */
export const pack327_purchaseBundle = onCall(
  { region: 'europe-west3', maxInstances: 50, timeoutSeconds: 60 },
  async (request): Promise<PurchaseBundleResponse> => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const data = request.data as PurchaseBundleRequest;

    // Validate input
    if (!data.bundleId || !data.platform) {
      throw new HttpsError('invalid-argument', 'bundleId and platform are required');
    }

    if (!['WEB', 'IOS', 'ANDROID'].includes(data.platform)) {
      throw new HttpsError('invalid-argument', 'Invalid platform');
    }

    try {
      // Check user is 18+ and verified
      const userDoc = await db.collection('users').doc(uid).get();
      if (!userDoc.exists) {
        throw new HttpsError('not-found', 'User not found');
      }

      const userData = userDoc.data()!;
      const age = calculateAge(userData.dateOfBirth);
      if (age < 18) {
        throw new HttpsError('failed-precondition', 'Must be 18+ to purchase bundles');
      }

      if (userData.verificationStatus !== 'VERIFIED') {
        throw new HttpsError('failed-precondition', 'Must be verified to purchase bundles');
      }

      // Get bundle details
      const bundleDoc = await db.collection('promoBundles').doc(data.bundleId).get();
      if (!bundleDoc.exists) {
        throw new HttpsError('not-found', 'Bundle not found');
      }

      const bundle = { id: bundleDoc.id, ...bundleDoc.data() } as PromoBundle;

      if (!bundle.available) {
        throw new HttpsError('failed-precondition', 'Bundle is not available');
      }

      // TODO: Process payment based on platform
      // For now, we assume payment is completed (integrate with Stripe/IAP)
      // In production, you would verify payment here

      const now = new Date();
      const purchaseId = db.collection('promoBundlePurchases').doc().id;

      // Calculate expiry date for the bundle
      const maxDays = Math.max(
        bundle.includes.subscriptionDays || 0,
        bundle.includes.boostDays || 0
      );
      const expiresAt = new Date(now.getTime() + maxDays * 24 * 60 * 60 * 1000);

      // Create purchase record
      const purchase: Omit<PromoBundlePurchase, 'id'> = {
        userId: uid,
        bundleId: bundle.id,
        activatedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        subscriptionApplied: false,
        boostApplied: false,
        tokensCredited: false,
        createdAt: now.toISOString(),
      };

      await db.collection('promoBundlePurchases').doc(purchaseId).set(purchase);

      // Apply bundle benefits
      const applied: PurchaseBundleResponse['applied'] = {};

      // 1. Apply Subscription (if included)
      if (bundle.includes.subscriptionType && bundle.includes.subscriptionDays) {
        try {
          await applySubscription(
            uid,
            bundle.includes.subscriptionType,
            bundle.includes.subscriptionDays
          );
          
          applied.subscription = {
            type: bundle.includes.subscriptionType,
            expiresAt: new Date(now.getTime() + bundle.includes.subscriptionDays * 24 * 60 * 60 * 1000).toISOString(),
          };

          await db.collection('promoBundlePurchases').doc(purchaseId).update({
            subscriptionApplied: true,
          });
        } catch (error: any) {
          logger.error('Error applying subscription:', error);
          // Don't fail the whole purchase, log for manual review
        }
      }

      // 2. Apply Boost (if included)
      if (bundle.includes.boostDays && bundle.includes.boostMultiplier) {
        try {
          await applyBoost(
            uid,
            bundle.includes.boostDays,
            bundle.includes.boostMultiplier
          );

          applied.boost = {
            expiresAt: new Date(now.getTime() + bundle.includes.boostDays * 24 * 60 * 60 * 1000).toISOString(),
            multiplier: bundle.includes.boostMultiplier,
          };

          await db.collection('promoBundlePurchases').doc(purchaseId).update({
            boostApplied: true,
          });
        } catch (error: any) {
          logger.error('Error applying boost:', error);
        }
      }

      // 3. Credit Bonus Tokens (if included)
      if (bundle.includes.bonusTokens && bundle.includes.bonusTokens > 0) {
        try {
          const tokenResult = await earnTokens({
            userId: uid,
            amountTokens: bundle.includes.bonusTokens,
            source: 'BONUS',
            relatedId: purchaseId,
            metadata: {
              bundleId: bundle.id,
              bundleTitle: bundle.title,
              purchaseId,
              contextType: 'PROMO_BUNDLE',
            },
          });

          if (tokenResult.success) {
            applied.tokens = {
              amount: bundle.includes.bonusTokens,
              newBalance: tokenResult.newBalance || 0,
            };

            await db.collection('promoBundlePurchases').doc(purchaseId).update({
              tokensCredited: true,
              walletTransactionId: tokenResult.txId,
            });
          }
        } catch (error: any) {
          logger.error('Error crediting tokens:', error);
        }
      }

      // Record analytics
      await recordBundleAnalytics(bundle.id, data.platform, bundle.pricePLN);

      logger.info(`Bundle purchased: ${purchaseId} by ${uid}`, {
        bundleId: bundle.id,
        platform: data.platform,
      });

      return {
        success: true,
        purchaseId,
        bundle,
        applied,
      };
    } catch (error: any) {
      logger.error('Error purchasing bundle:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError('internal', `Failed to purchase bundle: ${error.message}`);
    }
  }
);

/**
 * Get user's bundle purchases
 */
export const pack327_getUserPurchases = onCall(
  { region: 'europe-west3', maxInstances: 50 },
  async (request): Promise<GetUserPurchasesResponse> => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
      const purchasesSnapshot = await db
        .collection('promoBundlePurchases')
        .where('userId', '==', uid)
        .orderBy('activatedAt', 'desc')
        .limit(20)
        .get();

      const purchases: PromoBundlePurchase[] = purchasesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as PromoBundlePurchase));

      return {
        success: true,
        purchases,
      };
    } catch (error: any) {
      logger.error('Error getting user purchases:', error);
      throw new HttpsError('internal', 'Failed to fetch purchases');
    }
  }
);

// ============================================================================
// ADMIN ENDPOINTS
// ============================================================================

/**
 * Create a new promo bundle (admin only)
 */
export const pack327_admin_createBundle = onCall(
  { region: 'europe-west3', maxInstances: 10 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Check admin role
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const data = request.data as CreateBundleRequest;

    // Validate input
    if (!data.title || !data.description || !data.includes || !data.pricePLN) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }

    if (data.pricePLN < PACK327_CONFIG.MIN_BUNDLE_PRICE_PLN || 
        data.pricePLN > PACK327_CONFIG.MAX_BUNDLE_PRICE_PLN) {
      throw new HttpsError('invalid-argument', 'Invalid bundle price');
    }

    try {
      const now = new Date().toISOString();
      const priceTokensEquivalent = Math.round(data.pricePLN / PACK327_CONFIG.TOKEN_CONVERSION_RATE);

      const bundle: Omit<PromoBundle, 'id'> = {
        title: data.title,
        description: data.description,
        includes: data.includes,
        pricePLN: data.pricePLN,
        priceTokensEquivalent,
        available: true,
        createdAt: now,
      };

      const bundleRef = await db.collection('promoBundles').add(bundle);

      logger.info(`Bundle created: ${bundleRef.id} by admin ${uid}`);

      return {
        success: true,
        bundleId: bundleRef.id,
        bundle: {
          ...bundle,
          id: bundleRef.id,
        },
      };
    } catch (error: any) {
      logger.error('Error creating bundle:', error);
      throw new HttpsError('internal', 'Failed to create bundle');
    }
  }
);

/**
 * Update a promo bundle (admin only)
 */
export const pack327_admin_updateBundle = onCall(
  { region: 'europe-west3', maxInstances: 10 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Check admin role
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const data = request.data as UpdateBundleRequest;

    if (!data.bundleId) {
      throw new HttpsError('invalid-argument', 'bundleId is required');
    }

    try {
      const bundleRef = db.collection('promoBundles').doc(data.bundleId);
      const bundleDoc = await bundleRef.get();

      if (!bundleDoc.exists) {
        throw new HttpsError('not-found', 'Bundle not found');
      }

      const updates: any = {
        updatedAt: new Date().toISOString(),
      };

      if (data.title !== undefined) updates.title = data.title;
      if (data.description !== undefined) updates.description = data.description;
      if (data.includes !== undefined) {
        // Merge includes
        const currentIncludes = bundleDoc.data()!.includes;
        updates.includes = { ...currentIncludes, ...data.includes };
      }
      if (data.pricePLN !== undefined) {
        if (data.pricePLN < PACK327_CONFIG.MIN_BUNDLE_PRICE_PLN || 
            data.pricePLN > PACK327_CONFIG.MAX_BUNDLE_PRICE_PLN) {
          throw new HttpsError('invalid-argument', 'Invalid bundle price');
        }
        updates.pricePLN = data.pricePLN;
        updates.priceTokensEquivalent = Math.round(data.pricePLN / PACK327_CONFIG.TOKEN_CONVERSION_RATE);
      }
      if (data.available !== undefined) updates.available = data.available;

      await bundleRef.update(updates);

      logger.info(`Bundle updated: ${data.bundleId} by admin ${uid}`);

      return {
        success: true,
        bundleId: data.bundleId,
      };
    } catch (error: any) {
      logger.error('Error updating bundle:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError('internal', 'Failed to update bundle');
    }
  }
);

/**
 * Initialize default bundles (admin only, run once)
 */
export const pack327_admin_initDefaultBundles = onCall(
  { region: 'europe-west3', maxInstances: 1 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Check admin role
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    try {
      const batch = db.batch();
      const now = new Date().toISOString();
      const createdBundles: string[] = [];

      for (const bundleData of DEFAULT_BUNDLES) {
        const bundleRef = db.collection('promoBundles').doc();
        batch.set(bundleRef, {
          ...bundleData,
          createdAt: now,
        });
        createdBundles.push(bundleRef.id);
      }

      await batch.commit();

      logger.info(`Default bundles initialized: ${createdBundles.length} bundles created`);

      return {
        success: true,
        bundlesCreated: createdBundles.length,
        bundleIds: createdBundles,
      };
    } catch (error: any) {
      logger.error('Error initializing default bundles:', error);
      throw new HttpsError('internal', 'Failed to initialize bundles');
    }
  }
);

/**
 * Get bundle analytics (admin only)
 */
export const pack327_admin_getBundleAnalytics = onCall(
  { region: 'europe-west3', maxInstances: 10 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Check admin role
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const { bundleId, startDate, endDate, limit = 30 } = request.data;

    try {
      let query = db.collection('bundleAnalytics').orderBy('date', 'desc').limit(limit);

      if (bundleId) {
        query = query.where('bundleId', '==', bundleId);
      }

      if (startDate) {
        query = query.where('date', '>=', startDate);
      }

      if (endDate) {
        query = query.where('date', '<=', endDate);
      }

      const snapshot = await query.get();
      const analytics = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      // Calculate totals
      const totals = analytics.reduce(
        (acc, item: any) => {
          acc.totalPurchases += item.totalPurchases || 0;
          acc.totalRevenuePLN += item.totalRevenuePLN || 0;
          acc.platformBreakdown.web += item.platformBreakdown?.web || 0;
          acc.platformBreakdown.ios += item.platformBreakdown?.ios || 0;
          acc.platformBreakdown.android += item.platformBreakdown?.android || 0;
          return acc;
        },
        {
          totalPurchases: 0,
          totalRevenuePLN: 0,
          platformBreakdown: { web: 0, ios: 0, android: 0 },
        }
      );

      return {
        success: true,
        analytics,
        totals,
      };
    } catch (error: any) {
      logger.error('Error getting bundle analytics:', error);
      throw new HttpsError('internal', 'Failed to fetch analytics');
    }
  }
);

/**
 * Get bundle sales summary (admin only)
 */
export const pack327_admin_getSalesSummary = onCall(
  { region: 'europe-west3', maxInstances: 10 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Check admin role
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    try {
      // Get total purchases count
      const purchasesSnapshot = await db.collection('promoBundlePurchases').count().get();
      const totalPurchases = purchasesSnapshot.data().count;

      // Get bundles with purchase counts
      const bundlesSnapshot = await db.collection('promoBundles').get();
      const bundleStats = await Promise.all(
        bundlesSnapshot.docs.map(async (doc) => {
          const bundle = doc.data();
          const purchaseCount = await db
            .collection('promoBundlePurchases')
            .where('bundleId', '==', doc.id)
            .count()
            .get();

          return {
            bundleId: doc.id,
            title: bundle.title,
            pricePLN: bundle.pricePLN,
            available: bundle.available,
            totalPurchases: purchaseCount.data().count,
            totalRevenue: purchaseCount.data().count * bundle.pricePLN,
          };
        })
      );

      // Sort by revenue
      bundleStats.sort((a, b) => b.totalRevenue - a.totalRevenue);

      const totalRevenue = bundleStats.reduce((sum, stat) => sum + stat.totalRevenue, 0);

      return {
        success: true,
        summary: {
          totalPurchases,
          totalRevenuePLN: totalRevenue,
          averageOrderValue: totalPurchases > 0 ? totalRevenue / totalPurchases : 0,
          bundleStats,
        },
      };
    } catch (error: any) {
      logger.error('Error getting sales summary:', error);
      throw new HttpsError('internal', 'Failed to fetch sales summary');
    }
  }
);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Apply subscription to user profile
 */
async function applySubscription(
  userId: string,
  subscriptionType: SubscriptionType,
  durationDays: number
): Promise<void> {
  const now = Timestamp.now();
  const expiresAt = Timestamp.fromMillis(now.toMillis() + durationDays * 24 * 60 * 60 * 1000);

  const membershipRef = db.collection('user_membership').doc(userId);

  // Check if user already has membership
  const membershipDoc = await membershipRef.get();
  
  if (membershipDoc.exists) {
    const current = membershipDoc.data();
    // Extend existing subscription
    const currentExpiry = current?.expiresAt || now;
    const newExpiry = Timestamp.fromMillis(
      Math.max(currentExpiry.toMillis(), now.toMillis()) + durationDays * 24 * 60 * 60 * 1000
    );

    await membershipRef.update({
      tier: subscriptionType === 'VIP' ? 'VIP' : 'ROYAL_CLUB',
      status: 'ACTIVE',
      expiresAt: newExpiry,
      updatedAt: now,
    });
  } else {
    // Create new membership
    await membershipRef.set({
      userId,
      tier: subscriptionType === 'VIP' ? 'VIP' : 'ROYAL_CLUB',
      status: 'ACTIVE',
      billingCycle: 'ONE_TIME',
      purchasedAt: now,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });
  }

  logger.info(`Subscription applied: ${subscriptionType} for ${durationDays} days to user ${userId}`);
}

/**
 * Apply boost to user profile
 */
async function applyBoost(
  userId: string,
  durationDays: number,
  multiplier: number
): Promise<void> {
  const now = Timestamp.now();
  const expiresAt = Timestamp.fromMillis(now.toMillis() + durationDays * 24 * 60 * 60 * 1000);

  const userRef = db.collection('users').doc(userId);

  // Check if user already has boost
  const userDoc = await userRef.get();
  const userData = userDoc.data();

  if (userData?.boostExpiresAt && userData.boostExpiresAt.toMillis() > now.toMillis()) {
    // Extend existing boost
    const currentExpiry = userData.boostExpiresAt;
    const newExpiry = Timestamp.fromMillis(currentExpiry.toMillis() + durationDays * 24 * 60 * 60 * 1000);

    await userRef.update({
      boostExpiresAt: newExpiry,
      boostMultiplier: Math.max(userData.boostMultiplier || 1, multiplier),
    });
  } else {
    // Apply new boost
    await userRef.update({
      boostExpiresAt: expiresAt,
      boostMultiplier: multiplier,
    });
  }

  logger.info(`Boost applied: ${multiplier}x for ${durationDays} days to user ${userId}`);
}

/**
 * Record bundle analytics
 */
async function recordBundleAnalytics(
  bundleId: string,
  platform: string,
  revenuePLN: number
): Promise<void> {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const analyticsRef = db.collection('bundleAnalytics').doc(`${bundleId}_${today}`);

  await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(analyticsRef);

    if (doc.exists) {
      const current = doc.data()!;
      transaction.update(analyticsRef, {
        totalPurchases: FieldValue.increment(1),
        totalRevenuePLN: FieldValue.increment(revenuePLN),
        [`platformBreakdown.${platform.toLowerCase()}`]: FieldValue.increment(1),
      });
    } else {
      transaction.set(analyticsRef, {
        bundleId,
        date: today,
        totalPurchases: 1,
        totalRevenuePLN: revenuePLN,
        platformBreakdown: {
          web: platform === 'WEB' ? 1 : 0,
          ios: platform === 'IOS' ? 1 : 0,
          android: platform === 'ANDROID' ? 1 : 0,
        },
        createdAt: new Date().toISOString(),
      });
    }
  });
}

/**
 * Calculate age from date of birth
 */
function calculateAge(dateOfBirth: any): number {
  if (!dateOfBirth) return 0;

  let dob: Date;
  if (dateOfBirth.toDate) {
    dob = dateOfBirth.toDate();
  } else if (typeof dateOfBirth === 'string') {
    dob = new Date(dateOfBirth);
  } else {
    return 0;
  }

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }

  return age;
}

logger.info('✅ PACK 327 - Creator Promo Bundles loaded successfully');