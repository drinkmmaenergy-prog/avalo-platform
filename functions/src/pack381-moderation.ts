/**
 * PACK 381 — Regional Expansion Engine
 * Regional Content Moderation System
 * 
 * Manages region-specific content rules and moderation policies
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

export interface RegionalContentRules {
  regionId: string;
  countryCode: string;
  
  // Content Restrictions
  prohibitedContent: {
    adultContent: {
      allowed: boolean;
      ageRestriction: number;
      requiresVerification: boolean;
      blurByDefault: boolean;
    };
    profanity: {
      level: 'none' | 'mild' | 'moderate' | 'strict';
      autoFilter: boolean;
      bannedWords: string[];
    };
    violence: {
      allowed: boolean;
      level: 'none' | 'mild' | 'moderate' | 'strict';
    };
    nudity: {
      allowed: boolean;
      partialAllowed: boolean;
      artisticException: boolean;
    };
    drugs: {
      allowed: boolean;
      medicalException: boolean;
    };
    gambling: {
      allowed: boolean;
      ageRestriction: number;
    };
    political: {
      allowed: boolean;
      requiresDisclaimer: boolean;
      electionPeriodRestrictions: boolean;
    };
    religious: {
      allowed: boolean;
      sensitivities: string[];
    };
  };
  
  // Profile Requirements
  profile: {
    photoRequired: boolean;
    realPhotosOnly: boolean;
    faceVisible: boolean;
    minClothingStandard: 'none' | 'casual' | 'modest' | 'conservative';
    bannedSymbols: string[];
    nameVerification: boolean;
  };
  
  // Communication Rules
  communication: {
    autoplayVideos: boolean;
    autoplayAudio: boolean;
    voiceCallsAllowed: boolean;
    videoCallsAllowed: boolean;
    giftingAllowed: boolean;
    maxMessageLength: number;
    linksSharingAllowed: boolean;
    externalContactAllowed: boolean;
  };
  
  // Cultural Sensitivities
  cultural: {
    sensitivities: Array<{
      topic: string;
      description: string;
      autoFlag: boolean;
      requiresReview: boolean;
    }>;
    holidays: Array<{
      date: string;
      name: string;
      restrictedContent: string[];
    }>;
    taboos: string[];
    preferredGreetings: string[];
  };
  
  // Moderation Settings
  moderation: {
    aiLevel: 'strict' | 'moderate' | 'lenient';
    humanReviewRequired: boolean;
    humanReviewPercentage: number;
    autoFlagKeywords: string[];
    autoBlockKeywords: string[];
    appealProcess: boolean;
    appealTimeLimit: number; // hours
  };
  
  // Age Verification
  ageGating: {
    required: boolean;
    minimumAge: number;
    verificationMethod: ('id' | 'credit_card' | 'phone' | 'email' | 'facial')[];
    gracePeriod: number; // days
    restrictedContent: string[];
  };
  
  metadata: {
    createdAt: string;
    updatedAt: string;
    updatedBy: string;
    reviewedBy?: string;
    lastReviewed?: string;
  };
}

/**
 * Admin: Update regional content rules
 */
export const pack381_updateContentRules = functions.https.onCall(
  async (data: Partial<RegionalContentRules>, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    const userData = userDoc.data();
    
    if (userData?.role !== 'admin' && userData?.role !== 'super_admin') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Admin access required'
      );
    }

    const { regionId } = data;
    if (!regionId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'regionId is required'
      );
    }

    const rulesRef = db.collection('regionalContentRules').doc(regionId);
    const existingRules = await rulesRef.get();

    const now = new Date().toISOString();
    const rulesData = {
      ...data,
      metadata: {
        ...data.metadata,
        updatedAt: now,
        updatedBy: context.auth.uid,
        ...(existingRules.exists ? {} : { createdAt: now }),
      },
    };

    await rulesRef.set(rulesData, { merge: true });

    await db.collection('auditLogs').add({
      type: 'content_rules_update',
      userId: context.auth.uid,
      regionId,
      changes: data,
      timestamp: now,
    });

    return {
      success: true,
      regionId,
      message: 'Regional content rules updated',
    };
  }
);

