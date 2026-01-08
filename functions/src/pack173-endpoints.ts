/**
 * PACK 173 — Avalo Global Abuse Firewall
 * API Endpoints
 * 
 * Endpoints for abuse reporting, case management, and protection settings
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, serverTimestamp, generateId } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import {
  AbuseCase,
  AbuseCategory,
  ContentType,
  ReportAbuseRequest,
  ReportAbuseResponse,
  GetAbuseCaseResponse,
  HarassmentSanction,
  CreatorShieldSettings,
  UserAbuseCaseLink,
} from './pack173-types';
import {
  analyzeContentForAbuse,
  createAbuseEvent,
  detectCommentRaid,
} from './pack173-abuse-detection';
import {
  applyAbuseMitigation,
  resolveAbuseCase,
  checkHarassmentRestrictions,
} from './pack173-abuse-mitigation';

// ============================================================================
// REPORT ABUSE
// ============================================================================

export const reportAbuse = onCall<ReportAbuseRequest, Promise<ReportAbuseResponse>>(
  {
    region: 'us-central1',
    memory: '512MiB' as const,
  },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const {
      targetUserId,
      targetContentId,
      targetContentType,
      category,
      description,
      severity,
      screenshotUrls,
      additionalContext,
    } = request.data;

    try {
      // Create or get existing case
      const caseId = await createOrGetAbuseCase(
        targetUserId,
        category,
        userId
      );

      // Create report record
      const reportId = generateId();
      await db.collection('abuse_reports').doc(reportId).set({
        reportId,
        caseId,
        reportedBy: userId,
        targetUserId,
        targetContentId,
        targetContentType,
        category,
        description,
        userPerceivedSeverity: severity,
        screenshotUrls: screenshotUrls || [],
        additionalContext,
        status: 'PENDING_REVIEW',
        createdAt: serverTimestamp(),
      });

      // Analyze content if provided
      if (targetContentId && targetContentType) {
        const contentDoc = await db
          .collection(getCollectionForContentType(targetContentType))
          .doc(targetContentId)
          .get();

        if (contentDoc.exists) {
          const content = contentDoc.data();
          const analysis = await analyzeContentForAbuse(
            content?.content || content?.text || '',
            content?.authorId || content?.userId || '',
            targetUserId,
            targetContentId,
            targetContentType
          );

          if (analysis.hasAbuse && analysis.maxSeverity >= 70) {
            // Auto-apply mitigation for high severity
            await applyAbuseMitigation(
              caseId,
              analysis.recommendedActions as any,
              'SYSTEM'
            );
          }
        }
      }

      // Check if victim should enable shield mode
      const victimLink = await getOrCreateUserCaseLink(targetUserId);
      const victimProtectionEnabled = victimLink.activeCasesAsVictim >= 2;

      if (victimProtectionEnabled) {
        await recommendShieldMode(targetUserId);
      }

      logger.info('Abuse reported', {
        reportId,
        caseId,
        reportedBy: userId,
        targetUserId,
        category,
      });

      return {
        success: true,
        caseId,
        caseCreated: true,
        message: 'Your report has been received and is being reviewed',
        victimProtectionEnabled,
      };
    } catch (error: any) {
      logger.error('Error reporting abuse', {
        userId,
        targetUserId,
        error: error.message,
      });
      throw new HttpsError('internal', 'Failed to report abuse');
    }
  }
);

// ============================================================================
// GET ABUSE CASE
// ============================================================================

export const getAbuseCase = onCall<{ caseId: string }, Promise<GetAbuseCaseResponse>>(
  {
    region: 'us-central1',
  },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { caseId } = request.data;

    try {
      const caseDoc = await db.collection('abuse_cases').doc(caseId).get();

      if (!caseDoc.exists) {
        throw new HttpsError('not-found', 'Case not found');
      }

      const abuseCase = caseDoc.data() as AbuseCase;

      // Check if user is authorized to view this case
      if (abuseCase.targetUserId !== userId && abuseCase.reviewedBy !== userId) {
        throw new HttpsError('permission-denied', 'Not authorized to view this case');
      }

      // Get related events
      const eventsSnapshot = await db
        .collection('abuse_events')
        .where('caseId', '==', caseId)
        .orderBy('detectedAt', 'desc')
        .limit(50)
        .get();

      const events = eventsSnapshot.docs.map((doc) => doc.data());

      // Get sanctions
      const sanctionsSnapshot = await db
        .collection('harassment_sanctions')
        .where('caseId', '==', caseId)
        .get();

      const sanctions = sanctionsSnapshot.docs.map(
        (doc) => doc.data() as HarassmentSanction
      );

      // Check if user can appeal any sanctions
      const userSanctions = sanctions.filter((s) => s.userId === userId);
      const canAppeal = userSanctions.some(
        (s) => s.appealable && !s.appealed && s.active
      );

      return {
        case: abuseCase,
        events: events as any,
        sanctions,
        canAppeal,
      };
    } catch (error: any) {
      if (error instanceof HttpsError) throw error;
      logger.error('Error getting abuse case', { caseId, error: error.message });
      throw new HttpsError('internal', 'Failed to get abuse case');
    }
  }
);

// ============================================================================
// APPEAL SANCTION
// ============================================================================

export const appealSanction = onCall<
  { sanctionId: string; appealReason: string; additionalEvidence?: string },
  Promise<{ success: boolean; message: string }>
>(
  {
    region: 'us-central1',
  },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { sanctionId, appealReason, additionalEvidence } = request.data;

    try {
      const sanctionRef = db.collection('harassment_sanctions').doc(sanctionId);
      const sanctionDoc = await sanctionRef.get();

      if (!sanctionDoc.exists) {
        throw new HttpsError('not-found', 'Sanction not found');
      }

      const sanction = sanctionDoc.data() as HarassmentSanction;

      if (sanction.userId !== userId) {
        throw new HttpsError('permission-denied', 'Not your sanction');
      }

      if (!sanction.appealable) {
        throw new HttpsError('failed-precondition', 'This sanction cannot be appealed');
      }

      if (sanction.appealed) {
        throw new HttpsError('failed-precondition', 'Sanction already appealed');
      }

      // Create appeal record
      const appealId = generateId();
      await db.collection('sanction_appeals').doc(appealId).set({
        appealId,
        sanctionId,
        userId,
        caseId: sanction.caseId,
        appealReason,
        additionalEvidence,
        status: 'PENDING_REVIEW',
        createdAt: serverTimestamp(),
      });

      // Mark sanction as appealed
      await sanctionRef.update({
        appealed: true,
        updatedAt: serverTimestamp(),
      });

      logger.info('Sanction appeal submitted', {
        sanctionId,
        userId,
        appealId,
      });

      return {
        success: true,
        message: 'Your appeal has been submitted and will be reviewed',
      };
    } catch (error: any) {
      if (error instanceof HttpsError) throw error;
      logger.error('Error appealing sanction', { sanctionId, error: error.message });
      throw new HttpsError('internal', 'Failed to submit appeal');
    }
  }
);

// ============================================================================
// CREATOR SHIELD SETTINGS
// ============================================================================

export const getCreatorShieldSettings = onCall<
  void,
  Promise<CreatorShieldSettings>
>(
  {
    region: 'us-central1',
  },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
      const settingsDoc = await db
        .collection('creator_shield_settings')
        .doc(userId)
        .get();

      if (!settingsDoc.exists) {
        // Return default settings
        const defaultSettings: CreatorShieldSettings = {
          userId,
          enabled: false,
          autoFilterInsults: true,
          autoHideToxicComments: true,
          toxicCommentThreshold: 70,
          allowOnlyFollowersWhenRaid: true,
          rateLimitDuringSpikes: true,
          blockFreshAccounts: true,
          freshAccountAgeDays: 7,
          autoHideFirstNToxic: 100,
          requireApprovalForNegative: false,
          currentlyUnderRaid: false,
          updatedAt: serverTimestamp() as Timestamp,
        };

        await db
          .collection('creator_shield_settings')
          .doc(userId)
          .set(defaultSettings);

        return defaultSettings;
      }

      return settingsDoc.data() as CreatorShieldSettings;
    } catch (error: any) {
      logger.error('Error getting shield settings', { userId, error: error.message });
      throw new HttpsError('internal', 'Failed to get settings');
    }
  }
);

export const updateCreatorShieldSettings = onCall<
  Partial<CreatorShieldSettings>,
  Promise<{ success: boolean }>
>(
  {
    region: 'us-central1',
  },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const updates = request.data;

    try {
      await db
        .collection('creator_shield_settings')
        .doc(userId)
        .set(
          {
            ...updates,
            userId,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

      logger.info('Creator shield settings updated', { userId, updates });

      return { success: true };
    } catch (error: any) {
      logger.error('Error updating shield settings', {
        userId,
        error: error.message,
      });
      throw new HttpsError('internal', 'Failed to update settings');
    }
  }
);

// ============================================================================
// USER CASE TRACKING
// ============================================================================

export const getUserAbuseCases = onCall<
  void,
  Promise<{
    asVictim: AbuseCase[];
    totalAsVictim: number;
    activeAsVictim: number;
    shieldModeRecommended: boolean;
    activeSanctions: HarassmentSanction[];
  }>
>(
  {
    region: 'us-central1',
  },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
      // Get cases where user is victim
      const victimCasesSnapshot = await db
        .collection('abuse_cases')
        .where('targetUserId', '==', userId)
        .orderBy('detectedAt', 'desc')
        .limit(20)
        .get();

      const asVictim = victimCasesSnapshot.docs.map((doc) => doc.data() as AbuseCase);
      const activeAsVictim = asVictim.filter(
        (c) => c.status === 'DETECTED' || c.status === 'UNDER_REVIEW'
      ).length;

      // Get active sanctions against user
      const sanctionsSnapshot = await db
        .collection('harassment_sanctions')
        .where('userId', '==', userId)
        .where('active', '==', true)
        .get();

      const activeSanctions = sanctionsSnapshot.docs.map(
        (doc) => doc.data() as HarassmentSanction
      );

      const shieldModeRecommended = activeAsVictim >= 2;

      return {
        asVictim,
        totalAsVictim: asVictim.length,
        activeAsVictim,
        shieldModeRecommended,
        activeSanctions,
      };
    } catch (error: any) {
      logger.error('Error getting user abuse cases', {
        userId,
        error: error.message,
      });
      throw new HttpsError('internal', 'Failed to get cases');
    }
  }
);

// ============================================================================
// CHECK RESTRICTIONS
// ============================================================================

export const checkMyRestrictions = onCall<
  void,
  Promise<{
    restricted: boolean;
    canComment: boolean;
    canPost: boolean;
    canMessage: boolean;
    activeSanctions: HarassmentSanction[];
  }>
>(
  {
    region: 'us-central1',
  },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
      const restrictions = await checkHarassmentRestrictions(userId);

      return {
        restricted: restrictions.restricted,
        canComment: restrictions.restrictions.canComment,
        canPost: restrictions.restrictions.canPost,
        canMessage: restrictions.restrictions.canMessage,
        activeSanctions: restrictions.restrictions.activeSanctions,
      };
    } catch (error: any) {
      logger.error('Error checking restrictions', { userId, error: error.message });
      throw new HttpsError('internal', 'Failed to check restrictions');
    }
  }
);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create or get existing abuse case
 */
