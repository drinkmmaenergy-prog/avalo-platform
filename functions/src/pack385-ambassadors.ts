/**
 * PACK 385 — Creator & Ambassador Launch Program
 * Manages early access, boosted discovery, and revenue multipliers for launch ambassadors
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

/**
 * Ambassador tiers
 */
export enum AmbassadorTier {
  LOCAL = 'LOCAL',
  REGIONAL = 'REGIONAL',
  GLOBAL = 'GLOBAL'
}

/**
 * Ambassador program data
 */
interface LaunchAmbassador {
  userId: string;
  tier: AmbassadorTier;
  assignedAt: admin.firestore.Timestamp;
  assignedBy: string;
  region?: string;
  country?: string;
  benefits: {
    earlyAccessFlags: string[];
    boostedDiscoveryWindows: number; // hours per day
    revenueMultiplier: number;
    prioritySupport: boolean;
    exclusiveBadge: string;
  };
  performance: {
    referralsGenerated: number;
    contentCreated: number;
    engagementScore: number;
    revenueGenerated: number;
  };
  status: 'ACTIVE' | 'SUSPENDED' | 'GRADUATED';
}

/**
 * Tier configurations
 */
const TIER_CONFIGS = {
  [AmbassadorTier.LOCAL]: {
    earlyAccessFlags: ['BETA_FEATURES', 'EARLY_UPDATES'],
    boostedDiscoveryWindows: 4,
    revenueMultiplier: 1.2,
    prioritySupport: true,
    exclusiveBadge: 'LOCAL_AMBASSADOR',
    requirements: {
      minFollowers: 1000,
      minEngagement: 0.05
    }
  },
  [AmbassadorTier.REGIONAL]: {
    earlyAccessFlags: ['BETA_FEATURES', 'EARLY_UPDATES', 'PREMIUM_SETTINGS'],
    boostedDiscoveryWindows: 8,
    revenueMultiplier: 1.5,
    prioritySupport: true,
    exclusiveBadge: 'REGIONAL_AMBASSADOR',
    requirements: {
      minFollowers: 10000,
      minEngagement: 0.08
    }
  },
  [AmbassadorTier.GLOBAL]: {
    earlyAccessFlags: ['BETA_FEATURES', 'EARLY_UPDATES', 'PREMIUM_SETTINGS', 'ALPHA_ACCESS'],
    boostedDiscoveryWindows: 12,
    revenueMultiplier: 2.0,
    prioritySupport: true,
    exclusiveBadge: 'GLOBAL_AMBASSADOR',
    requirements: {
      minFollowers: 100000,
      minEngagement: 0.10
    }
  }
};

/**
 * Assign user as launch ambassador
 * Admin-only function
 */
export const pack385_assignLaunchAmbassador = functions.https.onCall(async (data, context) => {
  // Admin authentication required
  if (!context.auth || !context.auth.token?.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { userId, tier, region, country } = data;

  if (!userId || !tier) {
    throw new functions.https.HttpsError('invalid-argument', 'User ID and tier required');
  }

  // Validate tier
  if (!Object.values(AmbassadorTier).includes(tier)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid ambassador tier');
  }

  // Check if user exists
  const userDoc = await db.collection('users').doc(userId).get();
  
  if (!userDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'User not found');
  }

  // Get tier configuration
  const tierConfig = TIER_CONFIGS[tier as AmbassadorTier];

  // Create ambassador record
  const ambassador: LaunchAmbassador = {
    userId,
    tier: tier as AmbassadorTier,
    assignedAt: admin.firestore.FieldValue.serverTimestamp() as admin.firestore.Timestamp,
    assignedBy: context.auth.uid,
    region,
    country,
    benefits: {
      earlyAccessFlags: tierConfig.earlyAccessFlags,
      boostedDiscoveryWindows: tierConfig.boostedDiscoveryWindows,
      revenueMultiplier: tierConfig.revenueMultiplier,
      prioritySupport: tierConfig.prioritySupport,
      exclusiveBadge: tierConfig.exclusiveBadge
    },
    performance: {
      referralsGenerated: 0,
      contentCreated: 0,
      engagementScore: 0,
      revenueGenerated: 0
    },
    status: 'ACTIVE'
  };

  await db.collection('launchAmbassadors').doc(userId).set(ambassador);

  // Update user document
  await db.collection('users').doc(userId).update({
    isLaunchAmbassador: true,
    ambassadorTier: tier,
    badges: admin.firestore.FieldValue.arrayUnion(tierConfig.exclusiveBadge)
  });

  // Log assignment
  await db.collection('auditLogs').add({
    type: 'AMBASSADOR_ASSIGNED',
    severity: 'MEDIUM',
    userId: context.auth.uid,
    data: {
      ambassadorUserId: userId,
      tier,
      region,
      country
    },
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });

  return {
    success: true,
    userId,
    tier,
    benefits: ambassador.benefits
  };
});

