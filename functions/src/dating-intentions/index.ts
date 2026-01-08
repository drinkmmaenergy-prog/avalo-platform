/**
 * PACK 187 — Dating Intention & Chemistry Declaration System
 * Cloud Functions API
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  DatingIntentionBadge,
  UserDatingIntention,
  DatingPreferences,
  IntentionAnalytics,
} from './types';
import {
  calculateCompatibilityScore,
  calculateBatchCompatibility,
  shouldShowMatch,
  getIcebreakerSuggestions,
} from './compatibility';

const db = admin.firestore();

/**
 * Get user's current dating intentions
 */
export const getDatingIntentions = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const userId = context.auth.uid;

    try {
      const doc = await db.collection('dating_intentions').doc(userId).get();

      if (!doc.exists) {
        // Return default empty intentions
        return {
          userId,
          badges: [],
          preferences: {
            showBadgeToMatches: false,
            allowIntentionFiltering: true,
            notifyOnHighCompatibility: true,
          },
          createdAt: admin.firestore.Timestamp.now(),
          lastUpdated: admin.firestore.Timestamp.now(),
        };
      }

      return doc.data();
    } catch (error) {
      console.error('Error fetching dating intentions:', error);
      throw new functions.https.HttpsError('internal', 'Failed to fetch intentions');
    }
  }
);

/**
 * Update user's dating intentions and preferences
 */
export const updateDatingIntentions = functions.https.onCall(
  async (data: {
    badges?: DatingIntentionBadge[];
    preferences?: Partial<DatingPreferences>;
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const userId = context.auth.uid;

    // Validate badges
    if (data.badges) {
      const validBadges = Object.values(DatingIntentionBadge);
      for (const badge of data.badges) {
        if (!validBadges.includes(badge)) {
          throw new functions.https.HttpsError('invalid-argument', `Invalid badge: ${badge}`);
        }
      }

      // Limit to max 4 badges
      if (data.badges.length > 4) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Maximum 4 intention badges allowed'
        );
      }
    }

    try {
      const docRef = db.collection('dating_intentions').doc(userId);
      const doc = await docRef.get();

      const updateData: any = {
        lastUpdated: admin.firestore.Timestamp.now(),
      };

      if (data.badges !== undefined) {
        updateData.badges = data.badges;
      }

      if (data.preferences) {
        if (doc.exists) {
          updateData.preferences = {
            ...(doc.data()?.preferences || {}),
            ...data.preferences,
          };
        } else {
          updateData.preferences = data.preferences;
        }
      }

      if (!doc.exists) {
        updateData.userId = userId;
        updateData.createdAt = admin.firestore.Timestamp.now();
        updateData.matchesGenerated = 0;
        updateData.conversationsStarted = 0;
      }

      await docRef.set(updateData, { merge: true });

      // Fetch and return updated document
      const updated = await docRef.get();
      return updated.data();
    } catch (error) {
      console.error('Error updating dating intentions:', error);
      throw new functions.https.HttpsError('internal', 'Failed to update intentions');
    }
  }
);

/**
 * Calculate compatibility between current user and a target user
 */
