/**
 * PACK 221: Romantic Journeys Integration Hooks
 * Connects journey system with existing chat, call, meeting, and safety systems
 */

import {
  checkChemistryThreshold,
  offerJourney,
  trackJourneyActivity,
  checkAndUnlockMilestones,
  pauseJourneyForSafety,
  resumeJourneyAfterSafety,
  getJourneyBetweenUsers,
} from './romanticJourneys.js';

// ============================================================================
// CHAT INTEGRATION HOOKS
// ============================================================================

/**
 * Hook: Called after successful chat message billing
 * Tracks journey activity and checks chemistry threshold
 */
export async function onChatMessageSent(
  senderId: string,
  receiverId: string,
  tokensSpent: number
): Promise<void> {
  try {
    // Check chemistry threshold
    const threshold = await checkChemistryThreshold(senderId, receiverId);
    if (threshold.reached && threshold.triggeredBy) {
      // Offer journey
      await offerJourney(senderId, receiverId, senderId);
    }
    
    // Track activity if journey exists
    await trackJourneyActivity(senderId, receiverId, 'chat', tokensSpent);
  } catch (error) {
    console.error('Error in chat journey integration:', error);
    // Non-blocking - don't fail chat if journey tracking fails
  }
}

/**
 * Hook: Called when chat reaches 200+ tokens spent
 */
export async function onChatTokenMilestone(
  user1Id: string,
  user2Id: string,
  totalTokens: number
): Promise<void> {
  try {
    const threshold = await checkChemistryThreshold(user1Id, user2Id);
    if (threshold.reached) {
      await offerJourney(user1Id, user2Id, user1Id);
    }
  } catch (error) {
    console.error('Error in chat token milestone:', error);
  }
}

// ============================================================================
// CALL INTEGRATION HOOKS
// ============================================================================

/**
 * Hook: Called after successful call completion
 */
export async function onCallCompleted(
  callerId: string,
  receiverId: string,
  durationMinutes: number
): Promise<void> {
  try {
    // Check chemistry threshold
    const threshold = await checkChemistryThreshold(callerId, receiverId);
    if (threshold.reached) {
      await offerJourney(callerId, receiverId, callerId);
    }
    
    // Track journey activity
    await trackJourneyActivity(callerId, receiverId, 'call');
    
    // Check for "you_sound_great" milestone
    const journey = await getJourneyBetweenUsers(callerId, receiverId);
    if (journey && journey.status === 'active') {
      await checkAndUnlockMilestones(journey.journeyId, 'call');
    }
  } catch (error) {
    console.error('Error in call journey integration:', error);
  }
}

// ============================================================================
// MEETING INTEGRATION HOOKS
// ============================================================================

/**
 * Hook: Called after successful meeting completion
 */
export async function onMeetingCompleted(
  user1Id: string,
  user2Id: string,
  meetingId: string,
  vibePositive: boolean
): Promise<void> {
  try {
    // Check chemistry threshold
    const threshold = await checkChemistryThreshold(user1Id, user2Id);
    if (threshold.reached) {
      await offerJourney(user1Id, user2Id, user1Id);
    }
    
    // Track journey activity
    await trackJourneyActivity(user1Id, user2Id, 'meeting');
    
    // Check for milestones
    const journey = await getJourneyBetweenUsers(user1Id, user2Id);
    if (journey && journey.status === 'active') {
      await checkAndUnlockMilestones(journey.journeyId, 'meeting');
    }
  } catch (error) {
    console.error('Error in meeting journey integration:', error);
  }
}

// ============================================================================
// EVENT INTEGRATION HOOKS
// ============================================================================

/**
 * Hook: Called when users attend an event together
 */
