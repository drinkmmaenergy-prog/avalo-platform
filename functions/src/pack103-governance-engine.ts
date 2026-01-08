/**
 * PACK 103 — Community Governance, Moderation Expansion & Federated Automated Enforcement
 * Core Governance Engine
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
  EnforcementConfidence,
  ConfidenceSource,
  getEnforcementLevelFromConfidence,
  ModeratorLevel,
  UserRoles,
  canModeratorPerformAction,
  ModeratorActionType,
  ModerationCase,
  ModerationCaseHistoryEntry,
  ModerationAuditLog,
  VisibilityRestriction,
  PostingRestriction,
  ModerationCaseStatus,
  ModerationCasePriority,
  ModerationReasonCode,
  VisibilityTierRestriction,
} from './pack103-types';

// ============================================================================
// COLLECTIONS
// ============================================================================

const COLLECTIONS = {
  USER_ROLES: 'user_roles',
  MODERATION_CASES: 'moderation_cases',
  MODERATION_AUDIT_LOG: 'moderation_audit_log',
  ENFORCEMENT_CONFIDENCE: 'enforcement_confidence',
  VISIBILITY_RESTRICTIONS: 'visibility_restrictions',
  POSTING_RESTRICTIONS: 'posting_restrictions',
  USER_TRUST_PROFILE: 'user_trust_profile',
  USER_ENFORCEMENT_STATE: 'user_enforcement_state',
  CONTENT_REPORTS: 'content_reports',
  ANOMALY_DETECTIONS: 'pack95_anomaly_detections',
} as const;

// ============================================================================
// ENFORCEMENT CONFIDENCE CALCULATION
// ============================================================================

/**
 * Calculate enforcement confidence score for a user
 * Combines multiple signals into a 0.0-1.0 confidence score
 */
export async function calculateEnforcementConfidence(userId: string): Promise<EnforcementConfidence> {
  try {
    logger.info(`Calculating enforcement confidence for user ${userId}`);
    
    const sources: ConfidenceSource[] = [];
    let totalWeight = 0;
    let weightedScore = 0;

    // 1. AI Content Scans (weight: 0.25)
    const aiScanScore = await getAIContentScanScore(userId);
    if (aiScanScore > 0) {
      const weight = 0.25;
      sources.push({
        type: 'AI_SCAN',
        weight,
        contribution: aiScanScore * weight,
        timestamp: Timestamp.now(),
      });
      totalWeight += weight;
      weightedScore += aiScanScore * weight;
    }

    // 2. Community Moderator Flags (weight: 0.15)
    const communityFlagScore = await getCommunityFlagScore(userId);
    if (communityFlagScore > 0) {
      const weight = 0.15;
      sources.push({
        type: 'COMMUNITY_FLAG',
        weight,
        contribution: communityFlagScore * weight,
        timestamp: Timestamp.now(),
      });
      totalWeight += weight;
      weightedScore += communityFlagScore * weight;
    }

    // 3. Trusted Moderator Actions (weight: 0.25)
    const trustedModScore = await getTrustedModeratorScore(userId);
    if (trustedModScore > 0) {
      const weight = 0.25;
      sources.push({
        type: 'TRUSTED_MOD_ACTION',
        weight,
        contribution: trustedModScore * weight,
        timestamp: Timestamp.now(),
      });
      totalWeight += weight;
      weightedScore += trustedModScore * weight;
    }

    // 4. User Reports (weight: 0.15)
    const userReportScore = await getUserReportScore(userId);
    if (userReportScore > 0) {
      const weight = 0.15;
      sources.push({
        type: 'USER_REPORT',
        weight,
        contribution: userReportScore * weight,
        timestamp: Timestamp.now(),
      });
      totalWeight += weight;
      weightedScore += userReportScore * weight;
    }

    // 5. Violation History (weight: 0.10)
    const violationHistoryScore = await getViolationHistoryScore(userId);
    if (violationHistoryScore > 0) {
      const weight = 0.10;
      sources.push({
        type: 'VIOLATION_HISTORY',
        weight,
        contribution: violationHistoryScore * weight,
        timestamp: Timestamp.now(),
      });
      totalWeight += weight;
      weightedScore += violationHistoryScore * weight;
    }

    // 6. Anomaly Detection (weight: 0.10)
    const anomalyScore = await getAnomalyDetectionScore(userId);
    if (anomalyScore > 0) {
      const weight = 0.10;
      sources.push({
        type: 'ANOMALY_DETECTION',
        weight,
        contribution: anomalyScore * weight,
        timestamp: Timestamp.now(),
      });
      totalWeight += weight;
      weightedScore += anomalyScore * weight;
    }

    // Calculate final confidence score
    const finalScore = totalWeight > 0 ? weightedScore / totalWeight : 0;
    const confidence: EnforcementConfidence = {
      userId,
      score: Math.min(1.0, Math.max(0.0, finalScore)),
      sources,
      calculatedAt: Timestamp.now(),
      factors: sources.map(s => ({
        factor: s.type,
        value: s.contribution,
        impact: s.weight,
      })),
    };

    // Store confidence calculation
    await db.collection(COLLECTIONS.ENFORCEMENT_CONFIDENCE).doc(userId).set(confidence);

    logger.info(`Enforcement confidence for user ${userId}: ${confidence.score.toFixed(3)}`);
    return confidence;
  } catch (error: any) {
    logger.error(`Error calculating enforcement confidence for user ${userId}`, error);
    throw error;
  }
}