/**
 * Apply regional moderation to content
 */
export const pack381_applyRegionalModeration = functions.https.onCall(
  async (data: {
    contentType: 'profile' | 'message' | 'photo' | 'video' | 'bio';
    content: string | any;
    regionId?: string;
    userId?: string;
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    const { contentType, content, regionId: providedRegionId, userId: targetUserId } = data;
    const userId = targetUserId || context.auth.uid;

    // Get user's region
    let regionId = providedRegionId;
    if (!regionId) {
      const userDoc = await db.collection('users').doc(userId).get();
      const userData = userDoc.data();
      regionId = userData?.detectedRegion || 'GLOBAL';
    }

    // Get regional content rules
    const rulesDoc = await db.collection('regionalContentRules').doc(regionId).get();
    
    if (!rulesDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Regional content rules not found'
      );
    }

    const rules = rulesDoc.data() as RegionalContentRules;

    // Moderation result
    let approved = true;
    const flags: string[] = [];
    const violations: string[] = [];
    let requiresReview = false;
    let autoBlocked = false;

    // Check content based on type
    if (contentType === 'profile' || contentType === 'bio' || contentType === 'message') {
      const textContent = typeof content === 'string' ? content.toLowerCase() : '';
      
      // Check profanity
      if (rules.prohibitedContent.profanity.autoFilter) {
        rules.prohibitedContent.profanity.bannedWords.forEach(word => {
          if (textContent.includes(word.toLowerCase())) {
            violations.push(`Profanity detected: ${word}`);
            approved = false;
          }
        });
      }
      
      // Check auto-block keywords
      rules.moderation.autoBlockKeywords.forEach(keyword => {
        if (textContent.includes(keyword.toLowerCase())) {
          violations.push(`Blocked keyword: ${keyword}`);
          autoBlocked = true;
          approved = false;
        }
      });
      
      // Check auto-flag keywords
      rules.moderation.autoFlagKeywords.forEach(keyword => {
        if (textContent.includes(keyword.toLowerCase())) {
          flags.push(`Flagged keyword: ${keyword}`);
          requiresReview = true;
        }
      });
      
      // Check cultural sensitivities
      rules.cultural.sensitivities.forEach(sensitivity => {
        if (textContent.includes(sensitivity.topic.toLowerCase())) {
          flags.push(`Cultural sensitivity: ${sensitivity.topic}`);
          if (sensitivity.autoFlag) {
            requiresReview = true;
          }
        }
      });
    }

    // Profile-specific checks
    if (contentType === 'profile') {
      if (rules.profile.photoRequired && !content.photoUrl) {
        violations.push('Profile photo is required in this region');
        approved = false;
      }
    }

    // Determine final decision
    let decision: 'approved' | 'flagged' | 'rejected';
    
    if (autoBlocked) {
      decision = 'rejected';
    } else if (requiresReview || violations.length > 0) {
      decision = 'flagged';
      approved = false;
    } else if (flags.length > 0) {
      decision = 'flagged';
    } else {
      decision = 'approved';
    }

    // If human review required
    if (rules.moderation.humanReviewRequired || requiresReview) {
      const reviewNeeded = Math.random() * 100 < rules.moderation.humanReviewPercentage || requiresReview;
      
      if (reviewNeeded) {
        // Create moderation task
        await db.collection('moderationQueue').add({
          userId,
          regionId,
          contentType,
          content,
          flags,
          violations,
          autoDecision: decision,
          status: 'pending',
          priority: autoBlocked ? 'high' : requiresReview ? 'medium' : 'low',
          createdAt: new Date().toISOString(),
        });
      }
    }

    // Log moderation decision
    await db.collection('moderationLogs').add({
      userId,
      regionId,
      contentType,
      decision,
      flags,
      violations,
      autoBlocked,
      requiresReview,
      timestamp: new Date().toISOString(),
    });

    return {
      approved,
      decision,
      flags,
      violations,
      requiresReview,
      autoBlocked,
      regionId,
      appealAllowed: rules.moderation.appealProcess,
    };
  }
);

