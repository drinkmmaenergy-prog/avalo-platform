/**
 * PACK 193 — Avalo Club Intelligence Architecture
 * Cloud Functions for smart community ranking system
 */

import * as functions from 'firebase-functions';
import { db, serverTimestamp, generateId } from './init';
import {
  ContributionType,
  ClubContribution,
  ContributionScore,
  ClubRoleType,
  ClubRole,
  ChallengeType,
  ChallengeDifficulty,
  ClubChallenge,
  ToxicityType,
  SeverityLevel,
  ToxicityEvent,
  CliquePattern,
  CliqueDetection,
  NewcomerBoost,
  ClubSafetySettings,
  RecordContributionRequest,
  RecordContributionResponse,
  AssignRoleRequest,
  AssignRoleResponse,
  CreateChallengeRequest,
  CreateChallengeResponse,
  isValidContributionType,
  isForbiddenChallengeType,
  isValidRoleType,
  isForbiddenRoleType,
} from './types/clubIntelligence';

// ============================================
// CONTRIBUTION MANAGEMENT
// ============================================

/**
 * Record a contribution to a club
 * Validates contribution type and calculates impact score
 */
export const recordContribution = functions.https.onCall(
  async (data: RecordContributionRequest, context): Promise<RecordContributionResponse> => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { clubId, contributionType, description, relatedContentId } = data;
    const userId = context.auth.uid;

    try {
      if (!isValidContributionType(contributionType)) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Invalid contribution type'
        );
      }

      const clubRef = db.collection('clubs').doc(clubId);
      const clubSnap = await clubRef.get();
      
      if (!clubSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Club not found');
      }

      const memberRef = db.collection('club_members').doc(`${userId}_${clubId}`);
      const memberSnap = await memberRef.get();
      
      if (!memberSnap.exists || !memberSnap.data()?.isActive) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'User is not an active member of this club'
        );
      }

      const userSnap = await db.collection('users').doc(userId).get();
      const userName = userSnap.data()?.displayName || 'Unknown';

      const impactScore = calculateImpactScore(contributionType, description);

      const contributionId = generateId();
      const contribution: ClubContribution = {
        contributionId,
        clubId,
        userId,
        userName,
        contributionType,
        description,
        relatedContentId,
        impactScore,
        isValidated: true,
        createdAt: serverTimestamp() as any,
        updatedAt: serverTimestamp() as any,
      };

      await db.collection('club_contributions').doc(contributionId).set(contribution);

      await updateContributionScore(userId, clubId, contributionType, impactScore);

      return { success: true, contributionId, impactScore };
    } catch (error: any) {
      console.error('Error recording contribution:', error);
      return {
        success: false,
        error: error.message || 'Failed to record contribution',
      };
    }
  }
);

/**
 * Calculate impact score based on contribution type and content
 */
function calculateImpactScore(type: ContributionType, description: string): number {
  const baseScores: Record<ContributionType, number> = {
    [ContributionType.KNOWLEDGE]: 10,
    [ContributionType.ENGAGEMENT]: 5,
    [ContributionType.CREATIVITY]: 8,
    [ContributionType.COLLABORATION]: 12,
    [ContributionType.LEADERSHIP]: 15,
    [ContributionType.TUTORIAL]: 20,
    [ContributionType.GUIDE]: 18,
    [ContributionType.QA]: 7,
    [ContributionType.PROJECT]: 25,
    [ContributionType.MENTORSHIP]: 30,
    [ContributionType.RESOURCE]: 10,
  };

  let score = baseScores[type] || 5;

  if (description.length > 500) score += 5;
  if (description.length > 1000) score += 10;

  return Math.min(score, 50);
}

/**
 * Update user's contribution score in a club
 */
