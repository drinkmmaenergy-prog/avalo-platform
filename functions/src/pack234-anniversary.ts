/**
 * PACK 234: Anniversary System
 * Automatic celebrations that reactivate couples emotionally
 * 
 * Detects and celebrates:
 * - Match anniversaries (7/30/60/90/180/365 days)
 * - First chat anniversaries
 * - First call anniversaries
 * - First memory anniversaries
 * - First meeting anniversaries
 * 
 * ECONOMICS:
 * - No free tokens or discounts
 * - Drives paid interactions through emotional engagement
 * - Streak rewards are cosmetic only (themes, stickers, badges)
 */

import * as functions from 'firebase-functions';
import { db, serverTimestamp, increment } from './init';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

export type AnniversaryType = 
  | 'match'
  | 'first_chat'
  | 'first_call'
  | 'first_memory'
  | 'first_meeting';

export type AnniversaryInterval = 7 | 30 | 60 | 90 | 180 | 365;

export interface AnniversaryStatus {
  coupleId: string;
  participantIds: [string, string];
  isActive: boolean;
  lastChecked: Timestamp | FieldValue;
  nextEligibleEvents: {
    match: Timestamp | null;
    firstChat: Timestamp | null;
    firstCall: Timestamp | null;
    firstMemory: Timestamp | null;
    firstMeeting: Timestamp | null;
  };
  streakPoints: number;
  lastCelebration: Timestamp | null;
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}

export interface AnniversaryCelebration {
  celebrationId: string;
  coupleId: string;
  participantIds: [string, string];
  anniversaryType: AnniversaryType;
  interval: AnniversaryInterval;
  milestoneDate: Timestamp;
  celebrationDate: Timestamp | FieldValue;
  isActive: boolean;
  expiresAt: Timestamp; // 24 hours
  message: string;
  suggestedAction: string;
  suggestedActionType: 'video_call' | 'voice_call' | 'chat' | 'meeting' | 'event' | 'gift';
  viewedBy: string[];
  viewedAt?: { [userId: string]: Timestamp };
  lastInteractionAt?: Timestamp;
  metadata: {
    originalEventDate: Timestamp;
    daysSince: number;
  };
}

export interface AnniversaryStreak {
  coupleId: string;
  participantIds: [string, string];
  streakPoints: number;
  lastActivityAt: Timestamp | null;
  activities48h: number; // Count of activities in last 48h window
  lastWindowStart: Timestamp | null;
  createdAt: Timestamp | FieldValue;
  lastUpdated: Timestamp | FieldValue;
}

export interface StreakActivity {
  activityId: string;
  coupleId: string;
  participantIds: [string, string];
  activityType: 'paid_chat' | 'video_call' | 'voice_call' | 'date_booking' | 'event_attendance';
  activityAt: Timestamp | FieldValue;
  pointsAwarded: number;
  withinWindow: boolean; // Was it within 48h of anniversary?
  anniversaryCelebrationId?: string;
  metadata?: any;
}

export interface AnniversaryReward {
  rewardId: string;
  coupleId: string;
  participantIds: [string, string];
  rewardType: 'chat_theme' | 'sticker' | 'animation' | 'memory_frame' | 'profile_badge';
  rewardDetails: {
    name: string;
    description: string;
    imageUrl?: string;
    duration?: number; // hours if temporary
  };
  isEarned: boolean;
  isActive: boolean;
  streakPointsRequired: number;
  earnedAt: Timestamp | FieldValue;
  activatedAt?: Timestamp;
  expiresAt?: Timestamp;
}

// Anniversary intervals to check (in days)
const ANNIVERSARY_INTERVALS: AnniversaryInterval[] = [7, 30, 60, 90, 180, 365];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if user is in Sleep Mode (PACK 228)
 */
async function isUserInSleepMode(userId: string): Promise<boolean> {
  const sleepDoc = await db.collection('sleep_mode_states').doc(userId).get();
  return sleepDoc.exists && sleepDoc.data()?.isActive === true;
}

/**
 * Check if couple is in Breakup Recovery (PACK 222)
 */
async function isCoupleInBreakupRecovery(coupleId: string): Promise<boolean> {
  const breakupDoc = await db.collection('breakup_recovery_states').doc(coupleId).get();
  return breakupDoc.exists && breakupDoc.data()?.isActive === true;
}

/**
 * Check if there's a safety incident between couple
 */
