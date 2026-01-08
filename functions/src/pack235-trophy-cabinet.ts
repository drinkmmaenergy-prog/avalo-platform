/**
 * PACK 235: Couple Trophy Cabinet
 * Automatic achievement system showcasing couple milestones and memories
 * 
 * Features:
 * - Automatic trophy detection from couple activities
 * - Cosmetic reward system (no free tokens/discounts)
 * - Real-time trophy notifications
 * - Integration with Memory Log, QR check-ins, Economy Engine
 * - Safety restrictions (Sleep Mode, Breakup Recovery, Safety Flags)
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { db, serverTimestamp, increment } from './init';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// TYPESCRIPT TYPES
// ============================================================================

export type TrophyCategory = 
  | 'meetings'
  | 'events'
  | 'travel'
  | 'chat'
  | 'calls'
  | 'celebrations'
  | 'gifts'
  | 'challenges'
  | 'premium'
  | 'photos';

export type RewardType = 
  | 'golden_chat_border'
  | 'animated_intro'
  | 'couple_badge'
  | 'custom_chat_theme'
  | 'animated_log_frame';

export interface TrophyData {
  coupleId: string;
  participantIds: [string, string];
  total: number;
  categories: {
    meetings: number;
    events: number;
    travel: number;
    chat: number;
    calls: number;
    celebrations: number;
    gifts: number;
    challenges: number;
    premium: number;
    photos: number;
  };
  unlocks: {
    goldenChatBorder: boolean;
    animatedIntro: boolean;
    coupleBadge: boolean;
    customChatTheme: boolean;
    animatedLogFrame: boolean;
  };
  lastUpdated: Timestamp;
  createdAt: Timestamp;
}

export interface TrophyUnlock {
  trophyId: string;
  coupleId: string;
  participantIds: [string, string];
  category: TrophyCategory;
  title: string;
  description: string;
  unlockedAt: Timestamp;
  isViewed: boolean;
  viewedBy: string[];
  viewedAt?: { [userId: string]: Timestamp };
  metadata?: any;
}

export interface TrophyReward {
  rewardId: string;
  coupleId: string;
  participantIds: [string, string];
  rewardType: RewardType;
  rewardDetails: {
    name: string;
    description: string;
    icon: string;
  };
  isEarned: boolean;
  isActive: boolean;
  totalTrophiesRequired: number;
  earnedAt?: Timestamp;
  activatedAt?: Timestamp;
  deactivatedAt?: Timestamp;
}

export interface TrophyNotification {
  notificationId: string;
  recipientUserId: string;
  coupleId: string;
  trophyId?: string;
  rewardId?: string;
  notificationType: 'trophy_unlocked' | 'reward_earned' | 'milestone_reached';
  title: string;
  message: string;
  isRead: boolean;
  readAt?: Timestamp;
  createdAt: Timestamp;
}

// ============================================================================
// TROPHY REWARD CONFIGURATION
// ============================================================================

const TROPHY_REWARDS: { [key: number]: Omit<TrophyReward, 'rewardId' | 'coupleId' | 'participantIds' | 'isEarned' | 'isActive'> } = {
  3: {
    rewardType: 'golden_chat_border',
    rewardDetails: {
      name: 'Golden Chat Border',
      description: 'Elegant golden border around your chat',
      icon: '✨'
    },
    totalTrophiesRequired: 3
  },
  5: {
    rewardType: 'animated_intro',
    rewardDetails: {
      name: 'Animated Chat Intro',
      description: 'Beautiful animation when opening your chat',
      icon: '🎬'
    },
    totalTrophiesRequired: 5
  },
  7: {
    rewardType: 'couple_badge',
    rewardDetails: {
      name: 'Couple Badge',
      description: 'Special badge visible across the platform',
      icon: '💑'
    },
    totalTrophiesRequired: 7
  },
  12: {
    rewardType: 'custom_chat_theme',
    rewardDetails: {
      name: 'Custom Chat Theme',
      description: 'Exclusive romantic chat theme',
      icon: '🎨'
    },
    totalTrophiesRequired: 12
  },
  20: {
    rewardType: 'animated_log_frame',
    rewardDetails: {
      name: 'Animated Memory Frame',
      description: 'Premium animated frame for Memory Log photos',
      icon: '🖼️'
    },
    totalTrophiesRequired: 20
  }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if user is in Sleep Mode (PACK 228)
 */
