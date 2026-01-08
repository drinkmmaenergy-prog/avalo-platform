/**
 * PACK 221: Long-Arc Romance Journeys
 *
 * Relationship timeline, memories, shared milestones, and streaks
 * to increase chemistry, loyalty, and monetization.
 *
 * Key Features:
 * - Pair-based journey state machine
 * - Timeline milestone generator
 * - Challenge system with triggers and rewards
 * - Safety integration
 * - Notification hooks
 * - PACK 222 Breakup Recovery integration
 */

import { db, serverTimestamp, increment, generateId } from './init.js';
import type { Timestamp } from 'firebase-admin/firestore';
import { onJourneyEnded } from './pack-222-breakup-recovery-integration.js';

// ============================================================================
// TYPES
// ============================================================================

export type JourneyStatus = 'pending' | 'active' | 'paused' | 'archived';

export type MilestoneType = 
  | 'first_spark'           // First 1:1 paid chat
  | 'you_sound_great'       // First call
  | 'good_vibe'             // Meeting completed with positive vibe
  | 'big_day'               // First event attended together
  | 'intense_chemistry'     // High chat message streak
  | 'romantic_balance'      // Both users ask questions equally
  | 'hero_moment'           // Panic Mode used and resolved safely
  | 'date_streak'           // 3+ meetings in 60 days
  | 'trust';                // Selfie re-verification successful on both sides

export interface RomanticJourney {
  journeyId: string;
  user1Id: string;
  user2Id: string;
  status: JourneyStatus;
  initiatorId: string;
  acceptedBy?: string;
  startedAt?: Timestamp;
  offeredAt: Timestamp;
  lastActivityAt: Timestamp;
  endedAt?: Timestamp;
  endedBy?: string;
  
  // Activity stats
  stats: {
    totalChats: number;
    totalCalls: number;
    totalMeetings: number;
    totalEvents: number;
    totalTokensSpent: number;
    currentStreak: number;
    longestStreak: number;
  };
  