async function hasSafetyIncident(userId1: string, userId2: string): Promise<boolean> {
  const incidents = await db.collection('safety_incidents')
    .where('participantIds', 'array-contains', userId1)
    .where('resolved', '==', false)
    .get();
  
  for (const doc of incidents.docs) {
    const data = doc.data();
    if (data.participantIds.includes(userId2)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if user has disabled anniversaries
 */
async function hasAnniversariesDisabled(userId: string): Promise<boolean> {
  const settingsDoc = await db
    .collection('users').doc(userId)
    .collection('settings').doc('anniversary')
    .get();
  
  return settingsDoc.exists && settingsDoc.data()?.enabled === false;
}

/**
 * Get couple document for two users
 */
async function getCoupleDocument(userId1: string, userId2: string) {
  // Try to find existing couple document
  const couplesQuery = await db.collection('couples')
    .where('participantIds', 'array-contains', userId1)
    .get();
  
  for (const doc of couplesQuery.docs) {
    const data = doc.data();
    if (data.participantIds.includes(userId2)) {
      return { id: doc.id, data };
    }
  }
  
  return null;
}

/**
 * Calculate next anniversary date
 */
function calculateNextAnniversary(originalDate: Date, interval: AnniversaryInterval): Date {
  const next = new Date(originalDate);
  next.setDate(next.getDate() + interval);
  return next;
}

/**
 * Check if date is today (local timezone)
 */
function isToday(date: Date, timezoneOffset: number = 0): boolean {
  const now = new Date();
  now.setMinutes(now.getMinutes() + timezoneOffset);
  
  return date.getFullYear() === now.getFullYear() &&
         date.getMonth() === now.getMonth() &&
         date.getDate() === now.getDate();
}

/**
 * Generate celebration message
 */
function generateCelebrationMessage(type: AnniversaryType, interval: AnniversaryInterval): string {
  const messages: { [key: string]: { [key: number]: string } } = {
    match: {
      7: "A week of connection. Today marks 7 days since you met on Avalo.",
      30: "One month together. Today marks 30 days since you matched.",
      60: "Two months of chemistry. Today marks 60 days since you met on Avalo.",
      90: "Three months of connection. A small moment worth celebrating.",
      180: "Half a year together. Today marks 6 months since you matched on Avalo.",
      365: "One year anniversary. Today marks a year since you met on Avalo. 🎉"
    },
    first_chat: {
      7: "A week since your first message. The beginning of something special.",
      30: "One month since your first conversation on Avalo.",
      60: "Two months since your first words to each other.",
      90: "Three months since that first message that started it all.",
      180: "Six months since your first chat. Look how far you've come.",
      365: "One year since your first conversation. A journey worth celebrating."
    },
    first_call: {
      7: "A week since you first heard each other's voice.",
      30: "One month since your first call together.",
      60: "Two months since that memorable first call.",
      90: "Three months since you first connected by voice.",
      180: "Six months since your first call on Avalo.",
      365: "One year since you first spoke to each other."
    },
    first_memory: {
      7: "A week since that special memory you created together.",
      30: "One month since that moment you captured in your Memory Log.",
      60: "Two months since that memory that brought you closer.",
      90: "Three months since that unforgettable moment.",
      180: "Six months since that special memory you shared.",
      365: "One year anniversary of a memory worth celebrating."
    },
    first_meeting: {
      7: "A week since you met in person. The chemistry was real.",
      30: "One month since your first real meeting.",
      60: "Two months since you took the leap and met face to face.",
      90: "Three months since that first meeting that changed everything.",
      180: "Six months since you first met in person on Avalo.",
      365: "One year since your first meeting. From digital to real." 
    }
  };
  
  return messages[type]?.[interval] || `Today marks ${interval} days of connection.`;
}

/**
 * Generate suggested paid action
 */
function generateSuggestedAction(type: AnniversaryType, interval: AnniversaryInterval): {
  action: string;
  actionType: 'video_call' | 'voice_call' | 'chat' | 'meeting' | 'event' | 'gift';
} {
  const actions: { [key: string]: { action: string; actionType: any } } = {
    match: { action: "Send a video message to celebrate this milestone", actionType: 'video_call' },
    first_chat: { action: "Start a meaningful conversation about how far you've come", actionType: 'chat' },
    first_call: { action: "Call them and reminisce about that first conversation", actionType: 'voice_call' },
    first_memory: { action: "Create a new memory together", actionType: 'meeting' },
    first_meeting: { action: "Plan your next date to celebrate", actionType: 'meeting' }
  };
  
  // For longer intervals, suggest more significant actions
  if (interval >= 180) {
    return { action: "Celebrate offline together with a special date", actionType: 'meeting' };
  }
  
  return actions[type] || { action: "Send a message to celebrate", actionType: 'chat' };
}

// =============================================================================
// DAILY ANNIVERSARY CHECK (Scheduled Function)
// =============================================================================

/**
 * Check for anniversaries daily at 03:00 UTC
 * Processes all active couples and creates celebrations
 */
export const checkDailyAnniversaries = functions.pubsub
  .schedule('0 3 * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('🎉 Starting daily anniversary check...');
    
    const batch = db.batch();
    let celebrationsCreated = 0;
    
    try {
      // Get all anniversary status documents
      const statusDocs = await db.collection('anniversary_status')
        .where('isActive', '==', true)
        .get();
      
      console.log(`Found ${statusDocs.size} active couples to check`);
      
      for (const statusDoc of statusDocs.docs) {
        const status = statusDoc.data() as AnniversaryStatus;
        const { coupleId, participantIds, nextEligibleEvents } = status;
        
        // Check if either user has disabled anniversaries
        const user1Disabled = await hasAnniversariesDisabled(participantIds[0]);
        const user2Disabled = await hasAnniversariesDisabled(participantIds[1]);
        if (user1Disabled || user2Disabled) {
          console.log(`Skipping ${coupleId}: User disabled anniversaries`);
          continue;
        }
        
        // Check sleep mode for both users
        const user1Sleep = await isUserInSleepMode(participantIds[0]);
        const user2Sleep = await isUserInSleepMode(participantIds[1]);
        if (user1Sleep || user2Sleep) {
          console.log(`Skipping ${coupleId}: User in sleep mode`);
          continue;
        }
        
        // Check breakup recovery
        const inBreakupRecovery = await isCoupleInBreakupRecovery(coupleId);
        if (inBreakupRecovery) {
          console.log(`Skipping ${coupleId}: In breakup recovery`);
          continue;
        }
        
        // Check safety incidents
        const hasSafety = await hasSafetyIncident(participantIds[0], participantIds[1]);
        if (hasSafety) {
          console.log(`Skipping ${coupleId}: Safety incident flagged`);
          continue;
        }
        
        // Check each anniversary type
        for (const [eventType, nextDate] of Object.entries(nextEligibleEvents)) {
          if (!nextDate) continue;
          
          const anniversaryDate = nextDate instanceof Timestamp ? nextDate.toDate() : new Date(nextDate);
          
          // Check if anniversary is today
          if (isToday(anniversaryDate)) {
            console.log(`🎉 Anniversary detected for ${coupleId}: ${eventType} anniversary`);
            
            // Get original event date and calculate interval
            const couple = await db.collection('couples').doc(coupleId).get();
            const coupleData = couple.data();
            
            if (!coupleData) continue;
            
            const originalDate = getOriginalEventDate(coupleData, eventType as AnniversaryType);
            if (!originalDate) continue;
            
            const daysSince = Math.floor(
              (Date.now() - originalDate.getTime()) / (1000 * 60 * 60 * 24)
            );
            
            // Find matching interval
            const interval = ANNIVERSARY_INTERVALS.find(i => i === daysSince);
            if (!interval) continue;
            
            // Create celebration
            await createAnniversaryCelebration(
              coupleId,
              participantIds as [string, string],
              eventType as AnniversaryType,
              interval,
              originalDate,
              batch
            );
            
            celebrationsCreated++;
          }
        }
        
        // Update last checked timestamp
        batch.update(statusDoc.ref, {
          lastChecked: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      
      // Commit all celebrations
      await batch.commit();
      
      // Update analytics
      await updateAnniversaryAnalytics(celebrationsCreated);
      
      console.log(`✅ Anniversary check complete. Created ${celebrationsCreated} celebrations.`);
      
      return { success: true, celebrationsCreated };
      
    } catch (error) {
      console.error('Error in daily anniversary check:', error);
      throw error;
    }
  });

/**
 * Get original event date from couple data
 */
function getOriginalEventDate(coupleData: any, eventType: AnniversaryType): Date | null {
  switch (eventType) {
    case 'match':
      return coupleData.matchedAt?.toDate() || null;
    case 'first_chat':
      return coupleData.firstMessageAt?.toDate() || null;
    case 'first_call':
      return coupleData.firstCallAt?.toDate() || null;
    case 'first_memory':
      return coupleData.firstMemoryAt?.toDate() || null;
    case 'first_meeting':
      return coupleData.firstMeetingAt?.toDate() || null;
    default:
      return null;
  }
}

/**
 * Create anniversary celebration
 */
async function createAnniversaryCelebration(
  coupleId: string,
  participantIds: [string, string],
  anniversaryType: AnniversaryType,
  interval: AnniversaryInterval,
  originalDate: Date,
  batch: FirebaseFirestore.WriteBatch
): Promise<void> {
  const celebrationId = db.collection('anniversary_celebrations').doc().id;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours
  
  const message = generateCelebrationMessage(anniversaryType, interval);
  const { action, actionType } = generateSuggestedAction(anniversaryType, interval);
  
  const celebration: Partial<AnniversaryCelebration> = {
    celebrationId,
    coupleId,
    participantIds,
    anniversaryType,
    interval,
    milestoneDate: Timestamp.fromDate(originalDate),
    celebrationDate: serverTimestamp(),
    isActive: true,
    expiresAt: Timestamp.fromDate(expiresAt),
    message,
    suggestedAction: action,
    suggestedActionType: actionType,
    viewedBy: [],
    metadata: {
      originalEventDate: Timestamp.fromDate(originalDate),
      daysSince: interval
    }
  };
  
  const celebrationRef = db.collection('anniversary_celebrations').doc(celebrationId);
  batch.set(celebrationRef, celebration);
  
  // Create notifications for both users
  for (const userId of participantIds) {
    const notificationId = db.collection('anniversary_notifications').doc().id;
    const notificationRef = db.collection('anniversary_notifications').doc(notificationId);
    
    batch.set(notificationRef, {
      notificationId,
      recipientUserId: userId,
      coupleId,
      celebrationId,
      anniversaryType,
      interval,
      message,
      isRead: false,
      createdAt: serverTimestamp()
    });
  }
  
  // Create milestone history entry
  const historyId = db.collection('anniversary_milestone_history').doc().id;
  const historyRef = db.collection('anniversary_milestone_history').doc(historyId);
  
  batch.set(historyRef, {
    historyId,
    coupleId,
    participantIds,
    anniversaryType,
    interval,
    celebrationId,
    celebratedAt: serverTimestamp()
  });
  
  // Update anniversary status with last celebration
  const statusRef = db.collection('anniversary_status').doc(coupleId);
  batch.update(statusRef, {
    lastCelebration: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  
  console.log(`Created celebration ${celebrationId} for couple ${coupleId}`);
}

// =============================================================================
// STREAK TRACKING
// =============================================================================

/**
 * Track paid activity for streak calculation
 * Called from other systems (chat, calls, meetings, events)
 */
export const trackAnniversaryActivity = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { coupleId, activityType, metadata } = data;
  
  if (!coupleId || !activityType) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }
  
  try {
    // Get couple info
    const coupleDoc = await db.collection('couples').doc(coupleId).get();
    if (!coupleDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Couple not found');
    }
    
    const coupleData = coupleDoc.data()!;
    const participantIds = coupleData.participantIds as [string, string];
    
    // Check if there's an active celebration in the last 48 hours
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const recentCelebrations = await db.collection('anniversary_celebrations')
      .where('coupleId', '==', coupleId)
      .where('isActive', '==', true)
      .where('celebrationDate', '>=', Timestamp.fromDate(twoDaysAgo))
      .get();
    
    const withinWindow = !recentCelebrations.empty;
    const anniversaryCelebrationId = withinWindow ? recentCelebrations.docs[0].id : undefined;
    
    // Calculate streak points based on activity type
    const pointsMap = {
      'paid_chat': 1,      // > 200 words
      'video_call': 2,     // > 8 minutes
      'voice_call': 1,     // > 10 minutes
      'date_booking': 4,
      'event_attendance': 6
    };
    
    const pointsAwarded = pointsMap[activityType as keyof typeof pointsMap] || 0;
    
    // Create activity record
    const activityId = db.collection('anniversary_streak_activities').doc().id;
    await db.collection('anniversary_streak_activities').doc(activityId).set({
      activityId,
      coupleId,
      participantIds,
      activityType,
      activityAt: serverTimestamp(),
      pointsAwarded,
      withinWindow,
      anniversaryCelebrationId,
      metadata: metadata || {}
    });
    
    // Update streak points if within window
    if (withinWindow && pointsAwarded > 0) {
      const streakRef = db.collection('anniversary_streaks').doc(coupleId);
      const streakDoc = await streakRef.get();
      
      if (streakDoc.exists) {
        await streakRef.update({
          streakPoints: increment(pointsAwarded),
          lastActivityAt: serverTimestamp(),
          lastUpdated: serverTimestamp()
        });
      } else {
        await streakRef.set({
          coupleId,
          participantIds,
          streakPoints: pointsAwarded,
          lastActivityAt: serverTimestamp(),
          activities48h: 1,
          lastWindowStart: serverTimestamp(),
          createdAt: serverTimestamp(),
          lastUpdated: serverTimestamp()
        });
      }
      
      // Check for unlocked rewards
      await checkAndUnlockRewards(coupleId, participantIds);
    }
    
    return {
      success: true,
      pointsAwarded: withinWindow ? pointsAwarded : 0,
      withinWindow,
      message: withinWindow 
        ? `Earned ${pointsAwarded} streak points!` 
        : 'Activity tracked (outside anniversary window)'
    };
    
  } catch (error) {
    console.error('Error tracking anniversary activity:', error);
    throw new functions.https.HttpsError('internal', 'Failed to track activity');
  }
});

/**
 * Check and unlock rewards based on streak points
 */
async function checkAndUnlockRewards(coupleId: string, participantIds: [string, string]): Promise<void> {
  const streakDoc = await db.collection('anniversary_streaks').doc(coupleId).get();
  if (!streakDoc.exists) return;
  
  const streakPoints = streakDoc.data()!.streakPoints;
  
  // Define rewards and their point thresholds
  const rewards = [
    { points: 5, type: 'chat_theme', name: 'Anniversary Glow Theme', description: 'Special chat theme with romantic gradient' },
    { points: 10, type: 'sticker', name: 'Anniversary Heart Sticker', description: 'Exclusive anniversary sticker pack' },
    { points: 15, type: 'animation', name: 'Celebration Animation', description: 'Special celebration entrance animation' },
    { points: 20, type: 'memory_frame', name: 'Golden Anniversary Frame', description: 'Premium frame for Memory Log photos' },
    { points: 30, type: 'profile_badge', name: 'Anniversary Duo Badge', description: 'Visible only to each other' }
  ];
  
  for (const reward of rewards) {
    if (streakPoints >= reward.points) {
      // Check if already unlocked
      const existingReward = await db.collection('anniversary_rewards')
        .where('coupleId', '==', coupleId)
        .where('rewardType', '==', reward.type)
        .get();
      
      if (existingReward.empty) {
        // Unlock reward
        const rewardId = db.collection('anniversary_rewards').doc().id;
        await db.collection('anniversary_rewards').doc(rewardId).set({
          rewardId,
          coupleId,
          participantIds,
          rewardType: reward.type,
          rewardDetails: {
            name: reward.name,
            description: reward.description
          },
          isEarned: true,
          isActive: false, // User must activate it
          streakPointsRequired: reward.points,
          earnedAt: serverTimestamp()
        });
        
        console.log(`Unlocked reward: ${reward.name} for couple ${coupleId}`);
      }
    }
  }
}

// =============================================================================
// HTTP CALLABLE FUNCTIONS FOR MOBILE APP
// =============================================================================

/**
 * Get active celebrations for a user
 */
export const getActiveCelebrations = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = context.auth.uid;
  
  try {
    const celebrations = await db.collection('anniversary_celebrations')
      .where('participantIds', 'array-contains', userId)
      .where('isActive', '==', true)
      .orderBy('celebrationDate', 'desc')
      .limit(10)
      .get();
    
    return {
      success: true,
      celebrations: celebrations.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    };
    
  } catch (error) {
    console.error('Error getting celebrations:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get celebrations');
  }
});

/**
 * Get streak status for a couple
 */
export const getStreakStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { coupleId } = data;
  
  if (!coupleId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing coupleId');
  }
  
  try {
    const streakDoc = await db.collection('anniversary_streaks').doc(coupleId).get();
    
    if (!streakDoc.exists) {
      return { success: true, streak: null };
    }
    
    const streakData = streakDoc.data();
    
    // Get unlocked rewards
    const rewards = await db.collection('anniversary_rewards')
      .where('coupleId', '==', coupleId)
      .where('isEarned', '==', true)
      .get();
    
    return {
      success: true,
      streak: {
        ...streakData,
        unlockedRewards: rewards.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      }
    };
    
  } catch (error) {
    console.error('Error getting streak status:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get streak status');
  }
});

