/**
 * PACK 103 — Community Governance, Moderation Expansion & Federated Automated Enforcement
 * Rate Limiting & Rogue Moderator Detection
 * 
 * NON-NEGOTIABLE RULES:
 * - No free tokens, no bonuses, no discounts, no cashback
 * - No changes to token price or 65/35 revenue split
 * - Enforcement cannot be influenced by payments or user popularity
 * - Moderation actions must be legally, ethically, and procedurally defensible
 */

import { db, serverTimestamp, generateId } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import {
  ModeratorActionType,
  ModeratorActionRateLimit,
  RogueModeratorDetection,
  ModerationAuditLog,
} from './pack103-types';
import { createModerationCase } from './pack103-case-management';

// ============================================================================
// COLLECTIONS
// ============================================================================

const COLLECTIONS = {
  MODERATOR_RATE_LIMITS: 'moderator_rate_limits',
  ROGUE_MODERATOR_DETECTIONS: 'rogue_moderator_detections',
  MODERATION_AUDIT_LOG: 'moderation_audit_log',
  USER_ROLES: 'user_roles',
} as const;

// ============================================================================
// RATE LIMIT CONFIGURATION
// ============================================================================

interface RateLimitConfig {
  maxActions: number;
  windowMinutes: number;
}

// Rate limits per action type (per moderator)
const RATE_LIMITS: Record<ModeratorActionType, RateLimitConfig> = {
  'FLAG_FOR_REVIEW': { maxActions: 50, windowMinutes: 60 },
  'RECOMMEND_VISIBILITY_DOWNGRADE': { maxActions: 20, windowMinutes: 60 },
  'APPLY_VISIBILITY_RESTRICTION': { maxActions: 10, windowMinutes: 60 },
  'FREEZE_POSTING': { maxActions: 10, windowMinutes: 60 },
  'UNFREEZE_POSTING': { maxActions: 10, windowMinutes: 60 },
  'MARK_KYC_PRIORITY': { maxActions: 15, windowMinutes: 60 },
  'CREATE_CASE': { maxActions: 30, windowMinutes: 60 },
  'UPDATE_CASE': { maxActions: 100, windowMinutes: 60 },
  'ASSIGN_CASE': { maxActions: 50, windowMinutes: 60 },
  'RESOLVE_CASE': { maxActions: 30, windowMinutes: 60 },
  'APPLY_ENFORCEMENT': { maxActions: 5, windowMinutes: 60 },
  'REMOVE_ENFORCEMENT': { maxActions: 5, windowMinutes: 60 },
  'APPEAL_SUBMITTED': { maxActions: 10, windowMinutes: 1440 }, // 24 hours
  'APPEAL_REVIEWED': { maxActions: 30, windowMinutes: 60 },
};

// ============================================================================
// RATE LIMITING
// ============================================================================

/**
 * Check if moderator can perform action based on rate limits
 */
export async function checkModeratorRateLimit(
  moderatorId: string,
  actionType: ModeratorActionType
): Promise<{ allowed: boolean; reason?: string; remaining?: number }> {
  try {
    const config = RATE_LIMITS[actionType];
    const now = Date.now();
    const windowStart = new Date(now - config.windowMinutes * 60 * 1000);

    // Get current rate limit record
    const rateLimitId = `${moderatorId}_${actionType}`;
    const rateLimitDoc = await db
      .collection(COLLECTIONS.MODERATOR_RATE_LIMITS)
      .doc(rateLimitId)
      .get();

    if (!rateLimitDoc.exists) {
      // No record yet, allowed
      return { allowed: true, remaining: config.maxActions - 1 };
    }

    const rateLimit = rateLimitDoc.data() as ModeratorActionRateLimit;

    // Check if window has expired
    if (rateLimit.windowEnd.toMillis() < now) {
      // Window expired, reset and allow
      return { allowed: true, remaining: config.maxActions - 1 };
    }

    // Check if within window and under limit
    if (rateLimit.count >= config.maxActions) {
      const minutesRemaining = Math.ceil((rateLimit.windowEnd.toMillis() - now) / 60000);
      return {
        allowed: false,
        reason: `Rate limit exceeded. Try again in ${minutesRemaining} minutes.`,
        remaining: 0,
      };
    }

    return {
      allowed: true,
      remaining: config.maxActions - rateLimit.count - 1,
    };
  } catch (error: any) {
    logger.error(`Error checking rate limit for moderator ${moderatorId}`, error);
    // Default to allowing action if rate limit check fails
    return { allowed: true };
  }
}

