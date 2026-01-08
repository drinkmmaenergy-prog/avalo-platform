/**
 * PACK 315 - Push Notifications & Growth Funnels
 * Growth Funnel Cron Jobs (Activation & Retention)
 */

import { getFirestore, Firestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { enqueueNotification } from './enqueue';
import { NotificationType } from './types';

// ============================================================================
// Configuration
// ============================================================================

const ACTIVATION_CONFIG = {
  // Days since registration to trigger activation nudges
  checkDaysAfterRegistration: [1, 3, 7],
  // Maximum nudges per user per funnel
  maxNudgesPerFunnel: 3,
  // Cooldown between nudges (hours)
  nudgeCooldownHours: 24
};

const RETENTION_CONFIG = {
  // Days of inactivity to trigger retention nudges
  inactiveDays: [3, 7, 14],
  // Maximum nudges per user per retention period
  maxNudgesPerPeriod: 2,
  // Cooldown between nudges (hours)
  nudgeCooldownHours: 48
};

// ============================================================================
// Activation Funnel Cron Job
// ============================================================================

/**
 * Run daily to check for users who need activation nudges
 * Focuses on profile completion, photos, verification, and first swipe
 */
export const activationNudgesCron = onSchedule(
  {
    schedule: 'every day 10:00',
    timeZone: 'UTC',
    memory: '512MiB',
    timeoutSeconds: 540
  },
  async (event) => {
    const db = getFirestore();
    
    try {
      logger.info('Starting activation nudges cron job');
      
      let totalNudgesScheduled = 0;
      
      // Process each activation day milestone
      for (const daysAgo of ACTIVATION_CONFIG.checkDaysAfterRegistration) {
        const count = await processActivationDay(db, daysAgo);
        totalNudgesScheduled += count;
      }
      
      logger.info('Activation nudges completed', { totalNudgesScheduled });
    } catch (error) {
      logger.error('Error in activation nudges cron', { error });
      throw error;
    }
  }
);

/**
 * Process users registered N days ago
 */
async function processActivationDay(db: Firestore, daysAgo: number): Promise<number> {
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() - daysAgo);
  targetDate.setHours(0, 0, 0, 0);
  
  const endDate = new Date(targetDate);
  endDate.setHours(23, 59, 59, 999);
  
  logger.info(`Processing activation for users registered ${daysAgo} days ago`);
  
  // Find users registered on target date
  const usersSnapshot = await db
    .collection('users')
    .where('createdAt', '>=', targetDate.toISOString())
    .where('createdAt', '<=', endDate.toISOString())
    .limit(500)
    .get();
  
  if (usersSnapshot.empty) {
    logger.info(`No users found for ${daysAgo} days ago`);
    return 0;
  }
  
  logger.info(`Found ${usersSnapshot.size} users to check`);
  
  let nudgesScheduled = 0;
  
  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    const userData = userDoc.data();
    
    // Check if user has already received too many nudges
    const recentNudgesCount = await countRecentActivationNudges(db, userId);
    if (recentNudgesCount >= ACTIVATION_CONFIG.maxNudgesPerFunnel) {
      continue;
    }
    
    // Check cooldown period
    const lastNudge = await getLastActivationNudge(db, userId);
    if (lastNudge) {
      const hoursSinceLastNudge = (Date.now() - new Date(lastNudge).getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastNudge < ACTIVATION_CONFIG.nudgeCooldownHours) {
        continue;
      }
    }
    
    // Determine what nudge to send based on user's incomplete actions
    const nudgeType = await determineActivationNudge(db, userId, userData);
    
    if (nudgeType) {
      try {
        await enqueueNotification(db, {
          userId,
          type: nudgeType,
          category: 'GROWTH',
          funnelId: 'ACTIVATION_PROFILE_COMPLETION',
          stepNumber: daysAgo
        });
        
        nudgesScheduled++;
        
        // Track this nudge
        await trackActivationNudge(db, userId, nudgeType, daysAgo);
      } catch (error) {
        logger.error('Failed to enqueue activation nudge', {
          userId,
          nudgeType,
          error
        });
      }
    }
  }
  
  logger.info(`Scheduled ${nudgesScheduled} activation nudges for day ${daysAgo}`);
  return nudgesScheduled;
}

/**
 * Determine which activation nudge to send based on incomplete profile
 */
