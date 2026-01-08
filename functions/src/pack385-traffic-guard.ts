/**
 * PACK 385 — Load, Traffic & Scale Protection
 * Manages dynamic traffic throttling and resource protection during launch
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

/**
 * Traffic guard configuration
 */
interface TrafficGuard {
  enabled: boolean;
  level: 'NORMAL' | 'ELEVATED' | 'HIGH' | 'CRITICAL';
  triggers: {
    apiRateTightening: boolean;
    referralThrottles: boolean;
    swipeCapReduction: boolean;
    chatConcurrencyCaps: boolean;
    aiUsageBurstControl: boolean;
  };
  limits: {
    apiRequestsPerMinute: number;
    maxConcurrentChats: number;
    maxSwipesPerHour: number;
    maxReferralsPerHour: number;
    maxAIRequestsPerMinute: number;
  };
  updatedAt: admin.firestore.Timestamp;
}

/**
 * Default traffic guard levels
 */
const TRAFFIC_LEVELS = {
  NORMAL: {
    apiRequestsPerMinute: 1000,
    maxConcurrentChats: 10000,
    maxSwipesPerHour: 100,
    maxReferralsPerHour: 10,
    maxAIRequestsPerMinute: 500
  },
  ELEVATED: {
    apiRequestsPerMinute: 750,
    maxConcurrentChats: 7500,
    maxSwipesPerHour: 75,
    maxReferralsPerHour: 7,
    maxAIRequestsPerMinute: 350
  },
  HIGH: {
    apiRequestsPerMinute: 500,
    maxConcurrentChats: 5000,
    maxSwipesPerHour: 50,
    maxReferralsPerHour: 5,
    maxAIRequestsPerMinute: 200
  },
  CRITICAL: {
    apiRequestsPerMinute: 250,
    maxConcurrentChats: 2500,
    maxSwipesPerHour: 25,
    maxReferralsPerHour: 2,
    maxAIRequestsPerMinute: 100
  }
};

/**
 * Set traffic protection level
 * Admin-only function
 */
export const pack385_setTrafficLevel = functions.https.onCall(async (data, context) => {
  // Admin authentication required
  if (!context.auth || !context.auth.token?.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { level, reason } = data;

  if (!level || !Object.keys(TRAFFIC_LEVELS).includes(level)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid traffic level');
  }

  const limits = TRAFFIC_LEVELS[level as keyof typeof TRAFFIC_LEVELS];

  const trafficGuard: TrafficGuard = {
    enabled: true,
    level: level as TrafficGuard['level'],
    triggers: {
      apiRateTightening: level !== 'NORMAL',
      referralThrottles: level !== 'NORMAL',
      swipeCapReduction: level === 'HIGH' || level === 'CRITICAL',
      chatConcurrencyCaps: level === 'HIGH' || level === 'CRITICAL',
      aiUsageBurstControl: level !== 'NORMAL'
    },
    limits,
    updatedAt: admin.firestore.FieldValue.serverTimestamp() as admin.firestore.Timestamp
  };

  await db.collection('launchTrafficGuards').doc('global').set(trafficGuard);

  // Log level change
  await db.collection('auditLogs').add({
    type: 'TRAFFIC_LEVEL_CHANGE',
    severity: level === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
    userId: context.auth.uid,
    data: {
      level,
      reason: reason || 'Manual adjustment',
      limits
    },
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });

  return {
    success: true,
    level,
    limits
  };
});

/**
 * Get current traffic guard configuration
 */
export const pack385_getTrafficGuard = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const guardDoc = await db.collection('launchTrafficGuards').doc('global').get();

  if (!guardDoc.exists) {
    return {
      enabled: false,
      level: 'NORMAL',
      limits: TRAFFIC_LEVELS.NORMAL
    };
  }

  return guardDoc.data();
});

/**
 * Check if user action is within traffic limits
 */