export async function onEventAttendedTogether(
  user1Id: string,
  user2Id: string,
  eventId: string
): Promise<void> {
  try {
    // Track journey activity
    await trackJourneyActivity(user1Id, user2Id, 'event');
    
    // Check for "big_day" milestone
    const journey = await getJourneyBetweenUsers(user1Id, user2Id);
    if (journey && journey.status === 'active') {
      await checkAndUnlockMilestones(journey.journeyId, 'event');
    }
  } catch (error) {
    console.error('Error in event journey integration:', error);
  }
}

// ============================================================================
// SAFETY INTEGRATION HOOKS (PACK 159)
// ============================================================================

/**
 * Hook: Called when safety incident is created
 */
export async function onSafetyIncidentCreated(
  userId: string,
  incidentId: string,
  severity: 'low' | 'medium' | 'high' | 'critical'
): Promise<void> {
  try {
    // For high/critical incidents, pause all journeys involving this user
    if (severity === 'high' || severity === 'critical') {
      await pauseAllUserJourneys(userId, `Safety incident: ${incidentId}`);
    }
  } catch (error) {
    console.error('Error in safety integration:', error);
  }
}

/**
 * Hook: Called when safety incident is resolved
 */
export async function onSafetyIncidentResolved(
  userId: string,
  incidentId: string
): Promise<void> {
  try {
    await resumeAllUserJourneys(userId);
  } catch (error) {
    console.error('Error resuming journeys after safety resolution:', error);
  }
}

/**
 * Hook: Called when panic mode is activated and resolved
 */
export async function onPanicModeResolved(
  userId: string,
  partnerId: string,
  resolution: 'safe' | 'escalated'
): Promise<void> {
  try {
    if (resolution === 'safe') {
      // Unlock "hero_moment" milestone
      const journey = await getJourneyBetweenUsers(userId, partnerId);
      if (journey && journey.status === 'active') {
        await checkAndUnlockMilestones(journey.journeyId, 'panic');
      }
    } else {
      // Pause journey for escalated panic
      const journey = await getJourneyBetweenUsers(userId, partnerId);
      if (journey) {
        await pauseJourneyForSafety(journey.journeyId, 'Panic mode escalated');
      }
    }
  } catch (error) {
    console.error('Error in panic mode journey integration:', error);
  }
}

/**
 * Helper: Pause all journeys for a user
 */
async function pauseAllUserJourneys(userId: string, reason: string): Promise<void> {
  const { getUserJourneys } = await import('./romanticJourneys.js');
  const journeys = await getUserJourneys(userId, ['active']);
  
  for (const journey of journeys) {
    await pauseJourneyForSafety(journey.journeyId, reason);
  }
}

/**
 * Helper: Resume all paused journeys for a user
 */
async function resumeAllUserJourneys(userId: string): Promise<void> {
  const { getUserJourneys } = await import('./romanticJourneys.js');
  const journeys = await getUserJourneys(userId, ['paused']);
  
  for (const journey of journeys) {
    if (journey.safety.pausedForSafety) {
      await resumeJourneyAfterSafety(journey.journeyId);
    }
  }
}

// ============================================================================
// VERIFICATION INTEGRATION HOOKS
// ============================================================================

/**
 * Hook: Called when both users in a pair complete selfie verification
 */
export async function onMutualVerificationComplete(
  user1Id: string,
  user2Id: string
): Promise<void> {
  try {
    const journey = await getJourneyBetweenUsers(user1Id, user2Id);
    if (journey && journey.status === 'active') {
      await checkAndUnlockMilestones(journey.journeyId, 'verification');
    }
  } catch (error) {
    console.error('Error in verification journey integration:', error);
  }
}

// ============================================================================
// WISHLIST INTEGRATION HOOKS
// ============================================================================

/**
 * Hook: Called when users mutually add each other to wishlist
 */
export async function onMutualWishlistAction(
  user1Id: string,
  user2Id: string
): Promise<void> {
  try {
    const threshold = await checkChemistryThreshold(user1Id, user2Id);
    if (threshold.reached) {
      await offerJourney(user1Id, user2Id, user1Id);
    }
  } catch (error) {
    console.error('Error in wishlist journey integration:', error);
  }
}