async function isUserInSleepMode(userId: string): Promise<boolean> {
  try {
    const sleepDoc = await db.collection('users').doc(userId).collection('settings').doc('sleep_mode').get();
    if (!sleepDoc.exists) return false;
    
    const data = sleepDoc.data();
    return data?.isActive === true;
  } catch (error) {
    console.error('Error checking sleep mode:', error);
    return false;
  }
}

/**
 * Check if couple is in Breakup Recovery (PACK 222)
 */
async function isCoupleInBreakupRecovery(coupleId: string): Promise<boolean> {
  try {
    const recoveryDoc = await db.collection('breakup_recovery_status').doc(coupleId).get();
    if (!recoveryDoc.exists) return false;
    
    const data = recoveryDoc.data();
    return data?.isActive === true;
  } catch (error) {
    console.error('Error checking breakup recovery:', error);
    return false;
  }
}

/**
 * Check if there's an active safety incident between couple
 */
async function hasSafetyIncident(participantIds: [string, string]): Promise<boolean> {
  try {
    const incidentsQuery = await db.collection('safety_incidents')
      .where('participantIds', 'array-contains-any', participantIds)
      .where('status', '==', 'active')
      .limit(1)
      .get();
    
    return !incidentsQuery.empty;
  } catch (error) {
    console.error('Error checking safety incidents:', error);
    return false;
  }
}

/**
 * Check if trophy system is enabled for both users
 */
async function isTrophySystemEnabled(participantIds: [string, string]): Promise<boolean> {
  try {
    const [user1Settings, user2Settings] = await Promise.all([
      db.collection('users').doc(participantIds[0]).collection('settings').doc('trophies').get(),
      db.collection('users').doc(participantIds[1]).collection('settings').doc('trophies').get()
    ]);
    
    const user1Enabled = !user1Settings.exists || user1Settings.data()?.enabled !== false;
    const user2Enabled = !user2Settings.exists || user2Settings.data()?.enabled !== false;
    
    return user1Enabled && user2Enabled;
  } catch (error) {
    console.error('Error checking trophy system settings:', error);
    return true; // Default enabled
  }
}

/**
 * Check all safety restrictions before awarding trophy
 */
async function canAwardTrophy(participantIds: [string, string], coupleId: string): Promise<boolean> {
  const [sleepMode1, sleepMode2, breakupRecovery, safetyIncident, systemEnabled] = await Promise.all([
    isUserInSleepMode(participantIds[0]),
    isUserInSleepMode(participantIds[1]),
    isCoupleInBreakupRecovery(coupleId),
    hasSafetyIncident(participantIds),
    isTrophySystemEnabled(participantIds)
  ]);
  
  if (sleepMode1 || sleepMode2) {
    console.log(`Trophy blocked: Sleep Mode active for couple ${coupleId}`);
    return false;
  }
  
  if (breakupRecovery) {
    console.log(`Trophy blocked: Breakup Recovery active for couple ${coupleId}`);
    return false;
  }
  
  if (safetyIncident) {
    console.log(`Trophy blocked: Safety incident flagged for couple ${coupleId}`);
    return false;
  }
  
  if (!systemEnabled) {
    console.log(`Trophy blocked: System disabled by user for couple ${coupleId}`);
    return false;
  }
  
  return true;
}

/**
 * Get or create trophy status for couple
 */
async function getOrCreateTrophyStatus(coupleId: string, participantIds: [string, string]): Promise<TrophyData> {
  const trophyRef = db.collection('trophies').doc(coupleId);
  const trophyDoc = await trophyRef.get();
  
  if (trophyDoc.exists) {
    return trophyDoc.data() as TrophyData;
  }
  
  // Create initial trophy status
  const initialData: TrophyData = {
    coupleId,
    participantIds,
    total: 0,
    categories: {
      meetings: 0,
      events: 0,
      travel: 0,
      chat: 0,
      calls: 0,
      celebrations: 0,
      gifts: 0,
      challenges: 0,
      premium: 0,
      photos: 0
    },
    unlocks: {
      goldenChatBorder: false,
      animatedIntro: false,
      coupleBadge: false,
      customChatTheme: false,
      animatedLogFrame: false
    },
    lastUpdated: FieldValue.serverTimestamp() as Timestamp,
    createdAt: FieldValue.serverTimestamp() as Timestamp
  };
  
  await trophyRef.set(initialData);
  return initialData;
}

