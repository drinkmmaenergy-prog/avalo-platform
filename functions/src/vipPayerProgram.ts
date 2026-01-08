/**
 * PACK 232 — VIP Repeat Payer Program
 * 
 * Emotional rewards for loyal paying users that increase spending and retention
 * without giving free tokens, gifts, discounts, or altering 65/35 tokenomics.
 * 
 * VIP is status, not charity.
 */

import {
  onDocumentCreated,
  onDocumentUpdated,
} from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';

const db = getFirestore();

// ============================================================================
// TYPES
// ============================================================================

type VIPLevel = 'none' | 'bronze' | 'silver' | 'gold' | 'royal';

interface VIPProfile {
  userId: string;
  vipLevel: VIPLevel;
  vipSince: Timestamp | null;
  vipScore: number; // 0-100 internal score
  vipHistory: Array<{
    level: VIPLevel;
    date: Timestamp;
  }>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface VIPActivity {
  userId: string;
  activityType: 'paid_chat' | 'paid_call' | 'paid_meeting' | 'token_purchase';
  partnerId?: string; // Who they paid
  tokenAmount: number;
  timestamp: Timestamp;
  metadata?: Record<string, any>;
}

interface VIPScoreComponents {
  userId: string;
  loyaltyScore: number; // Paid chats with same person
  consistencyScore: number; // Consistent payer across people
  valueScore: number; // Calls and meetings (high value)
  frequencyScore: number; // Token purchases per month
  totalScore: number; // Sum of all components (0-100)
  updatedAt: Timestamp;
}

interface VIPThresholds {
  paidChatsWithSamePerson: number; // ≥3 → loyalty
  paidChatsTotal: number; // ≥6 → consistency
  paidCalls: number; // ≥2 → high value
  paidMeetings: number; // ≥1 → elite
  tokenPurchasesPerMonth: number; // ≥2 → high monetization
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const VIP_THRESHOLDS: VIPThresholds = {
  paidChatsWithSamePerson: 3,
  paidChatsTotal: 6,
  paidCalls: 2,
  paidMeetings: 1,
  tokenPurchasesPerMonth: 2,
};

const VIP_LEVEL_SCORES = {
  none: 0,
  bronze: 20, // Entry level
  silver: 40, // Chats with ≥2 earners
  gold: 60, // Consistent meetings/calls
  royal: 80, // Long-term repeat spending
};

const QUEUE_PRIORITY_BOOST = {
  none: 0,
  bronze: 0,
  silver: 0.5,
  gold: 1,
  royal: 2,
};

const INACTIVITY_DOWNGRADE_DAYS = 90; // 3 months no activity → gradual drop

// ============================================================================
// TRACK VIP ACTIVITY
// ============================================================================

/**
 * Triggered when a paid chat is created or updated
 * Tracks paid chat activity for VIP scoring
 */
export const trackPaidChatForVIP = onDocumentCreated(
  'chats/{chatId}',
  async (event) => {
    const chatData = event.data?.data();
    if (!chatData) return;

    const { roles, state, participants } = chatData;
    
    // Only track paid chats
    if (state !== 'PAID_ACTIVE' && state !== 'CLOSED') return;
    
    const payerId = roles?.payerId;
    const earnerId = roles?.earnerId;
    
    if (!payerId || !earnerId) return;

    try {
      // Record activity
      await db.collection('vipActivity').add({
        userId: payerId,
        activityType: 'paid_chat',
        partnerId: earnerId,
        tokenAmount: chatData.billing?.totalConsumed || 0,
        timestamp: Timestamp.now(),
        metadata: {
          chatId: event.params.chatId,
          mode: chatData.mode,
        },
      } as VIPActivity);

      // Update VIP score
      await updateVIPScore(payerId);
      
      logger.info(`Tracked paid chat for VIP: ${payerId}`);
    } catch (error) {
      logger.error('Error tracking paid chat for VIP:', error);
    }
  }
);

/**
 * Triggered when a call is completed
 * Tracks paid call activity for VIP scoring
 */
export const trackPaidCallForVIP = onDocumentUpdated(
  'calls/{callId}',
  async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();
    
    if (!beforeData || !afterData) return;
    
    // Only track when call ends
    if (beforeData.state !== 'ACTIVE' || afterData.state !== 'ENDED') return;

    const { payerId, earnerId, totalTokens } = afterData;
    
    if (!payerId || !earnerId) return;

    try {
      // Record activity
      await db.collection('vipActivity').add({
        userId: payerId,
        activityType: 'paid_call',
        partnerId: earnerId,
        tokenAmount: totalTokens || 0,
        timestamp: Timestamp.now(),
        metadata: {
          callId: event.params.callId,
          callType: afterData.callType,
          durationMinutes: afterData.durationMinutes,
        },
      } as VIPActivity);

      // Update VIP score
      await updateVIPScore(payerId);
      
      logger.info(`Tracked paid call for VIP: ${payerId}`);
    } catch (error) {
      logger.error('Error tracking paid call for VIP:', error);
    }
  }
);

/**
 * Triggered when a calendar booking is completed/verified
 * Tracks paid meeting activity for VIP scoring
 */
export const trackPaidMeetingForVIP = onDocumentUpdated(
  'calendarBookings/{bookingId}',
  async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();
    
    if (!beforeData || !afterData) return;
    
    // Only track when meeting is verified/completed
    if (afterData.status !== 'completed') return;
    if (beforeData.status === 'completed') return; // Already tracked

    const { bookerId, hostId, price } = afterData;
    
    if (!bookerId || !hostId) return;

    try {
      // Record activity
      await db.collection('vipActivity').add({
        userId: bookerId,
        activityType: 'paid_meeting',
        partnerId: hostId,
        tokenAmount: price || 0,
        timestamp: Timestamp.now(),
        metadata: {
          bookingId: event.params.bookingId,
          meetingType: afterData.meetingType,
        },
      } as VIPActivity);

      // Update VIP score
      await updateVIPScore(bookerId);
      
      logger.info(`Tracked paid meeting for VIP: ${bookerId}`);
    } catch (error) {
      logger.error('Error tracking paid meeting for VIP:', error);
    }
  }
);

