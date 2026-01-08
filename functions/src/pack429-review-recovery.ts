/**
 * PACK 429 — Automated Review Recovery Flows
 * Prompts satisfied users to leave positive reviews
 */

import * as admin from 'firebase-admin';
import {
  ReviewRecoveryPrompt,
  Platform,
} from './pack429-store-defense.types';

const db = admin.firestore();

// ============================================================================
// ELIGIBILITY CHECKS
// ============================================================================

interface EligibilityCheck {
  eligible: boolean;
  reasons: string[];
}

/**
 * Check if user is eligible for review prompt
 */
async function checkEligibility(userId: string): Promise<EligibilityCheck> {
  const reasons: string[] = [];
  
  try {
    // 1. Check if user exists and is not banned
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      reasons.push('USER_NOT_FOUND');
      return { eligible: false, reasons };
    }
    
    const userData = userDoc.data();
    
    if (userData?.banned) {
      reasons.push('USER_BANNED');
    }
    
    // 2. Check for active disputes
    const disputesSnap = await db
      .collection('disputes')
      .where('userId', '==', userId)
      .where('status', '==', 'OPEN')
      .limit(1)
      .get();
    
    if (!disputesSnap.empty) {
      reasons.push('ACTIVE_DISPUTE');
    }
    
    // 3. Check for recent refunds
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const refundsSnap = await db
      .collection('refunds')
      .where('userId', '==', userId)
      .where('createdAt', '>', admin.firestore.Timestamp.fromDate(thirtyDaysAgo))
      .limit(1)
      .get();
    
    if (!refundsSnap.empty) {
      reasons.push('RECENT_REFUND');
    }
    
    // 4. Check for abuse flags
    if (userData?.abuseFlagged) {
      reasons.push('ABUSE_FLAGGED');
    }
    
    // 5. Check for recent prompts (max 1 per 30 days)
    const recentPromptSnap = await db
      .collection('reviewRecoveryPrompts')
      .where('userId', '==', userId)
      .where('promptedAt', '>', admin.firestore.Timestamp.fromDate(thirtyDaysAgo))
      .limit(1)
      .get();
    
    if (!recentPromptSnap.empty) {
      reasons.push('ALREADY_PROMPTED_RECENTLY');
    }
    
    // 6. Check if in crisis mode (different rules apply)
    const crisisDoc = await db.collection('crisisMode').doc('global').get();
    const inCrisisMode = crisisDoc.exists && crisisDoc.data()?.active;
    
    // If in crisis mode, allow happy users to be prompted more frequently
    if (inCrisisMode && reasons.includes('ALREADY_PROMPTED_RECENTLY')) {
      // Check if it's been at least 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const veryRecentPromptSnap = await db
        .collection('reviewRecoveryPrompts')
        .where('userId', '==', userId)
        .where('promptedAt', '>', admin.firestore.Timestamp.fromDate(sevenDaysAgo))
        .limit(1)
        .get();
      
      if (veryRecentPromptSnap.empty) {
        // Remove the reason, they're eligible during crisis mode
        const index = reasons.indexOf('ALREADY_PROMPTED_RECENTLY');
        reasons.splice(index, 1);
      } else {
        reasons.push('CRISIS_MODE_TOO_SOON');
      }
    }
    
    return {
      eligible: reasons.length === 0,
      reasons,
    };
  } catch (error) {
    console.error('Error checking eligibility:', error);
    reasons.push('ERROR_CHECKING');
    return { eligible: false, reasons };
  }
}

// ============================================================================
// PROMPT CREATION
// ============================================================================

type TriggerType = 'CHAT_SUCCESS' | 'CALENDAR_SUCCESS' | 'PAYOUT_SUCCESS' | 'SAFETY_RESOLVED';

/**
 * Create a review recovery prompt for a user
 */
export async function createReviewPrompt(
  userId: string,
  trigger: TriggerType,
  platform: Platform,
  region: string = 'US',
  language: string = 'en'
): Promise<string | null> {
  // Check eligibility
  const eligibility = await checkEligibility(userId);
  
  const promptRef = db.collection('reviewRecoveryPrompts').doc();
  
  const prompt: ReviewRecoveryPrompt = {
    id: promptRef.id,
    userId,
    trigger,
    platform,
    region,
    language,
    prompted: false,
    responded: false,
    leftReview: false,
    eligible: eligibility.eligible,
    ineligibilityReasons: eligibility.eligible ? undefined : eligibility.reasons,
    createdAt: admin.firestore.Timestamp.now(),
  };
  
  await promptRef.set(prompt);
  
  if (!eligibility.eligible) {
    console.log(`User ${userId} not eligible for review prompt: ${eligibility.reasons.join(', ')}`);
    return null;
  }
  
  console.log(`Created review prompt for user ${userId} (trigger: ${trigger})`);
  
  return promptRef.id;
}

