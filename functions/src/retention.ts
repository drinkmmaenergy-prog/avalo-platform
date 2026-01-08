/**
 * Retention Engine for Avalo
 * 
 * Lightweight retention hooks to re-engage high-value users.
 * Integrates with existing notification system.
 * 
 * IMPORTANT: All notifications are generic and safe (no explicit content).
 */

import { db, serverTimestamp, generateId } from './init.js';

// ============================================================================
// TYPES
// ============================================================================

export type RetentionTaskType = 
  | 'COME_BACK_HIGH_VALUE'
  | 'COME_BACK_CREATOR'
  | 'COME_BACK_VIP'
  | 'COME_BACK_ROYAL'
  | 'INACTIVE_EARNER'
  | 'INACTIVE_SPENDER';

export interface RetentionTask {
  taskId: string;
  userId: string;
  type: RetentionTaskType;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  metadata: {
    daysSinceLastActive: number;
    lifetimeTokensSpent?: number;
    lifetimeTokensEarned?: number;
    membershipTier?: string;
    lastActivityType?: string;
  };
  status: 'PENDING' | 'SENT' | 'FAILED';
  createdAt: any; // Timestamp
  processedAt?: any; // Timestamp
}

export interface RetentionStats {
  userId: string;
  lastActiveAt: Date;
  daysSinceLastActive: number;
  lifetimeTokensSpent: number;
  lifetimeTokensEarned: number;
  membershipTier: 'none' | 'vip' | 'royal';
  isCreator: boolean;
  totalChats: number;
  totalCalls: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export const RETENTION_CONFIG = {
  // Inactivity thresholds (days)
  THRESHOLDS: {
    HIGH_VALUE_USER: 3,      // High spenders: nudge after 3 days
    CREATOR: 7,              // Creators: nudge after 7 days
    VIP_MEMBER: 5,           // VIP/Royal: nudge after 5 days
    REGULAR_USER: 14,        // Regular users: nudge after 14 days
  },
  
  // High-value user definition
  HIGH_VALUE: {
    MIN_TOKENS_SPENT: 1000,
    MIN_TOKENS_EARNED: 500,
  },
  
  // Creator definition
  CREATOR: {
    MIN_TOKENS_EARNED: 100,
    MIN_CHATS_AS_EARNER: 10,
  },
  
  // Batch size for scheduled job
  BATCH_SIZE: 100,
  
  // Notification templates
  MESSAGES: {
    COME_BACK_HIGH_VALUE: {
      title: 'We miss you! 💫',
      body: 'New connections are waiting for you on Avalo',
    },
    COME_BACK_CREATOR: {
      title: 'Your fans are waiting! ⭐',
      body: 'New messages and opportunities on Avalo',
    },
    COME_BACK_VIP: {
      title: 'VIP benefits waiting! 👑',
      body: 'Exclusive matches and features ready for you',
    },
    COME_BACK_ROYAL: {
      title: 'Royal member benefits! 💎',
      body: 'Premium connections and features await',
    },
    INACTIVE_EARNER: {
      title: 'Earning opportunities! 💰',
      body: 'Start earning again on Avalo',
    },
    INACTIVE_SPENDER: {
      title: 'New matches for you! ❤️',
      body: 'Exciting connections waiting on Avalo',
    },
  },
};

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Find inactive users and create retention tasks
 * Should be called by scheduled Cloud Function (e.g., daily)
 */
export async function findAndCreateRetentionTasks(): Promise<number> {
  let tasksCreated = 0;
  
  // Query inactive users (this is simplified - in production, use indexed queries)
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - RETENTION_CONFIG.THRESHOLDS.HIGH_VALUE_USER);
  
  const inactiveUsersSnap = await db.collection('users')
    .where('lastActiveAt', '<', cutoffDate)
    .limit(RETENTION_CONFIG.BATCH_SIZE)
    .get();
  
  for (const userDoc of inactiveUsersSnap.docs) {
    const userData = userDoc.data();
    const userId = userDoc.id;
    
    // Calculate retention stats
    const stats = await calculateRetentionStats(userId, userData);
    
    // Determine if user qualifies for retention outreach
    const taskType = determineRetentionTaskType(stats);
    
    if (taskType) {
      // Check if we already sent a task recently
      const recentTaskExists = await hasRecentRetentionTask(userId, 7); // Within 7 days
      
      if (!recentTaskExists) {
        await createRetentionTask(userId, taskType, stats);
        tasksCreated++;
      }
    }
  }
  