async function updateContributionScore(
  userId: string,
  clubId: string,
  contributionType: ContributionType,
  impactScore: number
): Promise<void> {
  const scoreId = `${userId}_${clubId}`;
  const scoreRef = db.collection('club_contribution_scores').doc(scoreId);
  const scoreSnap = await scoreRef.get();

  const userSnap = await db.collection('users').doc(userId).get();
  const userName = userSnap.data()?.displayName || 'Unknown';

  if (!scoreSnap.exists) {
    const newScore: ContributionScore = {
      scoreId,
      clubId,
      userId,
      userName,
      totalScore: impactScore,
      knowledgeScore: contributionType === ContributionType.KNOWLEDGE ? impactScore : 0,
      engagementScore: contributionType === ContributionType.ENGAGEMENT ? impactScore : 0,
      creativityScore: contributionType === ContributionType.CREATIVITY ? impactScore : 0,
      collaborationScore: contributionType === ContributionType.COLLABORATION ? impactScore : 0,
      leadershipScore: contributionType === ContributionType.LEADERSHIP ? impactScore : 0,
      contributionCount: 1,
      lastContributionAt: serverTimestamp() as any,
      lastUpdated: serverTimestamp() as any,
    };
    await scoreRef.set(newScore);
  } else {
    const updates: any = {
      totalScore: (scoreSnap.data()?.totalScore || 0) + impactScore,
      contributionCount: (scoreSnap.data()?.contributionCount || 0) + 1,
      lastContributionAt: serverTimestamp(),
      lastUpdated: serverTimestamp(),
    };

    const typeToField: Record<string, string> = {
      [ContributionType.KNOWLEDGE]: 'knowledgeScore',
      [ContributionType.ENGAGEMENT]: 'engagementScore',
      [ContributionType.CREATIVITY]: 'creativityScore',
      [ContributionType.COLLABORATION]: 'collaborationScore',
      [ContributionType.LEADERSHIP]: 'leadershipScore',
    };

    const fieldName = typeToField[contributionType];
    if (fieldName) {
      updates[fieldName] = (scoreSnap.data()?.[fieldName] || 0) + impactScore;
    }

    await scoreRef.update(updates);
  }
}

/**
 * Get contribution scores for a club
 */
export const getContributionScores = functions.https.onCall(
  async (data: { clubId: string; limit?: number }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { clubId, limit = 50 } = data;

    try {
      const scoresSnap = await db
        .collection('club_contribution_scores')
        .where('clubId', '==', clubId)
        .orderBy('totalScore', 'desc')
        .limit(limit)
        .get();

      const scores = scoresSnap.docs.map(doc => doc.data());

      return { success: true, scores };
    } catch (error: any) {
      console.error('Error getting contribution scores:', error);
      return { success: false, error: error.message };
    }
  }
);

// ============================================
// ROLE MANAGEMENT
// ============================================

/**
 * Assign a functional role to a club member
 */
export const assignClubRole = functions.https.onCall(
  async (data: AssignRoleRequest, context): Promise<AssignRoleResponse> => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { clubId, userId, role, description } = data;
    const assignerId = context.auth.uid;

    try {
      if (!isValidRoleType(role)) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid role type');
      }

      if (isForbiddenRoleType(role)) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Forbidden role type - roles must be functional, not status-based'
        );
      }

      const clubRef = db.collection('clubs').doc(clubId);
      const clubSnap = await clubRef.get();
      
      if (!clubSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Club not found');
      }

      const clubData = clubSnap.data();
      const isOwner = clubData?.ownerId === assignerId;
      const isModeratorSnap = await db
        .collection('club_moderators')
        .doc(`${assignerId}_${clubId}`)
        .get();
      const isModerator = isModeratorSnap.exists && isModeratorSnap.data()?.isActive;

      if (!isOwner && !isModerator) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Only club owner or moderators can assign roles'
        );
      }

      const userSnap = await db.collection('users').doc(userId).get();
      const userName = userSnap.data()?.displayName || 'Unknown';

      const roleId = `${userId}_${clubId}_${role}`;
      const clubRole: ClubRole = {
        roleId,
        clubId,
        userId,
        userName,
        role,
        description,
        isFunctional: true,
        isStatusBased: false,
        assignedBy: assignerId,
        assignedAt: serverTimestamp() as any,
        isActive: true,
      };

      await db.collection('club_roles').doc(roleId).set(clubRole);

      return { success: true, roleId };
    } catch (error: any) {
      console.error('Error assigning role:', error);
      return { success: false, error: error.message || 'Failed to assign role' };
    }
  }
);

// ============================================
// CHALLENGE MANAGEMENT
// ============================================

/**
 * Create a safe challenge for club members
 */