// ============================================================================
// NOTIFICATION INTEGRATION (PACK 169)
// ============================================================================

/**
 * Hook: Send notification when journey is offered
 */
export async function sendJourneyOfferNotification(
  userId: string,
  partnerId: string,
  partnerName: string
): Promise<void> {
  try {
    // Integration with PACK 169 notification system
    // This would use the actual notification service
    console.log(`Sending journey offer notification to ${userId} for ${partnerName}`);
    
    // Placeholder for actual notification sending
    // await sendNotification(userId, {
    //   type: 'journey_offer',
    //   title: 'You have chemistry! 💕',
    //   body: `Start a Romantic Journey with ${partnerName}?`,
    //   data: { partnerId, type: 'journey_offer' }
    // });
  } catch (error) {
    console.error('Error sending journey offer notification:', error);
  }
}

/**
 * Hook: Send notification when journey milestone is unlocked
 */
export async function sendMilestoneNotification(
  userId: string,
  partnerId: string,
  milestoneType: string,
  milestoneName: string
): Promise<void> {
  try {
    console.log(`Sending milestone notification to ${userId}: ${milestoneName}`);
    
    // Placeholder for actual notification sending
    // await sendNotification(userId, {
    //   type: 'journey_milestone',
    //   title: 'New Journey Milestone! ✨',
    //   body: `You unlocked: ${milestoneName}`,
    //   data: { partnerId, milestoneType }
    // });
  } catch (error) {
    console.error('Error sending milestone notification:', error);
  }
}

/**
 * Hook: Send notification when journey challenge is completed
 */
export async function sendChallengeCompletedNotification(
  userId: string,
  challengeName: string,
  rewardDescription: string
): Promise<void> {
  try {
    console.log(`Sending challenge completed notification to ${userId}: ${challengeName}`);
    
    // Placeholder for actual notification sending
    // await sendNotification(userId, {
    //   type: 'journey_challenge_completed',
    //   title: 'Challenge Complete! 🎉',
    //   body: `${challengeName} - Reward: ${rewardDescription}`,
    //   data: { challengeName }
    // });
  } catch (error) {
    console.error('Error sending challenge notification:', error);
  }
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Scheduled function: Check stale journey offers (7+ days with no response)
 */
export async function cleanupStaleJourneyOffers(): Promise<number> {
  const { db, serverTimestamp } = await import('./init.js');
  
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  
  const staleOffersSnap = await db.collection('romantic_journeys')
    .where('status', '==', 'pending')
    .where('offeredAt', '<', sevenDaysAgo)
    .limit(100)
    .get();
  
  let cleanedCount = 0;
  
  for (const doc of staleOffersSnap.docs) {
    await doc.ref.update({
      status: 'archived',
      endedAt: serverTimestamp(),
      endedBy: 'system',
      updatedAt: serverTimestamp()
    });
    cleanedCount++;
  }
  
  return cleanedCount;
}

/**
 * Scheduled function: Update journey streaks daily
 */
export async function updateJourneyStreaks(): Promise<number> {
  const { db } = await import('./init.js');
  
  const activeJourneysSnap = await db.collection('romantic_journeys')
    .where('status', '==', 'active')
    .limit(500)
    .get();
  
  let updatedCount = 0;
  
  for (const doc of activeJourneysSnap.docs) {
    const journey = doc.data();
    const lastActivity = journey.lastActivityAt?.toDate() || new Date(0);
    const hoursSinceActivity = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60);
    
    // Reset streak if inactive for 48+ hours
    if (hoursSinceActivity >= 48 && journey.stats.currentStreak > 0) {
      await doc.ref.update({
        'stats.currentStreak': 0,
        updatedAt: new Date()
      });
      updatedCount++;
    }
  }
  
  return updatedCount;
}