/**
 * Record moderator action for rate limiting
 */
export async function recordModeratorAction(
  moderatorId: string,
  actionType: ModeratorActionType
): Promise<void> {
  try {
    const config = RATE_LIMITS[actionType];
    const now = Date.now();
    const windowEnd = new Date(now + config.windowMinutes * 60 * 1000);

    const rateLimitId = `${moderatorId}_${actionType}`;
    const rateLimitRef = db.collection(COLLECTIONS.MODERATOR_RATE_LIMITS).doc(rateLimitId);
    const rateLimitDoc = await rateLimitRef.get();

    if (!rateLimitDoc.exists || rateLimitDoc.data()!.windowEnd.toMillis() < now) {
      // Create new window
      const newRateLimit: ModeratorActionRateLimit = {
        moderatorId,
        actionType,
        count: 1,
        windowStart: Timestamp.fromMillis(now),
        windowEnd: Timestamp.fromMillis(windowEnd.getTime()),
      };
      await rateLimitRef.set(newRateLimit);
    } else {
      // Increment count in existing window
      await rateLimitRef.update({
        count: (rateLimitDoc.data()!.count || 0) + 1,
      });
    }
  } catch (error: any) {
    logger.error(`Error recording moderator action for ${moderatorId}`, error);
    // Don't throw - recording failure shouldn't block action
  }
}

// ============================================================================
// ROGUE MODERATOR DETECTION
// ============================================================================

/**
 * Analyze moderator behavior for suspicious patterns
 */
export async function analyzeModeratorBehavior(moderatorId: string): Promise<void> {
  try {
    logger.info(`Analyzing behavior for moderator ${moderatorId}`);

    // Get moderator's actions from last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const actionsQuery = await db
      .collection(COLLECTIONS.MODERATION_AUDIT_LOG)
      .where('actorId', '==', moderatorId)
      .where('createdAt', '>=', Timestamp.fromDate(sevenDaysAgo))
      .get();

    if (actionsQuery.empty) {
      return; // Not enough data to analyze
    }

    const actions = actionsQuery.docs.map(doc => doc.data() as ModerationAuditLog);
    
    // Calculate metrics
    const totalActions = actions.length;
    const reversedActions = actions.filter(a => a.reversedAt).length;
    const falsePositiveRate = totalActions > 0 ? reversedActions / totalActions : 0;

    // Detect suspicious patterns
    const suspiciousPatterns: string[] = [];

    // 1. High false positive rate
    if (falsePositiveRate > 0.3 && totalActions > 10) {
      suspiciousPatterns.push(`High false positive rate: ${(falsePositiveRate * 100).toFixed(1)}%`);
    }

    // 2. Excessive action volume
    if (totalActions > 500) {
      suspiciousPatterns.push(`Excessive action volume: ${totalActions} in 7 days`);
    }

    // 3. Targeting same users repeatedly
    const targetCounts = new Map<string, number>();
    actions.forEach(action => {
      const count = targetCounts.get(action.targetUserId) || 0;
      targetCounts.set(action.targetUserId, count + 1);
    });
    const repeatedTargets = Array.from(targetCounts.entries()).filter(([_, count]) => count > 10);
    if (repeatedTargets.length > 0) {
      suspiciousPatterns.push(`Repeatedly targeting users: ${repeatedTargets.length} users with >10 actions each`);
    }

    // 4. Unusual timing patterns (all actions in short bursts)
    const hourCounts = new Map<number, number>();
    actions.forEach(action => {
      const hour = action.createdAt.toDate().getHours();
      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
    });
    const maxHourCount = Math.max(...Array.from(hourCounts.values()));
    if (maxHourCount > totalActions * 0.8) {
      suspiciousPatterns.push(`Unusual timing: ${maxHourCount} actions concentrated in single hour`);
    }

    // 5. Check if actions align with enforcement outcomes
    const restrictiveActions = actions.filter(a => 
      ['APPLY_VISIBILITY_RESTRICTION', 'FREEZE_POSTING', 'APPLY_ENFORCEMENT'].includes(a.actionType)
    );
    const restrictiveActionRate = totalActions > 0 ? restrictiveActions.length / totalActions : 0;
    if (restrictiveActionRate > 0.7 && totalActions > 20) {
      suspiciousPatterns.push(`Excessive restrictive actions: ${(restrictiveActionRate * 100).toFixed(1)}%`);
    }

    // If suspicious patterns detected, create detection record
    if (suspiciousPatterns.length > 0) {
      await detectRogueModerator(moderatorId, falsePositiveRate, suspiciousPatterns);
    }
  } catch (error: any) {
    logger.error(`Error analyzing moderator behavior for ${moderatorId}`, error);
    throw error;
  }
}

