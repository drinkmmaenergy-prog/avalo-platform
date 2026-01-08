/**
 * PACK 103 — Community Governance, Moderation Expansion & Federated Automated Enforcement
 * Integration with PACK 87 Enforcement Engine
 * 
 * NON-NEGOTIABLE RULES:
 * - No free tokens, no bonuses, no discounts, no cashback
 * - No changes to token price or 65/35 revenue split
 * - Enforcement cannot be influenced by payments or user popularity
 * - Moderation actions must be legally, ethically, and procedurally defensible
 */

import { logger } from 'firebase-functions/v2';
import {
  calculateEnforcementConfidence,
  getEnforcementLevelFromConfidence,
  applyVisibilityTier,
  applyPostingRestriction,
  getVisibilityRestriction,
  getPostingRestriction,
} from './pack103-governance-engine';
import {
  recalculateEnforcementState,
  setManualEnforcementState,
  getEnforcementState as getPack87EnforcementState,
} from './enforcementEngine';
import { createModerationCase } from './pack103-case-management';
import {
  getTransparencyMessage,
  EnforcementConfidenceLevel,
  VisibilityTierRestriction,
} from './pack103-types';
import { sendEnforcementNotification } from './pack92-notifications';

// ============================================================================
// FEDERATED ENFORCEMENT APPLICATION
// ============================================================================

/**
 * Apply federated automated enforcement based on confidence score
 * This integrates Pack 103 confidence model with Pack 87 enforcement engine
 */
export async function applyFederatedEnforcement(userId: string): Promise<void> {
  try {
    logger.info(`Applying federated enforcement for user ${userId}`);

    // Calculate enforcement confidence
    const confidence = await calculateEnforcementConfidence(userId);
    const level = getEnforcementLevelFromConfidence(confidence.score);

    logger.info(`Enforcement confidence for ${userId}: ${confidence.score.toFixed(3)} (${level})`);

    // Apply enforcement based on confidence level
    switch (level) {
      case 'NONE':
        // No enforcement needed
        logger.info(`No enforcement needed for user ${userId}`);
        break;

      case 'SOFT':
        await applySoftEnforcement(userId, confidence.score);
        break;

      case 'HARD':
        await applyHardEnforcement(userId, confidence.score);
        break;

      case 'SUSPENSION_RISK':
        await applySuspensionRiskEnforcement(userId, confidence.score);
        break;
    }

    // Recalculate PACK 87 enforcement state to reflect any changes
    await recalculateEnforcementState(userId);

    logger.info(`Federated enforcement applied for user ${userId}`);
  } catch (error: any) {
    logger.error(`Error applying federated enforcement for user ${userId}`, error);
    throw error;
  }
}

/**
 * Apply soft enforcement (confidence 0.3 - 0.6)
 * - Lower visibility in discovery
 * - No hard restrictions
 */
async function applySoftEnforcement(userId: string, confidenceScore: number): Promise<void> {
  try {
    logger.info(`Applying soft enforcement for user ${userId}`);

    // Apply visibility tier restriction (temporary, 48 hours)
    await applyVisibilityTier(
      userId,
      'LOW',
      'SYSTEM',
      `Automated soft enforcement (confidence: ${confidenceScore.toFixed(3)})`,
      48 // 48 hours
    );

    // Create case for review
    await createModerationCase(
      userId,
      ['HIGH_RISK_CONTENT'],
      'AUTO',
      `Automated soft enforcement applied based on confidence score ${confidenceScore.toFixed(3)}`
    );

    // Send notification
    await sendEnforcementNotification({
      userId,
      level: 'SOFT',
      reason: 'Automated content review in progress',
    });

    logger.info(`Soft enforcement applied for user ${userId}`);
  } catch (error: any) {
    logger.error(`Error applying soft enforcement for user ${userId}`, error);
    throw error;
  }
}

/**
 * Apply hard enforcement (confidence 0.6 - 0.8)
 * - Hide from discovery
 * - Limit interactions
 * - Create case for human review
 */
async function applyHardEnforcement(userId: string, confidenceScore: number): Promise<void> {
  try {
    logger.info(`Applying hard enforcement for user ${userId}`);

    // Apply visibility tier restriction (hidden)
    await applyVisibilityTier(
      userId,
      'HIDDEN',
      'SYSTEM',
      `Automated hard enforcement (confidence: ${confidenceScore.toFixed(3)})`,
      72 // 72 hours
    );

    // Apply posting restriction
    await applyPostingRestriction(
      userId,
      true,
      'SYSTEM',
      `Automated hard enforcement (confidence: ${confidenceScore.toFixed(3)})`,
      48 // 48 hours
    );

    // Create case for mandatory human review
    await createModerationCase(
      userId,
      ['PERSISTENT_VIOLATIONS'],
      'AUTO',
      `Automated hard enforcement applied based on confidence score ${confidenceScore.toFixed(3)}. Requires human review.`
    );

    // Send notification
    await sendEnforcementNotification({
      userId,
      level: 'HARD',
      reason: 'Account restrictions applied due to policy concerns',
    });

    logger.info(`Hard enforcement applied for user ${userId}`);
  } catch (error: any) {
    logger.error(`Error applying hard enforcement for user ${userId}`, error);
    throw error;
  }
}