/**
 * Award trophy to couple
 */
async function awardTrophy(
  coupleId: string,
  participantIds: [string, string],
  category: TrophyCategory,
  title: string,
  description: string,
  metadata?: any
): Promise<void> {
  // Check safety restrictions
  const canAward = await canAwardTrophy(participantIds, coupleId);
  if (!canAward) {
    console.log(`Trophy award blocked for couple ${coupleId}`);
    return;
  }
  
  const batch = db.batch();
  
  // Get current trophy status
  const trophyRef = db.collection('trophies').doc(coupleId);
  const trophyData = await getOrCreateTrophyStatus(coupleId, participantIds);
  
  // Check if this is a new trophy
  const currentCategoryCount = trophyData.categories[category];
  const newCategoryCount = currentCategoryCount + 1;
  const newTotal = trophyData.total + 1;
  
  // Update trophy counts
  batch.update(trophyRef, {
    [`categories.${category}`]: newCategoryCount,
    total: newTotal,
    lastUpdated: FieldValue.serverTimestamp()
  });
  
  // Create trophy unlock record
  const trophyUnlockRef = db.collection('trophy_unlocks').doc();
  const trophyUnlock: TrophyUnlock = {
    trophyId: trophyUnlockRef.id,
    coupleId,
    participantIds,
    category,
    title,
    description,
    unlockedAt: FieldValue.serverTimestamp() as Timestamp,
    isViewed: false,
    viewedBy: [],
    metadata
  };
  batch.set(trophyUnlockRef, trophyUnlock);
  
  // Create milestone history
  const historyRef = db.collection('trophy_milestone_history').doc();
  batch.set(historyRef, {
    historyId: historyRef.id,
    coupleId,
    participantIds,
    milestoneType: 'trophy_unlocked',
    category,
    title,
    totalAfter: newTotal,
    milestoneAt: FieldValue.serverTimestamp()
  });
  
  // Create notifications for both users
  for (const userId of participantIds) {
    const notificationRef = db.collection('trophy_notifications').doc();
    const notification: TrophyNotification = {
      notificationId: notificationRef.id,
      recipientUserId: userId,
      coupleId,
      trophyId: trophyUnlockRef.id,
      notificationType: 'trophy_unlocked',
      title: '🏆 New Trophy Unlocked!',
      message: `You and your partner earned "${title}"`,
      isRead: false,
      createdAt: FieldValue.serverTimestamp() as Timestamp
    };
    batch.set(notificationRef, notification);
  }
  
  await batch.commit();
  
  console.log(`Trophy awarded: ${title} to couple ${coupleId} (Total: ${newTotal})`);
  
  // Check if new rewards should be unlocked
  await checkAndUnlockRewards(coupleId, participantIds, newTotal);
}

/**
 * Check and unlock cosmetic rewards based on trophy count
 */