  // Safety tracking
  safety: {
    pausedForSafety: boolean;
    pausedAt?: Timestamp;
    pauseReason?: string;
  };
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface JourneyMilestone {
  milestoneId: string;
  journeyId: string;
  user1Id: string;
  user2Id: string;
  type: MilestoneType;
  unlockedAt: Timestamp;
  metadata?: Record<string, any>;
}

export interface JourneyChallenge {
  challengeId: string;
  name: string;
  description: string;
  requirement: {
    type: 'chat_count' | 'call_count' | 'meeting_count' | 'streak_days' | 'question_balance' | 'event_attendance';
    threshold: number;
  };
  reward: {
    type: 'profile_boost' | 'discovery_boost' | 'badge' | 'animation';
    value: string;
    duration?: number; // hours
  };
  active: boolean;
}

export interface ChemistryThreshold {
  user1Id: string;
  user2Id: string;
  thresholdReached: boolean;
  reachedAt?: Timestamp;
  offeredAt?: Timestamp;
  triggeredBy: 'chat_tokens' | 'calls' | 'meetings' | 'wishlist';
  metadata: {
    chatTokensSpent?: number;
    callsCompleted?: number;
    meetingsCompleted?: number;
    wishlistActions?: number;
  };
}

// ============================================================================
// CHEMISTRY THRESHOLD DETECTION
// ============================================================================

/**
 * Check if a pair of users has reached the chemistry threshold
 * Triggers: 200+ tokens, 2+ calls, 1 meeting, multiple wishlist actions
 */
export async function checkChemistryThreshold(
  user1Id: string,
  user2Id: string
): Promise<{ reached: boolean; triggeredBy?: string; metadata?: any }> {
  
  // Create deterministic pair ID (alphabetically sorted)
  const pairId = [user1Id, user2Id].sort().join('_');
  
  // Check if already reached
  const thresholdDoc = await db.collection('journey_chemistry_thresholds').doc(pairId).get();
  if (thresholdDoc.exists && thresholdDoc.data()?.thresholdReached) {
    return { reached: false }; // Already triggered
  }
  
  const metadata: any = {};
  
  // Check chat tokens spent (from fan_status or transactions)
  try {
    const fanStatusId1 = `${user1Id}_${user2Id}`;
    const fanStatusId2 = `${user2Id}_${user1Id}`;
    
    const [fan1Snap, fan2Snap] = await Promise.all([
      db.collection('fan_status').doc(fanStatusId1).get(),
      db.collection('fan_status').doc(fanStatusId2).get()
    ]);
    
    const tokens1 = fan1Snap.exists ? (fan1Snap.data()?.totalTokensSpent || 0) : 0;
    const tokens2 = fan2Snap.exists ? (fan2Snap.data()?.totalTokensSpent || 0) : 0;
    const totalTokens = tokens1 + tokens2;
    
    metadata.chatTokensSpent = totalTokens;
    
    if (totalTokens >= 200) {
      await recordThresholdReached(user1Id, user2Id, 'chat_tokens', metadata);
      return { reached: true, triggeredBy: 'chat_tokens', metadata };
    }
  } catch (error) {
    console.error('Error checking token threshold:', error);
  }
  
  // Check calls completed (from call history)
  try {
    const callsQuery = await db.collection('calls')
      .where('participants', 'array-contains', user1Id)
      .where('status', '==', 'completed')
      .get();
    
    const callsBetweenPair = callsQuery.docs.filter(doc => {
      const participants = doc.data().participants || [];
      return participants.includes(user2Id);
    });
    
    metadata.callsCompleted = callsBetweenPair.length;
    
    if (callsBetweenPair.length >= 2) {
      await recordThresholdReached(user1Id, user2Id, 'calls', metadata);
      return { reached: true, triggeredBy: 'calls', metadata };
    }
  } catch (error) {
    console.error('Error checking call threshold:', error);
  }
  
  // Check meetings completed (from meetings collection)
  try {
    const meetingsQuery = await db.collection('meetings')
      .where('participants', 'array-contains', user1Id)
      .where('status', '==', 'completed')
      .get();
    
    const meetingsBetweenPair = meetingsQuery.docs.filter(doc => {
      const participants = doc.data().participants || [];
      return participants.includes(user2Id);
    });
    
    metadata.meetingsCompleted = meetingsBetweenPair.length;
    
    if (meetingsBetweenPair.length >= 1) {
      await recordThresholdReached(user1Id, user2Id, 'meetings', metadata);
      return { reached: true, triggeredBy: 'meetings', metadata };
    }
  } catch (error) {
    console.error('Error checking meeting threshold:', error);
  }
  
  // Check wishlist actions (mutual likes/saves)
  try {
    const [wishlist1Snap, wishlist2Snap] = await Promise.all([
      db.collection('wishlists').doc(user1Id).collection('items').where('targetUserId', '==', user2Id).get(),
      db.collection('wishlists').doc(user2Id).collection('items').where('targetUserId', '==', user1Id).get()
    ]);
    
    const mutualActions = Math.min(wishlist1Snap.size, wishlist2Snap.size);
    metadata.wishlistActions = mutualActions;
    
    if (mutualActions >= 2) {
      await recordThresholdReached(user1Id, user2Id, 'wishlist', metadata);
      return { reached: true, triggeredBy: 'wishlist', metadata };
    }
  } catch (error) {
    console.error('Error checking wishlist threshold:', error);
  }
  
  return { reached: false };
}

/**
 * Record that chemistry threshold has been reached
 */
async function recordThresholdReached(
  user1Id: string,
  user2Id: string,
  triggeredBy: string,
  metadata: any
): Promise<void> {
  const pairId = [user1Id, user2Id].sort().join('_');
  
  await db.collection('journey_chemistry_thresholds').doc(pairId).set({
    user1Id,
    user2Id,
    thresholdReached: true,
    reachedAt: serverTimestamp(),
    triggeredBy,
    metadata,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

// ============================================================================
// JOURNEY LIFECYCLE
// ============================================================================

/**
 * Offer journey to a pair (called after chemistry threshold reached)
 */
export async function offerJourney(
  user1Id: string,
  user2Id: string,
  initiatorId: string
): Promise<{ journeyId: string; offered: boolean }> {
  
  // Check if journey already exists
  const existingJourney = await getJourneyBetweenUsers(user1Id, user2Id);
  if (existingJourney) {
    return { journeyId: existingJourney.journeyId, offered: false };
  }
  
  // Check if either user has active safety incidents
  const [safety1, safety2] = await Promise.all([
    checkSafetyStatus(user1Id),
    checkSafetyStatus(user2Id)
  ]);
  
  if (!safety1.safe || !safety2.safe) {
    return { journeyId: '', offered: false }; // Cannot offer journey due to safety
  }
  
  // Create journey offer
  const journeyId = generateId();
  
  await db.collection('romantic_journeys').doc(journeyId).set({
    journeyId,
    user1Id,
    user2Id,
    status: 'pending',
    initiatorId,
    offeredAt: serverTimestamp(),
    lastActivityAt: serverTimestamp(),
    stats: {
      totalChats: 0,
      totalCalls: 0,
      totalMeetings: 0,
      totalEvents: 0,
      totalTokensSpent: 0,
      currentStreak: 0,
      longestStreak: 0
    },
    safety: {
      pausedForSafety: false
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  
  // Update threshold doc to mark as offered
  const pairId = [user1Id, user2Id].sort().join('_');
  await db.collection('journey_chemistry_thresholds').doc(pairId).update({
    offeredAt: serverTimestamp(),
    journeyId,
    updatedAt: serverTimestamp()
  });
  
  return { journeyId, offered: true };
}

/**
 * Accept journey (either user can accept)
 */
export async function acceptJourney(
  journeyId: string,
  acceptingUserId: string
): Promise<{ success: boolean; reason?: string }> {
  
  const journeyRef = db.collection('romantic_journeys').doc(journeyId);
  const journeySnap = await journeyRef.get();
  
  if (!journeySnap.exists) {
    return { success: false, reason: 'Journey not found' };
  }
  
  const journey = journeySnap.data() as RomanticJourney;
  
  // Verify accepting user is a participant
  if (journey.user1Id !== acceptingUserId && journey.user2Id !== acceptingUserId) {
    return { success: false, reason: 'Not a participant' };
  }
  
  // Check if already accepted
  if (journey.status === 'active') {
    return { success: false, reason: 'Already active' };
  }
  
  // Check safety status
  const safetyCheck = await checkSafetyStatus(acceptingUserId);
  if (!safetyCheck.safe) {
    return { success: false, reason: 'Safety check failed' };
  }
  
  // Activate journey
  await journeyRef.update({
    status: 'active',
    acceptedBy: acceptingUserId,
    startedAt: serverTimestamp(),
    lastActivityAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  
  // Unlock first milestone: "first_spark"
  await unlockMilestone(journeyId, journey.user1Id, journey.user2Id, 'first_spark', {
    acceptedBy: acceptingUserId
  });
  
  return { success: true };
}

/**
 * End journey (either user can end)
 */
export async function endJourney(
  journeyId: string,
  endingUserId: string,
  reason?: string
): Promise<{ success: boolean; archived: boolean }> {
  
  const journeyRef = db.collection('romantic_journeys').doc(journeyId);
  const journeySnap = await journeyRef.get();
  
  if (!journeySnap.exists) {
    return { success: false, archived: false };
  }
  
  const journey = journeySnap.data() as RomanticJourney;
  
  // Verify ending user is a participant
  if (journey.user1Id !== endingUserId && journey.user2Id !== endingUserId) {
    return { success: false, archived: false };
  }
  
  // Archive the journey
  await archiveJourney(journey);
  
  // Update journey status
  await journeyRef.update({
    status: 'archived',
    endedAt: serverTimestamp(),
    endedBy: endingUserId,
    updatedAt: serverTimestamp()
  });
  
  // PACK 222: Trigger breakup recovery
  await onJourneyEnded(journeyId, journey.user1Id, journey.user2Id, endingUserId, reason).catch(err => {
    console.error('Failed to initiate breakup recovery:', err);
  });
  
  return { success: true, archived: true };
}

/**
 * Archive journey with all milestones
 */
async function archiveJourney(journey: RomanticJourney): Promise<void> {
  const archiveId = generateId();
  
  // Get all milestones
  const milestonesSnap = await db.collection('journey_milestones')
    .where('journeyId', '==', journey.journeyId)
    .get();
  
  const milestones = milestonesSnap.docs.map(doc => doc.data());
  
  // Create archive document
  await db.collection('journey_archives').doc(archiveId).set({
    archiveId,
    originalJourneyId: journey.journeyId,
    user1Id: journey.user1Id,
    user2Id: journey.user2Id,
    initiatorId: journey.initiatorId,
    startedAt: journey.startedAt,
    endedAt: serverTimestamp(),
    endedBy: journey.endedBy,
    stats: journey.stats,
    milestones,
    archivedAt: serverTimestamp()
  });
}

// ============================================================================
// MILESTONE SYSTEM
// ============================================================================

/**
 * Unlock a milestone for a journey
 */
export async function unlockMilestone(
  journeyId: string,
  user1Id: string,
  user2Id: string,
  type: MilestoneType,
  metadata?: Record<string, any>
): Promise<{ milestoneId: string; unlocked: boolean }> {
  
  // Check if milestone already unlocked
  const existingMilestone = await db.collection('journey_milestones')
    .where('journeyId', '==', journeyId)
    .where('type', '==', type)
    .limit(1)
    .get();
  
  if (!existingMilestone.empty) {
    return { milestoneId: existingMilestone.docs[0].id, unlocked: false };
  }
  
  const milestoneId = generateId();
  
  await db.collection('journey_milestones').doc(milestoneId).set({
    milestoneId,
    journeyId,
    user1Id,
    user2Id,
    type,
    unlockedAt: serverTimestamp(),
    metadata: metadata || {}
  });
  
  // Send notifications to both users
  await sendMilestoneNotification(user1Id, user2Id, type, journeyId);
  
  return { milestoneId, unlocked: true };
}

/**
 * Check conditions and unlock milestones based on activity
 */
export async function checkAndUnlockMilestones(
  journeyId: string,
  activityType: 'chat' | 'call' | 'meeting' | 'event' | 'verification' | 'panic'
): Promise<void> {
  
  const journeySnap = await db.collection('romantic_journeys').doc(journeyId).get();
  if (!journeySnap.exists) return;
  
  const journey = journeySnap.data() as RomanticJourney;
  
  switch (activityType) {
    case 'call':
      // Check for first call milestone
      if (journey.stats.totalCalls === 1) {
        await unlockMilestone(journeyId, journey.user1Id, journey.user2Id, 'you_sound_great');
      }
      break;
      
    case 'meeting':
      // Check for first meeting with positive vibe
      if (journey.stats.totalMeetings === 1) {
        await unlockMilestone(journeyId, journey.user1Id, journey.user2Id, 'good_vibe');
      }
      
      // Check for date streak (3+ meetings in 60 days)
      if (journey.stats.totalMeetings >= 3) {
        await checkDateStreak(journeyId, journey.user1Id, journey.user2Id);
      }
      break;
      
    case 'event':
      // First event together
      if (journey.stats.totalEvents === 1) {
        await unlockMilestone(journeyId, journey.user1Id, journey.user2Id, 'big_day');
      }
      break;
      
    case 'chat':
      // Check for high chat streak
      if (journey.stats.currentStreak >= 7) {
        await unlockMilestone(journeyId, journey.user1Id, journey.user2Id, 'intense_chemistry', {
          streak: journey.stats.currentStreak
        });
      }
      break;
      
    case 'verification':
      // Trust milestone - both verified
      await unlockMilestone(journeyId, journey.user1Id, journey.user2Id, 'trust');
      break;
      
    case 'panic':
      // Hero moment - panic resolved
      await unlockMilestone(journeyId, journey.user1Id, journey.user2Id, 'hero_moment');
      break;
  }
}

/**
 * Check for date streak milestone (3+ meetings in 60 days)
 */
async function checkDateStreak(journeyId: string, user1Id: string, user2Id: string): Promise<void> {
  const sixtyDaysAgo = new Date(Date.now() - (60 * 24 * 60 * 60 * 1000));
  
  const meetingsQuery = await db.collection('meetings')
    .where('participants', 'array-contains', user1Id)
    .where('status', '==', 'completed')
    .where('completedAt', '>', sixtyDaysAgo)
    .get();
  
  const meetingsBetweenPair = meetingsQuery.docs.filter(doc => {
    const participants = doc.data().participants || [];
    return participants.includes(user2Id);
  });
  
  if (meetingsBetweenPair.length >= 3) {
    await unlockMilestone(journeyId, user1Id, user2Id, 'date_streak', {
      meetingsInWindow: meetingsBetweenPair.length
    });
  }
}

// ============================================================================
// ACTIVITY TRACKING
// ============================================================================

/**
 * Track activity on a journey and update stats
 */
export async function trackJourneyActivity(
  user1Id: string,
  user2Id: string,
  activityType: 'chat' | 'call' | 'meeting' | 'event',
  tokensSpent?: number
): Promise<void> {
  
  const journey = await getJourneyBetweenUsers(user1Id, user2Id);
  if (!journey || journey.status !== 'active') return;
  
  const updates: any = {
    lastActivityAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  
  // Update stats based on activity type
  switch (activityType) {
    case 'chat':
      updates['stats.totalChats'] = increment(1);
      if (tokensSpent) {
        updates['stats.totalTokensSpent'] = increment(tokensSpent);
      }
      // Update streak logic would go here
      break;
      
    case 'call':
      updates['stats.totalCalls'] = increment(1);
      break;
      
    case 'meeting':
      updates['stats.totalMeetings'] = increment(1);
      break;
      
    case 'event':
      updates['stats.totalEvents'] = increment(1);
      break;
  }
  
  await db.collection('romantic_journeys').doc(journey.journeyId).update(updates);
  
  // Check for new milestones
  await checkAndUnlockMilestones(journey.journeyId, activityType);
}

// ============================================================================
// CHALLENGE SYSTEM
// ============================================================================

/**
 * Get available challenges for a journey
 */
export async function getAvailableChallenges(): Promise<JourneyChallenge[]> {
  const challengesSnap = await db.collection('journey_challenges')
    .where('active', '==', true)
    .get();
  
  return challengesSnap.docs.map(doc => doc.data() as JourneyChallenge);
}

/**
 * Start a challenge for a journey
 */
export async function startChallenge(
  journeyId: string,
  challengeId: string
): Promise<{ progressId: string; started: boolean }> {
  
  const journeySnap = await db.collection('romantic_journeys').doc(journeyId).get();
  if (!journeySnap.exists || journeySnap.data()?.status !== 'active') {
    return { progressId: '', started: false };
  }
  
  const progressId = generateId();
  
  await db.collection('journey_challenge_progress').doc(progressId).set({
    progressId,
    journeyId,
    challengeId,
    status: 'in_progress',
    progress: 0,
    startedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  
  return { progressId, started: true };
}

/**
 * Check challenge progress and award rewards if completed
 */
export async function checkChallengeProgress(
  journeyId: string,
  challengeId: string
): Promise<{ completed: boolean; reward?: any }> {
  
  const [journeySnap, challengeSnap, progressSnap] = await Promise.all([
    db.collection('romantic_journeys').doc(journeyId).get(),
    db.collection('journey_challenges').doc(challengeId).get(),
    db.collection('journey_challenge_progress')
      .where('journeyId', '==', journeyId)
      .where('challengeId', '==', challengeId)
      .where('status', '==', 'in_progress')
      .limit(1)
      .get()
  ]);
  
  if (!journeySnap.exists || !challengeSnap.exists || progressSnap.empty) {
    return { completed: false };
  }
  
  const journey = journeySnap.data() as RomanticJourney;
  const challenge = challengeSnap.data() as JourneyChallenge;
  const progress = progressSnap.docs[0].data();
  
  // Check if challenge requirement is met
  let requirementMet = false;
  let currentProgress = 0;
  
  switch (challenge.requirement.type) {
    case 'chat_count':
      currentProgress = journey.stats.totalChats;
      requirementMet = currentProgress >= challenge.requirement.threshold;
      break;
    case 'call_count':
      currentProgress = journey.stats.totalCalls;
      requirementMet = currentProgress >= challenge.requirement.threshold;
      break;
    case 'meeting_count':
      currentProgress = journey.stats.totalMeetings;
      requirementMet = currentProgress >= challenge.requirement.threshold;
      break;
    case 'streak_days':
      currentProgress = journey.stats.currentStreak;
      requirementMet = currentProgress >= challenge.requirement.threshold;
      break;
  }
  
  // Update progress
  await progressSnap.docs[0].ref.update({
    progress: currentProgress,
    updatedAt: serverTimestamp()
  });
  
  // Award reward if completed
  if (requirementMet) {
    await progressSnap.docs[0].ref.update({
      status: 'completed',
      completedAt: serverTimestamp(),
      reward: challenge.reward
    });
    
    // Apply reward (profile boost, badge, etc.)
    await applyReward(journey.user1Id, journey.user2Id, challenge.reward);
    
    return { completed: true, reward: challenge.reward };
  }
  
  return { completed: false };
}

/**
 * Apply reward to users
 */
async function applyReward(
  user1Id: string,
  user2Id: string,
  reward: JourneyChallenge['reward']
): Promise<void> {
  // Implementation depends on reward type
  // This is a placeholder for the actual reward application logic
  
  switch (reward.type) {
    case 'profile_boost':
      // Apply profile boost to both users
      break;
    case 'discovery_boost':
      // Apply discovery boost to both users
      break;
    case 'badge':
      // Award badge to both users
      break;
    case 'animation':
      // Unlock animation for both users
      break;
  }
}

// ============================================================================
// SAFETY INTEGRATION
// ============================================================================

/**
 * Check if a user has any active safety incidents
 */
async function checkSafetyStatus(userId: string): Promise<{ safe: boolean; reason?: string }> {
  try {
    const incidentsSnap = await db.collection('safety_incidents')
      .where('userId', '==', userId)
      .where('status', '==', 'active')
      .limit(1)
      .get();
    
    if (!incidentsSnap.empty) {
      return { safe: false, reason: 'Active safety incident' };
    }
    
    return { safe: true };
  } catch (error) {
    // If safety check fails, default to safe
    return { safe: true };
  }
}

/**
 * Pause journey due to safety incident
 */
export async function pauseJourneyForSafety(
  journeyId: string,
  reason: string
): Promise<void> {
  await db.collection('romantic_journeys').doc(journeyId).update({
    status: 'paused',
    'safety.pausedForSafety': true,
    'safety.pausedAt': serverTimestamp(),
    'safety.pauseReason': reason,
    updatedAt: serverTimestamp()
  });
}

/**
 * Resume journey after safety resolution
 */
export async function resumeJourneyAfterSafety(journeyId: string): Promise<void> {
  const journeySnap = await db.collection('romantic_journeys').doc(journeyId).get();
  if (!journeySnap.exists) return;
  
  const journey = journeySnap.data() as RomanticJourney;
  
  // Verify both users are now safe
  const [safety1, safety2] = await Promise.all([
    checkSafetyStatus(journey.user1Id),
    checkSafetyStatus(journey.user2Id)
  ]);
  
  if (safety1.safe && safety2.safe) {
    await db.collection('romantic_journeys').doc(journeyId).update({
      status: 'active',
      'safety.pausedForSafety': false,
      updatedAt: serverTimestamp()
    });
  }
}

// ============================================================================
// NOTIFICATIONS
// ============================================================================

/**
 * Send milestone notification to both users
 */
async function sendMilestoneNotification(
  user1Id: string,
  user2Id: string,
  milestoneType: MilestoneType,
  journeyId: string
): Promise<void> {
  // This would integrate with PACK 169 notification system
  // Placeholder for actual notification sending
  
  const milestoneNames: Record<MilestoneType, string> = {
    first_spark: 'First Spark ✨',
    you_sound_great: 'You Sound Great 🎙️',
    good_vibe: 'Good Vibe ✅',
    big_day: 'Big Day 🎉',
    intense_chemistry: 'Intense Chemistry 🔥',
    romantic_balance: 'Romantic Balance ⚖️',
    hero_moment: 'Hero Moment 🦸',
    date_streak: 'Date Streak 📅',
    trust: 'Trust Built 🤝'
  };
  
  const notificationData = {
    type: 'journey_milestone',
    title: 'New Journey Milestone!',
    body: `You unlocked: ${milestoneNames[milestoneType]}`,
    data: {
      journeyId,
      milestoneType
    }
  };
  
  // Send to both users (implementation would use actual notification service)
  console.log(`Sending milestone notification to ${user1Id} and ${user2Id}:`, notificationData);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get journey between two users
 */
export async function getJourneyBetweenUsers(
  user1Id: string,
  user2Id: string
): Promise<RomanticJourney | null> {
  const journeysSnap = await db.collection('romantic_journeys')
    .where('status', 'in', ['pending', 'active', 'paused'])
    .get();
  
  const journey = journeysSnap.docs.find(doc => {
    const data = doc.data();
    return (data.user1Id === user1Id && data.user2Id === user2Id) ||
           (data.user1Id === user2Id && data.user2Id === user1Id);
  });
  
  return journey ? journey.data() as RomanticJourney : null;
}

/**
 * Get user's active journeys
 */
export async function getUserJourneys(
  userId: string,
  status: JourneyStatus[] = ['active']
): Promise<RomanticJourney[]> {
  const journeys1 = await db.collection('romantic_journeys')
    .where('user1Id', '==', userId)
    .where('status', 'in', status)
    .get();
  
  const journeys2 = await db.collection('romantic_journeys')
    .where('user2Id', '==', userId)
    .where('status', 'in', status)
    .get();
  
  const allJourneys = [...journeys1.docs, ...journeys2.docs];
  return allJourneys.map(doc => doc.data() as RomanticJourney);
}

/**
 * Get journey milestones
 */
export async function getJourneyMilestones(journeyId: string): Promise<JourneyMilestone[]> {
  const milestonesSnap = await db.collection('journey_milestones')
    .where('journeyId', '==', journeyId)
    .orderBy('unlockedAt', 'asc')
    .get();
  
  return milestonesSnap.docs.map(doc => doc.data() as JourneyMilestone);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize default challenges in the system
 */
export async function initializeDefaultChallenges(): Promise<void> {
  const defaultChallenges: Omit<JourneyChallenge, 'challengeId'>[] = [
    {
      name: 'Ask 10 Flirty Questions',
      description: 'Keep the conversation flowing with 10 questions',
      requirement: { type: 'chat_count', threshold: 10 },
      reward: { type: 'profile_boost', value: 'highlight', duration: 24 },
      active: true
    },
    {
      name: 'Plan a Meeting This Week',
      description: 'Take it offline and meet in person',
      requirement: { type: 'meeting_count', threshold: 1 },
      reward: { type: 'discovery_boost', value: 'both' },
      active: true
    },
    {
      name: '3 Days Chat Streak',
      description: 'Keep the chemistry alive for 3 consecutive days',
      requirement: { type: 'streak_days', threshold: 3 },
      reward: { type: 'badge', value: 'message_animation' },
      active: true
    },
    {
      name: 'Make Each Other Laugh',
      description: 'Share 5 fun moments together',
      requirement: { type: 'chat_count', threshold: 5 },
      reward: { type: 'badge', value: 'compliment' },
      active: true
    }
  ];
  
  for (const challenge of defaultChallenges) {
    const challengeId = generateId();
    await db.collection('journey_challenges').doc(challengeId).set({
      challengeId,
      ...challenge
    });
  }
}