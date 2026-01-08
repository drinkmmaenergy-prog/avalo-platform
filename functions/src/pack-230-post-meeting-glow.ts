/**
 * PACK 230: Post-Meeting Glow Engine
 * 
 * Emotional reinforcement after real-world meetings → more chemistry, more re-bookings,
 * more paid chats/calls, and events.
 * 
 * Key Features:
 * - Post-meeting feedback collection (3-tap simple)
 * - Positive glow state (72 hours after good feedback)
 * - Action suggestions during glow period
 * - Negative outcome handling with safety
 * - Voluntary refund by earner
 * - Event glow for group meetings
 * - Integration with existing momentum, journeys, memories systems
 */

import { db, serverTimestamp, increment, generateId } from './init.js';
import type { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// TYPES
// ============================================================================

export type MeetingVibe = 'great_chemistry' | 'ok_neutral' | 'not_for_me';

export type MeetAgain = 'yes_definitely' | 'maybe' | 'no';

export type FeedbackTag = 
  | 'good_conversation'
  | 'nice_energy'
  | 'fun_playful'
  | 'respectful'
  | 'on_time'
  | 'different_than_expected_but_interesting'
  | 'not_my_type';

export type GlowIntensity = 'none' | 'soft' | 'medium' | 'strong';

export type ActionSuggestionType =
  | 'thank_for_meeting'
  | 'plan_next_date'
  | 'quick_voice_call'
  | 'block_time_second_meeting'
  | 'add_event_together'
  | 'suggest_matching_event';

export interface PostMeetingFeedback {
  feedbackId: string;
  bookingId: string;
  userId: string;
  partnerId: string;
  
  // Feedback responses
  overallVibe: MeetingVibe;
  wouldMeetAgain: MeetAgain;
  tags: FeedbackTag[];
  
  // Selfie mismatch complaint
  selfieMismatchReported: boolean;
  selfieMismatchDetails?: {
    reason: string;
    severity: 'minor' | 'significant' | 'severe';
    requestRefund: boolean;
    requestMeetingEnd: boolean;
  };
  
  // Voluntary refund (earner only)
  voluntaryRefundOffered?: number; // 0, 25, 50, 100 percent of earner share
  
  submittedAt: Timestamp;
  createdAt: Timestamp;
}

export interface PostMeetingGlowState {
  glowId: string;
  bookingId: string;
  chatId?: string;
  participantIds: [string, string];
  
  // Glow status
  isActive: boolean;
  glowIntensity: GlowIntensity;
  expiresAt: Timestamp;
  
  // Feedback summary
  bothFeedbackPositive: boolean;
  hasGreatChemistry: boolean;
  feedbackA: {
    userId: string;
    vibe: MeetingVibe;
    meetAgain: MeetAgain;
  };
  feedbackB: {
    userId: string;
    vibe: MeetingVibe;
    meetAgain: MeetAgain;
  };
  
  // Momentum bonus applied
  momentumBonusApplied: boolean;
  momentumBonus: number;
  
  // Memory created
  memoryCreated: boolean;
  memoryId?: string;
  
  // Journey integration
  journeyAdvanced: boolean;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface GlowActionSuggestion {
  suggestionId: string;
  glowId: string;
  userId: string;
  partnerId: string;
  
  type: ActionSuggestionType;
  title: string;
  description: string;
  actionText: string;
  
  // Tracking
  shownAt?: Timestamp;
  interactedAt?: Timestamp;
  dismissed: boolean;
  
  expiresAt: Timestamp;
  createdAt: Timestamp;
}

export interface EventGlowState {
  eventGlowId: string;
  eventId: string;
  userId: string;
  
  // Connections made
  connections: Array<{
    partnerId: string;
    mutualInterest: boolean;
    chatStarted: boolean;
    meetingScheduled: boolean;
  }>;
  
  // Event feedback
  eventVibe: 'excellent' | 'good' | 'ok' | 'poor';
  wouldAttendAgain: boolean;
  
  // Glow period
  isActive: boolean;
  expiresAt: Timestamp;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface SelfieMismatchCase {
  caseId: string;
  bookingId: string;
  reporterId: string;
  reportedUserId: string;
  
  severity: 'minor' | 'significant' | 'severe';
  reason: string;
  
  // Resolution
  status: 'pending' | 'under_review' | 'resolved' | 'rejected';
  refundApproved: boolean;
  refundAmount?: number;
  meetingEndedImmediately: boolean;
  
  reviewedBy?: string;
  reviewedAt?: Timestamp;
  resolutionNotes?: string;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// POST-MEETING FEEDBACK COLLECTION
// ============================================================================

/**
 * Submit post-meeting feedback (called after meeting ends and QR check-in verified)
 */
export async function submitPostMeetingFeedback(params: {
  bookingId: string;
  userId: string;
  overallVibe: MeetingVibe;
  wouldMeetAgain: MeetAgain;
  tags: FeedbackTag[];
  selfieMismatchReported?: boolean;
  selfieMismatchDetails?: {
    reason: string;
    severity: 'minor' | 'significant' | 'severe';
    requestRefund: boolean;
    requestMeetingEnd: boolean;
  };
  voluntaryRefundPercent?: number;
}): Promise<{ success: boolean; feedbackId?: string; error?: string }> {
  try {
    const {
      bookingId,
      userId,
      overallVibe,
      wouldMeetAgain,
      tags,
      selfieMismatchReported = false,
      selfieMismatchDetails,
      voluntaryRefundPercent
    } = params;
    
    // Get booking
    const bookingSnap = await db.collection('meetBookings').doc(bookingId).get();
    if (!bookingSnap.exists) {
      return { success: false, error: 'Booking not found' };
    }
    
    const booking = bookingSnap.data();
    if (booking?.status !== 'completed' && booking?.status !== 'waiting') {
      return { success: false, error: 'Booking must be completed to submit feedback' };
    }
    
    // Verify user is participant
    if (userId !== booking.hostId && userId !== booking.guestId) {
      return { success: false, error: 'User is not a participant in this meeting' };
    }
    
    const partnerId = userId === booking.hostId ? booking.guestId : booking.hostId;
    const isEarner = userId === booking.hostId;
    
    // Validate voluntary refund (earner only)
    if (voluntaryRefundPercent !== undefined) {
      if (!isEarner) {
        return { success: false, error: 'Only earner can offer voluntary refund' };
      }
      if (![0, 25, 50, 100].includes(voluntaryRefundPercent)) {
        return { success: false, error: 'Invalid refund percentage. Must be 0, 25, 50, or 100' };
      }
    }
    
    // Check if feedback already submitted
    const existingFeedback = await db.collection('postMeetingFeedbacks')
      .where('bookingId', '==', bookingId)
      .where('userId', '==', userId)
      .limit(1)
      .get();
    
    if (!existingFeedback.empty) {
      return { success: false, error: 'Feedback already submitted' };
    }
    
    const feedbackId = generateId();
    
    const feedback: PostMeetingFeedback = {
      feedbackId,
      bookingId,
      userId,
      partnerId,
      overallVibe,
      wouldMeetAgain,
      tags,
      selfieMismatchReported,
      selfieMismatchDetails,
      voluntaryRefundOffered: isEarner ? voluntaryRefundPercent : undefined,
      submittedAt: serverTimestamp() as any,
      createdAt: serverTimestamp() as any
    };
    
    await db.collection('postMeetingFeedbacks').doc(feedbackId).set(feedback);
    
    // Handle selfie mismatch case
    if (selfieMismatchReported && selfieMismatchDetails) {
      await createSelfieMismatchCase(
        bookingId,
        userId,
        partnerId,
        selfieMismatchDetails
      );
    }
    
    // Process voluntary refund
    if (isEarner && voluntaryRefundPercent && voluntaryRefundPercent > 0) {
      await processVoluntaryRefund(bookingId, userId, partnerId, voluntaryRefundPercent);
    }
    
    // Check if both feedbacks are in and create glow state
    await checkAndCreateGlowState(bookingId);
    
    // Apply negative outcome handling if needed
    await handleNegativeOutcome(bookingId, userId, partnerId, overallVibe, wouldMeetAgain);
    
    return { success: true, feedbackId };
  } catch (error: any) {
    console.error('Error submitting post-meeting feedback:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Check if both users have submitted feedback and create glow state
 */
async function checkAndCreateGlowState(bookingId: string): Promise<void> {
  const feedbacksSnap = await db.collection('postMeetingFeedbacks')
    .where('bookingId', '==', bookingId)
    .get();
  
  if (feedbacksSnap.size < 2) {
    return; // Wait for both feedbacks
  }
  
  const feedbacks = feedbacksSnap.docs.map(doc => doc.data() as PostMeetingFeedback);
  const [feedbackA, feedbackB] = feedbacks;
  
  // Determine if glow should be activated
  const shouldActivateGlow = determineGlowActivation(feedbackA, feedbackB);
  
  if (!shouldActivateGlow.activate) {
    return; // No glow for negative outcomes
  }
  
  // Get booking to find chatId
  const bookingSnap = await db.collection('meetBookings').doc(bookingId).get();
  const booking = bookingSnap.data();
  
  // Try to find existing chat between participants
  const chatSnap = await db.collection('chats')
    .where('participants', 'array-contains', feedbackA.userId)
    .get();
  
  let chatId: string | undefined;
  for (const doc of chatSnap.docs) {
    const chat = doc.data();
    if (chat.participants?.includes(feedbackB.userId)) {
      chatId = doc.id;
      break;
    }
  }
  
  const glowId = generateId();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (72 * 60 * 60 * 1000)); // 72 hours
  
  const glowState: PostMeetingGlowState = {
    glowId,
    bookingId,
    chatId,
    participantIds: [feedbackA.userId, feedbackB.userId],
    isActive: true,
    glowIntensity: shouldActivateGlow.intensity,
    expiresAt: expiresAt as any,
    bothFeedbackPositive: shouldActivateGlow.bothPositive,
    hasGreatChemistry: shouldActivateGlow.hasGreatChemistry,
    feedbackA: {
      userId: feedbackA.userId,
      vibe: feedbackA.overallVibe,
      meetAgain: feedbackA.wouldMeetAgain
    },
    feedbackB: {
      userId: feedbackB.userId,
      vibe: feedbackB.overallVibe,
      meetAgain: feedbackB.wouldMeetAgain
    },
    momentumBonusApplied: false,
    momentumBonus: 15, // As per spec
    memoryCreated: false,
    journeyAdvanced: false,
    createdAt: serverTimestamp() as any,
    updatedAt: serverTimestamp() as any
  };
  
  await db.collection('postMeetingGlowStates').doc(glowId).set(glowState);
  
  // Apply glow effects
  await applyGlowEffects(glowState);
  
  // Generate action suggestions
  await generateGlowActionSuggestions(glowState);
}

/**
 * Determine if glow should be activated based on feedback
 */
function determineGlowActivation(
  feedbackA: PostMeetingFeedback,
  feedbackB: PostMeetingFeedback
): {
  activate: boolean;
  intensity: GlowIntensity;
  bothPositive: boolean;
  hasGreatChemistry: boolean;
} {
  const vibeA = feedbackA.overallVibe;
  const vibeB = feedbackB.overallVibe;
  const meetAgainA = feedbackA.wouldMeetAgain;
  const meetAgainB = feedbackB.wouldMeetAgain;
  
  // Great chemistry from both
  if (vibeA === 'great_chemistry' && vibeB === 'great_chemistry') {
    return {
      activate: true,
      intensity: 'strong',
      bothPositive: true,
      hasGreatChemistry: true
    };
  }
  
  // Great chemistry from one, OK from other
  if (
    (vibeA === 'great_chemistry' && vibeB === 'ok_neutral') ||
    (vibeA === 'ok_neutral' && vibeB === 'great_chemistry')
  ) {
    // Check meet again intentions
    if (meetAgainA === 'yes_definitely' || meetAgainB === 'yes_definitely' || 
        meetAgainA === 'maybe' || meetAgainB === 'maybe') {
      return {
        activate: true,
        intensity: 'medium',
        bothPositive: false,
        hasGreatChemistry: false
      };
    }
  }
  
  // Both OK/neutral with positive meet again
  if (vibeA === 'ok_neutral' && vibeB === 'ok_neutral') {
    if ((meetAgainA === 'yes_definitely' || meetAgainA === 'maybe') &&
        (meetAgainB === 'yes_definitely' || meetAgainB === 'maybe')) {
      return {
        activate: true,
        intensity: 'soft',
        bothPositive: false,
        hasGreatChemistry: false
      };
    }
  }
  
  // Any "not for me" = no glow
  if (vibeA === 'not_for_me' || vibeB === 'not_for_me') {
    return {
      activate: false,
      intensity: 'none',
      bothPositive: false,
      hasGreatChemistry: false
    };
  }
  
  return {
    activate: false,
    intensity: 'none',
    bothPositive: false,
    hasGreatChemistry: false
  };
}

// ============================================================================
// GLOW EFFECTS APPLICATION
// ============================================================================

/**
 * Apply all glow effects (momentum, memories, journeys)
 */
async function applyGlowEffects(glowState: PostMeetingGlowState): Promise<void> {
  const [userA, userB] = glowState.participantIds;
  
  // Apply romantic momentum bonus
  try {
    const { trackMomentumAction } = await import('./pack-224-romantic-momentum.js');
    
    await trackMomentumAction(userA, 'meeting_verified', {
      bookingId: glowState.bookingId,
      glowBonus: glowState.momentumBonus
    });
    
    await trackMomentumAction(userB, 'meeting_verified', {
      bookingId: glowState.bookingId,
      glowBonus: glowState.momentumBonus
    });
    
    await db.collection('postMeetingGlowStates').doc(glowState.glowId).update({
      momentumBonusApplied: true,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error applying momentum bonus:', error);
  }
  
  // Create shared memory moment
  if (glowState.chatId) {
    try {
      const { detectFirstMeeting, detectMeetingChemistry } = await import('./pack-229-shared-memories.js');
      
      // Create first meeting moment
      await detectFirstMeeting(
        glowState.chatId,
        glowState.participantIds,
        new Date(),
        glowState.bookingId
      );
      
      // If great chemistry, create chemistry moment
      if (glowState.hasGreatChemistry) {
        await detectMeetingChemistry(
          glowState.chatId,
          glowState.participantIds,
          new Date(),
          glowState.bookingId,
          'high_chemistry'
        );
      }
      
      await db.collection('postMeetingGlowStates').doc(glowState.glowId).update({
        memoryCreated: true,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error creating memory moment:', error);
    }
  }
  
  // Advance romantic journey if exists
  try {
    // TODO: Integration with PACK 221 Romantic Journeys
    await db.collection('postMeetingGlowStates').doc(glowState.glowId).update({
      journeyAdvanced: true,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error advancing journey:', error);
  }
}

/**
 * Generate action suggestions during glow period
 */
async function generateGlowActionSuggestions(glowState: PostMeetingGlowState): Promise<void> {
  const suggestions: Array<Omit<GlowActionSuggestion, 'suggestionId' | 'createdAt'>> = [];
  
  // For each participant
  for (const userId of glowState.participantIds) {
    const partnerId = glowState.participantIds.find(id => id !== userId)!;
    
    // Thank for meeting
    suggestions.push({
      glowId: glowState.glowId,
      userId,
      partnerId,
      type: 'thank_for_meeting',
      title: 'Say thanks',
      description: 'Send a message to thank them for the meeting',
      actionText: 'Send message',
      dismissed: false,
      expiresAt: glowState.expiresAt
    });
    
    // Plan next date (if chemistry was good)
    if (glowState.glowIntensity !== 'soft') {
      suggestions.push({
        glowId: glowState.glowId,
        userId,
        partnerId,
        type: 'plan_next_date',
        title: 'Plan the next date?',
        description: 'The chemistry was there — keep the momentum going',
        actionText: 'Suggest date',
        dismissed: false,
        expiresAt: glowState.expiresAt
      });
    }
    
    // Quick voice call
    suggestions.push({
      glowId: glowState.glowId,
      userId,
      partnerId,
      type: 'quick_voice_call',
      title: 'Quick call?',
      description: 'Jump on a voice call to keep the connection warm',
      actionText: 'Start call',
      dismissed: false,
      expiresAt: glowState.expiresAt
    });
    
    // Block time for second meeting
    if (glowState.hasGreatChemistry) {
      suggestions.push({
        glowId: glowState.glowId,
        userId,
        partnerId,
        type: 'block_time_second_meeting',
        title: 'Block time this week',
        description: 'Schedule your second meeting while the energy is high',
        actionText: 'Open calendar',
        dismissed: false,
        expiresAt: glowState.expiresAt
      });
    }
  }
  
  // Save suggestions
  for (const suggestion of suggestions) {
    const suggestionId = generateId();
    await db.collection('glowActionSuggestions').doc(suggestionId).set({
      suggestionId,
      ...suggestion,
      createdAt: serverTimestamp()
    });
  }
}

// ============================================================================
// NEGATIVE OUTCOME HANDLING
// ============================================================================

/**
 * Handle negative feedback outcomes
 */
async function handleNegativeOutcome(
  bookingId: string,
  userId: string,
  partnerId: string,
  vibe: MeetingVibe,
  meetAgain: MeetAgain
): Promise<void> {
  // Check if outcome is negative
  if (vibe === 'not_for_me' || (vibe === 'ok_neutral' && meetAgain === 'no')) {
    try {
      // Adjust romantic momentum down slightly
      const { applyMomentumPenalty } = await import('./pack-224-romantic-momentum.js');
      await applyMomentumPenalty(userId, 'meeting_no_show', {
        bookingId,
        reason: 'negative_feedback'
      });
      
      // Offer breakup recovery suggestions if emotionally intense
      // Check if there was a journey or significant interaction
      const chatSnap = await db.collection('chats')
        .where('participants', 'array-contains', userId)
        .get();
      
      for (const doc of chatSnap.docs) {
        const chat = doc.data();
        if (chat.participants?.includes(partnerId)) {
          const messageCount = chat.billing?.messageCount || 0;
          
          // If there was significant interaction, trigger recovery
          if (messageCount > 20) {
            const { detectBreakupState } = await import('./pack-222-breakup-recovery.js');
            await detectBreakupState(
              userId,
              partnerId,
              doc.id,
              'meeting_disappointment'
            );
          }
          break;
        }
      }
    } catch (error) {
      console.error('Error handling negative outcome:', error);
    }
  }
}

// ============================================================================
// SELFIE MISMATCH HANDLING
// ============================================================================

/**
 * Create selfie mismatch case
 */
async function createSelfieMismatchCase(
  bookingId: string,
  reporterId: string,
  reportedUserId: string,
  details: {
    reason: string;
    severity: 'minor' | 'significant' | 'severe';
    requestRefund: boolean;
    requestMeetingEnd: boolean;
  }
): Promise<string> {
  const caseId = generateId();
  
  const mismatchCase: SelfieMismatchCase = {
    caseId,
    bookingId,
    reporterId,
    reportedUserId,
    severity: details.severity,
    reason: details.reason,
    status: 'pending',
    refundApproved: false,
    meetingEndedImmediately: details.requestMeetingEnd,
    createdAt: serverTimestamp() as any,
    updatedAt: serverTimestamp() as any
  };
  
  await db.collection('selfieMismatchCases').doc(caseId).set(mismatchCase);
  
  // If immediate end requested, update meeting status
  if (details.requestMeetingEnd) {
    await db.collection('meetBookings').doc(bookingId).update({
      status: 'ended_mismatch',
      endedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }
  
  // If refund requested, process it
  if (details.requestRefund) {
    await processSelfieMismatchRefund(bookingId, reporterId, reportedUserId);
  }
  
  return caseId;
}

/**
 * Process selfie mismatch refund (from earner share only)
 */
async function processSelfieMismatchRefund(
  bookingId: string,
  payerId: string,
  earnerId: string
): Promise<void> {
  const bookingSnap = await db.collection('meetBookings').doc(bookingId).get();
  if (!bookingSnap.exists) return;
  
  const booking = bookingSnap.data();
  const refundAmount = booking?.escrowAmount || 0; // Full earner share
  
  // Transfer from earner to payer
  await db.runTransaction(async (transaction) => {
    const payerWalletRef = db.collection('balances').doc(payerId).collection('wallet').doc('wallet');
    const earnerWalletRef = db.collection('balances').doc(earnerId).collection('wallet').doc('wallet');
    
    transaction.update(payerWalletRef, {
      tokens: increment(refundAmount),
      lastUpdated: serverTimestamp()
    });
    
    transaction.update(earnerWalletRef, {
      tokens: increment(-refundAmount),
      lastUpdated: serverTimestamp()
    });
    
    // Log transaction
    const transactionRef = db.collection('transactions').doc();
    transaction.set(transactionRef, {
      senderUid: earnerId,
      receiverUid: payerId,
      tokensAmount: refundAmount,
      bookingId,
      transactionType: 'selfie_mismatch_refund',
      createdAt: serverTimestamp()
    });
  });
}

// ============================================================================
// VOLUNTARY REFUND
// ============================================================================

/**
 * Process voluntary refund from earner
 */
async function processVoluntaryRefund(
  bookingId: string,
  earnerId: string,
  payerId: string,
  refundPercent: number
): Promise<void> {
  const bookingSnap = await db.collection('meetBookings').doc(bookingId).get();
  if (!bookingSnap.exists) return;
  
  const booking = bookingSnap.data();
  const earnerShare = booking?.escrowAmount || 0;
  const refundAmount = Math.floor(earnerShare * (refundPercent / 100));
  
  if (refundAmount === 0) return;
  
  await db.runTransaction(async (transaction) => {
    const payerWalletRef = db.collection('balances').doc(payerId).collection('wallet').doc('wallet');
    const earnerWalletRef = db.collection('balances').doc(earnerId).collection('wallet').doc('wallet');
    
    transaction.update(payerWalletRef, {
      tokens: increment(refundAmount),
      lastUpdated: serverTimestamp()
    });
    
    transaction.update(earnerWalletRef, {
      tokens: increment(-refundAmount),
      lastUpdated: serverTimestamp()
    });
    
    // Log transaction
    const transactionRef = db.collection('transactions').doc();
    transaction.set(transactionRef, {
      senderUid: earnerId,
      receiverUid: payerId,
      tokensAmount: refundAmount,
      bookingId,
      transactionType: 'voluntary_refund',
      refundPercent,
      createdAt: serverTimestamp()
    });
  });
  
  // Boost soft reputation for earner
  try {
    await db.collection('users').doc(earnerId).update({
      'reputation.kindnessScore': increment(refundPercent / 10),
      updatedAt: serverTimestamp()
    });
    
    // Boost romantic momentum (emotional reasons)
    if (refundPercent >= 50) {
      const { trackMomentumAction } = await import('./pack-224-romantic-momentum.js');
      await trackMomentumAction(earnerId, 'destiny_reward_claimed', {
        reason: 'voluntary_refund_kindness'
      });
    }
  } catch (error) {
    console.error('Error boosting reputation/momentum:', error);
  }
}

// ============================================================================
// EVENT GLOW
// ============================================================================

/**
 * Submit event feedback and create glow state
 */
export async function submitEventFeedback(params: {
  eventId: string;
  userId: string;
  eventVibe: 'excellent' | 'good' | 'ok' | 'poor';
  wouldAttendAgain: boolean;
  connections: Array<{
    partnerId: string;
    mutualInterest: boolean;
  }>;
}): Promise<{ success: boolean; eventGlowId?: string; error?: string }> {
  try {
    const { eventId, userId, eventVibe, wouldAttendAgain, connections } = params;
    
    const eventGlowId = generateId();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (72 * 60 * 60 * 1000));
    
    const eventGlow: EventGlowState = {
      eventGlowId,
      eventId,
      userId,
      connections: connections.map(conn => ({
        ...conn,
        chatStarted: false,
        meetingScheduled: false
      })),
      eventVibe,
      wouldAttendAgain,
      isActive: eventVibe === 'excellent' || eventVibe === 'good',
      expiresAt: expiresAt as any,
      createdAt: serverTimestamp() as any,
      updatedAt: serverTimestamp() as any
    };
    
    await db.collection('eventGlowStates').doc(eventGlowId).set(eventGlow);
    
    // Generate connection suggestions
    await generateEventConnectionSuggestions(eventGlow);
    
    return { success: true, eventGlowId };
  } catch (error: any) {
    console.error('Error submitting event feedback:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Generate connection suggestions from event
 */
async function generateEventConnectionSuggestions(eventGlow: EventGlowState): Promise<void> {
  for (const connection of eventGlow.connections) {
    if (!connection.mutualInterest) continue;
    
    // Create suggestion to start chat or schedule coffee
    const suggestionId = generateId();
    await db.collection('glowActionSuggestions').doc(suggestionId).set({
      suggestionId,
      glowId: eventGlow.eventGlowId,
      userId: eventGlow.userId,
      partnerId: connection.partnerId,
      type: 'suggest_matching_event',
      title: 'New connection from event',
      description: 'You both showed interest — start a conversation',
      actionText: 'Start chat',
      dismissed: false,
      expiresAt: eventGlow.expiresAt,
      createdAt: serverTimestamp()
    });
  }
}

// ============================================================================
// QUERIES & HELPERS
// ============================================================================

/**
 * Get active glow state for user
 */
export async function getActiveGlowState(userId: string): Promise<PostMeetingGlowState | null> {
  const now = new Date();
  
  const glowSnap = await db.collection('postMeetingGlowStates')
    .where('participantIds', 'array-contains', userId)
    .where('isActive', '==', true)
    .where('expiresAt', '>', now)
    .limit(1)
    .get();
  
  if (glowSnap.empty) return null;
  
  return glowSnap.docs[0].data() as PostMeetingGlowState;
}

/**
 * Get action suggestions for user
 */
export async function getGlowActionSuggestions(userId: string): Promise<GlowActionSuggestion[]> {
  const now = new Date();
  
  const suggestionsSnap = await db.collection('glowActionSuggestions')
    .where('userId', '==', userId)
    .where('dismissed', '==', false)
    .where('expiresAt', '>', now)
    .orderBy('createdAt', 'desc')
    .limit(5)
    .get();
  
  return suggestionsSnap.docs.map(doc => doc.data() as GlowActionSuggestion);
}

/**
 * Dismiss action suggestion
 */
export async function dismissActionSuggestion(suggestionId: string): Promise<void> {
  await db.collection('glowActionSuggestions').doc(suggestionId).update({
    dismissed: true,
    updatedAt: serverTimestamp()
  });
}

/**
 * Track suggestion interaction
 */
export async function trackSuggestionInteraction(suggestionId: string): Promise<void> {
  await db.collection('glowActionSuggestions').doc(suggestionId).update({
    interactedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

/**
 * Expire old glow states (called by cron)
 */
export async function expireOldGlowStates(): Promise<void> {
  const now = new Date();
  
  const expiredSnap = await db.collection('postMeetingGlowStates')
    .where('isActive', '==', true)
    .where('expiresAt', '<', now)
    .get();
  
  const batch = db.batch();
  expiredSnap.docs.forEach(doc => {
    batch.update(doc.ref, {
      isActive: false,
      updatedAt: serverTimestamp()
    });
  });
  
  await batch.commit();
}