/**
 * Apply suspension risk enforcement (confidence > 0.8)
 * - Full visibility hidden
 * - Posting frozen
 * - Create high priority case for immediate human review
 * - Cannot auto-suspend without Level 3 approval
 */
async function applySuspensionRiskEnforcement(userId: string, confidenceScore: number): Promise<void> {
  try {
    logger.info(`Applying suspension risk enforcement for user ${userId}`);

    // Apply full restrictions
    await applyVisibilityTier(
      userId,
      'HIDDEN',
      'SYSTEM',
      `Automated suspension risk enforcement (confidence: ${confidenceScore.toFixed(3)})`,
      undefined // No expiration until human review
    );

    await applyPostingRestriction(
      userId,
      true,
      'SYSTEM',
      `Automated suspension risk enforcement (confidence: ${confidenceScore.toFixed(3)})`,
      undefined // No expiration until human review
    );

    // Create CRITICAL priority case for immediate human review
    const caseId = await createModerationCase(
      userId,
      ['PERSISTENT_VIOLATIONS', 'HIGH_RISK_CONTENT'],
      'AUTO',
      `SUSPENSION RISK: Automated enforcement detected high confidence (${confidenceScore.toFixed(3)}). Requires immediate Level 3 admin review before suspension.`
    );

    // Send notification
    await sendEnforcementNotification({
      userId,
      level: 'SUSPENDED', // Use suspended level notification
      reason: 'Your account is under review due to serious policy concerns',
    });

    logger.warn(`Suspension risk enforcement applied for user ${userId}, case: ${caseId}`);
  } catch (error: any) {
    logger.error(`Error applying suspension risk enforcement for user ${userId}`, error);
    throw error;
  }
}

// ============================================================================
// ENFORCEMENT STATE SYNC
// ============================================================================

/**
 * Sync Pack 103 restrictions with Pack 87 enforcement state
 * Called when Pack 87 enforcement state changes
 */
export async function syncEnforcementRestrictions(userId: string): Promise<void> {
  try {
    // Get Pack 87 enforcement state
    const pack87State = await getPack87EnforcementState(userId);
    
    if (!pack87State) {
      return;
    }

    // Get Pack 103 restrictions
    const visibilityRestriction = await getVisibilityRestriction(userId);
    const postingRestriction = await getPostingRestriction(userId);

    // If Pack 87 shows suspended but Pack 103 has no restrictions, apply them
    if (pack87State.accountStatus === 'SUSPENDED') {
      if (!visibilityRestriction || visibilityRestriction.tier !== 'HIDDEN') {
        await applyVisibilityTier(userId, 'HIDDEN', 'SYSTEM', 'Synced with suspension');
      }
      if (!postingRestriction || !postingRestriction.restricted) {
        await applyPostingRestriction(userId, true, 'SYSTEM', 'Synced with suspension');
      }
    }

    // If Pack 87 shows hard restricted, ensure visibility is lowered
    if (pack87State.accountStatus === 'HARD_RESTRICTED') {
      if (!visibilityRestriction || visibilityRestriction.tier === 'NORMAL') {
        await applyVisibilityTier(userId, 'LOW', 'SYSTEM', 'Synced with hard restriction');
      }
    }

    // If Pack 87 shows active and Pack 103 has restrictions, consider lifting
    if (pack87State.accountStatus === 'ACTIVE') {
      if (visibilityRestriction && visibilityRestriction.appliedBy === 'SYSTEM') {
        // Check if restriction has been in place long enough
        const hoursSinceApplied = (Date.now() - visibilityRestriction.appliedAt.toMillis()) / (1000 * 60 * 60);
        if (hoursSinceApplied > 24) {
          // Consider lifting automatic restrictions after 24 hours of good behavior
          logger.info(`Considering lifting automatic restrictions for ${userId}`);
        }
      }
    }
  } catch (error: any) {
    logger.error(`Error syncing enforcement restrictions for user ${userId}`, error);
    // Don't throw - sync failures shouldn't break enforcement
  }
}

// ============================================================================
// MANUAL ENFORCEMENT INTEGRATION
// ============================================================================

/**
 * Apply manual enforcement action from moderator
 * Integrates with Pack 87 manual enforcement
 */