/**
 * Check if specific content is allowed in region
 */
export const pack381_checkContentAllowed = functions.https.onCall(
  async (data: {
    contentType: string;
    regionId?: string;
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    const { contentType, regionId: providedRegionId } = data;

    // Get user's region
    let regionId = providedRegionId;
    if (!regionId) {
      const userDoc = await db.collection('users').doc(context.auth.uid).get();
      const userData = userDoc.data();
      regionId = userData?.detectedRegion || 'GLOBAL';
    }

    const rulesDoc = await db.collection('regionalContentRules').doc(regionId).get();
    
    if (!rulesDoc.exists) {
      return {
        allowed: true,
        reason: 'No specific rules for region',
      };
    }

    const rules = rulesDoc.data() as RegionalContentRules;

    let allowed = true;
    let reason = null;
    let restrictions: any = {};

    switch (contentType) {
      case 'adult':
        allowed = rules.prohibitedContent.adultContent.allowed;
        reason = allowed ? null : 'Adult content not allowed in this region';
        restrictions = {
          ageRestriction: rules.prohibitedContent.adultContent.ageRestriction,
          requiresVerification: rules.prohibitedContent.adultContent.requiresVerification,
        };
        break;

      case 'nudity':
        allowed = rules.prohibitedContent.nudity.allowed;
        reason = allowed ? null : 'Nudity not allowed in this region';
        restrictions = {
          partialAllowed: rules.prohibitedContent.nudity.partialAllowed,
          artisticException: rules.prohibitedContent.nudity.artisticException,
        };
        break;

      case 'gambling':
        allowed = rules.prohibitedContent.gambling.allowed;
        reason = allowed ? null : 'Gambling content not allowed in this region';
        restrictions = {
          ageRestriction: rules.prohibitedContent.gambling.ageRestriction,
        };
        break;

      case 'political':
        allowed = rules.prohibitedContent.political.allowed;
        reason = allowed ? null : 'Political content not allowed in this region';
        restrictions = {
          requiresDisclaimer: rules.prohibitedContent.political.requiresDisclaimer,
          electionRestrictions: rules.prohibitedContent.political.electionPeriodRestrictions,
        };
        break;

      case 'voice_call':
        allowed = rules.communication.voiceCallsAllowed;
        reason = allowed ? null : 'Voice calls not available in this region';
        break;

      case 'video_call':
        allowed = rules.communication.videoCallsAllowed;
        reason = allowed ? null : 'Video calls not available in this region';
        break;

      case 'gifting':
        allowed = rules.communication.giftingAllowed;
        reason = allowed ? null : 'Gifting not available in this region';
        break;

      case 'external_contact':
        allowed = rules.communication.externalContactAllowed;
        reason = allowed ? null : 'Sharing external contact info not allowed';
        break;
    }

    return {
      allowed,
      reason,
      restrictions,
      regionId,
    };
  }
);

/**
 * Get moderation queue for moderators
 */
export const pack381_getModerationQueue = functions.https.onCall(
  async (data: {
    regionId?: string;
    priority?: 'low' | 'medium' | 'high';
    limit?: number;
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    const userData = userDoc.data();
    
    if (userData?.role !== 'moderator' && userData?.role !== 'admin') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Moderator access required'
      );
    }

    const { regionId, priority, limit = 50 } = data;

    let query = db.collection('moderationQueue').where('status', '==', 'pending');

    if (regionId) {
      query = query.where('regionId', '==', regionId);
    }

    if (priority) {
      query = query.where('priority', '==', priority);
    }

    query = query.orderBy('createdAt', 'desc').limit(limit);

    const snapshot = await query.get();

    const queue = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return { queue };
  }
);

/**
 * Moderator: Review flagged content
 */