/**
 * Get AI content scan score (0.0 - 1.0)
 */
async function getAIContentScanScore(userId: string): Promise<number> {
  // Check trust profile for AI moderation flags
  const trustDoc = await db.collection(COLLECTIONS.USER_TRUST_PROFILE).doc(userId).get();
  const trustProfile = trustDoc.data();
  
  if (!trustProfile) return 0;
  
  const aiFlags = trustProfile.flags?.filter((f: string) => 
    f.includes('AI_') || f.includes('CONTENT_')
  ) || [];
  
  return Math.min(1.0, aiFlags.length * 0.2);
}

/**
 * Get community moderator flag score (0.0 - 1.0)
 */
async function getCommunityFlagScore(userId: string): Promise<number> {
  const last30Days = new Date();
  last30Days.setDate(last30Days.getDate() - 30);
  
  const flagsQuery = await db
    .collection(COLLECTIONS.MODERATION_AUDIT_LOG)
    .where('targetUserId', '==', userId)
    .where('actorLevel', '==', 1) // Community mod level
    .where('actionType', '==', 'FLAG_FOR_REVIEW')
    .where('createdAt', '>=', Timestamp.fromDate(last30Days))
    .get();
  
  return Math.min(1.0, flagsQuery.size * 0.15);
}

/**
 * Get trusted moderator action score (0.0 - 1.0)
 */
async function getTrustedModeratorScore(userId: string): Promise<number> {
  const last30Days = new Date();
  last30Days.setDate(last30Days.getDate() - 30);
  
  const actionsQuery = await db
    .collection(COLLECTIONS.MODERATION_AUDIT_LOG)
    .where('targetUserId', '==', userId)
    .where('actorLevel', '==', 2) // Trusted mod level
    .where('createdAt', '>=', Timestamp.fromDate(last30Days))
    .get();
  
  return Math.min(1.0, actionsQuery.size * 0.25);
}

/**
 * Get user report score (0.0 - 1.0)
 */
async function getUserReportScore(userId: string): Promise<number> {
  const last30Days = new Date();
  last30Days.setDate(last30Days.getDate() - 30);
  
  const reportsQuery = await db
    .collection(COLLECTIONS.CONTENT_REPORTS)
    .where('reportedUserId', '==', userId)
    .where('createdAt', '>=', Timestamp.fromDate(last30Days))
    .get();
  
  // Weight by unique reporters
  const uniqueReporters = new Set(reportsQuery.docs.map(d => d.data().reporterId));
  return Math.min(1.0, uniqueReporters.size * 0.1);
}

/**
 * Get violation history score (0.0 - 1.0)
 */
async function getViolationHistoryScore(userId: string): Promise<number> {
  const casesQuery = await db
    .collection(COLLECTIONS.MODERATION_CASES)
    .where('subjectUserId', '==', userId)
    .where('status', '==', 'RESOLVED')
    .get();
  
  let severityScore = 0;
  casesQuery.docs.forEach(doc => {
    const caseData = doc.data();
    const resolution = caseData.resolution;
    if (resolution?.outcome === 'TEMPORARY_RESTRICTION') severityScore += 0.2;
    if (resolution?.outcome === 'PERMANENT_RESTRICTION') severityScore += 0.5;
    if (resolution?.outcome === 'SUSPENSION') severityScore += 0.8;
  });
  
  return Math.min(1.0, severityScore);
}

/**
 * Get anomaly detection score (0.0 - 1.0)
 */
