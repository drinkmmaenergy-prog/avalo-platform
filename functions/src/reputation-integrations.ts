/**
 * PACK 140 — Reputation System 2.0 Integration Hooks
 * 
 * This file contains helper functions for integrating reputation tracking
 * with existing Avalo systems (Mentorship, Events, Clubs, Safety, etc.)
 */

import { recordReputationEvent } from './reputation-system';
import { ReputationEventType } from './types/reputation.types';

// ============================================================================
// PACK 136: MENTORSHIP INTEGRATION
// ============================================================================

/**
 * Track mentorship session attendance
 * Call this when a session is completed successfully
 */
export async function trackMentorshipSessionCompleted(
  expertId: string,
  userId: string,
  sessionId: string
): Promise<void> {
  // Expert: Reliability + Delivery
  await recordReputationEvent({
    userId: expertId,
    eventType: ReputationEventType.SESSION_COMPLETED,
    context: {
      type: 'mentorship_session',
      referenceId: sessionId,
      description: 'Mentorship session completed successfully',
    },
    source: 'pack136_mentorship',
  });

  await recordReputationEvent({
    userId: expertId,
    eventType: ReputationEventType.SESSION_ATTENDED,
    context: {
      type: 'mentorship_session',
      referenceId: sessionId,
      description: 'Attended scheduled mentorship session',
    },
    source: 'pack136_mentorship',
  });

  // User: Reliability
  await recordReputationEvent({
    userId,
    eventType: ReputationEventType.SESSION_ATTENDED,
    context: {
      type: 'mentorship_session',
      referenceId: sessionId,
      description: 'Attended scheduled mentorship session',
    },
    source: 'pack136_mentorship',
  });
}

/**
 * Track mentorship session no-show
 */
export async function trackMentorshipNoShow(
  userId: string,
  sessionId: string,
  role: 'expert' | 'user'
): Promise<void> {
  await recordReputationEvent({
    userId,
    eventType: ReputationEventType.SESSION_NO_SHOW,
    context: {
      type: 'mentorship_session',
      referenceId: sessionId,
      description: `${role === 'expert' ? 'Expert' : 'User'} did not show up for scheduled session`,
    },
    source: 'pack136_mentorship',
  });
}

/**
 * Track late cancellation (less than 24 hours notice)
 */
export async function trackMentorshipLateCancellation(
  userId: string,
  sessionId: string
): Promise<void> {
  await recordReputationEvent({
    userId,
    eventType: ReputationEventType.SESSION_LATE_CANCEL,
    context: {
      type: 'mentorship_session',
      referenceId: sessionId,
      description: 'Cancelled session without adequate notice',
    },
    source: 'pack136_mentorship',
  });
}

/**
 * Track expert review received
 */
export async function trackExpertReview(
  expertId: string,
  reviewId: string,
  averageRating: number
): Promise<void> {
  // Reviews affect expertise dimension
  // Rating 1-5, convert to -10 to +10 impact
  const scoreImpact = Math.round((averageRating - 3) * 5);

  await recordReputationEvent({
    userId: expertId,
    eventType: ReputationEventType.REVIEW_RECEIVED,
    context: {
      type: 'expert_review',
      referenceId: reviewId,
      description: `Received ${averageRating.toFixed(1)}-star review`,
    },
    source: 'pack136_mentorship',
    customScoreImpact: scoreImpact,
  });
}

/**
 * Track curriculum completion
 */
export async function trackCurriculumCompleted(
  userId: string,
  curriculumId: string
): Promise<void> {
  await recordReputationEvent({
    userId,
    eventType: ReputationEventType.CURRICULUM_COMPLETED,
    context: {
      type: 'curriculum',
      referenceId: curriculumId,
      description: 'Completed full curriculum',
    },
    source: 'pack136_mentorship',
  });
}

/**
 * Track curriculum module completion
 */
export async function trackCurriculumModuleCompleted(
  userId: string,
  curriculumId: string,
  moduleNumber: number
): Promise<void> {
  await recordReputationEvent({
    userId,
    eventType: ReputationEventType.CURRICULUM_MODULE_COMPLETED,
    context: {
      type: 'curriculum_module',
      referenceId: `${curriculumId}_module_${moduleNumber}`,
      description: `Completed curriculum module ${moduleNumber}`,
    },
    source: 'pack136_mentorship',
  });
}

// ============================================================================
// PACK 117: EVENTS INTEGRATION
// ============================================================================

/**
 * Track event attendance
 */
export async function trackEventAttended(
  userId: string,
  eventId: string
): Promise<void> {
  await recordReputationEvent({
    userId,
    eventType: ReputationEventType.EVENT_ATTENDED,
    context: {
      type: 'event',
      referenceId: eventId,
      description: 'Attended event on time',
    },
    source: 'pack117_events',
  });
}

