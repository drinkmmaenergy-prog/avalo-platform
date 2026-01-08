/**
 * PACK 385 — Launch Phase Controller (Global Switchboard)
 * Controls the global rollout phase and feature visibility
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

/**
 * Launch phases in order of progression
 */
export enum LaunchPhase {
  INTERNAL = 'INTERNAL',
  BETA = 'BETA',
  SOFT_LAUNCH = 'SOFT_LAUNCH',
  REGIONAL_SCALE = 'REGIONAL_SCALE',
  GLOBAL_PUBLIC = 'GLOBAL_PUBLIC'
}

/**
 * Phase configuration determines what features are available
 */
interface PhaseConfig {
  featureVisibility: {
    discovery: boolean;
    referrals: boolean;
    tokenPurchase: boolean;
    payouts: boolean;
    ads: boolean;
    storeReviews: boolean;
  };
  limits: {
    maxDailyReferrals: number;
    maxSwipesPerDay: number;
    maxChatConcurrency: number;
    payoutThreshold: number;
  };
  discovery: {
    globalReach: boolean;
    regionalOnly: boolean;
    inviteOnly: boolean;
  };
}

/**
 * Phase configurations
 */
const PHASE_CONFIGS: Record<LaunchPhase, PhaseConfig> = {
  [LaunchPhase.INTERNAL]: {
    featureVisibility: {
      discovery: false,
      referrals: false,
      tokenPurchase: false,
      payouts: false,
      ads: false,
      storeReviews: false
    },
    limits: {
      maxDailyReferrals: 0,
      maxSwipesPerDay: 100,
      maxChatConcurrency: 5,
      payoutThreshold: 0
    },
    discovery: {
      globalReach: false,
      regionalOnly: false,
      inviteOnly: true
    }
  },
  [LaunchPhase.BETA]: {
    featureVisibility: {
      discovery: true,
      referrals: true,
      tokenPurchase: true,
      payouts: false,
      ads: false,
      storeReviews: false
    },
    limits: {
      maxDailyReferrals: 5,
      maxSwipesPerDay: 200,
      maxChatConcurrency: 10,
      payoutThreshold: 0
    },
    discovery: {
      globalReach: false,
      regionalOnly: true,
      inviteOnly: true
    }
  },
  [LaunchPhase.SOFT_LAUNCH]: {
    featureVisibility: {
      discovery: true,
      referrals: true,
      tokenPurchase: true,
      payouts: true,
      ads: false,
      storeReviews: true
    },
    limits: {
      maxDailyReferrals: 10,
      maxSwipesPerDay: 500,
      maxChatConcurrency: 20,
      payoutThreshold: 100
    },
    discovery: {
      globalReach: false,
      regionalOnly: true,
      inviteOnly: false
    }
  },
  [LaunchPhase.REGIONAL_SCALE]: {
    featureVisibility: {
      discovery: true,
      referrals: true,
      tokenPurchase: true,
      payouts: true,
      ads: true,
      storeReviews: true
    },
    limits: {
      maxDailyReferrals: 25,
      maxSwipesPerDay: 1000,
      maxChatConcurrency: 50,
      payoutThreshold: 50
    },
    discovery: {
      globalReach: false,
      regionalOnly: true,
      inviteOnly: false
    }
  },
  [LaunchPhase.GLOBAL_PUBLIC]: {
    featureVisibility: {
      discovery: true,
      referrals: true,
      tokenPurchase: true,
      payouts: true,
      ads: true,
      storeReviews: true
    },
    limits: {
      maxDailyReferrals: 50,
      maxSwipesPerDay: 2000,
      maxChatConcurrency: 100,
      payoutThreshold: 25
    },
    discovery: {
      globalReach: true,
      regionalOnly: false,
      inviteOnly: false
    }
  }
};

/**
 * Set global launch phase
 * Admin-only function
 */