async function determineActivationNudge(
  db: Firestore,
  userId: string,
  userData: any
): Promise<NotificationType | null> {
  // Priority order: Photos > Verification > Profile > First Swipe
  
  // Check if user has photos
  const photosSnapshot = await db
    .collection('users')
    .doc(userId)
    .collection('photos')
    .limit(1)
    .get();
  
  if (photosSnapshot.empty) {
    return 'GROWTH_ACTIVATION_PHOTOS';
  }
  
  // Check if user is verified
  if (!userData.verified || userData.verificationStatus !== 'APPROVED') {
    return 'GROWTH_ACTIVATION_VERIFICATION';
  }
  
  // Check if profile is complete
  const profileCompleteness = calculateProfileCompleteness(userData);
  if (profileCompleteness < 70) {
    return 'GROWTH_ACTIVATION_PROFILE';
  }
  
  // Check if user has swiped
  const swipesSnapshot = await db
    .collection('swipes')
    .where('userId', '==', userId)
    .limit(1)
    .get();
  
  if (swipesSnapshot.empty) {
    return 'GROWTH_ACTIVATION_FIRST_SWIPE';
  }
  
  // User is fully activated
  return null;
}

function calculateProfileCompleteness(userData: any): number {
  let score = 0;
  const fields = ['bio', 'age', 'gender', 'location', 'interests'];
  
  for (const field of fields) {
    if (userData[field]) {
      score += 20;
    }
  }
  
  return Math.min(score, 100);
}

async function countRecentActivationNudges(db: Firestore, userId: string): Promise<number> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  
  const snapshot = await db
    .collection('notifications')
    .where('userId', '==', userId)
    .where('category', '==', 'GROWTH')
    .where('funnelId', '==', 'ACTIVATION_PROFILE_COMPLETION')
    .where('createdAt', '>=', weekAgo)
    .get();
  
  return snapshot.size;
}

async function getLastActivationNudge(db: Firestore, userId: string): Promise<string | null> {
  const snapshot = await db
    .collection('notifications')
    .where('userId', '==', userId)
    .where('category', '==', 'GROWTH')
    .where('funnelId', '==', 'ACTIVATION_PROFILE_COMPLETION')
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();
  
  if (snapshot.empty) {
    return null;
  }
  
  return snapshot.docs[0].data().createdAt;
}