async function createOrGetAbuseCase(
  targetUserId: string,
  category: AbuseCategory,
  reportedBy: string
): Promise<string> {
  // Look for existing open case
  const existingCasesSnapshot = await db
    .collection('abuse_cases')
    .where('targetUserId', '==', targetUserId)
    .where('abuseCategory', '==', category)
    .where('status', 'in', ['DETECTED', 'UNDER_REVIEW'])
    .limit(1)
    .get();

  if (!existingCasesSnapshot.empty) {
    const existingCase = existingCasesSnapshot.docs[0];
    const caseId = existingCase.id;

    // Update case
    await existingCase.ref.update({
      reportIds: [...(existingCase.data().reportIds || []), reportedBy],
      updatedAt: serverTimestamp(),
    });

    return caseId;
  }

  // Create new case
  const caseId = generateId();
  const newCase: AbuseCase = {
    caseId,
    targetUserId,
    targetType: 'USER',
    abuseCategory: category,
    severity: 50,
    confidence: 0.7,
    status: 'DETECTED',
    contentIds: [],
    reportIds: [reportedBy],
    evidenceSummary: '',
    detectedAt: serverTimestamp() as Timestamp,
    detectionMethod: 'USER_REPORT',
    patterns: [],
    mitigationActions: [],
    updatedAt: serverTimestamp() as Timestamp,
  };

  await db.collection('abuse_cases').doc(caseId).set(newCase);

  return caseId;
}