async function getAnomalyDetectionScore(userId: string): Promise<number> {
  const last7Days = new Date();
  last7Days.setDate(last7Days.getDate() - 7);
  
  const anomaliesQuery = await db
    .collection(COLLECTIONS.ANOMALY_DETECTIONS)
    .where('userId', '==', userId)
    .where('createdAt', '>=', Timestamp.fromDate(last7Days))
    .get();
  
  return Math.min(1.0, anomaliesQuery.size * 0.3);
}

// ============================================================================
// MODERATION ROLE MANAGEMENT
// ============================================================================

/**
 * Assign moderation role to a user (admin only)
 */
export async function assignModerationRole(
  userId: string,
  role: UserRoles['roles'][0],
  grantedBy: string
): Promise<void> {
  try {
    logger.info(`Assigning role ${role} to user ${userId} by ${grantedBy}`);
    
    // Verify granter is admin
    const granterRoles = await getUserRoles(grantedBy);
    if (!granterRoles.roles.includes('ADMIN')) {
      throw new Error('Only admins can assign moderation roles');
    }

    const userRolesRef = db.collection(COLLECTIONS.USER_ROLES).doc(userId);
    const existingDoc = await userRolesRef.get();
    
    if (existingDoc.exists) {
      const existingRoles = existingDoc.data() as UserRoles;
      if (!existingRoles.roles.includes(role)) {
        await userRolesRef.update({
          roles: [...existingRoles.roles, role],
          updatedAt: serverTimestamp(),
        });
      }
    } else {
      const newRoles: UserRoles = {
        userId,
        roles: [role],
        grantedAt: serverTimestamp() as Timestamp,
        grantedBy,
        updatedAt: serverTimestamp() as Timestamp,
      };
      await userRolesRef.set(newRoles);
    }

    logger.info(`Role ${role} assigned to user ${userId}`);
  } catch (error: any) {
    logger.error(`Error assigning role to user ${userId}`, error);
    throw error;
  }
}

/**
 * Get user's moderation roles
 */
export async function getUserRoles(userId: string): Promise<UserRoles> {
  const rolesDoc = await db.collection(COLLECTIONS.USER_ROLES).doc(userId).get();
  
  if (!rolesDoc.exists) {
    return {
      userId,
      roles: ['USER'],
      grantedAt: Timestamp.now(),
      grantedBy: 'SYSTEM',
      updatedAt: Timestamp.now(),
    };
  }
  
  return rolesDoc.data() as UserRoles;
}

/**
 * Get user's highest moderation level
 */
export async function getUserModeratorLevel(userId: string): Promise<ModeratorLevel> {
  const roles = await getUserRoles(userId);
  
  if (roles.roles.includes('ADMIN')) return 3;
  if (roles.roles.includes('TRUSTED_MOD')) return 2;
  if (roles.roles.includes('COMMUNITY_MOD')) return 1;
  return 0;
}

/**
 * Check if user can perform moderation action
 */
export async function canUserPerformModAction(
  userId: string,
  actionType: ModeratorActionType
): Promise<boolean> {
  const level = await getUserModeratorLevel(userId);
  return canModeratorPerformAction(level, actionType);
}

// ============================================================================
// MODERATION ACTION LOGGING
// ============================================================================

/**
 * Log a moderation action
 */
export async function logModerationAction(
  actorId: string,
  targetUserId: string,
  actionType: ModeratorActionType,
  details: string,
  context?: {
    caseId?: string;
    previousState?: Record<string, any>;
    newState?: Record<string, any>;
    metadata?: Record<string, any>;
  }
): Promise<string> {
  try {
    const actorLevel = await getUserModeratorLevel(actorId);
    
    // Verify permission
    if (!canModeratorPerformAction(actorLevel, actionType)) {
      throw new Error(`User ${actorId} does not have permission to perform ${actionType}`);
    }

    const logId = generateId();
    const auditLog: ModerationAuditLog = {
      logId,
      caseId: context?.caseId,
      actorId,
      actorLevel,
      targetUserId,
      actionType,
      details,
      metadata: context?.metadata,
      previousState: context?.previousState,
      newState: context?.newState,
      reversible: isActionReversible(actionType),
      createdAt: serverTimestamp() as Timestamp,
    };

    await db.collection(COLLECTIONS.MODERATION_AUDIT_LOG).doc(logId).set(auditLog);
    
    logger.info(`Moderation action logged: ${actionType} by ${actorId} on ${targetUserId}`);
    return logId;
  } catch (error: any) {
    logger.error('Error logging moderation action', error);
    throw error;
  }
}