/**
 * Create rogue moderator detection record
 */
async function detectRogueModerator(
  moderatorId: string,
  falsePositiveRate: number,
  suspiciousPatterns: string[]
): Promise<void> {
  try {
    logger.warn(`Rogue moderator patterns detected for ${moderatorId}`, { suspiciousPatterns });

    // Check if already detected recently
    const recentDetectionQuery = await db
      .collection(COLLECTIONS.ROGUE_MODERATOR_DETECTIONS)
      .where('moderatorId', '==', moderatorId)
      .where('detectedAt', '>=', Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000))
      .limit(1)
      .get();

    if (!recentDetectionQuery.empty) {
      logger.info(`Rogue moderator already detected recently for ${moderatorId}`);
      return;
    }

    // Determine if should auto-suspend
    const shouldAutoSuspend = falsePositiveRate > 0.5 || suspiciousPatterns.length >= 3;

    // Create case for investigation
    const caseId = await createModerationCase(
      moderatorId,
      ['GOVERNANCE_BYPASS'],
      'SYSTEM',
      `Suspicious moderation patterns detected: ${suspiciousPatterns.join(', ')}`
    );

    const detection: RogueModeratorDetection = {
      moderatorId,
      detectedAt: serverTimestamp() as Timestamp,
      reason: suspiciousPatterns.join('; '),
      falsePositiveRate,
      suspiciousPatterns,
      autoSuspended: shouldAutoSuspend,
      caseId,
    };

    await db.collection(COLLECTIONS.ROGUE_MODERATOR_DETECTIONS).add(detection);

    // Auto-suspend if threshold met
    if (shouldAutoSuspend) {
      await suspendModerator(moderatorId, caseId, 'Automatic suspension due to suspicious moderation patterns');
    }

    logger.info(`Rogue moderator detection created for ${moderatorId}, case: ${caseId}`);
  } catch (error: any) {
    logger.error(`Error creating rogue moderator detection for ${moderatorId}`, error);
    throw error;
  }
}

/**
 * Suspend moderator role
 */
async function suspendModerator(
  moderatorId: string,
  caseId: string,
  reason: string
): Promise<void> {
  try {
    logger.warn(`Suspending moderator ${moderatorId}`);

    // Remove moderator roles
    const rolesRef = db.collection(COLLECTIONS.USER_ROLES).doc(moderatorId);
    await rolesRef.update({
      roles: ['USER'], // Reset to basic user
      updatedAt: serverTimestamp(),
      suspendedAt: serverTimestamp(),
      suspensionReason: reason,
      suspensionCaseId: caseId,
    });

    logger.info(`Moderator ${moderatorId} suspended`);
  } catch (error: any) {
    logger.error(`Error suspending moderator ${moderatorId}`, error);
    throw error;
  }
}

/**
 * Schedule periodic analysis of all moderators
 */