// ============================================================================
// TRIGGER HANDLERS
// ============================================================================

/**
 * Called after successful chat completion
 */
export async function onChatSuccess(
  chatId: string,
  userId: string,
  platform: Platform
): Promise<void> {
  try {
    // Verify chat was actually successful
    const chatDoc = await db.collection('chats').doc(chatId).get();
    
    if (!chatDoc.exists) return;
    
    const chatData = chatDoc.data();
    
    // Only trigger if chat had messages and wasn't reported
    if (chatData && chatData.messageCount > 5 && !chatData.reported) {
      await createReviewPrompt(userId, 'CHAT_SUCCESS', platform);
    }
  } catch (error) {
    console.error('Error in onChatSuccess:', error);
  }
}

/**
 * Called after successful calendar meeting
 */
export async function onCalendarSuccess(
  eventId: string,
  userId: string,
  platform: Platform
): Promise<void> {
  try {
    const eventDoc = await db.collection('calendarEvents').doc(eventId).get();
    
    if (!eventDoc.exists) return;
    
    const eventData = eventDoc.data();
    
    // Only trigger if meeting completed successfully
    if (eventData && eventData.status === 'COMPLETED' && !eventData.reported) {
      await createReviewPrompt(userId, 'CALENDAR_SUCCESS', platform);
    }
  } catch (error) {
    console.error('Error in onCalendarSuccess:', error);
  }
}

/**
 * Called after successful payout
 */
export async function onPayoutSuccess(
  payoutId: string,
  userId: string,
  platform: Platform
): Promise<void> {
  try {
    const payoutDoc = await db.collection('payouts').doc(payoutId).get();
    
    if (!payoutDoc.exists) return;
    
    const payoutData = payoutDoc.data();
    
    // Only trigger if payout completed and not disputed
    if (payoutData && payoutData.status === 'COMPLETED' && !payoutData.disputed) {
      await createReviewPrompt(userId, 'PAYOUT_SUCCESS', platform);
    }
  } catch (error) {
    console.error('Error in onPayoutSuccess:', error);
  }
}

/**
 * Called after safety ticket resolved positively
 */
export async function onSafetyResolved(
  ticketId: string,
  userId: string,
  platform: Platform
): Promise<void> {
  try {
    const ticketDoc = await db.collection('safetyTickets').doc(ticketId).get();
    
    if (!ticketDoc.exists) return;
    
    const ticketData = ticketDoc.data();
    
    // Only trigger if resolved in user's favor
    if (ticketData && ticketData.status === 'RESOLVED' && ticketData.outcome === 'USER_FAVOR') {
      await createReviewPrompt(userId, 'SAFETY_RESOLVED', platform);
    }
  } catch (error) {
    console.error('Error in onSafetyResolved:', error);
  }
}

// ============================================================================
// PROMPT DELIVERY
// ============================================================================

/**
 * Mark prompt as delivered and update timestamp
 */
export async function markPromptDelivered(promptId: string): Promise<void> {
  await db.collection('reviewRecoveryPrompts').doc(promptId).update({
    prompted: true,
    promptedAt: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now(),
  });
}

/**
 * Mark user as responded (they acknowledged the prompt)
 */
export async function markPromptResponded(
  promptId: string,
  leftReview: boolean
): Promise<void> {
  await db.collection('reviewRecoveryPrompts').doc(promptId).update({
    responded: true,
    respondedAt: admin.firestore.Timestamp.now(),
    leftReview,
    updatedAt: admin.firestore.Timestamp.now(),
  });
}

// ============================================================================
// PENDING PROMPTS QUERY
// ============================================================================

/**
 * Get pending prompts for a user (for client to display)
 */