/**
 * Triggered when tokens are purchased
 * Tracks token purchase frequency for VIP scoring
 */
export const trackTokenPurchaseForVIP = onDocumentCreated(
  'transactions/{transactionId}',
  async (event) => {
    const transactionData = event.data?.data();
    if (!transactionData) return;

    const { type, userId, amount } = transactionData;
    
    // Only track token purchases
    if (type !== 'token_purchase') return;
    if (!userId || !amount) return;

    try {
      // Record activity
      await db.collection('vipActivity').add({
        userId: userId,
        activityType: 'token_purchase',
        tokenAmount: amount,
        timestamp: Timestamp.now(),
        metadata: {
          transactionId: event.params.transactionId,
        },
      } as VIPActivity);

      // Update VIP score
      await updateVIPScore(userId);
      
      logger.info(`Tracked token purchase for VIP: ${userId}`);
    } catch (error) {
      logger.error('Error tracking token purchase for VIP:', error);
    }
  }
);

// ============================================================================
// VIP SCORE CALCULATION
// ============================================================================

/**
 * Calculate VIP score based on user activity
 */
async function updateVIPScore(userId: string): Promise<void> {
  try {
    const now = Timestamp.now();
    const thirtyDaysAgo = new Date(now.toMillis() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.toMillis() - 90 * 24 * 60 * 60 * 1000);

    // Get recent activity (last 90 days)
    const activitySnapshot = await db.collection('vipActivity')
      .where('userId', '==', userId)
      .where('timestamp', '>=', Timestamp.fromDate(ninetyDaysAgo))
      .get();

    if (activitySnapshot.empty) {
      logger.info(`No recent activity for user ${userId}`);
      return;
    }

    const activities = activitySnapshot.docs.map(doc => doc.data() as VIPActivity);

    // Calculate score components
    const components = calculateScoreComponents(activities, thirtyDaysAgo);
    
    // Save score components
    await db.collection('vipScoreComponents').doc(userId).set({
      ...components,
      userId,
      updatedAt: now,
    } as VIPScoreComponents);

    // Determine VIP level
    const newLevel = determineVIPLevel(components.totalScore);
    
    // Get or create VIP profile
    const profileRef = db.collection('vipProfiles').doc(userId);
    const profileDoc = await profileRef.get();
    
    if (!profileDoc.exists) {
      // Create new VIP profile
      await profileRef.set({
        userId,
        vipLevel: newLevel,
        vipSince: newLevel !== 'none' ? now : null,
        vipScore: components.totalScore,
        vipHistory: [{
          level: newLevel,
          date: now,
        }],
        createdAt: now,
        updatedAt: now,
      } as VIPProfile);

      // Create settings
      await db.collection('vipSettings').doc(userId).set({
        showBadgeToCreators: false, // Default off for privacy
        notifyOnLevelUp: true,
        privacyMode: 'creators', // Show to creators only
        createdAt: now,
        updatedAt: now,
      });

      if (newLevel !== 'none') {
        await sendVIPLevelUpNotification(userId, 'none', newLevel);
      }
    } else {
      // Update existing profile
      const currentProfile = profileDoc.data() as VIPProfile;
      const oldLevel = currentProfile.vipLevel;

      if (oldLevel !== newLevel) {
        // Level changed
        await profileRef.update({
          vipLevel: newLevel,
          vipSince: newLevel !== 'none' ? (currentProfile.vipSince || now) : null,
          vipScore: components.totalScore,
          vipHistory: FieldValue.arrayUnion({
            level: newLevel,
            date: now,
          }),
          updatedAt: now,
        });

        // Send notification (no downgrade shaming)
        if (isLevelUp(oldLevel, newLevel)) {
          await sendVIPLevelUpNotification(userId, oldLevel, newLevel);
        }
      } else {
        // Just update score
        await profileRef.update({
          vipScore: components.totalScore,
          updatedAt: now,
        });
      }
    }

    logger.info(`Updated VIP score for ${userId}: ${components.totalScore} (${newLevel})`);
  } catch (error) {
    logger.error(`Error updating VIP score for ${userId}:`, error);
    throw error;
  }
}