async function trackActivationNudge(
  db: Firestore,
  userId: string,
  nudgeType: NotificationType,
  daysSinceRegistration: number
): Promise<void> {
  await db.collection('growthFunnels').doc(userId).collection('steps').add({
    userId,
    funnelId: 'ACTIVATION_PROFILE_COMPLETION',
    stepNumber: daysSinceRegistration,
    stepName: nudgeType,
    status: 'IN_PROGRESS',
    startedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

// ============================================================================
// Retention Funnel Cron Job
// ============================================================================

/**
 * Run daily to check for inactive users who need re-engagement
 */
export const retentionNudgesCron = onSchedule(
  {
    schedule: 'every day 14:00',
    timeZone: 'UTC',
    memory: '512MiB',
    timeoutSeconds: 540
  },
  async (event) => {
    const db = getFirestore();
    
    try {
      logger.info('Starting retention nudges cron job');
      
      let totalNudgesScheduled = 0;
      
      // Process each retention milestone (3, 7, 14 days inactive)
      for (const inactiveDays of RETENTION_CONFIG.inactiveDays) {
        const count = await processRetentionDay(db, inactiveDays);
        totalNudgesScheduled += count;
      }
      
      logger.info('Retention nudges completed', { totalNudgesScheduled });
    } catch (error) {
      logger.error('Error in retention nudges cron', { error });
      throw error;
    }
  }
);

/**
 * Process users inactive for N days
 */
async function processRetentionDay(db: Firestore, inactiveDays: number): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - inactiveDays);
  cutoffDate.setHours(0, 0, 0, 0);
  
  const endDate = new Date(cutoffDate);
  endDate.setHours(23, 59, 59, 999);
  
  logger.info(`Processing retention for users inactive ${inactiveDays} days`);
  
  // Find users whose last activity was around the cutoff date
  // Check userDevices.lastSeenAt
  const devicesSnapshot = await db
    .collection('userDevices')
    .where('lastSeenAt', '>=', cutoffDate.toISOString())
    .where('lastSeenAt', '<=', endDate.toISOString())
    .where('enabled', '==', true)
    .limit(500)
    .get();
  
  if (devicesSnapshot.empty) {
    logger.info(`No inactive users found for ${inactiveDays} days`);
    return 0;
  }
  
  // Get unique user IDs
  const userIdsSet = new Set<string>();
  devicesSnapshot.docs.forEach(doc => {
    userIdsSet.add(doc.data().userId);
  });
  
  const userIds = Array.from(userIdsSet);
  
  logger.info(`Found ${userIds.length} inactive users to check`);
  
  let nudgesScheduled = 0;
  
  for (const userId of userIds) {
    // Check if user has already received too many retention nudges
    const recentNudgesCount = await countRecentRetentionNudges(db, userId, inactiveDays);
    if (recentNudgesCount >= RETENTION_CONFIG.maxNudgesPerPeriod) {
      continue;
    }
    
    // Check cooldown period
    const lastNudge = await getLastRetentionNudge(db, userId);
    if (lastNudge) {
      const hoursSinceLastNudge = (Date.now() - new Date(lastNudge).getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastNudge < RETENTION_CONFIG.nudgeCooldownHours) {
        continue;
      }
    }
    
    // Determine what retention nudge to send
    const nudgeType = await determineRetentionNudge(db, userId, inactiveDays);
    
    if (nudgeType) {
      try {
        const funnelIdMap: Record<number, string> = {
          3: 'RETENTION_3_DAY',
          7: 'RETENTION_7_DAY',
          14: 'RETENTION_14_DAY'
        };
        
        await enqueueNotification(db, {
          userId,
          type: nudgeType,
          category: 'GROWTH',
          funnelId: funnelIdMap[inactiveDays] || 'RETENTION_7_DAY'
        });
        
        nudgesScheduled++;
        
        // Track this nudge
        await trackRetentionNudge(db, userId, nudgeType, inactiveDays);
      } catch (error) {
        logger.error('Failed to enqueue retention nudge', {
          userId,
          nudgeType,
          error
        });
      }
    }
  }
  
  logger.info(`Scheduled ${nudgesScheduled} retention nudges for ${inactiveDays} days`);
  return nudgesScheduled;
}

/**
 * Determine which retention nudge to send based on user context
 */
async function determineRetentionNudge(
  db: Firestore,
  userId: string,
  inactiveDays: number
): Promise<NotificationType | null> {
  // Check if user has unseen likes
  const likesSnapshot = await db
    .collection('likes')
    .where('targetUserId', '==', userId)
    .where('seen', '==', false)
    .limit(1)
    .get();
  
  if (!likesSnapshot.empty) {
    return 'GROWTH_RETENTION_UNSEEN_LIKES';
  }
  
  // Check if user has AI companions and was chatting with them
  const aiChatsSnapshot = await db
    .collection('aiChats')
    .where('userId', '==', userId)
    .where('lastMessageAt', '>', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .limit(1)
    .get();
  
  if (!aiChatsSnapshot.empty) {
    return 'GROWTH_RETENTION_AI_WAITING';
  }
  
  // Check if there are new people near user
  const userDoc = await db.collection('users').doc(userId).get();
  if (userDoc.exists) {
    const userData = userDoc.data()!;
    
    // Simple check: are there users who joined recently in the same country?
    const recentUsersSnapshot = await db
      .collection('users')
      .where('country', '==', userData.country || 'PL')
      .where('createdAt', '>', new Date(Date.now() - inactiveDays * 24 * 60 * 60 * 1000).toISOString())
      .limit(5)
      .get();
    
    if (!recentUsersSnapshot.empty) {
      return 'GROWTH_RETENTION_NEW_PEOPLE';
    }
  }
  
  // Generic comeback message
  return 'GROWTH_RETENTION_COMEBACK';
}

async function countRecentRetentionNudges(
  db: Firestore,
  userId: string,
  inactiveDays: number
): Promise<number> {
  const funnelIdMap: Record<number, string> = {
    3: 'RETENTION_3_DAY',
    7: 'RETENTION_7_DAY',
    14: 'RETENTION_14_DAY'
  };
  
  const funnelId = funnelIdMap[inactiveDays];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  
  const snapshot = await db
    .collection('notifications')
    .where('userId', '==', userId)
    .where('category', '==', 'GROWTH')
    .where('funnelId', '==', funnelId)
    .where('createdAt', '>=', weekAgo)
    .get();
  
  return snapshot.size;
}

async function getLastRetentionNudge(db: Firestore, userId: string): Promise<string | null> {
  const snapshot = await db
    .collection('notifications')
    .where('userId', '==', userId)
    .where('category', '==', 'GROWTH')
    .where('funnelId', 'in', ['RETENTION_3_DAY', 'RETENTION_7_DAY', 'RETENTION_14_DAY'])
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();
  
  if (snapshot.empty) {
    return null;
  }
  
  return snapshot.docs[0].data().createdAt;
}

async function trackRetentionNudge(
  db: Firestore,
  userId: string,
  nudgeType: NotificationType,
  inactiveDays: number
): Promise<void> {
  const funnelIdMap: Record<number, string> = {
    3: 'RETENTION_3_DAY',
    7: 'RETENTION_7_DAY',
    14: 'RETENTION_14_DAY'
  };
  
  await db.collection('growthFunnels').doc(userId).collection('steps').add({
    userId,
    funnelId: funnelIdMap[inactiveDays],
    stepNumber: 1,
    stepName: nudgeType,
    status: 'IN_PROGRESS',
    startedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}