/**
 * Check if an action is reversible
 */
function isActionReversible(actionType: ModeratorActionType): boolean {
  const reversibleActions: ModeratorActionType[] = [
    'APPLY_VISIBILITY_RESTRICTION',
    'FREEZE_POSTING',
    'MARK_KYC_PRIORITY',
  ];
  return reversibleActions.includes(actionType);
}

// ============================================================================
// VISIBILITY & POSTING RESTRICTIONS
// ============================================================================

/**
 * Apply visibility tier restriction
 */
export async function applyVisibilityTier(
  userId: string,
  tier: VisibilityTierRestriction,
  appliedBy: string,
  reason: string,
  durationHours?: number,
  caseId?: string
): Promise<void> {
  try {
    logger.info(`Applying visibility tier ${tier} to user ${userId}`);
    
    const expiresAt = durationHours
      ? Timestamp.fromMillis(Date.now() + durationHours * 60 * 60 * 1000)
      : undefined;

    const restriction: VisibilityRestriction = {
      userId,
      tier,
      appliedAt: serverTimestamp() as Timestamp,
      appliedBy,
      expiresAt,
      reason,
      caseId,
    };

    await db.collection(COLLECTIONS.VISIBILITY_RESTRICTIONS).doc(userId).set(restriction);
    
    // Log the action
    await logModerationAction(appliedBy, userId, 'APPLY_VISIBILITY_RESTRICTION', 
      `Visibility tier set to ${tier}`, { caseId, newState: { tier } });

    logger.info(`Visibility tier ${tier} applied to user ${userId}`);
  } catch (error: any) {
    logger.error(`Error applying visibility tier for user ${userId}`, error);
    throw error;
  }
}

/**
 * Apply posting restriction
 */
export async function applyPostingRestriction(
  userId: string,
  restricted: boolean,
  appliedBy: string,
  reason: string,
  durationHours?: number,
  caseId?: string
): Promise<void> {
  try {
    logger.info(`${restricted ? 'Applying' : 'Removing'} posting restriction for user ${userId}`);
    
    const expiresAt = durationHours
      ? Timestamp.fromMillis(Date.now() + durationHours * 60 * 60 * 1000)
      : undefined;

    const restriction: PostingRestriction = {
      userId,
      restricted,
      appliedAt: serverTimestamp() as Timestamp,
      appliedBy,
      expiresAt,
      reason,
      caseId,
    };

    await db.collection(COLLECTIONS.POSTING_RESTRICTIONS).doc(userId).set(restriction);
    
    // Log the action
    await logModerationAction(
      appliedBy,
      userId,
      restricted ? 'FREEZE_POSTING' : 'UNFREEZE_POSTING',
      `Posting ${restricted ? 'frozen' : 'unfrozen'}`,
      { caseId, newState: { restricted } }
    );

    logger.info(`Posting restriction ${restricted ? 'applied' : 'removed'} for user ${userId}`);
  } catch (error: any) {
    logger.error(`Error applying posting restriction for user ${userId}`, error);
    throw error;
  }
}

/**
 * Get current visibility restriction for user
 */
export async function getVisibilityRestriction(userId: string): Promise<VisibilityRestriction | null> {
  const doc = await db.collection(COLLECTIONS.VISIBILITY_RESTRICTIONS).doc(userId).get();
  
  if (!doc.exists) return null;
  
  const restriction = doc.data() as VisibilityRestriction;
  
  // Check if expired
  if (restriction.expiresAt && restriction.expiresAt.toMillis() < Date.now()) {
    await db.collection(COLLECTIONS.VISIBILITY_RESTRICTIONS).doc(userId).delete();
    return null;
  }
  
  return restriction;
}

/**
 * Get current posting restriction for user
 */
export async function getPostingRestriction(userId: string): Promise<PostingRestriction | null> {
  const doc = await db.collection(COLLECTIONS.POSTING_RESTRICTIONS).doc(userId).get();
  
  if (!doc.exists) return null;
  
  const restriction = doc.data() as PostingRestriction;
  
  // Check if expired
  if (restriction.expiresAt && restriction.expiresAt.toMillis() < Date.now()) {
    await db.collection(COLLECTIONS.POSTING_RESTRICTIONS).doc(userId).delete();
    return null;
  }
  
  return restriction;
}

// ============================================================================
// HELPER EXPORTS
// ============================================================================

export {
  getEnforcementLevelFromConfidence,
  canModeratorPerformAction,
} from './pack103-types';