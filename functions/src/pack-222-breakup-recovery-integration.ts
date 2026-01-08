/**
 * PACK 222: Breakup Recovery Integration Hooks
 *
 * Integration points with PACK 221 (Romantic Journeys), PACK 223 (Destiny Weeks), and other systems
 */

import { detectBreakupState, trackRecoveryActivity, pauseRecoveryForSafety, markUserSafeForRecovery } from './pack-222-breakup-recovery.js';
import type { BreakupReason } from './pack-222-breakup-recovery.js';
import { syncBreakupRecoveryStatus } from './pack-223-destiny-weeks.js';

/**
 * Hook: Called when a romantic journey ends
 * Integrates with PACK 221's endJourney function
 */
export async function onJourneyEnded(
  journeyId: string,
  user1Id: string,
  user2Id: string,
  endedBy: string,
  reason?: string
): Promise<void> {
  try {
    // Determine breakup reason
    let breakupReason: BreakupReason = 'neutral_ending';
    
    if (reason) {
      switch (reason) {
        case 'ghosted':
          breakupReason = 'ghosted';
          break;
        case 'safety':
          breakupReason = 'hard_conflict';
          break;
        case 'mismatch':
          breakupReason = 'emotional_mismatch';
          break;
        case 'meeting_fail':
          breakupReason = 'meeting_disappointment';
          break;
        default:
          breakupReason = 'manual_end';
      }
    }
    
    // Create recovery state for both users
    await Promise.all([
      detectBreakupState(user1Id, user2Id, journeyId, breakupReason),
      detectBreakupState(user2Id, user1Id, journeyId, breakupReason)
    ]);
    
    // PACK 223: Sync with Destiny Weeks (cooldown phase)
    await Promise.all([
      syncBreakupRecoveryStatus(user1Id, true, 'cooldown'),
      syncBreakupRecoveryStatus(user2Id, true, 'cooldown')
    ]);
    
    console.log(`Breakup recovery initiated for journey ${journeyId}`);
  } catch (error) {
    console.error('Error initiating breakup recovery:', error);
    // Don't throw - recovery is optional, shouldn't block journey ending
  }
}

/**
 * Hook: Called when user logs in
 * Track activity for recovery timeline adjustment
 */
export async function onUserLogin(userId: string): Promise<void> {
  try {
    await trackRecoveryActivity(userId, 'login');
  } catch (error) {
    console.error('Error tracking login activity:', error);
  }
}

/**
 * Hook: Called when user swipes
 * Track activity for recovery timeline adjustment
 */
export async function onUserSwipe(userId: string): Promise<void> {
  try {
    await trackRecoveryActivity(userId, 'swipe');
  } catch (error) {
    console.error('Error tracking swipe activity:', error);
  }
}

/**
 * Hook: Called when user sends a chat message
 * Track activity for recovery timeline adjustment
 */
export async function onChatMessageSent(userId: string): Promise<void> {
  try {
    await trackRecoveryActivity(userId, 'chat');
  } catch (error) {
    console.error('Error tracking chat activity:', error);
  }
}

/**
 * Hook: Called when user views a profile
 * Track activity for recovery timeline adjustment
 */
export async function onProfileView(userId: string): Promise<void> {
  try {
    await trackRecoveryActivity(userId, 'profile_view');
  } catch (error) {
    console.error('Error tracking profile view activity:', error);
  }
}

/**
 * Hook: Called when user attends an event
 * Track activity for recovery timeline adjustment
 */
export async function onEventAttended(userId: string): Promise<void> {
  try {
    await trackRecoveryActivity(userId, 'event_attend');
  } catch (error) {
    console.error('Error tracking event attendance:', error);
  }
}

/**
 * Hook: Called when safety incident is created
 * Pause recovery if needed
 */
export async function onSafetyIncidentCreated(
  userId: string,
  incidentId: string,
  severity: 'low' | 'medium' | 'high' | 'critical'
): Promise<void> {
  try {
    // Only pause recovery for high or critical incidents
    if (severity === 'high' || severity === 'critical') {
      await pauseRecoveryForSafety(userId, `Safety incident: ${incidentId}`);
    }
  } catch (error) {
    console.error('Error pausing recovery for safety:', error);
  }
}

/**
 * Hook: Called when user marks themselves as feeling safe
 * Resume recovery process
 */
export async function onUserMarkedSafe(userId: string): Promise<void> {
  try {
    await markUserSafeForRecovery(userId);
    
    // PACK 223: Resume Destiny Weeks participation
    await syncBreakupRecoveryStatus(userId, false);
  } catch (error) {
    console.error('Error marking user safe for recovery:', error);
  }
}

/**
 * Hook: Called when safety incident is resolved
 * Resume recovery if user confirms they feel safe
 */
export async function onSafetyIncidentResolved(
  userId: string,
  incidentId: string
): Promise<void> {
  try {
    // User must manually confirm they feel safe
    // This is handled by onUserMarkedSafe
    console.log(`Safety incident ${incidentId} resolved for user ${userId}`);
  } catch (error) {
    console.error('Error on safety incident resolution:', error);
  }
}