export const calculateIntentionCompatibility = functions.https.onCall(
  async (data: { targetUserId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const userId = context.auth.uid;
    const { targetUserId } = data;

    if (!targetUserId) {
      throw new functions.https.HttpsError('invalid-argument', 'targetUserId is required');
    }

    try {
      // Fetch both users' intentions
      const [userDoc, targetDoc] = await Promise.all([
        db.collection('dating_intentions').doc(userId).get(),
        db.collection('dating_intentions').doc(targetUserId).get(),
      ]);

      if (!userDoc.exists || !targetDoc.exists) {
        return {
          compatibilityScore: 0,
          message: 'One or both users have not set dating intentions',
        };
      }

      const userIntentions = userDoc.data() as UserDatingIntention;
      const targetIntentions = targetDoc.data() as UserDatingIntention;

      const compatibility = calculateCompatibilityScore(userIntentions, targetIntentions);

      // Check if match should be shown based on preferences
      const shouldShow = shouldShowMatch(userIntentions, targetIntentions, compatibility);

      return {
        ...compatibility,
        shouldShow,
        icebreakers: getIcebreakerSuggestions(compatibility),
      };
    } catch (error) {
      console.error('Error calculating compatibility:', error);
      throw new functions.https.HttpsError('internal', 'Failed to calculate compatibility');
    }
  }
);

/**
 * Get batch compatibility scores for discovery feed
 */
export const getBatchCompatibilityScores = functions.https.onCall(
  async (data: { userIds: string[]; minScore?: number }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const userId = context.auth.uid;
    const { userIds, minScore = 0 } = data;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      throw new functions.https.HttpsError('invalid-argument', 'userIds array is required');
    }

    // Limit batch size
    if (userIds.length > 50) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Maximum 50 users per batch request'
      );
    }

    try {
      // Fetch current user's intentions
      const userDoc = await db.collection('dating_intentions').doc(userId).get();

      if (!userDoc.exists) {
        return [];
      }

      const userIntentions = userDoc.data() as UserDatingIntention;

      // Fetch candidate users' intentions
      const candidateDocs = await Promise.all(
        userIds.map(id => db.collection('dating_intentions').doc(id).get())
      );

      const candidates: UserDatingIntention[] = candidateDocs
        .filter(doc => doc.exists)
        .map(doc => doc.data() as UserDatingIntention);

      // Calculate batch compatibility
      const results = calculateBatchCompatibility(userIntentions, candidates, minScore);

      return results;
    } catch (error) {
      console.error('Error calculating batch compatibility:', error);
      throw new functions.https.HttpsError('internal', 'Failed to calculate batch compatibility');
    }
  }
);

/**
 * Track intention analytics when a match is made
 */
export const trackIntentionMatch = functions.https.onCall(
  async (data: { matchedUserId: string; conversationStarted: boolean }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const userId = context.auth.uid;
    const { matchedUserId, conversationStarted } = data;

    try {
      const batch = db.batch();

      // Update user's analytics
      const userRef = db.collection('dating_intentions').doc(userId);
      batch.update(userRef, {
        matchesGenerated: admin.firestore.FieldValue.increment(1),
        conversationsStarted: conversationStarted
          ? admin.firestore.FieldValue.increment(1)
          : admin.firestore.FieldValue.increment(0),
        lastUpdated: admin.firestore.Timestamp.now(),
      });

      // Update matched user's analytics
      const matchedRef = db.collection('dating_intentions').doc(matchedUserId);
      batch.update(matchedRef, {
        matchesGenerated: admin.firestore.FieldValue.increment(1),
        lastUpdated: admin.firestore.Timestamp.now(),
      });

      await batch.commit();

      return { success: true };
    } catch (error) {
      console.error('Error tracking intention match:', error);
      throw new functions.https.HttpsError('internal', 'Failed to track match');
    }
  }
);

/**
 * Get intention analytics for the user
 */
export const getIntentionAnalytics = functions.https.onCall(
  async (data: { period?: 'daily' | 'weekly' | 'monthly' }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const userId = context.auth.uid;
    const period = data.period || 'weekly';

    try {
      // Fetch user's intentions for badge performance data
      const userDoc = await db.collection('dating_intentions').doc(userId).get();

      if (!userDoc.exists) {
        return null;
      }

      const userData = userDoc.data() as UserDatingIntention;

      // Calculate period dates
      const now = new Date();
      const periodStart = new Date(now);

      switch (period) {
        case 'daily':
          periodStart.setDate(now.getDate() - 1);
          break;
        case 'weekly':
          periodStart.setDate(now.getDate() - 7);
          break;
        case 'monthly':
          periodStart.setMonth(now.getMonth() - 1);
          break;
      }

      // Return analytics
      return {
        userId,
        period,
        periodStart: admin.firestore.Timestamp.fromDate(periodStart),
        periodEnd: admin.firestore.Timestamp.now(),
        matchesGenerated: userData.matchesGenerated || 0,
        conversationsStarted: userData.conversationsStarted || 0,
        responseRate: userData.successRate || 0,
        activeBadges: userData.badges,
      };
    } catch (error) {
      console.error('Error fetching intention analytics:', error);
      throw new functions.https.HttpsError('internal', 'Failed to fetch analytics');
    }
  }
);