/**
 * Get ambassador data
 */
export const pack385_getAmbassadorData = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = data.userId || context.auth.uid;

  const ambassadorDoc = await db.collection('launchAmbassadors').doc(userId).get();

  if (!ambassadorDoc.exists) {
    return { isAmbassador: false };
  }

  const ambassadorData = ambassadorDoc.data() as LaunchAmbassador;

  return {
    isAmbassador: true,
    ...ambassadorData
  };
});

/**
 * Apply revenue multiplier for ambassador
 */
export const pack385_applyAmbassadorMultiplier = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { userId, baseRevenue } = data;

  if (!userId || baseRevenue === undefined) {
    throw new functions.https.HttpsError('invalid-argument', 'User ID and base revenue required');
  }

  // Get ambassador data
  const ambassadorDoc = await db.collection('launchAmbassadors').doc(userId).get();

  if (!ambassadorDoc.exists || ambassadorDoc.data()!.status !== 'ACTIVE') {
    return {
      revenue: baseRevenue,
      multiplier: 1.0,
      isAmbassador: false
    };
  }

  const ambassador = ambassadorDoc.data() as LaunchAmbassador;
  const multiplier = ambassador.benefits.revenueMultiplier;
  const boostedRevenue = baseRevenue * multiplier;

  // Update performance metrics
  await ambassadorDoc.ref.update({
    'performance.revenueGenerated': admin.firestore.FieldValue.increment(boostedRevenue)
  });

  return {
    revenue: boostedRevenue,
    multiplier,
    isAmbassador: true,
    tier: ambassador.tier
  };
});

/**
 * Activate boosted discovery for ambassador
 */
export const pack385_activateAmbassadorBoost = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  // Get ambassador data
  const ambassadorDoc = await db.collection('launchAmbassadors').doc(userId).get();

  if (!ambassadorDoc.exists || ambassadorDoc.data()!.status !== 'ACTIVE') {
    throw new functions.https.HttpsError('failed-precondition', 'User is not an active ambassador');
  }

  const ambassador = ambassadorDoc.data() as LaunchAmbassador;

  // Check if boost is already active today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const existingBoost = await db.collection('discoveryBoosts')
    .where('userId', '==', userId)
    .where('activatedAt', '>=', today)
    .limit(1)
    .get();

  if (!existingBoost.empty) {
    const boostData = existingBoost.docs[0].data();
    return {
      active: true,
      expiresAt: boostData.expiresAt.toDate().toISOString(),
      hoursRemaining: Math.max(0, (boostData.expiresAt.toMillis() - Date.now()) / (1000 * 60 * 60))
    };
  }

  // Create new boost window
  const hoursAvailable = ambassador.benefits.boostedDiscoveryWindows;
  const expiresAt = new Date(Date.now() + hoursAvailable * 60 * 60 * 1000);

  await db.collection('discoveryBoosts').add({
    userId,
    activatedAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt,
    tier: ambassador.tier,
    status: 'ACTIVE'
  });

  return {
    active: true,
    expiresAt: expiresAt.toISOString(),
    hoursRemaining: hoursAvailable
  };
});

