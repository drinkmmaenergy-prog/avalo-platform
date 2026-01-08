/**
 * PACK 179 — Reputation & Risk Transparency Center
 * Cloud Functions for Reputation Management
 * 
 * Public Trust Without Shaming · Positive Achievements Only · Zero Punitive Public Labels
 */

import * as functions from 'firebase-functions';
import { db, serverTimestamp, generateId } from './init';
import {
  BadgeType,
  AchievementCategory,
  ReputationBadge,
  AchievementMilestone,
  ReputationDisplaySettings,
  PublicReputation,
  ReputationAuditLog,
  AssignBadgeRequest,
  AssignBadgeResponse,
  RemoveBadgeRequest,
  RemoveBadgeResponse,
  TrackMilestoneRequest,
  TrackMilestoneResponse,
  GetPublicReputationRequest,
  GetPublicReputationResponse,
  UpdateDisplaySettingsRequest,
  UpdateDisplaySettingsResponse,
  BADGE_DEFINITIONS,
  FORBIDDEN_BADGE_FIELDS
} from './types/reputation.types';

const COLLECTIONS = {
  REPUTATION_BADGES: 'reputation_badges',
  ACHIEVEMENT_MILESTONES: 'achievement_milestones',
  REPUTATION_DISPLAY_SETTINGS: 'reputation_display_settings',
  PUBLIC_REPUTATION: 'public_reputation',
  REPUTATION_AUDIT_LOG: 'reputation_audit_log',
  SAFETY_SCORES: 'safety_scores',
  SAFETY_EVENTS: 'safety_events'
};

/**
 * Validate that data doesn't contain forbidden fields
 */
function validateNoForbiddenFields(data: any): boolean {
  const keys = Object.keys(data || {});
  return !keys.some(key => FORBIDDEN_BADGE_FIELDS.includes(key));
}

/**
 * Log reputation action to audit trail
 */
async function logReputationAction(
  userId: string,
  action: ReputationAuditLog['action'],
  details: Record<string, any>,
  performedBy: string
): Promise<void> {
  const logId = generateId();
  await db.collection(COLLECTIONS.REPUTATION_AUDIT_LOG).doc(logId).set({
    logId,
    userId,
    action,
    details,
    performedBy,
    timestamp: serverTimestamp()
  });
}

/**
 * Assign a reputation badge to a user
 */
