/**
 * PACK 400 - Retention Engine Consolidation
 * Unified Retention Engine Interface (PACK 301 + 301A + 301B)
 * 
 * This module provides a single, canonical interface for all retention engine
 * functionality across the platform. It combines:
 * - PACK 301: Core retention profile + segment management
 * - PACK 301A: Onboarding funnel + event tracking
 * - PACK 301B: Nudges + win-back sequences
 * 
 * IMPORTANT: This is an integration-only layer. It does NOT add new business
 * logic, tokenomics, prices, or refund rules. It only re-exports and composes
 * existing functionality from the underlying packs.
 */

// ============================================================================
// PACK 301 - CORE RETENTION PROFILE & SEGMENTS
// ============================================================================

import {
  // Profile management
  getUserRetentionProfile,
  updateUserActivity,
  updateOnboardingStage,
  
  // Churn prediction & scoring
  calculateChurnRiskFactors,
  calculateChurnScore,
  calculateUserSegment,
  updateUserSegmentAndChurnScore,
  
  // Activity tracking
  calculateActiveDays,
  updateActiveDaysMetrics,
  
  // Win-back sequence
  startWinBackSequence,
  markUserReturned,
  
  // Batch operations
  getUsersForReengagement,
  getUsersForWinBack,
  getIncompleteOnboardingUsers,
  
  // PACK 301A - Automation helpers
  recordActivity,
  recalculateChurnScore,
  recalculateSegment,
  getUsersForRetentionSweep,
  getUsersForWinbackSweep,
  getUsersForOnboardingNudges,
  markWinbackStepSent,
  markWinbackCompleted,
} from '../pack301-retention-service';

// ============================================================================
// PACK 301A - ONBOARDING FUNNEL & EVENTS
// ============================================================================

// Import Cloud Functions (these are already exported from index.ts)
// We're not re-exporting the functions themselves, just documenting them
// The actual functions are:
// - trackOnboardingStage (from pack301-onboarding.ts)
// - getOnboardingProgress (from pack301-onboarding.ts)
// - onPhotoUploaded (from pack301-onboarding.ts)

// ============================================================================
// PACK 301B - NUDGES & WIN-BACK SEQUENCES
// ============================================================================

// Import Cloud Functions (these are already exported from index.ts)
// We're not re-exporting the functions themselves, just documenting them
// The actual functions are:
// - evaluateUserNudges (from pack301-nudges.ts)
// - optOutFromNudges (from pack301-nudges.ts)
// - optInToNudges (from pack301-nudges.ts)
// - dailyWinBackSequence (from pack301-winback.ts)
// - markWinBackReturn (from pack301-winback.ts)
// - getWinBackStatistics (from pack301-winback.ts)
// - triggerWinBackMessage (from pack301-winback.ts)
// - dailyChurnRecalculation (from pack301-daily-churn.ts)
// - triggerChurnRecalculation (from pack301-daily-churn.ts)
// - getChurnStatistics (from pack301-daily-churn.ts)
// - trackActivity (from pack301-activity-hook.ts)
// - onSwipeCreated (from pack301-activity-hook.ts)
// - onChatMessageCreated (from pack301-activity-hook.ts)
// - onTokenPurchaseCreated (from pack301-activity-hook.ts)
// - onCalendarBookingCreated (from pack301-activity-hook.ts)
// - onEventTicketCreated (from pack301-activity-hook.ts)
// - trackCallActivity (from pack301-activity-hook.ts)
// - batchUpdateActivities (from pack301-activity-hook.ts)
// - getActivitySummary (from pack301-activity-hook.ts)

// ============================================================================
// UNIFIED RETENTION ENGINE INTERFACE
// ============================================================================

/**
 * RetentionEngine - Single entry point for all retention functionality
 * 
 * This interface consolidates PACK 301, 301A, and 301B into a unified API.
 * 
 * Usage:
 * ```typescript
 * import { RetentionEngine } from './pack301/retentionEngine';
 * 
 * // Get user profile
 * const profile = await RetentionEngine.getUserRetentionProfile(userId);
 * 
 * // Track activity
 * await RetentionEngine.updateUserActivity(userId, 'swipe');
 * 
 * // Update onboarding
 * await RetentionEngine.updateOnboardingStage(userId, OnboardingStage.PHOTOS_ADDED);
 * 
 * // Start win-back
 * await RetentionEngine.startWinBackSequence(userId);
 * ```
 */