export async function applyManualEnforcement(
  userId: string,
  reviewerId: string,
  action: {
    accountStatus?: 'ACTIVE' | 'SOFT_RESTRICTED' | 'HARD_RESTRICTED' | 'SUSPENDED';
    visibilityTier?: VisibilityTierRestriction;
    postingRestricted?: boolean;
    featureLocks?: string[];
    durationHours?: number;
    reviewNote: string;
    caseId?: string;
  }
): Promise<void> {
  try {
    logger.info(`Applying manual enforcement for user ${userId} by ${reviewerId}`);

    // Apply visibility tier if specified
    if (action.visibilityTier) {
      await applyVisibilityTier(
        userId,
        action.visibilityTier,
        reviewerId,
        action.reviewNote,
        action.durationHours,
        action.caseId
      );
    }

    // Apply posting restriction if specified
    if (action.postingRestricted !== undefined) {
      await applyPostingRestriction(
        userId,
        action.postingRestricted,
        reviewerId,
        action.reviewNote,
        action.durationHours,
        action.caseId
      );
    }

    // Apply Pack 87 enforcement state if account status specified
    if (action.accountStatus) {
      await setManualEnforcementState(userId, {
        accountStatus: action.accountStatus,
        featureLocks: (action.featureLocks || []) as any,
        visibilityTier: mapVisibilityTierToPack87(action.visibilityTier),
        reviewerId,
        reviewNote: action.reviewNote,
      });
    }

    // Send notification
    const notificationLevel = determineNotificationLevel(action.accountStatus);
    if (notificationLevel) {
      await sendEnforcementNotification({
        userId,
        level: notificationLevel,
        reason: action.reviewNote,
      });
    }

    logger.info(`Manual enforcement applied for user ${userId}`);
  } catch (error: any) {
    logger.error(`Error applying manual enforcement for user ${userId}`, error);
    throw error;
  }
}

/**
 * Map Pack 103 visibility tier to Pack 87 visibility tier
 */
function mapVisibilityTierToPack87(tier?: VisibilityTierRestriction): 'NORMAL' | 'LOW' | undefined {
  if (!tier) return undefined;
  if (tier === 'HIDDEN') return 'LOW';
  return tier;
}

/**
 * Determine notification level from account status
 */
function determineNotificationLevel(
  accountStatus?: string
): 'SOFT' | 'HARD' | 'SUSPENDED' | undefined {
  if (!accountStatus) return undefined;
  if (accountStatus === 'SUSPENDED') return 'SUSPENDED';
  if (accountStatus === 'HARD_RESTRICTED') return 'HARD';
  if (accountStatus === 'SOFT_RESTRICTED') return 'SOFT';
  return undefined;
}

// ============================================================================
// AUTOMATED TRIGGER INTEGRATION
// ============================================================================

/**
 * Trigger enforcement check when trust profile is updated
 * This is called by Pack 85 trust engine
 */
export async function onTrustProfileUpdate(userId: string): Promise<void> {
  try {
    logger.info(`Trust profile updated for user ${userId}, triggering enforcement check`);
    
    // Calculate new confidence and apply federated enforcement
    await applyFederatedEnforcement(userId);
  } catch (error: any) {
    logger.error(`Error handling trust profile update for user ${userId}`, error);
    // Don't throw - we don't want trust updates to fail
  }
}

/**
 * Trigger enforcement check when user is reported
 */
export async function onUserReported(
  reportedUserId: string,
  reporterId: string,
  reason: string
): Promise<void> {
  try {
    logger.info(`User ${reportedUserId} reported by ${reporterId} for: ${reason}`);
    
    // Recalculate confidence with new report
    const confidence = await calculateEnforcementConfidence(reportedUserId);
    
    // If confidence crosses threshold, apply enforcement
    if (confidence.score >= 0.3) {
      await applyFederatedEnforcement(reportedUserId);
    }
  } catch (error: any) {
    logger.error(`Error handling user report for ${reportedUserId}`, error);
    // Don't throw - report should still be recorded even if enforcement fails
  }
}

/**
 * Remove all Pack 103 restrictions for a user
 * Used when clearing enforcement or after successful appeal
 */
export async function removeAllRestrictions(
  userId: string,
  removedBy: string,
  reason: string
): Promise<void> {
  try {
    logger.info(`Removing all Pack 103 restrictions for user ${userId}`);

    // Remove visibility restriction
    const visibilityRestriction = await getVisibilityRestriction(userId);
    if (visibilityRestriction) {
      await applyVisibilityTier(userId, 'NORMAL', removedBy, reason);
    }

    // Remove posting restriction
    const postingRestriction = await getPostingRestriction(userId);
    if (postingRestriction && postingRestriction.restricted) {
      await applyPostingRestriction(userId, false, removedBy, reason);
    }

    logger.info(`All restrictions removed for user ${userId}`);
  } catch (error: any) {
    logger.error(`Error removing restrictions for user ${userId}`, error);
    throw error;
  }
}