export const assignReputationBadge = functions.https.onCall(
  async (data: AssignBadgeRequest, context): Promise<AssignBadgeResponse> => {
    try {
      if (!context.auth) {
        return { success: false, error: 'Unauthorized' };
      }

      const { userId, badgeType, metadata } = data;

      if (!userId || !badgeType) {
        return { success: false, error: 'Missing required fields' };
      }

      if (!Object.values(BadgeType).includes(badgeType)) {
        return { success: false, error: 'Invalid badge type' };
      }

      if (metadata && !validateNoForbiddenFields(metadata)) {
        return { success: false, error: 'Metadata contains forbidden fields' };
      }

      const badgeDefinition = BADGE_DEFINITIONS[badgeType];
      const badgeId = generateId();

      const badge: Omit<ReputationBadge, 'earnedAt' | 'createdAt' | 'updatedAt'> = {
        badgeId,
        userId,
        badgeType,
        badgeName: badgeDefinition.name,
        badgeDescription: badgeDefinition.description,
        badgeIcon: badgeDefinition.icon,
        verified: true,
        metadata: metadata || {}
      };

      await db.collection(COLLECTIONS.REPUTATION_BADGES).doc(badgeId).set({
        ...badge,
        earnedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      await logReputationAction(
        userId,
        'badge_assigned',
        { badgeId, badgeType },
        context.auth.uid
      );

      await updatePublicReputation(userId);

      return { success: true, badgeId };
    } catch (error: any) {
      console.error('Error assigning badge:', error);
      return { success: false, error: error.message };
    }
  }
);

/**
 * Remove a reputation badge (fraud cases only)
 */
export const removeReputationBadge = functions.https.onCall(
  async (data: RemoveBadgeRequest, context): Promise<RemoveBadgeResponse> => {
    try {
      if (!context.auth) {
        return { success: false, error: 'Unauthorized' };
      }

      const adminDoc = await db.collection('users').doc(context.auth.uid).get();
      const userRole = adminDoc.data()?.role;

      if (userRole !== 'admin' && userRole !== 'moderator') {
        return { success: false, error: 'Insufficient permissions' };
      }

      const { userId, badgeId, reason } = data;

      if (!userId || !badgeId || !reason) {
        return { success: false, error: 'Missing required fields' };
      }

      const badgeDoc = await db.collection(COLLECTIONS.REPUTATION_BADGES).doc(badgeId).get();

      if (!badgeDoc.exists) {
        return { success: false, error: 'Badge not found' };
      }

      if (badgeDoc.data()?.userId !== userId) {
        return { success: false, error: 'Badge does not belong to this user' };
      }

      await db.collection(COLLECTIONS.REPUTATION_BADGES).doc(badgeId).delete();

      await logReputationAction(
        userId,
        'badge_removed',
        { badgeId, reason },
        context.auth.uid
      );

      await updatePublicReputation(userId);

      return { success: true };
    } catch (error: any) {
      console.error('Error removing badge:', error);
      return { success: false, error: error.message };
    }
  }
);

/**
 * Track an achievement milestone
 */
export const trackAchievementMilestone = functions.https.onCall(
  async (data: TrackMilestoneRequest, context): Promise<TrackMilestoneResponse> => {
    try {
      if (!context.auth) {
        return { success: false, error: 'Unauthorized' };
      }

      const { userId, category, title, description, isPublic, proof } = data;

      if (!userId || !category || !title || !description) {
        return { success: false, error: 'Missing required fields' };
      }

      if (context.auth.uid !== userId) {
        return { success: false, error: 'Cannot create milestone for another user' };
      }

      if (!Object.values(AchievementCategory).includes(category)) {
        return { success: false, error: 'Invalid achievement category' };
      }

      const milestoneId = generateId();

      const milestone: Omit<AchievementMilestone, 'achievedAt' | 'createdAt' | 'updatedAt'> = {
        milestoneId,
        userId,
        category,
        title,
        description,
        verified: false,
        isPublic: isPublic ?? true,
        proof,
        metadata: {}
      };

      await db.collection(COLLECTIONS.ACHIEVEMENT_MILESTONES).doc(milestoneId).set({
        ...milestone,
        achievedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      await logReputationAction(
        userId,
        'milestone_added',
        { milestoneId, category, title },
        context.auth.uid
      );

      await updatePublicReputation(userId);

      return { success: true, milestoneId };
    } catch (error: any) {
      console.error('Error tracking milestone:', error);
      return { success: false, error: error.message };
    }
  }
);

/**
 * Get public reputation for a user
 */
export const getPublicReputation = functions.https.onCall(
  async (data: GetPublicReputationRequest, context): Promise<GetPublicReputationResponse> => {
    try {
      if (!context.auth) {
        return { success: false, error: 'Unauthorized' };
      }

      const { userId } = data;

      if (!userId) {
        return { success: false, error: 'Missing userId' };
      }

      const reputationDoc = await db.collection(COLLECTIONS.PUBLIC_REPUTATION).doc(userId).get();

      if (!reputationDoc.exists) {
        await updatePublicReputation(userId);
        const updatedDoc = await db.collection(COLLECTIONS.PUBLIC_REPUTATION).doc(userId).get();
        
        if (!updatedDoc.exists) {
          return { success: false, error: 'User reputation not found' };
        }

        return { success: true, reputation: updatedDoc.data() as PublicReputation };
      }

      const reputation = reputationDoc.data() as PublicReputation;

      if (!validateNoForbiddenFields(reputation)) {
        console.error('Public reputation contains forbidden fields for user:', userId);
        return { success: false, error: 'Data validation failed' };
      }

      return { success: true, reputation };
    } catch (error: any) {
      console.error('Error getting public reputation:', error);
      return { success: false, error: error.message };
    }
  }
);

/**
 * Update reputation display settings
 */
export const updateReputationDisplaySettings = functions.https.onCall(
  async (data: UpdateDisplaySettingsRequest, context): Promise<UpdateDisplaySettingsResponse> => {
    try {
      if (!context.auth) {
        return { success: false, error: 'Unauthorized' };
      }

      const { userId, settings } = data;

      if (!userId || !settings) {
        return { success: false, error: 'Missing required fields' };
      }

      if (context.auth.uid !== userId) {
        return { success: false, error: 'Cannot update settings for another user' };
      }

      if (!validateNoForbiddenFields(settings)) {
        return { success: false, error: 'Settings contain forbidden fields' };
      }

      const settingsRef = db.collection(COLLECTIONS.REPUTATION_DISPLAY_SETTINGS).doc(userId);
      const settingsDoc = await settingsRef.get();

      if (settingsDoc.exists) {
        await settingsRef.update({
          ...settings,
          updatedAt: serverTimestamp()
        });
      } else {
        await settingsRef.set({
          userId,
          displayBadges: settings.displayBadges ?? true,
          displayMilestones: settings.displayMilestones ?? true,
          displayAchievements: settings.displayAchievements ?? true,
          badgeOrder: settings.badgeOrder ?? [],
          privacyLevel: settings.privacyLevel ?? 'public',
          highlightedBadges: settings.highlightedBadges ?? [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      return { success: true };
    } catch (error: any) {
      console.error('Error updating display settings:', error);
      return { success: false, error: error.message };
    }
  }
);

/**
 * Update aggregated public reputation data
 */
async function updatePublicReputation(userId: string): Promise<void> {
  try {
    const [badgesSnapshot, milestonesSnapshot, userDoc] = await Promise.all([
      db.collection(COLLECTIONS.REPUTATION_BADGES)
        .where('userId', '==', userId)
        .orderBy('earnedAt', 'desc')
        .get(),
      db.collection(COLLECTIONS.ACHIEVEMENT_MILESTONES)
        .where('userId', '==', userId)
        .where('isPublic', '==', true)
        .where('verified', '==', true)
        .orderBy('achievedAt', 'desc')
        .get(),
      db.collection('users').doc(userId).get()
    ]);

    const badges = badgesSnapshot.docs.map(doc => doc.data() as ReputationBadge);
    const milestones = milestonesSnapshot.docs.map(doc => doc.data() as AchievementMilestone);

    const topBadges = badges.slice(0, 5).map(badge => ({
      badgeType: badge.badgeType,
      badgeName: badge.badgeName,
      badgeIcon: badge.badgeIcon,
      earnedAt: badge.earnedAt
    }));

    const recentAchievements = milestones.slice(0, 5).map(milestone => ({
      category: milestone.category,
      title: milestone.title,
      achievedAt: milestone.achievedAt
    }));

    const verificationStatus = {
      identityVerified: badges.some(b => b.badgeType === BadgeType.VERIFIED_IDENTITY),
      skillsVerified: badges.some(b => b.badgeType === BadgeType.VERIFIED_SKILLS)
    };

    const publicReputation: Omit<PublicReputation, 'lastUpdated'> = {
      userId,
      displayName: userDoc.data()?.displayName || 'User',
      totalBadges: badges.length,
      totalMilestones: milestones.length,
      topBadges,
      recentAchievements,
      verificationStatus
    };

    await db.collection(COLLECTIONS.PUBLIC_REPUTATION).doc(userId).set({
      ...publicReputation,
      lastUpdated: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.error('Error updating public reputation:', error);
    throw error;
  }
}

/**
 * Verify achievement milestone (admin only)
 */
export const verifyAchievementMilestone = functions.https.onCall(
  async (data: { milestoneId: string; verified: boolean }, context) => {
    try {
      if (!context.auth) {
        return { success: false, error: 'Unauthorized' };
      }

      const adminDoc = await db.collection('users').doc(context.auth.uid).get();
      const userRole = adminDoc.data()?.role;

      if (userRole !== 'admin' && userRole !== 'moderator') {
        return { success: false, error: 'Insufficient permissions' };
      }

      const { milestoneId, verified } = data;

      if (!milestoneId || verified === undefined) {
        return { success: false, error: 'Missing required fields' };
      }

      const milestoneRef = db.collection(COLLECTIONS.ACHIEVEMENT_MILESTONES).doc(milestoneId);
      const milestoneDoc = await milestoneRef.get();

      if (!milestoneDoc.exists) {
        return { success: false, error: 'Milestone not found' };
      }

      const milestone = milestoneDoc.data() as AchievementMilestone;

      await milestoneRef.update({
        verified,
        updatedAt: serverTimestamp()
      });

      await logReputationAction(
        milestone.userId,
        'milestone_verified',
        { milestoneId, verified },
        context.auth.uid
      );

      await updatePublicReputation(milestone.userId);

      return { success: true };
    } catch (error: any) {
      console.error('Error verifying milestone:', error);
      return { success: false, error: error.message };
    }
  }
);

/**
 * Separation enforcement: Prevent exposure of private data
 * This function validates that no safety/risk data is exposed in reputation
 */
export const validateReputationSeparation = functions.https.onCall(
  async (data: { userId: string }, context) => {
    try {
      if (!context.auth) {
        return { success: false, error: 'Unauthorized' };
      }

      const adminDoc = await db.collection('users').doc(context.auth.uid).get();
      const userRole = adminDoc.data()?.role;

      if (userRole !== 'admin') {
        return { success: false, error: 'Admin access required' };
      }

      const { userId } = data;

      const publicReputationDoc = await db.collection(COLLECTIONS.PUBLIC_REPUTATION).doc(userId).get();

      if (!publicReputationDoc.exists) {
        return { success: true, message: 'No public reputation data found' };
      }

      const reputationData = publicReputationDoc.data();

      if (!validateNoForbiddenFields(reputationData)) {
        console.error('SECURITY VIOLATION: Public reputation contains forbidden fields', {
          userId,
          forbiddenFields: Object.keys(reputationData || {}).filter(key => 
            FORBIDDEN_BADGE_FIELDS.includes(key)
          )
        });

        return {
          success: false,
          error: 'Security violation: forbidden fields detected',
          violatingFields: Object.keys(reputationData || {}).filter(key => 
            FORBIDDEN_BADGE_FIELDS.includes(key)
          )
        };
      }

      return { success: true, message: 'Separation validated successfully' };
    } catch (error: any) {
      console.error('Error validating separation:', error);
      return { success: false, error: error.message };
    }
  }
);