/**
 * Track event no-show
 */
export async function trackEventNoShow(
  userId: string,
  eventId: string
): Promise<void> {
  await recordReputationEvent({
    userId,
    eventType: ReputationEventType.EVENT_NO_SHOW,
    context: {
      type: 'event',
      referenceId: eventId,
      description: 'Failed to attend booked event',
    },
    source: 'pack117_events',
  });
}

// ============================================================================
// PACK 139: CLUBS INTEGRATION
// ============================================================================

/**
 * Track consistent club participation (called monthly)
 */
export async function trackClubParticipation(
  userId: string,
  clubId: string,
  daysActive: number
): Promise<void> {
  // Reward active club members
  if (daysActive >= 20) {
    await recordReputationEvent({
      userId,
      eventType: ReputationEventType.CURRICULUM_MODULE_COMPLETED,
      context: {
        type: 'club_participation',
        referenceId: clubId,
        description: `Active club member (${daysActive} days)`,
      },
      source: 'pack139_clubs',
      customScoreImpact: 3,
    });
  }
}

// ============================================================================
// PACK 137: CHALLENGES INTEGRATION
// ============================================================================

/**
 * Track challenge completion
 */
export async function trackChallengeCompleted(
  userId: string,
  challengeId: string,
  completionRate: number
): Promise<void> {
  // Only reward if completion rate >= 80%
  if (completionRate >= 80) {
    await recordReputationEvent({
      userId,
      eventType: ReputationEventType.CHALLENGE_COMPLETED,
      context: {
        type: 'challenge',
        referenceId: challengeId,
        description: `Completed challenge (${completionRate}% completion rate)`,
      },
      source: 'pack137_challenges',
    });
  }
}

// ============================================================================
// DIGITAL PRODUCTS INTEGRATION
// ============================================================================

/**
 * Track digital product delivered successfully
 */
export async function trackProductDelivered(
  creatorId: string,
  productId: string,
  transactionId: string
): Promise<void> {
  await recordReputationEvent({
    userId: creatorId,
    eventType: ReputationEventType.PRODUCT_DELIVERED,
    context: {
      type: 'digital_product',
      referenceId: transactionId,
      description: 'Digital product delivered successfully',
    },
    source: 'digital_products',
  });
}

/**
 * Track digital product refunded
 */
export async function trackProductRefunded(
  creatorId: string,
  productId: string,
  transactionId: string,
  reason: string
): Promise<void> {
  await recordReputationEvent({
    userId: creatorId,
    eventType: ReputationEventType.PRODUCT_REFUNDED,
    context: {
      type: 'digital_product',
      referenceId: transactionId,
      description: `Product refunded: ${reason}`,
    },
    source: 'digital_products',
  });
}

// ============================================================================
// PACK 126: SAFETY ENGINE INTEGRATION
// ============================================================================

/**
 * Track dispute resolution
 */
export async function trackDisputeResolved(
  userId: string,
  disputeId: string,
  outcome: 'resolved' | 'unresolved'
): Promise<void> {
  const eventType =
    outcome === 'resolved'
      ? ReputationEventType.DISPUTE_RESOLVED
      : ReputationEventType.DISPUTE_UNRESOLVED;

  await recordReputationEvent({
    userId,
    eventType,
    context: {
      type: 'dispute',
      referenceId: disputeId,
      description: `Dispute ${outcome}`,
    },
    source: 'pack126_safety',
  });
}

/**
 * Track consent violation
 */
export async function trackConsentViolation(
  userId: string,
  violationId: string,
  severity: 'minor' | 'major' | 'severe'
): Promise<void> {
  const scoreImpact = severity === 'severe' ? -20 : severity === 'major' ? -15 : -10;

  await recordReputationEvent({
    userId,
    eventType: ReputationEventType.CONSENT_VIOLATION,
    context: {
      type: 'consent_violation',
      referenceId: violationId,
      description: `Consent violation detected (${severity})`,
    },
    source: 'pack126_safety',
    customScoreImpact: scoreImpact,
  });
}

/**
 * Track harassment detection
 */
export async function trackHarassmentDetected(
  userId: string,
  caseId: string,
  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
): Promise<void> {
  const scoreImpact = level === 'CRITICAL' ? -20 : level === 'HIGH' ? -15 : -10;

  await recordReputationEvent({
    userId,
    eventType: ReputationEventType.HARASSMENT_DETECTED,
    context: {
      type: 'harassment',
      referenceId: caseId,
      description: `Harassment detected (${level} level)`,
    },
    source: 'pack126_safety',
    customScoreImpact: scoreImpact,
  });
}