export async function analyzeAllModerators(): Promise<void> {
  try {
    logger.info('Starting batch analysis of all moderators');

    // Get all users with moderator roles
    const moderatorsQuery = await db
      .collection(COLLECTIONS.USER_ROLES)
      .where('roles', 'array-contains-any', ['COMMUNITY_MOD', 'TRUSTED_MOD', 'ADMIN'])
      .get();

    logger.info(`Found ${moderatorsQuery.size} moderators to analyze`);

    // Analyze each moderator
    const analysisPromises = moderatorsQuery.docs.map(doc => 
      analyzeModeratorBehavior(doc.id).catch(error => {
        logger.error(`Failed to analyze moderator ${doc.id}`, error);
      })
    );

    await Promise.all(analysisPromises);

    logger.info('Completed batch analysis of all moderators');
  } catch (error: any) {
    logger.error('Error in batch moderator analysis', error);
    throw error;
  }
}

/**
 * Get rogue moderator detections
 */
export async function getRogueModeratorDetections(
  limit: number = 50
): Promise<RogueModeratorDetection[]> {
  const detectionsQuery = await db
    .collection(COLLECTIONS.ROGUE_MODERATOR_DETECTIONS)
    .orderBy('detectedAt', 'desc')
    .limit(limit)
    .get();

  return detectionsQuery.docs.map(doc => doc.data() as RogueModeratorDetection);
}

/**
 * Check if moderator is currently suspended
 */
export async function isModeratorSuspended(moderatorId: string): Promise<boolean> {
  const rolesDoc = await db.collection(COLLECTIONS.USER_ROLES).doc(moderatorId).get();
  
  if (!rolesDoc.exists) {
    return false;
  }

  const rolesData = rolesDoc.data();
  return rolesData?.suspendedAt !== undefined;
}

/**
 * Multi-actor confirmation for permanent suspension
 * Requires multiple Level 3 admins to agree before executing
 */
export async function requestPermanentSuspensionApproval(
  targetUserId: string,
  requesterId: string,
  reason: string,
  caseId: string
): Promise<string> {
  try {
    const approvalId = generateId();
    
    await db.collection('suspension_approvals').doc(approvalId).set({
      approvalId,
      targetUserId,
      requesterId,
      reason,
      caseId,
      status: 'PENDING',
      approvalsNeeded: 2, // Need 2 additional admin approvals
      approvers: [requesterId],
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 48 * 60 * 60 * 1000), // 48 hours
    });

    logger.info(`Permanent suspension approval requested: ${approvalId} for user ${targetUserId}`);
    return approvalId;
  } catch (error: any) {
    logger.error('Error requesting permanent suspension approval', error);
    throw error;
  }
}

/**
 * Approve permanent suspension request
 */
export async function approvePermanentSuspension(
  approvalId: string,
  approverId: string
): Promise<{ approved: boolean; actioned: boolean }> {
  try {
    const approvalRef = db.collection('suspension_approvals').doc(approvalId);
    const approvalDoc = await approvalRef.get();
    
    if (!approvalDoc.exists) {
      throw new Error('Approval request not found');
    }

    const approval = approvalDoc.data()!;
    
    // Check if expired
    if (approval.expiresAt.toMillis() < Date.now()) {
      throw new Error('Approval request has expired');
    }

    // Check if already approved by this admin
    if (approval.approvers.includes(approverId)) {
      throw new Error('You have already approved this request');
    }

    // Add approver
    const newApprovers = [...approval.approvers, approverId];
    
    await approvalRef.update({
      approvers: newApprovers,
      updatedAt: serverTimestamp(),
    });

    // Check if enough approvals
    if (newApprovers.length >= approval.approvalsNeeded + 1) {
      // Execute permanent suspension
      await approvalRef.update({
        status: 'APPROVED',
        actionedAt: serverTimestamp(),
      });

      logger.info(`Permanent suspension approved and will be executed for user ${approval.targetUserId}`);
      return { approved: true, actioned: true };
    }

    logger.info(`Approval added for ${approvalId}, ${approval.approvalsNeeded + 1 - newApprovers.length} more needed`);
    return { approved: true, actioned: false };
  } catch (error: any) {
    logger.error('Error approving permanent suspension', error);
    throw error;
  }
}