/**
 * Get or create user case link
 */
async function getOrCreateUserCaseLink(userId: string): Promise<UserAbuseCaseLink> {
  const linkDoc = await db.collection('user_abuse_case_links').doc(userId).get();

  if (linkDoc.exists) {
    return linkDoc.data() as UserAbuseCaseLink;
  }

  // Create new link
  const newLink: UserAbuseCaseLink = {
    userId,
    caseIds: [],
    totalCasesAsVictim: 0,
    activeCasesAsVictim: 0,
    shieldModeRecommended: false,
    totalCasesAsPerpetrator: 0,
    activeSanctions: [],
    lastUpdatedAt: serverTimestamp() as Timestamp,
  };

  await db.collection('user_abuse_case_links').doc(userId).set(newLink);

  return newLink;
}

/**
 * Get collection name for content type
 */
function getCollectionForContentType(contentType: ContentType): string {
  switch (contentType) {
    case 'COMMENT':
      return 'comments';
    case 'POST':
      return 'posts';
    case 'MESSAGE':
      return 'messages';
    case 'STORY':
      return 'stories';
    case 'PROFILE_BIO':
      return 'users';
    default:
      return 'comments';
  }
}

/**
 * Recommend shield mode to victim
 */
async function recommendShieldMode(userId: string): Promise<void> {
  await db.collection('user_abuse_case_links').doc(userId).update({
    shieldModeRecommended: true,
    lastUpdatedAt: serverTimestamp(),
  });

  // Send notification (integrate with notification system)
  logger.info('Shield mode recommended', { userId });
}