async function checkAndUnlockRewards(
  coupleId: string,
  participantIds: [string, string],
  totalTrophies: number
): Promise<void> {
  const batch = db.batch();
  let rewardsUnlocked = 0;
  
  // Check each reward threshold
  for (const [threshold, rewardConfig] of Object.entries(TROPHY_REWARDS)) {
    const requiredTrophies = parseInt(threshold);
    
    if (totalTrophies >= requiredTrophies) {
      // Check if reward already exists
      const existingReward = await db.collection('trophy_rewards')
        .where('coupleId', '==', coupleId)
        .where('rewardType', '==', rewardConfig.rewardType)
        .limit(1)
        .get();
      
      if (existingReward.empty) {
        // Create new reward
        const rewardRef = db.collection('trophy_rewards').doc();
        const reward: TrophyReward = {
          rewardId: rewardRef.id,
          coupleId,
          participantIds,
          ...rewardConfig,
          isEarned: true,
          isActive: false, // User must manually activate
          earnedAt: FieldValue.serverTimestamp() as Timestamp
        };
        
        batch.set(rewardRef, reward);
        rewardsUnlocked++;
        
        // Update trophy status with unlock flag
        const trophyRef = db.collection('trophies').doc(coupleId);
        const unlockKey = rewardConfig.rewardType === 'golden_chat_border' ? 'goldenChatBorder' :
                         rewardConfig.rewardType === 'animated_intro' ? 'animatedIntro' :
                         rewardConfig.rewardType === 'couple_badge' ? 'coupleBadge' :
                         rewardConfig.rewardType === 'custom_chat_theme' ? 'customChatTheme' :
                         'animatedLogFrame';
        
        batch.update(trophyRef, {
          [`unlocks.${unlockKey}`]: true
        });
        
        // Create notifications for reward unlock
        for (const userId of participantIds) {
          const notificationRef = db.collection('trophy_notifications').doc();
          const notification: TrophyNotification = {
            notificationId: notificationRef.id,
            recipientUserId: userId,
            coupleId,
            rewardId: rewardRef.id,
            notificationType: 'reward_earned',
            title: '💎 New Reward Unlocked!',
            message: `You unlocked: ${rewardConfig.rewardDetails.name}`,
            isRead: false,
            createdAt: FieldValue.serverTimestamp() as Timestamp
          };
          batch.set(notificationRef, notification);
        }
      }
    }
  }
  
  if (rewardsUnlocked > 0) {
    await batch.commit();
    console.log(`${rewardsUnlocked} reward(s) unlocked for couple ${coupleId}`);
  }
}

// ============================================================================
// TROPHY TRIGGERS - FIRESTORE LISTENERS
// ============================================================================

/**
 * TRIGGER: QR/Selfie Check-in (Meeting Trophy)
 */
export const onMeetingCheckIn = onDocumentCreated(
  'meeting_check_ins/{checkInId}',
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    
    const { coupleId, participantIds, checkInType, location } = data;
    
    // Award meeting trophy
    await awardTrophy(
      coupleId,
      participantIds,
      'meetings',
      'Real Connection',
      `Met in person via ${checkInType === 'qr' ? 'QR code' : 'selfie verification'}`,
      { checkInType, location }
    );
  }
);

/**
 * TRIGGER: Joint Event Attendance (Event Trophy)
 */
export const onEventAttendance = onDocumentCreated(
  'event_attendances/{attendanceId}',
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    
    const { eventId, coupleId, participantIds, eventType } = data;
    
    // Award event trophy
    await awardTrophy(
      coupleId,
      participantIds,
      'events',
      'Event Together',
      `Attended ${eventType} event together`,
      { eventId, eventType }
    );
  }
);

/**
 * TRIGGER: Meeting in Different City/Country (Travel Trophy)
 */
export const onTravelMeeting = onDocumentCreated(
  'meeting_check_ins/{checkInId}',
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    
    const { coupleId, participantIds, location, isDifferentCity, isDifferentCountry } = data;
    
    if (isDifferentCity || isDifferentCountry) {
      await awardTrophy(
        coupleId,
        participantIds,
        'travel',
        isDifferentCountry ? 'International Love' : 'Cross-City Adventure',
        `Met in ${location?.city || 'a new place'}`,
        { location, isDifferentCity, isDifferentCountry }
      );
    }
  }
);

/**
 * TRIGGER: Chat Milestone (>1000 paid words)
 */
export const onChatMilestone = onDocumentUpdated(
  'chats/{chatId}',
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    
    if (!before || !after) return;
    
    const { coupleId, participantIds, totalPaidWords } = after;
    const previousPaidWords = before.totalPaidWords || 0;
    
    // Check if crossed 1000 word threshold
    if (previousPaidWords < 1000 && totalPaidWords >= 1000) {
      await awardTrophy(
        coupleId,
        participantIds,
        'chat',
        'Deep Conversations',
        'Exchanged over 1,000 paid words',
        { totalPaidWords }
      );
    }
  }
);

/**
 * TRIGGER: Call Milestone (>120 min video OR >200 min voice)
 */