export const pack385_checkTrafficLimit = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { action } = data;
  const userId = context.auth.uid;

  // Get traffic guard config
  const guardDoc = await db.collection('launchTrafficGuards').doc('global').get();
  
  if (!guardDoc.exists || !guardDoc.data()!.enabled) {
    return { allowed: true };
  }

  const guard = guardDoc.data() as TrafficGuard;

  // Check specific action limits
  let allowed = true;
  let reason = '';

  switch (action) {
    case 'swipe':
      allowed = await checkSwipeLimit(userId, guard.limits.maxSwipesPerHour);
      reason = 'Swipe limit exceeded';
      break;
    case 'chat':
      allowed = await checkChatLimit(userId, guard.limits.maxConcurrentChats);
      reason = 'Chat concurrency limit exceeded';
      break;
    case 'referral':
      allowed = await checkReferralLimit(userId, guard.limits.maxReferralsPerHour);
      reason = 'Referral limit exceeded';
      break;
    case 'ai':
      allowed = await checkAILimit(userId, guard.limits.maxAIRequestsPerMinute);
      reason = 'AI request limit exceeded';
      break;
    default:
      allowed = true;
  }

  if (!allowed) {
    // Log throttle event
    await db.collection('throttleEvents').add({
      userId,
      action,
      reason,
      level: guard.level,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  return {
    allowed,
    reason: allowed ? undefined : reason,
    level: guard.level
  };
});

/**
 * Check swipe limit (per hour)
 */
async function checkSwipeLimit(userId: string, maxPerHour: number): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const swipes = await db.collection('swipes')
    .where('userId', '==', userId)
    .where('timestamp', '>', oneHourAgo)
    .count()
    .get();

  return swipes.data().count < maxPerHour;
}

/**
 * Check concurrent chat limit
 */
async function checkChatLimit(userId: string, maxConcurrent: number): Promise<boolean> {
  const activeChats = await db.collection('chats')
    .where('participants', 'array-contains', userId)
    .where('status', '==', 'ACTIVE')
    .count()
    .get();

  return activeChats.data().count < maxConcurrent;
}

/**
 * Check referral limit (per hour)
 */
async function checkReferralLimit(userId: string, maxPerHour: number): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const referrals = await db.collection('referralAttribution')
    .where('inviterId', '==', userId)
    .where('attributedAt', '>', oneHourAgo)
    .count()
    .get();

  return referrals.data().count < maxPerHour;
}

/**
 * Check AI request limit (per minute)
 */
async function checkAILimit(userId: string, maxPerMinute: number): Promise<boolean> {
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000);

  const aiRequests = await db.collection('aiRequests')
    .where('userId', '==', userId)
    .where('timestamp', '>', oneMinuteAgo)
    .count()
    .get();

  return aiRequests.data().count < maxPerMinute;
}

/**
 * Dynamic traffic protection based on system load
 */