/**
 * Calculate individual score components
 */
function calculateScoreComponents(
  activities: VIPActivity[],
  thirtyDaysAgo: Date
): Omit<VIPScoreComponents, 'userId' | 'updatedAt'> {
  // Count activities
  const paidChats = activities.filter(a => a.activityType === 'paid_chat');
  const paidCalls = activities.filter(a => a.activityType === 'paid_call');
  const paidMeetings = activities.filter(a => a.activityType === 'paid_meeting');
  const tokenPurchases = activities.filter(a => 
    a.activityType === 'token_purchase' &&
    a.timestamp.toDate() >= thirtyDaysAgo
  );

  // LOYALTY SCORE: Paid chats with same person (max 30 points)
  const partnersMap = new Map<string, number>();
  paidChats.forEach(chat => {
    if (chat.partnerId) {
      partnersMap.set(chat.partnerId, (partnersMap.get(chat.partnerId) || 0) + 1);
    }
  });
  
  const maxChatsWithOnePerson = Math.max(0, ...Array.from(partnersMap.values()));
  const loyaltyScore = Math.min(30, maxChatsWithOnePerson >= VIP_THRESHOLDS.paidChatsWithSamePerson
    ? 10 + (maxChatsWithOnePerson - VIP_THRESHOLDS.paidChatsWithSamePerson) * 5
    : maxChatsWithOnePerson * 3
  );

  // CONSISTENCY SCORE: Total paid chats across people (max 25 points)
  const totalPaidChats = paidChats.length;
  const consistencyScore = Math.min(25, totalPaidChats >= VIP_THRESHOLDS.paidChatsTotal
    ? 15 + (totalPaidChats - VIP_THRESHOLDS.paidChatsTotal) * 2
    : totalPaidChats * 2.5
  );

  // VALUE SCORE: Calls and meetings (max 30 points)
  const callScore = Math.min(15, paidCalls.length >= VIP_THRESHOLDS.paidCalls
    ? 10 + (paidCalls.length - VIP_THRESHOLDS.paidCalls) * 2.5
    : paidCalls.length * 5
  );
  
  const meetingScore = Math.min(15, paidMeetings.length >= VIP_THRESHOLDS.paidMeetings
    ? 15
    : paidMeetings.length * 15
  );
  
  const valueScore = callScore + meetingScore;

  // FREQUENCY SCORE: Token purchases per month (max 15 points)
  const purchasesThisMonth = tokenPurchases.length;
  const frequencyScore = Math.min(15, purchasesThisMonth >= VIP_THRESHOLDS.tokenPurchasesPerMonth
    ? 10 + (purchasesThisMonth - VIP_THRESHOLDS.tokenPurchasesPerMonth) * 2.5
    : purchasesThisMonth * 5
  );

  const totalScore = Math.round(loyaltyScore + consistencyScore + valueScore + frequencyScore);

  return {
    loyaltyScore: Math.round(loyaltyScore),
    consistencyScore: Math.round(consistencyScore),
    valueScore: Math.round(valueScore),
    frequencyScore: Math.round(frequencyScore),
    totalScore: Math.min(100, totalScore),
  };
}