/**
 * Toggle anniversary system for user
 */
export const toggleAnniversarySystem = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = context.auth.uid;
  const { enabled } = data;
  
  if (typeof enabled !== 'boolean') {
    throw new functions.https.HttpsError('invalid-argument', 'enabled must be a boolean');
  }
  
  try {
    await db
      .collection('users').doc(userId)
      .collection('settings').doc('anniversary')
      .set({ enabled, updatedAt: serverTimestamp() }, { merge: true });
    
    return {
      success: true,
      message: enabled ? 'Anniversary system enabled' : 'Anniversary system disabled'
    };
    
  } catch (error) {
    console.error('Error toggling anniversary system:', error);
    throw new functions.https.HttpsError('internal', 'Failed to toggle anniversary system');
  }
});

/**
 * Mark celebration as viewed
 */
export const markCelebrationViewed = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = context.auth.uid;
  const { celebrationId } = data;
  
  if (!celebrationId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing celebrationId');
  }
  
  try {
    const celebrationRef = db.collection('anniversary_celebrations').doc(celebrationId);
    const celebrationDoc = await celebrationRef.get();
    
    if (!celebrationDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Celebration not found');
    }
    
    const data = celebrationDoc.data()!;
    
    // Verify user is participant
    if (!data.participantIds.includes(userId)) {
      throw new functions.https.HttpsError('permission-denied', 'Not a participant');
    }
    
    // Update viewed status
    await celebrationRef.update({
      viewedBy: FieldValue.arrayUnion(userId),
      [`viewedAt.${userId}`]: serverTimestamp(),
      lastInteractionAt: serverTimestamp()
    });
    
    return { success: true };
    
  } catch (error) {
    console.error('Error marking celebration viewed:', error);
    throw new functions.https.HttpsError('internal', 'Failed to mark celebration viewed');
  }
});