export const onCallMilestone = onDocumentUpdated(
  'call_stats/{coupleId}',
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    
    if (!before || !after) return;
    
    const { coupleId, participantIds, totalVideoMinutes, totalVoiceMinutes } = after;
    const previousVideoMinutes = before.totalVideoMinutes || 0;
    const previousVoiceMinutes = before.totalVoiceMinutes || 0;
    
    // Check video call threshold (120 minutes)
    if (previousVideoMinutes < 120 && totalVideoMinutes >= 120) {
      await awardTrophy(
        coupleId,
        participantIds,
        'calls',
        'Face to Face',
        'Completed 120+ minutes of video calls',
        { totalVideoMinutes }
      );
    }
    
    // Check voice call threshold (200 minutes)
    if (previousVoiceMinutes < 200 && totalVoiceMinutes >= 200) {
      await awardTrophy(
        coupleId,
        participantIds,
        'calls',
        'Voice Connection',
        'Completed 200+ minutes of voice calls',
        { totalVoiceMinutes }
      );
    }
  }
);

/**
 * TRIGGER: Anniversary Achievement (Celebration Trophy)
 */
export const onAnniversaryCelebration = onDocumentCreated(
  'anniversary_celebrations/{celebrationId}',
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    
    const { coupleId, participantIds, anniversaryType, interval } = data;
    
    // Award celebration trophy
    await awardTrophy(
      coupleId,
      participantIds,
      'celebrations',
      'Anniversary Milestone',
      `Celebrated ${interval.replace('_', ' ')} ${anniversaryType} anniversary`,
      { anniversaryType, interval }
    );
  }
);

/**
 * TRIGGER: Gift Exchange (≥3 paid gifts)
 */
export const onGiftMilestone = onDocumentUpdated(
  'gift_stats/{coupleId}',
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    
    if (!before || !after) return;
    
    const { coupleId, participantIds, totalGiftsExchanged } = after;
    const previousGifts = before.totalGiftsExchanged || 0;
    
    // Check if crossed 3 gift threshold
    if (previousGifts < 3 && totalGiftsExchanged >= 3) {
      await awardTrophy(
        coupleId,
        participantIds,
        'gifts',
        'Gift Givers',
        'Exchanged 3+ paid gifts',
        { totalGiftsExchanged }
      );
    }
  }
);

/**
 * TRIGGER: Couple Challenge Completion (PACK 233)
 */
export const onChallengeCompletion = onDocumentCreated(
  'challenge_completions/{completionId}',
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    
    const { challengeId, coupleId, participantIds, challengeType } = data;
    
    // Award challenge trophy
    await awardTrophy(
      coupleId,
      participantIds,
      'challenges',
      'Challenge Accepted',
      `Completed ${challengeType} couple challenge`,
      { challengeId, challengeType }
    );
  }
);

/**
 * TRIGGER: First Paid Booking (Premium Trophy)
 */
export const onFirstPaidBooking = onDocumentCreated(
  'calendar_bookings/{bookingId}',
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    
    const { coupleId, participantIds, bookingType } = data;
    
    // Check if this is their first paid booking
    const previousBookings = await db.collection('calendar_bookings')
      .where('coupleId', '==', coupleId)
      .where('status', '==', 'completed')
      .count()
      .get();
    
    if (previousBookings.data().count === 1) {
      await awardTrophy(
        coupleId,
        participantIds,
        'premium',
        'Premium Connection',
        'Made first paid calendar booking',
        { bookingType }
      );
    }
  }
);

/**
 * TRIGGER: First Memory Log Photo Together (Photo Trophy)
 */
export const onFirstMemoryPhoto = onDocumentCreated(
  'memory_log_entries/{entryId}',
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    
    const { coupleId, participantIds, hasPhoto } = data;
    
    if (hasPhoto) {
      // Check if this is their first photo together
      const previousPhotos = await db.collection('memory_log_entries')
        .where('coupleId', '==', coupleId)
        .where('hasPhoto', '==', true)
        .count()
        .get();
      
      if (previousPhotos.data().count === 1) {
        await awardTrophy(
          coupleId,
          participantIds,
          'photos',
          'Memory Captured',
          'Uploaded first Memory Log photo together',
          { hasPhoto: true }
        );
      }
    }
  }
);

// ============================================================================
// CALLABLE FUNCTIONS - CLIENT API
// ============================================================================

/**
 * Get trophy status for couple
 */
export const getTrophyStatus = onCall<{ coupleId: string }>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const { coupleId } = request.data;
    const userId = request.auth.uid;
    
    // Get trophy data
    const trophyDoc = await db.collection('trophies').doc(coupleId).get();
    if (!trophyDoc.exists) {
      return null;
    }
    
    const trophyData = trophyDoc.data();
    
    // Verify user is participant
    if (!trophyData?.participantIds?.includes(userId)) {
      throw new HttpsError('permission-denied', 'Not a participant of this couple');
    }
    
    return trophyData;
  }
);