  return tasksCreated;
}

/**
 * Calculate retention statistics for a user
 */
async function calculateRetentionStats(userId: string, userData?: any): Promise<RetentionStats> {
  if (!userData) {
    const userSnap = await db.collection('users').doc(userId).get();
    userData = userSnap.data();
  }
  
  const lastActiveAt = userData?.lastActiveAt?.toDate?.() || new Date();
  const daysSinceLastActive = Math.floor((Date.now() - lastActiveAt.getTime()) / (1000 * 60 * 60 * 24));
  
  // Get wallet stats
  const walletSnap = await db.collection('users').doc(userId).collection('wallet').doc('current').get();
  const wallet = walletSnap.data();
  
  // Determine membership tier
  let membershipTier: 'none' | 'vip' | 'royal' = 'none';
  if (userData?.roles?.royal || userData?.royalClubTier !== undefined) {
    membershipTier = 'royal';
  } else if (userData?.roles?.vip || userData?.vipSubscription?.status === 'active') {
    membershipTier = 'vip';
  }
  
  // Check if creator
  const isCreator = (wallet?.earned || 0) >= RETENTION_CONFIG.CREATOR.MIN_TOKENS_EARNED;
  
  return {
    userId,
    lastActiveAt,
    daysSinceLastActive,
    lifetimeTokensSpent: wallet?.spent || 0,
    lifetimeTokensEarned: wallet?.earned || 0,
    membershipTier,
    isCreator,
    totalChats: userData?.stats?.totalChats || 0,
    totalCalls: userData?.stats?.totalCalls || 0,
  };
}

/**
 * Determine what type of retention task to create
 */
function determineRetentionTaskType(stats: RetentionStats): RetentionTaskType | null {
  // Royal members - highest priority
  if (stats.membershipTier === 'royal' && 
      stats.daysSinceLastActive >= RETENTION_CONFIG.THRESHOLDS.VIP_MEMBER) {
    return 'COME_BACK_ROYAL';
  }
  
  // VIP members
  if (stats.membershipTier === 'vip' && 
      stats.daysSinceLastActive >= RETENTION_CONFIG.THRESHOLDS.VIP_MEMBER) {
    return 'COME_BACK_VIP';
  }
  
  // High-value spenders
  if (stats.lifetimeTokensSpent >= RETENTION_CONFIG.HIGH_VALUE.MIN_TOKENS_SPENT &&
      stats.daysSinceLastActive >= RETENTION_CONFIG.THRESHOLDS.HIGH_VALUE_USER) {
    return 'COME_BACK_HIGH_VALUE';
  }
  
  // Creators / earners
  if (stats.isCreator && 
      stats.daysSinceLastActive >= RETENTION_CONFIG.THRESHOLDS.CREATOR) {
    return 'COME_BACK_CREATOR';
  }
  
  // Inactive earners (have earned something but not recently)
  if (stats.lifetimeTokensEarned > 0 &&
      stats.daysSinceLastActive >= RETENTION_CONFIG.THRESHOLDS.CREATOR) {
    return 'INACTIVE_EARNER';
  }
  
  // Inactive spenders
  if (stats.lifetimeTokensSpent > 0 &&
      stats.daysSinceLastActive >= RETENTION_CONFIG.THRESHOLDS.REGULAR_USER) {
    return 'INACTIVE_SPENDER';
  }
  
  // User doesn't qualify for retention outreach
  return null;
}

/**
 * Create a retention task
 */
async function createRetentionTask(
  userId: string,
  type: RetentionTaskType,
  stats: RetentionStats
): Promise<RetentionTask> {
  const taskId = generateId();
  
  // Determine priority
  let priority: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM';
  if (type === 'COME_BACK_ROYAL' || stats.lifetimeTokensSpent > 5000) {
    priority = 'HIGH';
  } else if (type === 'INACTIVE_SPENDER') {
    priority = 'LOW';
  }
  
  const task: RetentionTask = {
    taskId,
    userId,
    type,
    priority,
    metadata: {
      daysSinceLastActive: stats.daysSinceLastActive,
      lifetimeTokensSpent: stats.lifetimeTokensSpent,
      lifetimeTokensEarned: stats.lifetimeTokensEarned,
      membershipTier: stats.membershipTier,
    },
    status: 'PENDING',
    createdAt: serverTimestamp(),
  };
  
  await db.collection('retentionTasks').doc(taskId).set(task);
  
  return task;
}