// =============================================================================
// ANALYTICS
// =============================================================================

/**
 * Update anniversary analytics
 */
async function updateAnniversaryAnalytics(celebrationsToday: number): Promise<void> {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const analyticsRef = db.collection('anniversary_analytics').doc(today);
  
  await analyticsRef.set({
    date: today,
    totalCelebrations: increment(celebrationsToday),
    lastUpdated: serverTimestamp()
  }, { merge: true });
}

/**
 * Initialize anniversary status for a new couple
 * Called when couple is created
 */
export const initializeAnniversaryStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { coupleId } = data;
  
  if (!coupleId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing coupleId');
  }
  
  try {
    const coupleDoc = await db.collection('couples').doc(coupleId).get();
    if (!coupleDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Couple not found');
    }
    
    const coupleData = coupleDoc.data()!;
    const participantIds = coupleData.participantIds as [string, string];
    
    // Calculate next eligible dates for each anniversary type
    const matchDate = coupleData.matchedAt?.toDate();
    const firstChatDate = coupleData.firstMessageAt?.toDate();
    const firstCallDate = coupleData.firstCallAt?.toDate();
    const firstMemoryDate = coupleData.firstMemoryAt?.toDate();
    const firstMeetingDate = coupleData.firstMeetingAt?.toDate();
    
    const status: Partial<AnniversaryStatus> = {
      coupleId,
      participantIds,
      isActive: true,
      lastChecked: serverTimestamp(),
      nextEligibleEvents: {
        match: matchDate ? Timestamp.fromDate(calculateNextAnniversary(matchDate, 7)) : null,
        firstChat: firstChatDate ? Timestamp.fromDate(calculateNextAnniversary(firstChatDate, 7)) : null,
        firstCall: firstCallDate ? Timestamp.fromDate(calculateNextAnniversary(firstCallDate, 7)) : null,
        firstMemory: firstMemoryDate ? Timestamp.fromDate(calculateNextAnniversary(firstMemoryDate, 7)) : null,
        firstMeeting: firstMeetingDate ? Timestamp.fromDate(calculateNextAnniversary(firstMeetingDate, 7)) : null
      },
      streakPoints: 0,
      lastCelebration: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    await db.collection('anniversary_status').doc(coupleId).set(status);
    
    return { success: true, message: 'Anniversary status initialized' };
    
  } catch (error) {
    console.error('Error initializing anniversary status:', error);
    throw new functions.https.HttpsError('internal', 'Failed to initialize anniversary status');
  }
});

console.log('✅ PACK 234: Anniversary System functions loaded');