export const RetentionEngine = {
  // ====================================
  // CORE PROFILE MANAGEMENT (PACK 301)
  // ====================================
  
  /**
   * Get or create user retention profile
   * @param userId - User ID
   * @returns UserRetentionProfile
   */
  getUserRetentionProfile,
  
  /**
   * Update user's last active timestamp and optionally specific activity
   * @param userId - User ID
   * @param activityType - Optional: 'swipe' | 'chat' | 'purchase'
   */
  updateUserActivity,
  
  /**
   * Update onboarding stage (only moves forward)
   * @param userId - User ID
   * @param stage - OnboardingStage enum value
   */
  updateOnboardingStage,
  
  // ====================================
  // CHURN PREDICTION & SCORING (PACK 301)
  // ====================================
  
  /**
   * Calculate churn risk factors for a user
   * @param userId - User ID
   * @returns ChurnRiskFactors object
   */
  calculateChurnRiskFactors,
  
  /**
   * Calculate churn score from risk factors (0-1)
   * @param factors - ChurnRiskFactors object
   * @returns Churn score between 0 and 1
   */
  calculateChurnScore,
  
  /**
   * Determine user segment based on last active time
   * @param lastActiveAt - Timestamp of last activity
   * @param winBackSequenceStarted - Whether win-back is active
   * @returns UserSegment
   */
  calculateUserSegment,
  
  /**
   * Update user segment and churn score based on current activity
   * @param userId - User ID
   */
  updateUserSegmentAndChurnScore,
  
  /**
   * Recalculate churn score for a user (PACK 301A)
   * @param userId - User ID
   * @returns Updated retention profile
   */
  recalculateChurnScore,
  
  /**
   * Recalculate segment for a user (PACK 301A)
   * @param userId - User ID
   * @returns Updated retention profile
   */
  recalculateSegment,
  
  // ====================================
  // ACTIVITY TRACKING (PACK 301)
  // ====================================
  
  /**
   * Calculate active days in past N days
   * @param userId - User ID
   * @param days - Number of days to look back
   * @returns Number of active days
   */
  calculateActiveDays,
  
  /**
   * Update active days metrics (7 and 30 day windows)
   * @param userId - User ID
   */
  updateActiveDaysMetrics,
  
  /**
   * Record user activity and update retention profile (PACK 301A)
   * @param userId - User ID
   * @param activityType - Activity type (login, swipe, chat_message, etc.)
   * @param metadata - Optional activity metadata
   * @returns Updated profile info
   */
  recordActivity,
  
  // ====================================
  // WIN-BACK SEQUENCES (PACK 301 + 301B)
  // ====================================
  
  /**
   * Start win-back sequence for churned user
   * @param userId - User ID
   */
  startWinBackSequence,
  
  /**
   * Mark user as returned from win-back
   * @param userId - User ID
   */
  markUserReturned,
  
  /**
   * Mark win-back step as sent (PACK 301A)
   * @param userId - User ID
   * @param stepIndex - Step index (0-3)
   */
  markWinbackStepSent,
  
  /**
   * Mark win-back sequence as completed (PACK 301A)
   * @param userId - User ID
   */
  markWinbackCompleted,
  
  // ====================================
  // BATCH OPERATIONS (PACK 301)
  // ====================================
  
  /**
   * Get users for re-engagement (DORMANT or CHURN_RISK)
   * @param segment - User segment to query
   * @param limit - Max number of users (default: 100)
   * @returns Array of UserRetentionProfile
   */
  getUsersForReengagement,
  
  /**
   * Get users needing win-back messages
   * @param step - Win-back step (1-3)
   * @param limit - Max number of users (default: 100)
   * @returns Array of UserRetentionProfile
   */
  getUsersForWinBack,
  
  /**
   * Get incomplete onboarding users
   * @param limit - Max number of users (default: 100)
   * @returns Array of UserRetentionProfile
   */
  getIncompleteOnboardingUsers,
  
  /**
   * Get users for retention sweep with pagination (PACK 301A)
   * @param batchSize - Number of users per batch
   * @param cursor - Optional pagination cursor
   * @returns Users and next cursor
   */
  getUsersForRetentionSweep,
  
  /**
   * Get users for win-back sweep (PACK 301A)
   * @param batchSize - Number of users per batch
   * @param cursor - Optional pagination cursor
   * @returns Users and next cursor
   */
  getUsersForWinbackSweep,
  
  /**
   * Get users for onboarding nudges (PACK 301A)
   * @param batchSize - Number of users per batch
   * @param cursor - Optional pagination cursor
   * @returns Users and next cursor
   */
  getUsersForOnboardingNudges,
};

/**
 * Note: Cloud Functions from PACK 301A and 301B are already exported
 * from functions/src/index.ts as:
 * 
 * PACK 301A - Onboarding Functions:
 * - pack301_trackOnboardingStage
 * - pack301_getOnboardingProgress
 * - pack301_onPhotoUploaded
 * 
 * PACK 301A - Automation Functions:
 * - pack301a_logUserActivity
 * - pack301a_updateOnboardingStage
 * - pack301a_dailyRetentionSweep
 * - pack301a_dailyWinbackSweep
 * - pack301a_onboardingNudgeSweep
 * - pack301a_rebuildRetentionProfile
 * 
 * PACK 301B - Nudge Functions:
 * - pack301_evaluateUserNudges
 * - pack301_optOutFromNudges
 * - pack301_optInToNudges
 * 
 * PACK 301B - Win-Back Functions:
 * - pack301_dailyWinBackSequence
 * - pack301_markWinBackReturn
 * - pack301_getWinBackStatistics
 * - pack301_triggerWinBackMessage
 * 
 * PACK 301B - Daily Churn Functions:
 * - pack301_dailyChurnRecalculation
 * - pack301_triggerChurnRecalculation
 * - pack301_getChurnStatistics
 * 
 * PACK 301B - Activity Hook Functions:
 * - pack301_trackActivity
 * - pack301_onSwipeCreated
 * - pack301_onChatMessageCreated
 * - pack301_onTokenPurchaseCreated
 * - pack301_onCalendarBookingCreated
 * - pack301_onEventTicketCreated
 * - pack301_trackCallActivity
 * - pack301_batchUpdateActivities
 * - pack301_getActivitySummary
 * 
 * PACK 301 - Analytics Functions:
 * - pack301_aggregateRetentionMetrics
 * - pack301_dailyRetentionAnalytics
 * - pack301_getRetentionMetrics
 * - pack301_getSegmentDistribution
 * - pack301_getOnboardingFunnelMetrics
 * - pack301_getWinBackEffectiveness
 */

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default RetentionEngine;