/**
 * Determine VIP level based on score
 */
function determineVIPLevel(score: number): VIPLevel {
  if (score >= VIP_LEVEL_SCORES.royal) return 'royal';
  if (score >= VIP_LEVEL_SCORES.gold) return 'gold';
  if (score >= VIP_LEVEL_SCORES.silver) return 'silver';
  if (score >= VIP_LEVEL_SCORES.bronze) return 'bronze';
  return 'none';
}

/**
 * Check if level change is an upgrade
 */
function isLevelUp(oldLevel: VIPLevel, newLevel: VIPLevel): boolean {
  const levels: VIPLevel[] = ['none', 'bronze', 'silver', 'gold', 'royal'];
  return levels.indexOf(newLevel) > levels.indexOf(oldLevel);
}

/**
 * Send VIP level up notification
 */
async function sendVIPLevelUpNotification(
  userId: string,
  oldLevel: VIPLevel,
  newLevel: VIPLevel
): Promise<void> {
  const messages = {
    bronze: 'Welcome to VIP Bronze! You now have visibility boosts in Discover.',
    silver: 'Upgraded to VIP Silver! You now receive early chat invitations.',
    gold: 'Congratulations on VIP Gold! You now have priority in paid chat queues.',
    royal: 'You\'ve reached VIP Royal! Unlock exclusive emotional privileges.',
  };

  if (newLevel === 'none') return;

  await db.collection('vipNotifications').add({
    userId,
    type: 'level_up',
    title: `VIP ${newLevel.toUpperCase()} Achieved!`,
    message: messages[newLevel],
    oldLevel,
    newLevel,
    read: false,
    createdAt: Timestamp.now(),
  });
}

// ============================================================================
// VIP QUEUE PRIORITY INTEGRATION (PACK 231)
// ============================================================================

/**
 * Add VIP priority boost to queue score when user is queued
 * Triggered when a chat is added to queue
 */
export const applyVIPQueuePriority = onDocumentCreated(
  'paidChatQueue/{creatorId}/chats/{chatId}',
  async (event) => {
    const queueData = event.data?.data();
    if (!queueData) return;

    const payerId = queueData.payerId;
    if (!payerId) return;

    try {
      // Get payer's VIP level
      const vipProfileDoc = await db.collection('vipProfiles').doc(payerId).get();
      
      if (!vipProfileDoc.exists) {
        // No VIP profile = no boost
        return;
      }

      const vipProfile = vipProfileDoc.data() as VIPProfile;
      const priorityBoost = QUEUE_PRIORITY_BOOST[vipProfile.vipLevel];

      if (priorityBoost > 0) {
        // Update queue entry with VIP boost
        await event.data?.ref.update({
          scoreForOrder: FieldValue.increment(priorityBoost),
          vipLevel: vipProfile.vipLevel,
          vipPriorityApplied: true,
          updatedAt: Timestamp.now(),
        });

        logger.info(`Applied VIP ${vipProfile.vipLevel} priority boost (+${priorityBoost}) for ${payerId}`);
      }
    } catch (error) {
      logger.error('Error applying VIP queue priority:', error);
    }
  }
);