/**
 * Check if user has a recent retention task
 */
async function hasRecentRetentionTask(userId: string, withinDays: number): Promise<boolean> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - withinDays);
  
  const recentTasksSnap = await db.collection('retentionTasks')
    .where('userId', '==', userId)
    .where('createdAt', '>=', cutoffDate)
    .limit(1)
    .get();
  
  return !recentTasksSnap.empty;
}

/**
 * Process pending retention tasks and send notifications
 * Should be called by scheduled Cloud Function or triggered on new retentionTasks
 */
export async function processPendingRetentionTasks(): Promise<number> {
  let processedCount = 0;
  
  const pendingTasksSnap = await db.collection('retentionTasks')
    .where('status', '==', 'PENDING')
    .orderBy('priority', 'desc')
    .orderBy('createdAt', 'asc')
    .limit(50)
    .get();
  
  for (const taskDoc of pendingTasksSnap.docs) {
    const task = taskDoc.data() as RetentionTask;
    
    try {
      await sendRetentionNotification(task);
      
      // Mark as sent
      await db.collection('retentionTasks').doc(task.taskId).update({
        status: 'SENT',
        processedAt: serverTimestamp(),
      });
      
      processedCount++;
    } catch (error) {
      // Mark as failed
      await db.collection('retentionTasks').doc(task.taskId).update({
        status: 'FAILED',
        processedAt: serverTimestamp(),
      });
    }
  }
  
  return processedCount;
}

/**
 * Send retention notification to user
 * This integrates with existing notification system
 */
async function sendRetentionNotification(task: RetentionTask): Promise<void> {
  const message = RETENTION_CONFIG.MESSAGES[task.type];
  
  // Create notification document (to be picked up by existing notification service)
  const notificationId = generateId();
  
  await db.collection('notifications').doc(notificationId).set({
    notificationId,
    userId: task.userId,
    type: 'retention',
    title: message.title,
    body: message.body,
    data: {
      retentionTaskId: task.taskId,
      retentionType: task.type,
    },
    status: 'PENDING',
    priority: task.priority,
    createdAt: serverTimestamp(),
  });
  
  // Note: The actual push notification sending would be handled by an existing
  // notification processing service that watches the notifications collection
}

/**
 * Get retention statistics (for admin dashboard)
 */
export async function getRetentionStats(days: number = 30): Promise<{
  totalTasksCreated: number;
  totalTasksSent: number;
  totalTasksFailed: number;
  tasksByType: Record<RetentionTaskType, number>;
}> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  const tasksSnap = await db.collection('retentionTasks')
    .where('createdAt', '>=', cutoffDate)
    .get();
  
  let totalTasksCreated = 0;
  let totalTasksSent = 0;
  let totalTasksFailed = 0;
  const tasksByType: Record<string, number> = {};
  
  for (const taskDoc of tasksSnap.docs) {
    const task = taskDoc.data() as RetentionTask;
    
    totalTasksCreated++;
    
    if (task.status === 'SENT') {
      totalTasksSent++;
    } else if (task.status === 'FAILED') {
      totalTasksFailed++;
    }
    
    tasksByType[task.type] = (tasksByType[task.type] || 0) + 1;
  }
  
  return {
    totalTasksCreated,
    totalTasksSent,
    totalTasksFailed,
    tasksByType: tasksByType as Record<RetentionTaskType, number>,
  };
}

/**
 * Manual trigger to create retention task for specific user
 */
export async function createManualRetentionTask(
  userId: string,
  type: RetentionTaskType
): Promise<RetentionTask> {
  const userSnap = await db.collection('users').doc(userId).get();
  
  if (!userSnap.exists) {
    throw new Error('User not found');
  }
  
  const stats = await calculateRetentionStats(userId);
  const task = await createRetentionTask(userId, type, stats);
  
  return task;
}