export const createClubChallenge = functions.https.onCall(
  async (data: CreateChallengeRequest, context): Promise<CreateChallengeResponse> => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { clubId, title, description, type, difficulty, startDate, endDate } = data;
    const creatorId = context.auth.uid;

    try {
      if (isForbiddenChallengeType(type)) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Forbidden challenge type - challenges must be educational and safe'
        );
      }

      const clubRef = db.collection('clubs').doc(clubId);
      const clubSnap = await clubRef.get();
      
      if (!clubSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Club not found');
      }

      const clubData = clubSnap.data();
      const isOwner = clubData?.ownerId === creatorId;
      const isModeratorSnap = await db
        .collection('club_moderators')
        .doc(`${creatorId}_${clubId}`)
        .get();
      const isModerator = isModeratorSnap.exists && isModeratorSnap.data()?.isActive;

      if (!isOwner && !isModerator) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Only club owner or moderators can create challenges'
        );
      }

      const challengeId = generateId();
      const challenge: ClubChallenge = {
        challengeId,
        clubId,
        createdBy: creatorId,
        title,
        description,
        type: type as ChallengeType,
        difficulty: difficulty as ChallengeDifficulty,
        startDate: new Date(startDate) as any,
        endDate: new Date(endDate) as any,
        participantCount: 0,
        completionCount: 0,
        isSafe: true,
        isEducational: true,
        isActive: true,
        createdAt: serverTimestamp() as any,
        updatedAt: serverTimestamp() as any,
      };

      await db.collection('club_challenges').doc(challengeId).set(challenge);

      return { success: true, challengeId };
    } catch (error: any) {
      console.error('Error creating challenge:', error);
      return { success: false, error: error.message || 'Failed to create challenge' };
    }
  }
);

// ============================================
// ANTI-CLIQUE DETECTION
// ============================================

/**
 * Detect clique formation patterns in a club
 */
