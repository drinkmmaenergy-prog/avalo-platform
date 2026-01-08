/**
 * PACK 173 — Avalo Global Abuse Firewall
 * Abuse Mitigation & Resolution Engine
 * 
 * Applies protective actions and resolves abuse cases
 */

import { db, serverTimestamp, generateId } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import {
  AbuseCase,
  AbuseEvent,
  AbuseCategory,
  AbuseStatus,
  MitigationAction,
  HarassmentSanction,
  StealthMitigation,
  VelocityThrottle,
  DefamationReport,
  CreatorShieldSettings,
  ContentType,
} from './pack173-types';

// ============================================================================
// MITIGATION ACTIONS
// ============================================================================

/**
 * Apply mitigation actions for detected abuse
 */
export async function applyAbuseMitigation(
  caseId: string,
  actions: MitigationAction[],
  appliedBy: 'SYSTEM' | string
): Promise<{ success: boolean; actionsApplied: MitigationAction[] }> {
  try {
    const caseRef = db.collection('abuse_cases').doc(caseId);
    const caseDoc = await caseRef.get();
    
    if (!caseDoc.exists) {
      throw new Error('Abuse case not found');
    }
    
    const abuseCase = caseDoc.data() as AbuseCase;
    const appliedActions: MitigationAction[] = [];
    
    for (const action of actions) {
      try {
        await executeMitigationAction(action, abuseCase);
        appliedActions.push(action);
      } catch (error: any) {
        logger.error('Failed to apply mitigation action', {
          caseId,
          action,
          error: error.message
        });
      }
    }
    
    // Update case with applied mitigations
    await caseRef.update({
      mitigationActions: appliedActions,
      mitigationAppliedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    // Mark related events as mitigated
    for (const contentId of abuseCase.contentIds) {
      await db.collection('abuse_events')
        .where('targetContentId', '==', contentId)
        .get()
        .then(snapshot => {
          const batch = db.batch();
          snapshot.docs.forEach(doc => {
            batch.update(doc.ref, {
              mitigated: true,
              mitigationAction: appliedActions[0]
            });
          });
          return batch.commit();
        });
    }
    
    logger.info('Abuse mitigation applied', {
      caseId,
      actionsCount: appliedActions.length,
      appliedBy
    });
    
    return {
      success: true,
      actionsApplied: appliedActions
    };
  } catch (error: any) {
    logger.error('Error applying abuse mitigation', {
      caseId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Execute individual mitigation action
 */
async function executeMitigationAction(
  action: MitigationAction,
  abuseCase: AbuseCase
): Promise<void> {
  switch (action) {
    case 'STEALTH_HIDE':
      await applyStealthHide(abuseCase);
      break;
    
    case 'THROTTLE':
      await applyVelocityThrottle(abuseCase);
      break;
    
    case 'AUTO_MUTE':
      await applyAutoMute(abuseCase);
      break;
    
    case 'REMOVE_CONTENT':
      await removeAbuseContent(abuseCase);
      break;
    
    case 'SOFT_WARNING':
      await issueSanction(abuseCase, 1, 'SOFT_WARNING', false);
      break;
    
    case 'HARD_WARNING':
      await issueSanction(abuseCase, 2, 'CONTENT_REMOVAL', false);
      break;
    
    case 'TEMP_BAN':
      await issueSanction(abuseCase, 3, 'COMMENT_FREEZE', false);
      break;
    
    case 'PERMANENT_BAN':
      await issueSanction(abuseCase, 5, 'PERMANENT_BAN', true);
      break;
    
    case 'ENABLE_SHIELD_MODE':
      await enableCreatorShield(abuseCase.targetUserId);
      break;
    
    case 'REQUEST_EVIDENCE':
      if (abuseCase.abuseCategory === 'DEFAMATION') {
        await requestDefamationEvidence(abuseCase);
      }
      break;
    
    default:
      logger.warn('Unknown mitigation action', { action });
  }
}

// ============================================================================
// STEALTH HIDING
// ============================================================================

/**
 * Hide content from target/public but keep visible to author
 */
async function applyStealthHide(abuseCase: AbuseCase): Promise<void> {
  for (const contentId of abuseCase.contentIds) {
    const mitigationId = generateId();
    const mitigation: StealthMitigation = {
      mitigationId,
      contentId,
      contentType: 'COMMENT',
      authorUserId: abuseCase.contentIds[0],
      visibleToAuthor: true,
      visibleToTarget: false,
      visibleToPublic: false,
      reason: abuseCase.abuseCategory,
      appliedAt: serverTimestamp() as Timestamp,
      expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 3600 * 1000) // 7 days
    };
    
    await db.collection('stealth_mitigations').doc(mitigationId).set(mitigation);
    
    // Update comment visibility flags
    await db.collection('comments').doc(contentId).update({
      stealthHidden: true,
      visibilityRestricted: true,
      restrictionReason: abuseCase.abuseCategory,
      updatedAt: serverTimestamp()
    });
  }
  
  logger.info('Stealth hiding applied', {
    caseId: abuseCase.caseId,
    contentCount: abuseCase.contentIds.length
  });
}

// ============================================================================
// VELOCITY THROTTLE
// ============================================================================

/**
 * Apply comment velocity throttle
 */
async function applyVelocityThrottle(abuseCase: AbuseCase): Promise<void> {
  for (const contentId of abuseCase.contentIds) {
    const throttleId = generateId();
    const throttle: VelocityThrottle = {
      throttleId,
      targetUserId: abuseCase.targetUserId,
      contentId,
      commentCount: 0,
      timeWindowMinutes: 10,
      threshold: 5, // Max 5 comments per 10 minutes
      throttleActive: true,
      throttleStartedAt: serverTimestamp() as Timestamp,
      throttleEndsAt: Timestamp.fromMillis(Date.now() + 24 * 3600 * 1000), // 24 hours
      raidSuspected: true,
      raidId: abuseCase.caseId
    };
    
    await db.collection('velocity_throttles').doc(throttleId).set(throttle);
  }
  
  logger.info('Velocity throttle applied', {
    caseId: abuseCase.caseId,
    targetUserId: abuseCase.targetUserId
  });
}

// ============================================================================
// AUTO-MUTE
// ============================================================================

/**
 * Auto-mute repeat harassers
 */
async function applyAutoMute(abuseCase: AbuseCase): Promise<void> {
  // Get all perpetrators from events
  const eventsSnapshot = await db
    .collection('abuse_events')
    .where('caseId', '==', abuseCase.caseId)
    .get();
  
  const perpetrators = new Set<string>();
  eventsSnapshot.docs.forEach(doc => {
    const event = doc.data() as AbuseEvent;
    event.perpetratorUserIds.forEach(id => perpetrators.add(id));
  });
  
  // Auto-mute each perpetrator for the target
  for (const perpetratorId of Array.from(perpetrators)) {
    const muteId = generateId();
    await db.collection('user_mutes').doc(muteId).set({
      muteId,
      userId: abuseCase.targetUserId,
      mutedUserId: perpetratorId,
      reason: 'AUTO_ABUSE_PROTECTION',
      isAutomatic: true,
      caseId: abuseCase.caseId,
      createdAt: serverTimestamp(),
      expiresAt: null // Permanent unless manually unmuted
    });
  }
  
  logger.info('Auto-mute applied', {
    caseId: abuseCase.caseId,
    mutedCount: perpetrators.size
  });
}

// ============================================================================
// CONTENT REMOVAL
// ============================================================================

/**
 * Remove abusive content
 */
async function removeAbuseContent(abuseCase: AbuseCase): Promise<void> {
  const batch = db.batch();
  
  for (const contentId of abuseCase.contentIds) {
    const contentRef = db.collection('comments').doc(contentId);
    batch.update(contentRef, {
      removed: true,
      removedReason: abuseCase.abuseCategory,
      removedAt: serverTimestamp(),
      removedByCaseId: abuseCase.caseId
    });
  }
  
  await batch.commit();
  
  logger.info('Content removed', {
    caseId: abuseCase.caseId,
    contentCount: abuseCase.contentIds.length
  });
}

// ============================================================================
// SANCTIONS SYSTEM
// ============================================================================

/**
 * Issue harassment sanction
 */
async function issueSanction(
  abuseCase: AbuseCase,
  level: 1 | 2 | 3 | 4 | 5,
  action: HarassmentSanction['action'],
  permanentBan: boolean
): Promise<void> {
  // Get perpetrators
  const eventsSnapshot = await db
    .collection('abuse_events')
    .where('caseId', '==', abuseCase.caseId)
    .get();
  
  const perpetrators = new Set<string>();
  eventsSnapshot.docs.forEach(doc => {
    const event = doc.data() as AbuseEvent;
    event.perpetratorUserIds.forEach(id => perpetrators.add(id));
  });
  
  // Issue sanction to each perpetrator
  for (const perpetratorId of Array.from(perpetrators)) {
    const sanctionId = generateId();
    
    let freezeDuration: number | undefined;
    let freezeEndsAt: Timestamp | undefined;
    
    if (action === 'COMMENT_FREEZE') {
      freezeDuration = level === 3 ? 24 : level === 4 ? 168 : 24;
      freezeEndsAt = Timestamp.fromMillis(Date.now() + freezeDuration * 3600 * 1000);
    }
    
    const sanction: HarassmentSanction = {
      sanctionId,
      userId: perpetratorId,
      caseId: abuseCase.caseId,
      level,
      action,
      freezeDuration,
      freezeStartedAt: freezeDuration ? serverTimestamp() as Timestamp : undefined,
      freezeEndsAt,
      permanentBan,
      deviceBlocked: permanentBan,
      reason: `${abuseCase.abuseCategory} - Severity: ${abuseCase.severity}`,
      appliedBy: 'SYSTEM',
      active: true,
      appealable: !permanentBan,
      appealed: false,
      createdAt: serverTimestamp() as Timestamp,
      updatedAt: serverTimestamp() as Timestamp
    };
    
    await db.collection('harassment_sanctions').doc(sanctionId).set(sanction);
    
    // Update user enforcement state if using PACK 87
    try {
      await updateEnforcementForHarassment(perpetratorId, level, permanentBan);
    } catch (error) {
      logger.warn('Failed to update enforcement state', { perpetratorId, error });
    }
  }
  
  logger.info('Sanctions issued', {
    caseId: abuseCase.caseId,
    level,
    action,
    perpetratorCount: perpetrators.size
  });
}

/**
 * Update enforcement state for harassment
 */
async function updateEnforcementForHarassment(
  userId: string,
  level: number,
  permanentBan: boolean
): Promise<void> {
  if (permanentBan) {
    await db.collection('user_enforcement_state').doc(userId).set({
      userId,
      accountStatus: 'BANNED',
      featureLocks: [],
      visibilityTier: 'LOW',
      reasonCodes: ['HARASSMENT_BAN'],
      trustScoreSnapshot: 0,
      lastUpdatedAt: serverTimestamp(),
      manualOverride: false
    }, { merge: true });
  } else if (level >= 3) {
    await db.collection('user_enforcement_state').doc(userId).set({
      userId,
      accountStatus: 'HARD_RESTRICTED',
      featureLocks: ['SEND_MESSAGES', 'SEND_COMMENTS'],
      visibilityTier: 'LOW',
      reasonCodes: ['HARASSMENT_RESTRICTION'],
      lastUpdatedAt: serverTimestamp()
    }, { merge: true });
  }
}

// ============================================================================
// CREATOR SHIELD MODE
// ============================================================================

/**
 * Enable creator shield mode for protection
 */
async function enableCreatorShield(userId: string): Promise<void> {
  const settingsRef = db.collection('creator_shield_settings').doc(userId);
  const settingsDoc = await settingsRef.get();
  
  if (!settingsDoc.exists) {
    const defaultSettings: CreatorShieldSettings = {
      userId,
      enabled: true,
      autoFilterInsults: true,
      autoHideToxicComments: true,
      toxicCommentThreshold: 70,
      allowOnlyFollowersWhenRaid: true,
      rateLimitDuringSpikes: true,
      blockFreshAccounts: true,
      freshAccountAgeDays: 7,
      autoHideFirstNToxic: 100,
      requireApprovalForNegative: false,
      currentlyUnderRaid: true,
      lastRaidDetectedAt: serverTimestamp() as Timestamp,
      updatedAt: serverTimestamp() as Timestamp
    };
    
    await settingsRef.set(defaultSettings);
  } else {
    await settingsRef.update({
      enabled: true,
      currentlyUnderRaid: true,
      lastRaidDetectedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }
  
  logger.info('Creator shield enabled', { userId });
}

// ============================================================================
// DEFAMATION EVIDENCE REQUEST
// ============================================================================

/**
 * Request evidence for defamation claims
 */
async function requestDefamationEvidence(abuseCase: AbuseCase): Promise<void> {
  for (const contentId of abuseCase.contentIds) {
    const reportId = generateId();
    
    // Get content details
    const contentDoc = await db.collection('comments').doc(contentId).get();
    const content = contentDoc.data();
    
    if (!content) continue;
    
    const report: DefamationReport = {
      reportId,
      caseId: abuseCase.caseId,
      targetUserId: abuseCase.targetUserId,
      accuserUserId: content.authorId,
      contentId,
      contentType: 'COMMENT',
      contentSnapshot: content.content || '',
      defamationType: 'FACTUAL_CLAIM',
      claimsMadeWithoutEvidence: abuseCase.patterns
        .filter(p => p.patternType === 'DEFAMATION_CLAIM')
        .flatMap(p => p.evidence),
      status: 'PENDING_EVIDENCE',
      evidenceRequested: true,
      evidenceRequestedAt: serverTimestamp() as Timestamp,
      throttled: true,
      removed: false,
      markedForReview: true,
      createdAt: serverTimestamp() as Timestamp,
      updatedAt: serverTimestamp() as Timestamp
    };
    
    await db.collection('defamation_reports').doc(reportId).set(report);
    
    // Throttle distribution immediately
    await db.collection('comments').doc(contentId).update({
      distributionThrottled: true,
      throttleReason: 'PENDING_DEFAMATION_EVIDENCE',
      updatedAt: serverTimestamp()
    });
  }
  
  logger.info('Defamation evidence requested', {
    caseId: abuseCase.caseId,
    contentCount: abuseCase.contentIds.length
  });
}

// ============================================================================
// CASE RESOLUTION
// ============================================================================

/**
 * Resolve abuse case
 */
export async function resolveAbuseCase(
  caseId: string,
  resolution: {
    resolutionType: 'CONFIRMED' | 'FALSE_POSITIVE' | 'NO_ACTION';
    reviewedBy: string;
    reviewNotes: string;
  }
): Promise<{ success: boolean }> {
  try {
    const caseRef = db.collection('abuse_cases').doc(caseId);
    const caseDoc = await caseRef.get();
    
    if (!caseDoc.exists) {
      throw new Error('Abuse case not found');
    }
    
    const abuseCase = caseDoc.data() as AbuseCase;
    
    // Update case status
    await caseRef.update({
      status: resolution.resolutionType === 'CONFIRMED' ? 'CONFIRMED' : 'RESOLVED',
      resolvedAt: serverTimestamp(),
      resolutionType: resolution.resolutionType,
      resolutionNotes: resolution.reviewNotes,
      reviewedBy: resolution.reviewedBy,
      reviewedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    // Handle false positives
    if (resolution.resolutionType === 'FALSE_POSITIVE') {
      await revertMitigations(abuseCase);
    }
    
    // Handle confirmed abuse
    if (resolution.resolutionType === 'CONFIRMED') {
      await escalateIfNeeded(abuseCase);
    }
    
    logger.info('Abuse case resolved', {
      caseId,
      resolutionType: resolution.resolutionType,
      reviewedBy: resolution.reviewedBy
    });
    
    return { success: true };
  } catch (error: any) {
    logger.error('Error resolving abuse case', {
      caseId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Revert mitigations for false positives
 */
async function revertMitigations(abuseCase: AbuseCase): Promise<void> {
  // Remove stealth mitigations
  const mitigationsSnapshot = await db
    .collection('stealth_mitigations')
    .where('reason', '==', abuseCase.abuseCategory)
    .get();
  
  const batch = db.batch();
  
  mitigationsSnapshot.docs.forEach(doc => {
    batch.delete(doc.ref);
  });
  
  // Restore content visibility
  for (const contentId of abuseCase.contentIds) {
    const contentRef = db.collection('comments').doc(contentId);
    batch.update(contentRef, {
      stealthHidden: false,
      visibilityRestricted: false,
      restrictionReason: null,
      updatedAt: serverTimestamp()
    });
  }
  
  await batch.commit();
  
  logger.info('Mitigations reverted for false positive', {
    caseId: abuseCase.caseId
  });
}

/**
 * Escalate case if severe
 */
async function escalateIfNeeded(abuseCase: AbuseCase): Promise<void> {
  if (abuseCase.severity >= 85 || abuseCase.abuseCategory === 'ENCOURAGING_HARM') {
    await db.collection('abuse_cases').doc(abuseCase.caseId).update({
      status: 'ESCALATED',
      updatedAt: serverTimestamp()
    });
    
    logger.warn('Abuse case escalated', {
      caseId: abuseCase.caseId,
      severity: abuseCase.severity,
      category: abuseCase.abuseCategory
    });
  }
}

/**
 * Check if user is currently restricted by harassment sanctions
 */
export async function checkHarassmentRestrictions(
  userId: string
): Promise<{
  restricted: boolean;
  restrictions: {
    canComment: boolean;
    canPost: boolean;
    canMessage: boolean;
    activeSanctions: HarassmentSanction[];
  };
}> {
  const sanctionsSnapshot = await db
    .collection('harassment_sanctions')
    .where('userId', '==', userId)
    .where('active', '==', true)
    .get();
  
  const activeSanctions = sanctionsSnapshot.docs.map(doc => 
    doc.data() as HarassmentSanction
  );
  
  // Check if any freezes are still active
  const now = Date.now();
  const activeFreeze = activeSanctions.find(s => 
    s.freezeEndsAt && s.freezeEndsAt.toMillis() > now
  );
  
  const permanentBan = activeSanctions.some(s => s.permanentBan);
  
  return {
    restricted: activeSanctions.length > 0,
    restrictions: {
      canComment: !activeFreeze && !permanentBan,
      canPost: !permanentBan,
      canMessage: !activeFreeze && !permanentBan,
      activeSanctions
    }
  };
}