export const pack385_setLaunchPhase = functions.https.onCall(async (data, context) => {
  // Admin authentication required
  if (!context.auth || !context.auth.token?.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { phase } = data;

  // Validate phase
  if (!Object.values(LaunchPhase).includes(phase)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid launch phase');
  }

  const config = PHASE_CONFIGS[phase as LaunchPhase];

  // Update global launch phase document
  await db.collection('launchPhases').doc('global').set({
    currentPhase: phase,
    config,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: context.auth.uid,
    history: admin.firestore.FieldValue.arrayUnion({
      phase,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      userId: context.auth.uid
    })
  }, { merge: true });

  // Log phase change
  await db.collection('auditLogs').add({
    type: 'LAUNCH_PHASE_CHANGE',
    severity: 'HIGH',
    userId: context.auth.uid,
    data: {
      newPhase: phase,
      config
    },
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });

  return {
    success: true,
    phase,
    config
  };
});

/**
 * Get current launch phase and configuration
 */
export const pack385_getLaunchPhase = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const phaseDoc = await db.collection('launchPhases').doc('global').get();
  
  if (!phaseDoc.exists) {
    // Default to INTERNAL if not set
    return {
      currentPhase: LaunchPhase.INTERNAL,
      config: PHASE_CONFIGS[LaunchPhase.INTERNAL]
    };
  }

  return phaseDoc.data();
});

/**
 * Check if a feature is enabled for current launch phase
 */
export const pack385_checkFeatureEnabled = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { feature } = data;

  const phaseDoc = await db.collection('launchPhases').doc('global').get();
  const currentPhase = phaseDoc.exists 
    ? phaseDoc.data()!.currentPhase 
    : LaunchPhase.INTERNAL;

  const config = PHASE_CONFIGS[currentPhase as LaunchPhase];

  return {
    enabled: config.featureVisibility[feature as keyof typeof config.featureVisibility] ?? false,
    phase: currentPhase
  };
});

/**
 * Get user limits based on current launch phase
 */
export const pack385_getUserLimits = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const phaseDoc = await db.collection('launchPhases').doc('global').get();
  const currentPhase = phaseDoc.exists 
    ? phaseDoc.data()!.currentPhase 
    : LaunchPhase.INTERNAL;

  const config = PHASE_CONFIGS[currentPhase as LaunchPhase];

  // Check if user is ambassador - they get higher limits
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  const isAmbassador = userDoc.data()?.isLaunchAmbassador || false;

  const limits = { ...config.limits };
  
  if (isAmbassador) {
    limits.maxDailyReferrals *= 2;
    limits.maxSwipesPerDay *= 1.5;
    limits.maxChatConcurrency *= 2;
  }

  return {
    limits,
    phase: currentPhase,
    isAmbassador
  };
});

/**
 * Background job: Enforce phase-based limits
 * Runs hourly to check and enforce limits
 */
export const pack385_enforcePhaseLimits = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async (context) => {
    const phaseDoc = await db.collection('launchPhases').doc('global').get();
    
    if (!phaseDoc.exists) return;

    const currentPhase = phaseDoc.data()!.currentPhase;
    const config = PHASE_CONFIGS[currentPhase as LaunchPhase];

    // Check users who have exceeded limits
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Get users with activity today
    const activitySnapshot = await db.collection('userActivity')
      .where('date', '==', today)
      .get();

    const batch = db.batch();
    let updated = 0;

    activitySnapshot.forEach((doc) => {
      const data = doc.data();
      const userId = doc.id;

      // Check if any limits are exceeded
      const violations = [];

      if (data.referralsToday > config.limits.maxDailyReferrals) {
        violations.push('referrals');
      }
      if (data.swipesToday > config.limits.maxSwipesPerDay) {
        violations.push('swipes');
      }

      if (violations.length > 0) {
        // Apply temporary restrictions
        batch.set(db.collection('userRestrictions').doc(userId), {
          violations,
          restrictedUntil: new Date(today.getTime() + 24 * 60 * 60 * 1000),
          reason: `Exceeded launch phase ${currentPhase} limits`,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        updated++;
      }
    });

    if (updated > 0) {
      await batch.commit();
    }

    console.log(`Enforced phase limits: ${updated} users restricted`);
  });