export const pack381_reviewContent = functions.https.onCall(
  async (data: {
    queueId: string;
    decision: 'approve' | 'reject' | 'escalate';
    reason?: string;
    notes?: string;
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    const userData = userDoc.data();
    
    if (userData?.role !== 'moderator' && userData?.role !== 'admin') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Moderator access required'
      );
    }

    const { queueId, decision, reason, notes } = data;

    const queueRef = db.collection('moderationQueue').doc(queueId);
    const queueDoc = await queueRef.get();

    if (!queueDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Moderation task not found'
      );
    }

    const now = new Date().toISOString();

    await queueRef.update({
      status: decision === 'escalate' ? 'escalated' : 'reviewed',
      decision,
      reviewedBy: context.auth.uid,
      reviewedAt: now,
      reason: reason || null,
      notes: notes || null,
    });

    // Log the review
    await db.collection('moderationReviews').add({
      queueId,
      moderatorId: context.auth.uid,
      decision,
      reason,
      notes,
      timestamp: now,
    });

    return {
      success: true,
      queueId,
      decision,
    };
  }
);

/**
 * User: Appeal moderation decision
 */
export const pack381_appealDecision = functions.https.onCall(
  async (data: {
    contentId: string;
    reason: string;
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    const userId = context.auth.uid;
    const { contentId, reason } = data;

    // Get user's region
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    const regionId = userData?.detectedRegion || 'GLOBAL';

    // Check if appeals are allowed
    const rulesDoc = await db.collection('regionalContentRules').doc(regionId).get();
    
    if (!rulesDoc.exists) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Region rules not found'
      );
    }

    const rules = rulesDoc.data() as RegionalContentRules;

    if (!rules.moderation.appealProcess) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Appeals not available in your region'
      );
    }

    // Check if appeal is within time limit
    const moderationLogSnapshot = await db
      .collection('moderationLogs')
      .where('userId', '==', userId)
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();

    if (!moderationLogSnapshot.empty) {
      const lastModeration = moderationLogSnapshot.docs[0].data();
      const hoursSinceModeration = 
        (Date.now() - new Date(lastModeration.timestamp).getTime()) / (1000 * 60 * 60);

      if (hoursSinceModeration > rules.moderation.appealTimeLimit) {
        throw new functions.https.HttpsError(
          'deadline-exceeded',
          `Appeal must be submitted within ${rules.moderation.appealTimeLimit} hours`
        );
      }
    }

    // Create appeal
    const appealRef = await db.collection('moderationAppeals').add({
      userId,
      regionId,
      contentId,
      reason,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });

    return {
      success: true,
      appealId: appealRef.id,
      message: 'Appeal submitted successfully',
    };
  }
);

/**
 * Get regional moderation statistics
 */
export const pack381_getModerationStats = functions.https.onCall(
  async (data: { regionId: string; days?: number }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    const userData = userDoc.data();
    
    if (userData?.role !== 'admin') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Admin access required'
      );
    }

    const { regionId, days = 30 } = data;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Get moderation logs
    const logsSnapshot = await db
      .collection('moderationLogs')
      .where('regionId', '==', regionId)
      .where('timestamp', '>=', cutoffDate.toISOString())
      .get();

    const stats = {
      total: logsSnapshot.size,
      byDecision: { approved: 0, flagged: 0, rejected: 0 },
      byContentType: {} as Record<string, number>,
      autoBlocked: 0,
      requiresReview: 0,
      commonViolations: {} as Record<string, number>,
      commonFlags: {} as Record<string, number>,
    };

    logsSnapshot.docs.forEach(doc => {
      const log = doc.data();
      
      stats.byDecision[log.decision as keyof typeof stats.byDecision]++;
      stats.byContentType[log.contentType] = (stats.byContentType[log.contentType] || 0) + 1;
      
      if (log.autoBlocked) stats.autoBlocked++;
      if (log.requiresReview) stats.requiresReview++;
      
      log.violations?.forEach((violation: string) => {
        stats.commonViolations[violation] = (stats.commonViolations[violation] || 0) + 1;
      });
      
      log.flags?.forEach((flag: string) => {
        stats.commonFlags[flag] = (stats.commonFlags[flag] || 0) + 1;
      });
    });

    return {
      regionId,
      period: `${days} days`,
      ...stats,
    };
  }
);
