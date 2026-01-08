/**
 * PACK 436 — Review Triggers Module
 * 
 * Automatically triggers review nudges at optimal moments
 */

import { displayReviewNudge, checkForPendingNudges, ReviewNudge } from './reviewNudges';

// ============================================================================
// TRIGGER TYPES
// ============================================================================

export type TriggerType = 
  | 'date_completed'
  | 'tokens_earned'
  | 'event_attended'
  | 'onboarding_completed'
  | 'match_unlocked'
  | 'conversation_started'
  | 'retention_milestone';

export interface TriggerEvent {
  type: TriggerType;
  userId: string;
  data?: any;
}

// ============================================================================
// TRIGGER HANDLERS
// ============================================================================

/**
 * Handle date completion trigger
 */
export async function onDateCompleted(userId: string, success: boolean): Promise<void> {
  if (!success) return;
  
  await checkAndTriggerNudge(userId, 'date_completed');
}

/**
 * Handle tokens earned trigger
 */
export async function onTokensEarned(userId: string, amount: number): Promise<void> {
  if (amount < 100) return; // Only trigger for >= 100 tokens
  
  await checkAndTriggerNudge(userId, 'tokens_earned');
}

/**
 * Handle event attendance trigger
 */
export async function onEventAttended(userId: string, eventId: string): Promise<void> {
  await checkAndTriggerNudge(userId, 'event_attended');
}

/**
 * Handle onboarding completion trigger
 */
export async function onOnboardingCompleted(userId: string, score: number): Promise<void> {
  if (score < 80) return; // Only trigger if onboarding went smoothly
  
  await checkAndTriggerNudge(userId, 'onboarding_completed');
}

/**
 * Handle match unlocked trigger
 */
export async function onMatchUnlocked(userId: string, matchId: string): Promise<void> {
  await checkAndTriggerNudge(userId, 'match_unlocked');
}

/**
 * Handle conversation started trigger
 */
export async function onConversationStarted(userId: string, conversationId: string): Promise<void> {
  await checkAndTriggerNudge(userId, 'conversation_started');
}

/**
 * Handle retention milestone trigger
 */
export async function onRetentionMilestone(userId: string, score: number): Promise<void> {
  if (score < 70) return;
  
  await checkAndTriggerNudge(userId, 'retention_milestone');
}

// ============================================================================
// CORE TRIGGER LOGIC
// ============================================================================

/**
 * Check if nudge should be triggered and display
 */
async function checkAndTriggerNudge(userId: string, triggerType: TriggerType): Promise<void> {
  try {
    // Check for pending nudges from backend
    const pendingNudge = await checkForPendingNudges(userId);
    
    if (pendingNudge) {
      // Display the nudge
      await displayReviewNudge(pendingNudge);
    }
  } catch (error) {
    console.error(`Error triggering nudge for ${triggerType}:`, error);
  }
}

// ============================================================================
// AUTO-TRIGGER SYSTEM
// ============================================================================

/**
 * Initialize auto-trigger system
 * Call this on app launch
 */
export function initializeReviewTriggers(userId: string): void {
  // Check for pending nudges on app launch
  checkAndTriggerNudge(userId, 'onboarding_completed');
}

/**
 * Register event listener for triggers
 */
export function registerTriggerListener(
  triggerType: TriggerType,
  callback: (data: any) => void
): () => void {
  // In production, this would register listeners with your event system
  // For now, return a no-op unsubscribe function
  return () => {};
}

// ============================================================================
// PLACEMENT HELPERS
// ============================================================================

/**
 * Trigger after booking success
 */
export async function triggerAfterBookingSuccess(userId: string, bookingId: string): Promise<void> {
  await onDateCompleted(userId, true);
}

/**
 * Trigger after verification
 */
export async function triggerAfterVerification(userId: string): Promise<void> {
  await onOnboardingCompleted(userId, 100); // High score for verified users
}

/**
 * Trigger after earning tokens
 */
export async function triggerAfterEarningTokens(userId: string, amount: number): Promise<void> {
  await onTokensEarned(userId, amount);
}

/**
 * Trigger after event attendance
 */
export async function triggerAfterEventAttendance(userId: string, eventId: string): Promise<void> {
  await onEventAttended(userId, eventId);
}

/**
 * Trigger after chat match success
 */
export async function triggerAfterChatMatchSuccess(userId: string, matchId: string): Promise<void> {
  await onMatchUnlocked(userId, matchId);
}

// ============================================================================
// TIMING UTILITIES
// ============================================================================

/**
 * Delay trigger by specified milliseconds
 * Useful for waiting until user is settled after an action
 */
export async function delayedTrigger(
  callback: () => Promise<void>,
  delayMs: number = 3000
): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(async () => {
      await callback();
      resolve();
    }, delayMs);
  });
}

/**
 * Trigger with delay (3 seconds default)
 */
export async function triggerWithDelay(
  userId: string,
  triggerType: TriggerType,
  delayMs: number = 3000
): Promise<void> {
  await delayedTrigger(
    () => checkAndTriggerNudge(userId, triggerType),
    delayMs
  );
}

// ============================================================================
// INTEGRATION EXAMPLES
// ============================================================================

/**
 * Example: Integrate with date booking flow
 * 
 * // In your date booking completion screen:
 * import { triggerAfterBookingSuccess } from '@/modules/reviewTriggers';
 * 
 * const handleBookingComplete = async () => {
 *   // ... booking completion logic
 *   await triggerAfterBookingSuccess(userId, bookingId);
 * };
 */

/**
 * Example: Integrate with verification flow
 * 
 * // In your verification success screen:
 * import { triggerAfterVerification } from '@/modules/reviewTriggers';
 * 
 * const handleVerificationComplete = async () => {
 *   // ... verification logic
 *   await triggerAfterVerification(userId);
 * };
 */

/**
 * Example: Integrate with token earning
 * 
 * // After tokens are earned:
 * import { triggerAfterEarningTokens } from '@/modules/reviewTriggers';
 * 
 * const handleTokensEarned = async (amount: number) => {
 *   // ... token logic
 *   await triggerAfterEarningTokens(userId, amount);
 * };
 */

// ============================================================================
// EXPORTS
// ============================================================================

export {
  // Core triggers
  onDateCompleted,
  onTokensEarned,
  onEventAttended,
  onOnboardingCompleted,
  onMatchUnlocked,
  onConversationStarted,
  onRetentionMilestone,
  
  // Helper triggers
  triggerAfterBookingSuccess,
  triggerAfterVerification,
  triggerAfterEarningTokens,
  triggerAfterEventAttendance,
  triggerAfterChatMatchSuccess,
  
  // Utilities
  initializeReviewTriggers,
  registerTriggerListener,
  delayedTrigger,
  triggerWithDelay,
};