/**
 * Track ambassador performance
 */
export const pack385_trackAmbassadorPerformance = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { userId, metric, value } = data;

  if (!userId || !metric) {
    throw new functions.https.HttpsError('invalid-argument', 'User ID and metric required');
  }

  const ambassadorDoc = await db.collection('launchAmbassadors').doc(userId).get();

  if (!ambassadorDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Ambassador not found');
  }

  // Update performance metric
  const updatePath = `performance.${metric}`;
  await ambassadorDoc.ref.update({
    [updatePath]: admin.firestore.FieldValue.increment(value || 1)
  });

  return { success: true };
});

/**
 * Get ambassador leaderboard
 */
export const pack385_getAmbassadorLeaderboard = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { tier, metric, limit } = data;
  const metricField = `performance.${metric || 'engagementScore'}`;
  const limitCount = Math.min(limit || 50, 100);

  let query = db.collection('launchAmbassadors')
    .where('status', '==', 'ACTIVE')
    .orderBy(metricField, 'desc')
    .limit(limitCount);

  if (tier) {
    query = query.where('tier', '==', tier);
  }

  const snapshot = await query.get();

  const leaderboard = await Promise.all(
    snapshot.docs.map(async (doc, index) => {
      const data = doc.data() as LaunchAmbassador;
      const userDoc = await db.collection('users').doc(data.userId).get();
      const userData = userDoc.data();

      return {
        rank: index + 1,
        userId: data.userId,
        username: userData?.username || 'Unknown',
        tier: data.tier,
        performance: data.performance
      };
    })
  );

  return { leaderboard };
});

/**
 * Remove ambassador status
 */
export const pack385_removeAmbassador = functions.https.onCall(async (data, context) => {
  // Admin authentication required
  if (!context.auth || !context.auth.token?.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { userId, reason } = data;

  if (!userId) {
    throw new functions.https.HttpsError('invalid-argument', 'User ID required');
  }

  const ambassadorDoc = await db.collection('launchAmbassadors').doc(userId).get();

  if (!ambassadorDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Ambassador not found');
  }

  // Update status
  await ambassadorDoc.ref.update({
    status: 'SUSPENDED',
    suspendedAt: admin.firestore.FieldValue.serverTimestamp(),
    suspensionReason: reason || 'No reason provided'
  });

  // Update user document
  await db.collection('users').doc(userId).update({
    isLaunchAmbassador: false
  });

  // Log removal
  await db.collection('auditLogs').add({
    type: 'AMBASSADOR_REMOVED',
    severity: 'MEDIUM',
    userId: context.auth.uid,
    data: {
      ambassadorUserId: userId,
      reason
    },
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });

  return { success: true };
});

/**
 * Background job: Calculate ambassador engagement scores
 */
export const pack385_calculateAmbassadorScores = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    const ambassadorsSnapshot = await db.collection('launchAmbassadors')
      .where('status', '==', 'ACTIVE')
      .get();

    const batch = db.batch();
    let updated = 0;

    for (const doc of ambassadorsSnapshot.docs) {
      const data = doc.data() as LaunchAmbassador;
      const userId = data.userId;

      // Calculate engagement score
      const score = 
        (data.performance.referralsGenerated * 10) +
        (data.performance.contentCreated * 5) +
        (data.performance.revenueGenerated * 0.01);

      batch.update(doc.ref, {
        'performance.engagementScore': score,
        lastScoreUpdate: admin.firestore.FieldValue.serverTimestamp()
      });

      updated++;

      // Commit in batches of 500
      if (updated % 500 === 0) {
        await batch.commit();
      }
    }

    if (updated % 500 !== 0) {
      await batch.commit();
    }

    console.log(`Updated engagement scores for ${updated} ambassadors`);
  });