// ============================================================================
// VIP PRIVILEGE TRACKING
// ============================================================================

/**
 * Log when a VIP privilege is used
 */
export async function logVIPPrivilegeUse(
  userId: string,
  creatorId: string,
  privilegeType: string,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    await db.collection('vipPrivilegesLog').add({
      userId,
      creatorId,
      privilegeType,
      timestamp: Timestamp.now(),
      metadata: metadata || {},
    });

    logger.info(`VIP privilege used: ${privilegeType} by ${userId}`);
  } catch (error) {
    logger.error('Error logging VIP privilege use:', error);
  }
}

// ============================================================================
// VIP DOWNGRADE MONITORING (NO SHAMING)
// ============================================================================

/**
 * Monitor inactivity for gradual downgrade
 * Runs daily to check for inactive VIP users
 */
export const monitorVIPInactivity = onSchedule(
  { schedule: 'every 24 hours' },
  async () => {
    try {
      const now = Timestamp.now();
      const thresholdDate = new Date(now.toMillis() - INACTIVITY_DOWNGRADE_DAYS * 24 * 60 * 60 * 1000);

      // Get all VIP users (not 'none')
      const vipUsers = await db.collection('vipProfiles')
        .where('vipLevel', '!=', 'none')
        .get();

      let downgradedCount = 0;

      for (const doc of vipUsers.docs) {
        const profile = doc.data() as VIPProfile;
        
        // Check last activity
        const lastActivitySnapshot = await db.collection('vipActivity')
          .where('userId', '==', profile.userId)
          .orderBy('timestamp', 'desc')
          .limit(1)
          .get();

        if (lastActivitySnapshot.empty) continue;

        const lastActivity = lastActivitySnapshot.docs[0].data() as VIPActivity;
        
        if (lastActivity.timestamp.toDate() < thresholdDate) {
          // User is inactive - gradual downgrade
          const currentLevel = profile.vipLevel;
          const newLevel = downgradeByOneLevel(currentLevel);

          if (newLevel !== currentLevel) {
            await db.collection('vipProfiles').doc(profile.userId).update({
              vipLevel: newLevel,
              vipScore: VIP_LEVEL_SCORES[newLevel],
              vipHistory: FieldValue.arrayUnion({
                level: newLevel,
                date: now,
              }),
              updatedAt: now,
            });

            // Track downgrade (no shaming notification sent)
            await db.collection('vipDowngradeTracking').doc(profile.userId).set({
              previousLevel: currentLevel,
              currentLevel: newLevel,
              reason: 'inactivity',
              lastActiveDate: lastActivity.timestamp,
              downgradedAt: now,
            });

            downgradedCount++;
            logger.info(`Downgraded VIP user ${profile.userId} from ${currentLevel} to ${newLevel} due to inactivity`);
          }
        }
      }

      logger.info(`VIP inactivity monitoring complete: ${downgradedCount} users downgraded`);
    } catch (error) {
      logger.error('Error monitoring VIP inactivity:', error);
    }
  }
);

/**
 * Downgrade by one level (gradual)
 */
function downgradeByOneLevel(currentLevel: VIPLevel): VIPLevel {
  const levels: VIPLevel[] = ['none', 'bronze', 'silver', 'gold', 'royal'];
  const currentIndex = levels.indexOf(currentLevel);
  return currentIndex > 0 ? levels[currentIndex - 1] : 'none';
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  VIPLevel,
  VIPProfile,
  VIPActivity,
  VIPScoreComponents,
  VIPThresholds,
  QUEUE_PRIORITY_BOOST,
  updateVIPScore,
  calculateScoreComponents,
  determineVIPLevel,
};