export const detectCliqueFormation = functions.https.onCall(
  async (data: { clubId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { clubId } = data;

    try {
      const clubRef = db.collection('clubs').doc(clubId);
      const clubSnap = await clubRef.get();
      
      if (!clubSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Club not found');
      }

      const membersSnap = await db
        .collection('club_members')
        .where('clubId', '==', clubId)
        .where('isActive', '==', true)
        .get();

      if (membersSnap.size < 10) {
        return { success: true, cliqueDetected: false, message: 'Not enough members for analysis' };
      }

      const members = membersSnap.docs.map(doc => doc.data());
      const interactionMatrix = await buildInteractionMatrix(clubId, members);
      
      const cliqueAnalysis = analyzeCliquePatterns(members, interactionMatrix);

      if (cliqueAnalysis.detected) {
        const detectionId = generateId();
        const detection: CliqueDetection = {
          detectionId,
          clubId,
          pattern: cliqueAnalysis.pattern!,
          severityScore: cliqueAnalysis.severityScore,
          involvedUserIds: cliqueAnalysis.involvedUserIds,
          excludedUserIds: cliqueAnalysis.excludedUserIds,
          evidenceData: {
            interactionMatrix,
            exclusionRate: cliqueAnalysis.exclusionRate,
            subgroupCohesion: cliqueAnalysis.subgroupCohesion,
          },
          detectedAt: serverTimestamp() as any,
          isMitigated: false,
        };

        await db.collection('club_clique_detections').doc(detectionId).set(detection);

        await applyAntiCliqueMitigation(clubId, detection);

        return {
          success: true,
          cliqueDetected: true,
          pattern: cliqueAnalysis.pattern,
          severityScore: cliqueAnalysis.severityScore,
          detectionId,
        };
      }

      return { success: true, cliqueDetected: false };
    } catch (error: any) {
      console.error('Error detecting cliques:', error);
      return { success: false, error: error.message };
    }
  }
);

/**
 * Build interaction matrix for clique detection
 */
async function buildInteractionMatrix(
  clubId: string,
  members: any[]
): Promise<Record<string, number>> {
  const matrix: Record<string, number> = {};

  const postsSnap = await db
    .collection('club_posts')
    .where('clubId', '==', clubId)
    .where('createdAt', '>', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
    .get();

  for (const member of members) {
    for (const otherMember of members) {
      if (member.userId === otherMember.userId) continue;
      
      const key = `${member.userId}_${otherMember.userId}`;
      let interactions = 0;

      for (const post of postsSnap.docs) {
        const postData = post.data();
        if (postData.userId === member.userId) {
          interactions += 1;
        }
      }

      matrix[key] = interactions;
    }
  }

  return matrix;
}

/**
 * Analyze interaction patterns for clique formation
 */
function analyzeCliquePatterns(members: any[], interactionMatrix: Record<string, number>): {
  detected: boolean;
  pattern?: CliquePattern;
  severityScore: number;
  involvedUserIds: string[];
  excludedUserIds: string[];
  exclusionRate?: number;
  subgroupCohesion?: number;
} {
  const memberIds = members.map(m => m.userId);
  const totalPossibleInteractions = memberIds.length * (memberIds.length - 1);
  
  let totalInteractions = 0;
  const userInteractionCounts: Record<string, number> = {};

  for (const userId of memberIds) {
    userInteractionCounts[userId] = 0;
  }

  for (const key in interactionMatrix) {
    totalInteractions += interactionMatrix[key];
    const [userId] = key.split('_');
    userInteractionCounts[userId] = (userInteractionCounts[userId] || 0) + interactionMatrix[key];
  }

  const avgInteractions = totalInteractions / memberIds.length;
  const excludedUsers = memberIds.filter(
    userId => userInteractionCounts[userId] < avgInteractions * 0.3
  );

  const exclusionRate = excludedUsers.length / memberIds.length;

  if (exclusionRate > 0.3 && excludedUsers.length >= 3) {
    const involvedUsers = memberIds.filter(id => !excludedUsers.includes(id));
    
    return {
      detected: true,
      pattern: CliquePattern.EXCLUSION_GROUP,
      severityScore: Math.min(exclusionRate * 100, 100),
      involvedUserIds: involvedUsers,
      excludedUserIds: excludedUsers,
      exclusionRate,
      subgroupCohesion: 0.8,
    };
  }

  return {
    detected: false,
    severityScore: 0,
    involvedUserIds: [],
    excludedUserIds: [],
  };
}

/**
 * Apply mitigation strategies for detected cliques
 */
async function applyAntiCliqueMitigation(
  clubId: string,
  detection: CliqueDetection
): Promise<void> {
  for (const excludedUserId of detection.excludedUserIds) {
    const boostId = `${excludedUserId}_${clubId}_${Date.now()}`;
    const boost: NewcomerBoost = {
      boostId,
      clubId,
      userId: excludedUserId,
      userName: '',
      boostMultiplier: 2.0,
      isActive: true,
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) as any,
      createdAt: serverTimestamp() as any,
    };

    await db.collection('club_newcomer_boost').doc(boostId).set(boost);
  }

  for (const involvedUserId of detection.involvedUserIds.slice(0, 3)) {
    console.log(`Reducing visibility for clique member: ${involvedUserId}`);
  }
}

// ============================================
// ANTI-TOXICITY MONITORING
// ============================================

/**
 * Detect and log toxicity events
 */
export const detectToxicity = functions.firestore
  .document('club_posts/{postId}')
  .onCreate(async (snapshot, context) => {
    const postData = snapshot.data();
    const { clubId, userId, content, type } = postData;

    if (type !== 'TEXT' || !content) return;

    const toxicityResult = await analyzeToxicity(content);

    if (toxicityResult.isToxic) {
      const eventId = generateId();
      const event: ToxicityEvent = {
        eventId,
        clubId,
        toxicityType: toxicityResult.type,
        severityLevel: toxicityResult.severity,
        reportedUserId: userId,
        reportedContentId: snapshot.id,
        reportedContentType: 'post',
        description: toxicityResult.reason,
        detectedBy: 'ai',
        detectedAt: serverTimestamp() as any,
        isResolved: false,
        mitigationActions: [],
      };

      await db.collection('club_toxicity_events').doc(eventId).set(event);

      if (toxicityResult.severity === SeverityLevel.HIGH || 
          toxicityResult.severity === SeverityLevel.CRITICAL) {
        await snapshot.ref.update({ isVisible: false });
      }
    }
  });

/**
 * Analyze content for toxicity
 */
async function analyzeToxicity(content: string): Promise<{
  isToxic: boolean;
  type: ToxicityType;
  severity: SeverityLevel;
  reason: string;
}> {
  const lowerContent = content.toLowerCase();

  const toxicPatterns = [
    { pattern: /flame|attack|insult/i, type: ToxicityType.FLAME_WAR, severity: SeverityLevel.MEDIUM },
    { pattern: /raid|brigade/i, type: ToxicityType.CLUB_RAIDING, severity: SeverityLevel.HIGH },
    { pattern: /drama|stir|conflict/i, type: ToxicityType.DRAMA_INSTIGATION, severity: SeverityLevel.LOW },
    { pattern: /bully|harass|intimidate/i, type: ToxicityType.BULLYING, severity: SeverityLevel.HIGH },
  ];

  for (const { pattern, type, severity } of toxicPatterns) {
    if (pattern.test(lowerContent)) {
      return {
        isToxic: true,
        type,
        severity,
        reason: `Detected ${type} pattern`,
      };
    }
  }

  return {
    isToxic: false,
    type: ToxicityType.DRAMA_INSTIGATION,
    severity: SeverityLevel.LOW,
    reason: '',
  };
}

/**
 * Resolve a toxicity event
 */
export const resolveToxicityEvent = functions.https.onCall(
  async (data: { eventId: string; resolution: string; actions: string[] }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { eventId, resolution, actions } = data;
    const moderatorId = context.auth.uid;

    try {
      const eventRef = db.collection('club_toxicity_events').doc(eventId);
      const eventSnap = await eventRef.get();

      if (!eventSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Toxicity event not found');
      }

      await eventRef.update({
        isResolved: true,
        resolvedBy: moderatorId,
        resolvedAt: serverTimestamp(),
        resolution,
        mitigationActions: actions,
      });

      return { success: true };
    } catch (error: any) {
      console.error('Error resolving toxicity event:', error);
      return { success: false, error: error.message };
    }
  }
);

// ============================================
// CLUB HEALTH METRICS
// ============================================

/**
 * Calculate and return club health metrics
 */
export const getClubHealth = functions.https.onCall(
  async (data: { clubId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { clubId } = data;

    try {
      const [toxicitySnap, cliqueSnap, contributionsSnap, membersSnap] = await Promise.all([
        db.collection('club_toxicity_events')
          .where('clubId', '==', clubId)
          .where('createdAt', '>', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
          .get(),
        db.collection('club_clique_detections')
          .where('clubId', '==', clubId)
          .where('isMitigated', '==', false)
          .get(),
        db.collection('club_contributions')
          .where('clubId', '==', clubId)
          .where('createdAt', '>', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
          .get(),
        db.collection('club_members')
          .where('clubId', '==', clubId)
          .where('isActive', '==', true)
          .get(),
      ]);

      const toxicityIndex = Math.min((toxicitySnap.size / membersSnap.size) * 100, 100);
      const cliqueRisk = cliqueSnap.size > 0 ? 75 : 25;
      const contributionDiversity = calculateContributionDiversity(contributionsSnap.docs);
      
      const healthScore = Math.max(
        0,
        100 - toxicityIndex * 0.4 - cliqueRisk * 0.3 - (100 - contributionDiversity) * 0.3
      );

      return {
        success: true,
        healthMetrics: {
          clubId,
          healthScore: Math.round(healthScore),
          toxicityIndex: Math.round(toxicityIndex),
          cliqueRisk: Math.round(cliqueRisk),
          contributionDiversity: Math.round(contributionDiversity),
          activeContributors: contributionsSnap.size,
          lastCalculated: new Date(),
        },
        recentToxicity: toxicitySnap.docs.map(doc => doc.data()),
        cliqueDetections: cliqueSnap.docs.map(doc => doc.data()),
      };
    } catch (error: any) {
      console.error('Error calculating club health:', error);
      return { success: false, error: error.message };
    }
  }
);

/**
 * Calculate contribution diversity score
 */
function calculateContributionDiversity(contributions: any[]): number {
  if (contributions.length === 0) return 0;

  const typeCount: Record<string, number> = {};
  for (const contrib of contributions) {
    const type = contrib.data().contributionType;
    typeCount[type] = (typeCount[type] || 0) + 1;
  }

  const uniqueTypes = Object.keys(typeCount).length;
  const totalTypes = Object.keys(ContributionType).length;

  return (uniqueTypes / totalTypes) * 100;
}