/**
 * Get trophy unlocks for couple
 */
export const getTrophyUnlocks = onCall<{ coupleId: string; limit?: number }>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const { coupleId, limit = 20 } = request.data;
    const userId = request.auth.uid;
    
    // Get trophies
    const trophiesQuery = await db.collection('trophy_unlocks')
      .where('coupleId', '==', coupleId)
      .where('participantIds', 'array-contains', userId)
      .orderBy('unlockedAt', 'desc')
      .limit(limit)
      .get();
    
    return trophiesQuery.docs.map(doc => doc.data());
  }
);

/**
 * Get available rewards for couple
 */
export const getTrophyRewards = onCall<{ coupleId: string }>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const { coupleId } = request.data;
    const userId = request.auth.uid;
    
    // Get rewards
    const rewardsQuery = await db.collection('trophy_rewards')
      .where('coupleId', '==', coupleId)
      .where('participantIds', 'array-contains', userId)
      .where('isEarned', '==', true)
      .get();
    
    return rewardsQuery.docs.map(doc => doc.data());
  }
);

/**
 * Activate a cosmetic reward
 */
export const activateTrophyReward = onCall<{ rewardId: string; activate: boolean }>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const { rewardId, activate } = request.data;
    const userId = request.auth.uid;
    
    // Get reward
    const rewardRef = db.collection('trophy_rewards').doc(rewardId);
    const rewardDoc = await rewardRef.get();
    
    if (!rewardDoc.exists) {
      throw new HttpsError('not-found', 'Reward not found');
    }
    
    const rewardData = rewardDoc.data();
    
    // Verify user is participant
    if (!rewardData?.participantIds?.includes(userId)) {
      throw new HttpsError('permission-denied', 'Not authorized to activate this reward');
    }
    
    // Verify reward is earned
    if (!rewardData?.isEarned) {
      throw new HttpsError('failed-precondition', 'Reward not yet earned');
    }
    
    // Update activation status
    await rewardRef.update({
      isActive: activate,
      [activate ? 'activatedAt' : 'deactivatedAt']: FieldValue.serverTimestamp()
    });
    
    return { success: true, isActive: activate };
  }
);

/**
 * Mark trophy as viewed
 */
export const markTrophyViewed = onCall<{ trophyId: string }>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const { trophyId } = request.data;
    const userId = request.auth.uid;
    
    // Update trophy viewed status
    await db.collection('trophy_unlocks').doc(trophyId).update({
      isViewed: true,
      viewedBy: FieldValue.arrayUnion(userId),
      [`viewedAt.${userId}`]: FieldValue.serverTimestamp()
    });
    
    return { success: true };
  }
);

/**
 * Toggle trophy system for user
 */
export const toggleTrophySystem = onCall<{ enabled: boolean }>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const { enabled } = request.data;
    const userId = request.auth.uid;
    
    // Update settings
    await db.collection('users').doc(userId).collection('settings').doc('trophies').set({
      enabled,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    
    return { success: true, enabled };
  }
);

/**
 * Manual trophy award (admin only) - for testing or special events
 */
export const manualAwardTrophy = onCall<{
  coupleId: string;
  category: TrophyCategory;
  title: string;
  description: string;
  metadata?: any;
}>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    // Check if user is admin
    const userDoc = await db.collection('users').doc(request.auth.uid).get();
    if (userDoc.data()?.role !== 'admin') {
      throw new HttpsError('permission-denied', 'Admin access required');
    }
    
    const { coupleId, category, title, description, metadata } = request.data;
    
    // Get couple data
    const coupleDoc = await db.collection('couples').doc(coupleId).get();
    if (!coupleDoc.exists) {
      throw new HttpsError('not-found', 'Couple not found');
    }
    
    const participantIds = coupleDoc.data()?.participantIds as [string, string];
    
    // Award trophy
    await awardTrophy(coupleId, participantIds, category, title, description, metadata);
    
    return { success: true };
  }
);

console.log('✅ PACK 235: Trophy Cabinet functions initialized');