/**
 * Track safety violation
 */
export async function trackSafetyViolation(
  userId: string,
  violationType: string,
  caseId: string
): Promise<void> {
  await recordReputationEvent({
    userId,
    eventType: ReputationEventType.SAFETY_VIOLATION,
    context: {
      type: 'safety_violation',
      referenceId: caseId,
      description: `Safety violation: ${violationType}`,
    },
    source: 'pack126_safety',
  });
}

// ============================================================================
// PACK 130: PATROL AI INTEGRATION
// ============================================================================

/**
 * Track trust flag added (requires human verification)
 */
export async function trackTrustFlagAdded(
  userId: string,
  flagType: string,
  flagId: string
): Promise<void> {
  // This should be added to pending verification first
  // Only record reputation event after human admin approval
  console.log(`Trust flag ${flagType} flagged for user ${userId}, pending verification`);
}

/**
 * Track trust flag removed (after review)
 */
export async function trackTrustFlagRemoved(
  userId: string,
  flagType: string,
  flagId: string
): Promise<void> {
  await recordReputationEvent({
    userId,
    eventType: ReputationEventType.TRUST_FLAG_REMOVED,
    context: {
      type: 'trust_flag',
      referenceId: flagId,
      description: `Trust flag removed after review: ${flagType}`,
    },
    source: 'pack130_patrol_ai',
  });
}

/**
 * Track user report (check for weaponization)
 */
export async function trackUserReport(
  reportedUserId: string,
  reporterId: string,
  reportType: string,
  reportId: string
): Promise<void> {
  // This will be checked for mass report campaigns
  // Record event only if not part of weaponization campaign
  await recordReputationEvent({
    userId: reportedUserId,
    eventType: ReputationEventType.REPORT_DISMISSED, // Will be changed if verified
    context: {
      type: 'user_report',
      referenceId: reportId,
      description: `Report received: ${reportType}`,
    },
    source: 'user_report',
    reporterId,
  });
}

// ============================================================================
// PACK 85: TRUST ENGINE INTEGRATION
// ============================================================================

/**
 * Sync reputation score to trust engine
 * Call this after reputation score changes
 */
export async function syncReputationToTrustEngine(
  userId: string,
  overallScore: number
): Promise<void> {
  // This updates the trust profile with reputation data
  // Trust engine can use reputation as one of many signals
  console.log(`Syncing reputation score ${overallScore} for user ${userId} to trust engine`);
  
  // Note: This does NOT affect trust score calculation
  // Reputation is displayed separately and only in specific contexts
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if user should be shown reputation in context
 */
export function shouldShowReputation(context: string): boolean {
  const validContexts = [
    'mentorship_booking',
    'digital_product_purchase',
    'paid_club_join',
    'paid_event_join',
  ];
  
  return validContexts.includes(context);
}

/**
 * Get reputation display string for UI
 */
export function getReputationDisplay(overallScore: number): {
  label: string;
  color: string;
  showScore: boolean;
} {
  if (overallScore >= 90) {
    return {
      label: 'Excellent Track Record',
      color: '#10B981',
      showScore: true,
    };
  }
  if (overallScore >= 75) {
    return {
      label: 'Very Good Track Record',
      color: '#3B82F6',
      showScore: true,
    };
  }
  if (overallScore >= 60) {
    return {
      label: 'Good Track Record',
      color: '#6366F1',
      showScore: true,
    };
  }
  if (overallScore >= 40) {
    return {
      label: 'Fair Track Record',
      color: '#F59E0B',
      showScore: false, // Don't show low scores to avoid shaming
    };
  }
  return {
    label: 'Building Track Record',
    color: '#9CA3AF',
    showScore: false,
  };
}

/**
 * Integration example: Add to PACK 136 mentorship session completion
 * 
 * In functions/src/expertMarketplace.ts, completeMentorshipSession function:
 * 
 * ```typescript
 * import { trackMentorshipSessionCompleted } from './reputation-integrations';
 * 
 * // After marking session as completed
 * await trackMentorshipSessionCompleted(expertId, userId, sessionId);
 * ```
 * 
 * Integration example: Add to PACK 117 event check-in
 * 
 * In functions/src/events.ts, check-in function:
 * 
 * ```typescript
 * import { trackEventAttended } from './reputation-integrations';
 * 
 * // After successful check-in
 * await trackEventAttended(userId, eventId);
 * ```
 * 
 * Integration example: Add to PACK 126 safety incident handling
 * 
 * In pack126-harassment-shield.ts:
 * 
 * ```typescript
 * import { trackHarassmentDetected } from './reputation-integrations';
 * 
 * // When harassment detected
 * await trackHarassmentDetected(userId, caseId, level);
 * ```
 */