export async function getPendingPromptsForUser(userId: string): Promise<ReviewRecoveryPrompt[]> {
  const snapshot = await db
    .collection('reviewRecoveryPrompts')
    .where('userId', '==', userId)
    .where('eligible', '==', true)
    .where('prompted', '==', false)
    .orderBy('createdAt', 'desc')
    .limit(1) // Only show most recent
    .get();
  
  const prompts: ReviewRecoveryPrompt[] = [];
  
  snapshot.forEach(doc => {
    prompts.push(doc.data() as ReviewRecoveryPrompt);
  });
  
  return prompts;
}

/**
 * Get all pending prompts (admin view)
 */
export async function getAllPendingPrompts(limit: number = 100): Promise<ReviewRecoveryPrompt[]> {
  const snapshot = await db
    .collection('reviewRecoveryPrompts')
    .where('eligible', '==', true)
    .where('prompted', '==', false)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  
  const prompts: ReviewRecoveryPrompt[] = [];
  
  snapshot.forEach(doc => {
    prompts.push(doc.data() as ReviewRecoveryPrompt);
  });
  
  return prompts;
}

// ============================================================================
// ANALYTICS
// ============================================================================

export interface RecoveryStats {
  totalPrompts: number;
  promptsDelivered: number;
  promptsResponded: number;
  reviewsLeft: number;
  conversionRate: number;
  byTrigger: {
    [key: string]: {
      prompts: number;
      responded: number;
      reviews: number;
    };
  };
}

/**
 * Get review recovery statistics
 */
export async function getRecoveryStats(days: number = 7): Promise<RecoveryStats> {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  const snapshot = await db
    .collection('reviewRecoveryPrompts')
    .where('createdAt', '>', admin.firestore.Timestamp.fromDate(startDate))
    .get();
  
  const stats: RecoveryStats = {
    totalPrompts: snapshot.size,
    promptsDelivered: 0,
    promptsResponded: 0,
    reviewsLeft: 0,
    conversionRate: 0,
    byTrigger: {},
  };
  
  snapshot.forEach(doc => {
    const prompt = doc.data() as ReviewRecoveryPrompt;
    
    if (prompt.prompted) stats.promptsDelivered++;
    if (prompt.responded) stats.promptsResponded++;
    if (prompt.leftReview) stats.reviewsLeft++;
    
    // Track by trigger
    if (!stats.byTrigger[prompt.trigger]) {
      stats.byTrigger[prompt.trigger] = {
        prompts: 0,
        responded: 0,
        reviews: 0,
      };
    }
    
    stats.byTrigger[prompt.trigger].prompts++;
    if (prompt.responded) stats.byTrigger[prompt.trigger].responded++;
    if (prompt.leftReview) stats.byTrigger[prompt.trigger].reviews++;
  });
  
  // Calculate conversion rate
  if (stats.promptsDelivered > 0) {
    stats.conversionRate = stats.reviewsLeft / stats.promptsDelivered;
  }
  
  return stats;
}

// ============================================================================
// LOCALIZED COPY GENERATION
// ============================================================================

export interface ReviewPromptCopy {
  title: string;
  message: string;
  primaryButton: string;
  secondaryButton: string;
}

/**
 * Get localized copy for review prompt
 * Integrates with PACK 293 notification system
 */
export function getPromptCopy(
  trigger: TriggerType,
  language: string = 'en'
): ReviewPromptCopy {
  // Default English copy
  const copy: { [key: string]: ReviewPromptCopy } = {
    CHAT_SUCCESS: {
      title: 'Enjoying Avalo?',
      message: 'We noticed you had a great chat! Would you mind sharing your experience with others?',
      primaryButton: 'Leave a Review',
      secondaryButton: 'Maybe Later',
    },
    CALENDAR_SUCCESS: {
      title: 'Great Meeting!',
      message: 'Your calendar meeting went well! Help others discover Avalo by sharing your experience.',
      primaryButton: 'Write a Review',
      secondaryButton: 'Not Now',
    },
    PAYOUT_SUCCESS: {
      title: 'Payout Complete!',
      message: 'Your earnings have been paid out successfully. Share your success story with a review!',
      primaryButton: 'Share Experience',
      secondaryButton: 'Skip',
    },
    SAFETY_RESOLVED: {
      title: 'Issue Resolved',
      message: 'We\'re glad we could help resolve your safety concern. How was your experience?',
      primaryButton: 'Leave Feedback',
      secondaryButton: 'No Thanks',
    },
  };
  
  // TODO: Add more language support via PACK 293
  // For now, return English
  return copy[trigger];
}