export const pack385_dynamicTrafficProtection = functions.https.onCall(async (data, context) => {
  // Admin or system authentication required
  if (!context.auth || !context.auth.token?.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  // Get current system metrics
  const metrics = await getSystemMetrics();

  // Determine appropriate traffic level
  let recommendedLevel: TrafficGuard['level'] = 'NORMAL';

  if (metrics.cpuUsage > 90 || metrics.errorRate > 10) {
    recommendedLevel = 'CRITICAL';
  } else if (metrics.cpuUsage > 75 || metrics.errorRate > 5) {
    recommendedLevel = 'HIGH';
  } else if (metrics.cpuUsage > 60 || metrics.errorRate > 2) {
    recommendedLevel = 'ELEVATED';
  }

  // Get current level
  const guardDoc = await db.collection('launchTrafficGuards').doc('global').get();
  const currentLevel = guardDoc.data()?.level || 'NORMAL';

  // Only change if different
  if (recommendedLevel !== currentLevel) {
    const limits = TRAFFIC_LEVELS[recommendedLevel];

    await db.collection('launchTrafficGuards').doc('global').set({
      enabled: true,
      level: recommendedLevel,
      triggers: {
        apiRateTightening: recommendedLevel !== 'NORMAL',
        referralThrottles: recommendedLevel !== 'NORMAL',
        swipeCapReduction: recommendedLevel === 'HIGH' || recommendedLevel === 'CRITICAL',
        chatConcurrencyCaps: recommendedLevel === 'HIGH' || recommendedLevel === 'CRITICAL',
        aiUsageBurstControl: recommendedLevel !== 'NORMAL'
      },
      limits,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      autoAdjusted: true
    });

    // Log auto-adjustment
    await db.collection('auditLogs').add({
      type: 'TRAFFIC_AUTO_ADJUSTED',
      severity: recommendedLevel === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
      data: {
        from: currentLevel,
        to: recommendedLevel,
        metrics
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  return {
    success: true,
    currentLevel: recommendedLevel,
    metrics
  };
});

/**
 * Get system metrics for traffic decisions
 */
async function getSystemMetrics(): Promise<{
  cpuUsage: number;
  memoryUsage: number;
  errorRate: number;
  activeUsers: number;
}> {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

  // Get error count
  const errors = await db.collection('errors')
    .where('timestamp', '>', fiveMinutesAgo)
    .count()
    .get();

  // Get active users count
  const activeUsers = await db.collection('userSessions')
    .where('lastActive', '>', fiveMinutesAgo)
    .count()
    .get();

  // Note: CPU and memory would come from Firebase monitoring
  // For now, we estimate based on error rate and user count
  const errorRate = errors.data().count / 5; // per minute
  const userCount = activeUsers.data().count;

  const estimatedCPU = Math.min(100, (userCount / 1000) * 60);
  const estimatedMemory = Math.min(100, (userCount / 800) * 50);

  return {
    cpuUsage: estimatedCPU,
    memoryUsage: estimatedMemory,
    errorRate,
    activeUsers: userCount
  };
}

/**
 * Throttle user temporarily for violations
 */
export const pack385_throttleUser = functions.https.onCall(async (data, context) => {
  // Admin authentication required
  if (!context.auth || !context.auth.token?.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { userId, duration, reason } = data;

  if (!userId || !duration) {
    throw new functions.https.HttpsError('invalid-argument', 'User ID and duration required');
  }

  const throttleUntil = new Date(Date.now() + duration * 1000);

  await db.collection('userThrottles').doc(userId).set({
    throttledUntil: throttleUntil,
    reason: reason || 'Traffic violation',
    throttledBy: context.auth.uid,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });

  return {
    success: true,
    userId,
    throttledUntil: throttleUntil.toISOString()
  };
});

/**
 * Background job: Monitor and adjust traffic protection
 */
export const pack385_monitorTrafficLoad = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async (context) => {
    const metrics = await getSystemMetrics();

    // Determine appropriate traffic level
    let recommendedLevel: TrafficGuard['level'] = 'NORMAL';

    if (metrics.cpuUsage > 90 || metrics.errorRate > 10) {
      recommendedLevel = 'CRITICAL';
    } else if (metrics.cpuUsage > 75 || metrics.errorRate > 5) {
      recommendedLevel = 'HIGH';
    } else if (metrics.cpuUsage > 60 || metrics.errorRate > 2) {
      recommendedLevel = 'ELEVATED';
    }

    // Get current level
    const guardDoc = await db.collection('launchTrafficGuards').doc('global').get();
    const currentLevel = guardDoc.data()?.level || 'NORMAL';

    // Only change if different
    if (recommendedLevel !== currentLevel) {
      const limits = TRAFFIC_LEVELS[recommendedLevel];

      await db.collection('launchTrafficGuards').doc('global').set({
        enabled: true,
        level: recommendedLevel,
        triggers: {
          apiRateTightening: recommendedLevel !== 'NORMAL',
          referralThrottles: recommendedLevel !== 'NORMAL',
          swipeCapReduction: recommendedLevel === 'HIGH' || recommendedLevel === 'CRITICAL',
          chatConcurrencyCaps: recommendedLevel === 'HIGH' || recommendedLevel === 'CRITICAL',
          aiUsageBurstControl: recommendedLevel !== 'NORMAL'
        },
        limits,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        autoAdjusted: true
      });

      console.log(`Traffic level auto-adjusted: ${currentLevel} -> ${recommendedLevel}`);

      // Create alert if CRITICAL
      if (recommendedLevel === 'CRITICAL') {
        await db.collection('alerts').add({
          type: 'CRITICAL_TRAFFIC_LOAD',
          severity: 'CRITICAL',
          data: {
            metrics,
            level: recommendedLevel
          },
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    }

    // Log metrics
    await db.collection('trafficMetrics').add({
      ...metrics,
      level: recommendedLevel,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
  });

/**
 * Background job: Clean up expired throttles
 */
export const pack385_cleanupThrottles = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async (context) => {
    const now = new Date();

    const expiredThrottles = await db.collection('userThrottles')
      .where('throttledUntil', '<=', now)
      .get();

    const batch = db.batch();
    expiredThrottles.forEach(doc => {
      batch.delete(doc.ref);
    });

    if (expiredThrottles.size > 0) {
      await batch.commit();
    }

    console.log(`Cleaned up ${expiredThrottles.size} expired throttles`);
  });
