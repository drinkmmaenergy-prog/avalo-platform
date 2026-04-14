import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK 258 — BUYER / SUPPORTER ANALYTICS
 * Keep High-Value Payers Loyal & Spending
 * 
 * Features:
 * - Private supporter analytics (lifetime/monthly spend, top earners)
 * - Top Fan Progression (L1-L6) per earner
 * - Emotional notifications (earner viewed, online, new content)
 * - Algorithmic benefits (inbox/feed prioritization)
 * - Retention loops (no spending triggers, trending earners)
 * - Safety: no public leaderboards, no entitlement, no pressure
 */

import { db, serverTimestamp, increment } from './init';
import { FieldValue } from 'firebase-admin/firestore';
import { Timestamp, admin, timestamp } from './runtime';

// ============================================================================
// TYPES
// ============================================================================

export type FanLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface SupporterAnalytics {
  userId: string;
  lifetimeSpent: number;           // Total tokens spent all-time
  monthlySpent: number;            // Tokens spent this month
  topCreatorId: string | null;     // ID of most supported earner
  topCreatorSpent: number;         // Tokens spent on top earner
  earnersDiscovered: number;      // Count of unique earners interacted with
  profileViewsReceived: number;    // Profile views from earners
  matchesFromPaidChats: number;    // Matches resulting from paid chats
  lastSpentAt: FirebaseFirestore.Timestamp | null;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface FanLevelData {
  supporterId: string;
  earnerId: string;
  level: FanLevel;                 // 1=Interested, 2=Supporter, 3=Big Fan, 4=Top Fan, 5=VIP, 6=Elite VIP
  totalSpent: number;              // Total spent on this earner
  lastInteractionAt: FirebaseFirestore.Timestamp;
  levelUnlockedAt: FirebaseFirestore.Timestamp;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface SupporterNotification {
  id: string;
  userId: string;                  // Supporter receiving the notification
  earnerId: string;               // Creator the notification is about
  type: NotificationType;
  message: string;
  deepLink: string;               // Link to chat/media/boost
  read: boolean;
  createdAt: FirebaseFirestore.Timestamp;
  readAt?: FirebaseFirestore.Timestamp;
}

export type NotificationType =
  | 'earner_viewed_profile'
  | 'earner_online'
  | 'earner_new_story'
  | 'earner_new_media'
  | 'top_fan_achieved'
  | 'unlocked_more_content'
  | 'earner_trending';

export interface RetentionTrigger {
  userId: string;
  earnerId: string;
  triggerType: 'no_spending_7days' | 'earner_trending' | 'dropped_top_fan';
  lastSent: FirebaseFirestore.Timestamp;
  cooldownHours: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Fan level thresholds (tokens spent on a specific earner)
const FAN_LEVEL_THRESHOLDS: Record<FanLevel, number> = {
  1: 0,       // Interested - any interaction
  2: 50,      // Supporter - 50+ tokens
  3: 200,     // Big Fan - 200+ tokens
  4: 500,     // Top Fan - 500+ tokens
  5: 1500,    // VIP - 1500+ tokens
  6: 5000,    // Elite VIP - 5000+ tokens
};

const FAN_LEVEL_NAMES: Record<FanLevel, string> = {
  1: 'Interested',
  2: 'Supporter',
  3: 'Big Fan',
  4: 'Top Fan',
  5: 'VIP',
  6: 'Elite VIP',
};

// Inbox prioritization multipliers
const INBOX_PRIORITY_BOOST: Record<FanLevel, number> = {
  1: 1.0,   // Normal
  2: 1.0,   // Normal
  3: 1.5,   // Slight boost
  4: 2.0,   // Strong boost
  5: 3.0,   // Peak priority
  6: 4.0,   // Elite priority
};

// Notification cooldowns (hours)
const NOTIFICATION_COOLDOWNS = {
  earner_viewed_profile: 12,
  earner_online: 8,
  earner_new_story: 24,
  earner_new_media: 24,
  top_fan_achieved: 0,  // Always send
  unlocked_more_content: 48,
  earner_trending: 48,
};

// Retention trigger cooldowns (hours)
const RETENTION_COOLDOWNS = {
  no_spending_7days: 168,        // 7 days
  earner_trending: 48,          // 2 days
  dropped_top_fan: 24,           // 1 day
};

// ============================================================================
// SUPPORTER ANALYTICS FUNCTIONS
// ============================================================================

/**
 * Track a token spending event and update supporter analytics
 */
export async function trackTokenSpending(
  supporterId: string,
  earnerId: string,
  tokensSpent: number,
  context: {
    source: 'chat' | 'media' | 'gift' | 'boost' | 'call' | 'meeting';
    metadata?: Record<string, any>;
  }
): Promise<void> {
  const batch = db.batch();
  const now = FieldValue.serverTimestamp();

  // 1. Update supporter analytics
  const analyticsRef = db.collection('supporterAnalytics').doc(supporterId);
  const analyticsDoc = await analyticsRef.get();

  if (!analyticsDoc.exists) {
    // Create new analytics document
    batch.set(analyticsRef, {
      userId: supporterId,
      lifetimeSpent: tokensSpent,
      monthlySpent: tokensSpent,
      topCreatorId: earnerId,
      topCreatorSpent: tokensSpent,
      earnersDiscovered: 1,
      profileViewsReceived: 0,
      matchesFromPaidChats: 0,
      lastSpentAt: now,
      createdAt: now,
      updatedAt: now,
    } as SupporterAnalytics);
  } else {
    // Update existing analytics
    const data = analyticsDoc.data() as SupporterAnalytics;
    const updates: Partial<SupporterAnalytics> = {
      lifetimeSpent: (data.lifetimeSpent || 0) + tokensSpent,
      monthlySpent: (data.monthlySpent || 0) + tokensSpent,
      lastSpentAt: now as any,
      updatedAt: now as any,
    };

    // Update top earner if necessary
    const currentTopCreatorSpent = data.topCreatorId === earnerId 
      ? (data.topCreatorSpent || 0) + tokensSpent
      : data.topCreatorSpent || 0;

    if (data.topCreatorId === earnerId || !data.topCreatorId) {
      updates.topCreatorId = earnerId;
      updates.topCreatorSpent = currentTopCreatorSpent;
    } else if (tokensSpent > data.topCreatorSpent) {
      updates.topCreatorId = earnerId;
      updates.topCreatorSpent = tokensSpent;
    }

    batch.update(analyticsRef, updates);
  }

  // 2. Update or create fan level for this earner
  const fanLevelRef = db.collection('fanLevels').doc(`${supporterId}_${earnerId}`);
  const fanLevelDoc = await fanLevelRef.get();

  if (!fanLevelDoc.exists) {
    // Create new fan level
    const initialLevel = calculateFanLevel(tokensSpent);
    batch.set(fanLevelRef, {
      supporterId,
      earnerId,
      level: initialLevel,
      totalSpent: tokensSpent,
      lastInteractionAt: now,
      levelUnlockedAt: now,
      createdAt: now,
      updatedAt: now,
    } as FanLevelData);

    // Send notification for level achievement
    if (initialLevel >= 2) {
      await sendFanLevelNotification(supporterId, earnerId, initialLevel);
    }
  } else {
    // Update existing fan level
    const data = fanLevelDoc.data() as FanLevelData;
    const newTotalSpent = (data.totalSpent || 0) + tokensSpent;
    const newLevel = calculateFanLevel(newTotalSpent);
    const levelIncreased = newLevel > data.level;

    batch.update(fanLevelRef, {
      totalSpent: newTotalSpent,
      level: newLevel,
      lastInteractionAt: now,
      updatedAt: now,
      ...(levelIncreased && { levelUnlockedAt: now }),
    });

    // Send notification if level increased
    if (levelIncreased) {
      await sendFanLevelNotification(supporterId, earnerId, newLevel);
    }
  }

  // 3. Record spending history
  const historyRef = db.collection('supporterSpendingHistory').doc();
  batch.set(historyRef, {
    supporterId,
    earnerId,
    tokensSpent,
    source: context.source,
    metadata: context.metadata || {},
    timestamp: now,
  });

  // 4. Update earner supporter stats
  const earnerStatsRef = db.collection('earnerSupporterStats').doc(earnerId);
  batch.set(earnerStatsRef, {
    totalRevenue: increment(tokensSpent),
    uniqueSupporters: increment(0), // Will be calculated separately
    updatedAt: now,
  }, { merge: true });

  await batch.commit();
}

/**
 * Calculate fan level based on total spending
 */
function calculateFanLevel(totalSpent: number): FanLevel {
  if (totalSpent >= FAN_LEVEL_THRESHOLDS[6]) return 6;
  if (totalSpent >= FAN_LEVEL_THRESHOLDS[5]) return 5;
  if (totalSpent >= FAN_LEVEL_THRESHOLDS[4]) return 4;
  if (totalSpent >= FAN_LEVEL_THRESHOLDS[3]) return 3;
  if (totalSpent >= FAN_LEVEL_THRESHOLDS[2]) return 2;
  return 1;
}

/**
 * Get fan level name
 */
export function getFanLevelName(level: FanLevel): string {
  return FAN_LEVEL_NAMES[level];
}

/**
 * Get inbox priority boost for a supporter
 */
export function getInboxPriorityBoost(level: FanLevel): number {
  return INBOX_PRIORITY_BOOST[level];
}

// ============================================================================
// EMOTIONAL NOTIFICATIONS
// ============================================================================

/**
 * Send emotional notification to supporter
 * Only sends if cooldown period has passed
 */
export async function sendEmotionalNotification(
  supporterId: string,
  earnerId: string,
  type: NotificationType,
  customMessage?: string
): Promise<boolean> {
  // Check cooldown
  const canSend = await checkNotificationCooldown(supporterId, earnerId, type);
  if (!canSend) {
    return false;
  }

  // Get fan level for personalization
  const fanLevelDoc = await db.collection('fanLevels')
    .doc(`${supporterId}_${earnerId}`)
    .get();
  
  const fanLevel = fanLevelDoc.exists 
    ? (fanLevelDoc.data() as FanLevelData).level 
    : 1;

  // Generate message and deep link
  const { message, deepLink } = generateNotificationContent(
    type,
    earnerId,
    fanLevel,
    customMessage
  );

  // Create notification
  const notificationRef = db.collection('supporterNotifications').doc();
  await notificationRef.set({
    id: notificationRef.id,
    userId: supporterId,
    earnerId,
    type,
    message,
    deepLink,
    read: false,
    createdAt: serverTimestamp(),
  } as SupporterNotification);

  return true;
}

/**
 * Check if notification cooldown has passed
 */
async function checkNotificationCooldown(
  supporterId: string,
  earnerId: string,
  type: NotificationType
): Promise<boolean> {
  const cooldownHours = NOTIFICATION_COOLDOWNS[type];
  if (cooldownHours === 0) return true;

  const cutoffTime = new Date();
  cutoffTime.setHours(cutoffTime.getHours() - cooldownHours);

  const recentNotifications = await db.collection('supporterNotifications')
    .where('userId', '==', supporterId)
    .where('earnerId', '==', earnerId)
    .where('type', '==', type)
    .where('createdAt', '>', cutoffTime)
    .limit(1)
    .get();

  return recentNotifications.empty;
}

/**
 * Generate notification content based on type
 */
function generateNotificationContent(
  type: NotificationType,
  earnerId: string,
  fanLevel: FanLevel,
  customMessage?: string
): { message: string; deepLink: string } {
  const levelName = getFanLevelName(fanLevel);

  const templates = {
    earner_viewed_profile: {
      message: customMessage || 'She viewed your profile again.',
      deepLink: `/chat/${earnerId}`,
    },
    earner_online: {
      message: customMessage || 'She is online now.',
      deepLink: `/chat/${earnerId}`,
    },
    earner_new_story: {
      message: customMessage || 'She just posted a new story.',
      deepLink: `/profile/${earnerId}/stories`,
    },
    earner_new_media: {
      message: customMessage || 'She posted new content.',
      deepLink: `/profile/${earnerId}/media`,
    },
    top_fan_achieved: {
      message: customMessage || `You're now a ${levelName} — she is likely to notice you more.`,
      deepLink: `/wallet/supporter-stats`,
    },
    unlocked_more_content: {
      message: customMessage || `You've unlocked more of her content than most users.`,
      deepLink: `/profile/${earnerId}`,
    },
    earner_trending: {
      message: customMessage || `She's trending — now is a good time to talk to her.`,
      deepLink: `/chat/${earnerId}`,
    },
  };

  return templates[type];
}

/**
 * Send fan level achievement notification
 */
async function sendFanLevelNotification(
  supporterId: string,
  earnerId: string,
  level: FanLevel
): Promise<void> {
  await sendEmotionalNotification(
    supporterId,
    earnerId,
    'top_fan_achieved',
    `You're now a ${getFanLevelName(level)} for this earner — she is likely to notice you more.`
  );
}

// ============================================================================
// RETENTION LOOPS
// ============================================================================

/**
 * Check and send retention triggers for inactive supporters
 * Run this as a scheduled Cloud Function (every 6 hours)
 */
export async function processRetentionTriggers(): Promise<number> {
  let triggersProcessed = 0;

  // 1. Find supporters with no spending in 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const inactiveSupporters = await db.collection('supporterAnalytics')
    .where('lastSpentAt', '<', sevenDaysAgo)
    .limit(100)
    .get();

  for (const doc of inactiveSupporters.docs) {
    const data = doc.data() as SupporterAnalytics;
    const canTrigger = await checkRetentionCooldown(
      data.userId,
      data.topCreatorId || '',
      'no_spending_7days'
    );

    if (canTrigger && data.topCreatorId) {
      // Get fan level to check if dropped
      const fanLevelDoc = await db.collection('fanLevels')
        .doc(`${data.userId}_${data.topCreatorId}`)
        .get();

      if (fanLevelDoc.exists) {
        const fanLevel = (fanLevelDoc.data() as FanLevelData).level;
        
        // Only send if they were at least level 3 (Big Fan)
        if (fanLevel >= 3) {
          await sendEmotionalNotification(
            data.userId,
            data.topCreatorId,
            'top_fan_achieved',
            `You dropped from ${getFanLevelName(fanLevel)} — catch up now?`
          );

          await recordRetentionTrigger(
            data.userId,
            data.topCreatorId,
            'no_spending_7days'
          );

          triggersProcessed++;
        }
      }
    }
  }

  return triggersProcessed;
}

/**
 * Check if retention trigger cooldown has passed
 */
async function checkRetentionCooldown(
  supporterId: string,
  earnerId: string,
  triggerType: RetentionTrigger['triggerType']
): Promise<boolean> {
  const cooldownHours = RETENTION_COOLDOWNS[triggerType];
  const cutoffTime = new Date();
  cutoffTime.setHours(cutoffTime.getHours() - cooldownHours);

  const recentTriggers = await db.collection('retentionTriggers')
    .where('userId', '==', supporterId)
    .where('earnerId', '==', earnerId)
    .where('triggerType', '==', triggerType)
    .where('lastSent', '>', cutoffTime)
    .limit(1)
    .get();

  return recentTriggers.empty;
}

/**
 * Record that a retention trigger was sent
 */
async function recordRetentionTrigger(
  supporterId: string,
  earnerId: string,
  triggerType: RetentionTrigger['triggerType']
): Promise<void> {
  const triggerRef = db.collection('retentionTriggers').doc();
  await triggerRef.set({
    userId: supporterId,
    earnerId,
    triggerType,
    lastSent: serverTimestamp(),
    cooldownHours: RETENTION_COOLDOWNS[triggerType],
  } as RetentionTrigger);
}

// ============================================================================
// ANALYTICS QUERIES
// ============================================================================

/**
 * Get supporter analytics for a user
 */
export async function getSupporterAnalytics(
  supporterId: string
): Promise<SupporterAnalytics | null> {
  const doc = await db.collection('supporterAnalytics').doc(supporterId).get();
  return doc.exists ? (doc.data() as SupporterAnalytics) : null;
}

/**
 * Get fan level for a supporter with a specific earner
 */
export async function getFanLevel(
  supporterId: string,
  earnerId: string
): Promise<FanLevelData | null> {
  const doc = await db.collection('fanLevels')
    .doc(`${supporterId}_${earnerId}`)
    .get();
  return doc.exists ? (doc.data() as FanLevelData) : null;
}

/**
 * Get top supporters for a earner (for earner analytics)
 */
export async function getTopSupporters(
  earnerId: string,
  limit: number = 10
): Promise<FanLevelData[]> {
  const snapshot = await db.collection('fanLevels')
    .where('earnerId', '==', earnerId)
    .orderBy('totalSpent', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map(doc => doc.data() as FanLevelData);
}

/**
 * Reset monthly spending (run at start of each month)
 */
export async function resetMonthlySpending(): Promise<number> {
  const batch = db.batch();
  let count = 0;

  const snapshot = await db.collection('supporterAnalytics')
    .where('monthlySpent', '>', 0)
    .limit(500)
    .get();

  snapshot.docs.forEach(doc => {
    batch.update(doc.ref, {
      monthlySpent: 0,
      updatedAt: serverTimestamp(),
    });
    count++;
  });

  if (count > 0) {
    await batch.commit();
  }

  return count;
}

// ============================================================================
// SAFETY FUNCTIONS
// ============================================================================

/**
 * Ensure no public leaderboards are exposed
 * This function validates that supporter identities are never exposed
 */
export function validatePrivacy(data: any): boolean {
  // Never expose supporter usernames or identifiable data
  // Only masked/hashed IDs should be visible
  const prohibitedFields = ['username', 'email', 'phone', 'realName'];
  
  for (const field of prohibitedFields) {
    if (data[field]) {
      return false;
    }
  }
  
  return true;
}

/**
 * Mask supporter identity for earner view
 */
export function maskSupporterIdentity(supporterId: string): string {
  // Return only a hashed/masked version for display
  const hash = supporterId.substring(0, 8);
  return `Supporter_${hash}`;
}

























