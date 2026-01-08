/**
 * PACK 192: AI Social Memory Hub
 * Cross-AI knowledge sharing with strict privacy controls
 * 
 * Features:
 * - Share safe preferences between AIs
 * - Block emotional/financial/personal data
 * - User transparency and control
 * - No AI gossip or manipulation
 */

import * as functions from 'firebase-functions';
import * as logger from 'firebase-functions/logger';
import { db, serverTimestamp, increment } from './init.js';
import { Timestamp } from 'firebase-admin/firestore';
import type {
  SharedPreference,
  SharedStoryProgress,
  MemoryPermissions,
  AiMemoryAccess,
  SharePreferenceRequest,
  GetSharedPreferencesRequest,
  GetSharedPreferencesResponse,
  MemoryAnalytics,
  AllowedPreferenceCategory,
} from './types/socialMemory.js';
import {
  validatePreferenceSharing,
  blockAiGossip,
  detectManipulativeBehavior,
} from './middleware/socialMemoryPrivacy.js';

/**
 * Get or create memory permissions for user
 */
async function getOrCreateMemoryPermissions(
  userId: string
): Promise<MemoryPermissions> {
  const permRef = db.collection('ai_memory_permissions').doc(userId);
  const permSnap = await permRef.get();

  if (permSnap.exists) {
    return permSnap.data() as MemoryPermissions;
  }

  const defaultPermissions: MemoryPermissions = {
    userId,
    crossAiSharingEnabled: true,
    allowedCategories: [
      'topics_liked',
      'humor_preference',
      'activity_preference',
      'languages',
      'safe_boundaries',
      'story_progress',
    ],
    excludedAiIds: [],
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  await permRef.set(defaultPermissions);
  return defaultPermissions;
}

/**
 * Share preference across AIs
 */
export const sharePreferenceAcrossAis = functions
  .region('europe-west3')
  .https.onCall(async (data: SharePreferenceRequest, context) => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }

      const callerId = context.auth.uid;
      if (callerId !== data.userId) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Cannot share preferences for other users'
        );
      }

      const permissions = await getOrCreateMemoryPermissions(data.userId);

      if (!permissions.crossAiSharingEnabled) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Cross-AI sharing is disabled for this user'
        );
      }

      if (!permissions.allowedCategories.includes(data.category)) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          `Category "${data.category}" is not enabled for sharing`
        );
      }

      const validationResult = await validatePreferenceSharing({
        userId: data.userId,
        category: data.category,
        key: data.key,
        value: data.value,
        requestingAiId: data.sourceAiId,
      });

      if (!validationResult.allowed) {
        logger.warn('[Social Memory] Preference sharing blocked', {
          userId: data.userId,
          category: data.category,
          reason: validationResult.reason,
        });

        throw new functions.https.HttpsError(
          'invalid-argument',
          validationResult.reason || 'Preference sharing validation failed'
        );
      }

      const preferenceId = `${data.userId}_${data.category}_${data.key}`;
      const prefRef = db.collection('ai_shared_preferences').doc(preferenceId);
      const existingPref = await prefRef.get();

      const preference: SharedPreference = {
        id: preferenceId,
        userId: data.userId,
        category: data.category,
        key: data.key,
        value: data.value,
        confidence: data.confidence || 0.8,
        sourceAiId: data.sourceAiId,
        createdAt: existingPref.exists
          ? (existingPref.data()?.createdAt as Timestamp)
          : Timestamp.now(),
        updatedAt: Timestamp.now(),
        accessCount: existingPref.exists
          ? (existingPref.data()?.accessCount || 0)
          : 0,
        lastAccessedAt: existingPref.exists
          ? (existingPref.data()?.lastAccessedAt as Timestamp)
          : Timestamp.now(),
      };

      await prefRef.set(preference, { merge: true });

      logger.info('[Social Memory] Preference shared', {
        userId: data.userId,
        category: data.category,
        key: data.key,
      });

      return {
        ok: true,
        preferenceId,
      };
    } catch (error: any) {
      logger.error('[sharePreferenceAcrossAis] Error:', error);

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError('internal', error.message);
    }
  });

/**
 * Get shared preferences for an AI
 */
export const getSharedPreferencesForAi = functions
  .region('europe-west3')
  .https.onCall(
    async (data: GetSharedPreferencesRequest, context): Promise<GetSharedPreferencesResponse> => {
      try {
        if (!context.auth) {
          throw new functions.https.HttpsError(
            'unauthenticated',
            'User must be authenticated'
          );
        }

        const callerId = context.auth.uid;
        if (callerId !== data.userId) {
          throw new functions.https.HttpsError(
            'permission-denied',
            'Cannot access other users\' preferences'
          );
        }

        const permissions = await getOrCreateMemoryPermissions(data.userId);

        if (!permissions.crossAiSharingEnabled) {
          return {
            preferences: [],
            storyProgress: [],
            permissionsActive: false,
          };
        }

        if (permissions.excludedAiIds.includes(data.aiId)) {
          logger.info('[Social Memory] AI excluded from memory access', {
            userId: data.userId,
            aiId: data.aiId,
          });

          return {
            preferences: [],
            storyProgress: [],
            permissionsActive: true,
          };
        }

        let query = db
          .collection('ai_shared_preferences')
          .where('userId', '==', data.userId) as any;

        if (data.categories && data.categories.length > 0) {
          const allowedCats = data.categories.filter((cat) =>
            permissions.allowedCategories.includes(cat)
          );
          if (allowedCats.length > 0) {
            query = query.where('category', 'in', allowedCats);
          }
        }

        const preferencesSnap = await query.limit(100).get();

        const preferences: SharedPreference[] = preferencesSnap.docs.map(
          (doc: any) => {
            const data = doc.data();

            doc.ref
              .update({
                accessCount: increment(1),
                lastAccessedAt: serverTimestamp(),
              })
              .catch((err: any) => logger.error('Failed to update access count:', err));

            return data as SharedPreference;
          }
        );

        const storyProgressSnap = await db
          .collection('ai_shared_story_progress')
          .where('userId', '==', data.userId)
          .limit(50)
          .get();

        const storyProgress: SharedStoryProgress[] = storyProgressSnap.docs.map(
          (doc) => doc.data() as SharedStoryProgress
        );

        const accessLogRef = db
          .collection('ai_memory_access_log')
          .doc(`${data.userId}_${data.aiId}`);

        const existingLog = await accessLogRef.get();
        const currentAccesses = existingLog.exists
          ? (existingLog.data()?.totalAccesses || 0)
          : 0;

        const accessLog: AiMemoryAccess = {
          id: accessLogRef.id,
          userId: data.userId,
          aiId: data.aiId,
          aiName: data.aiId,
          accessedPreferences: preferences.map((p) => p.id),
          lastAccessAt: Timestamp.now(),
          totalAccesses: currentAccesses + 1,
        };

        await accessLogRef.set(accessLog, { merge: true });

        logger.info('[Social Memory] Preferences retrieved', {
          userId: data.userId,
          aiId: data.aiId,
          count: preferences.length,
        });

        return {
          preferences,
          storyProgress,
          permissionsActive: true,
        };
      } catch (error: any) {
        logger.error('[getSharedPreferencesForAi] Error:', error);

        if (error instanceof functions.https.HttpsError) {
          throw error;
        }

        throw new functions.https.HttpsError('internal', error.message);
      }
    }
  );

/**
 * Store user story progress
 */
export const storeUserStoryProgress = functions
  .region('europe-west3')
  .https.onCall(
    async (
      data: {
        userId: string;
        storyId: string;
        storyName: string;
        currentChapter: number;
        totalChapters: number;
        lastPosition: string;
      },
      context
    ) => {
      try {
        if (!context.auth) {
          throw new functions.https.HttpsError(
            'unauthenticated',
            'User must be authenticated'
          );
        }

        const callerId = context.auth.uid;
        if (callerId !== data.userId) {
          throw new functions.https.HttpsError(
            'permission-denied',
            'Cannot store story progress for other users'
          );
        }

        const permissions = await getOrCreateMemoryPermissions(data.userId);

        if (!permissions.crossAiSharingEnabled) {
          throw new functions.https.HttpsError(
            'failed-precondition',
            'Cross-AI sharing is disabled'
          );
        }

        const progressId = `${data.userId}_${data.storyId}`;
        const progressRef = db
          .collection('ai_shared_story_progress')
          .doc(progressId);

        const existingProgress = await progressRef.get();

        const progress: SharedStoryProgress = {
          id: progressId,
          userId: data.userId,
          storyId: data.storyId,
          storyName: data.storyName,
          currentChapter: data.currentChapter,
          totalChapters: data.totalChapters,
          lastPosition: data.lastPosition,
          completedAt:
            data.currentChapter >= data.totalChapters
              ? Timestamp.now()
              : undefined,
          createdAt: existingProgress.exists
            ? (existingProgress.data()?.createdAt as Timestamp)
            : Timestamp.now(),
          updatedAt: Timestamp.now(),
        };

        await progressRef.set(progress, { merge: true });

        logger.info('[Social Memory] Story progress stored', {
          userId: data.userId,
          storyId: data.storyId,
          chapter: data.currentChapter,
        });

        return { ok: true, progressId };
      } catch (error: any) {
        logger.error('[storeUserStoryProgress] Error:', error);

        if (error instanceof functions.https.HttpsError) {
          throw error;
        }

        throw new functions.https.HttpsError('internal', error.message);
      }
    }
  );

/**
 * Update memory permissions
 */
export const updateMemoryPermissions = functions
  .region('europe-west3')
  .https.onCall(
    async (
      data: {
        userId: string;
        crossAiSharingEnabled?: boolean;
        allowedCategories?: AllowedPreferenceCategory[];
        excludedAiIds?: string[];
      },
      context
    ) => {
      try {
        if (!context.auth) {
          throw new functions.https.HttpsError(
            'unauthenticated',
            'User must be authenticated'
          );
        }

        const callerId = context.auth.uid;
        if (callerId !== data.userId) {
          throw new functions.https.HttpsError(
            'permission-denied',
            'Cannot update permissions for other users'
          );
        }

        const permRef = db.collection('ai_memory_permissions').doc(data.userId);

        const updates: Partial<MemoryPermissions> = {
          updatedAt: Timestamp.now(),
        };

        if (data.crossAiSharingEnabled !== undefined) {
          updates.crossAiSharingEnabled = data.crossAiSharingEnabled;
        }

        if (data.allowedCategories) {
          updates.allowedCategories = data.allowedCategories;
        }

        if (data.excludedAiIds) {
          updates.excludedAiIds = data.excludedAiIds;
        }

        await permRef.set(updates, { merge: true });

        logger.info('[Social Memory] Permissions updated', {
          userId: data.userId,
          updates: Object.keys(updates),
        });

        return { ok: true };
      } catch (error: any) {
        logger.error('[updateMemoryPermissions] Error:', error);

        if (error instanceof functions.https.HttpsError) {
          throw error;
        }

        throw new functions.https.HttpsError('internal', error.message);
      }
    }
  );

/**
 * Block preference sharing
 */
export const blockPreferenceSharing = functions
  .region('europe-west3')
  .https.onCall(
    async (data: { userId: string; preferenceId: string }, context) => {
      try {
        if (!context.auth) {
          throw new functions.https.HttpsError(
            'unauthenticated',
            'User must be authenticated'
          );
        }

        const callerId = context.auth.uid;
        if (callerId !== data.userId) {
          throw new functions.https.HttpsError(
            'permission-denied',
            'Cannot block preferences for other users'
          );
        }

        const prefRef = db
          .collection('ai_shared_preferences')
          .doc(data.preferenceId);
        const prefSnap = await prefRef.get();

        if (prefSnap.exists && prefSnap.data()?.userId === data.userId) {
          await prefRef.delete();

          logger.info('[Social Memory] Preference deleted', {
            userId: data.userId,
            preferenceId: data.preferenceId,
          });

          return { ok: true };
        }

        throw new functions.https.HttpsError(
          'not-found',
          'Preference not found or unauthorized'
        );
      } catch (error: any) {
        logger.error('[blockPreferenceSharing] Error:', error);

        if (error instanceof functions.https.HttpsError) {
          throw error;
        }

        throw new functions.https.HttpsError('internal', error.message);
      }
    }
  );

/**
 * Resolve preference conflict (when AIs disagree)
 */
export const resolvePreferenceConflict = functions
  .region('europe-west3')
  .https.onCall(
    async (
      data: {
        userId: string;
        category: string;
        key: string;
        preferredValue: any;
      },
      context
    ) => {
      try {
        if (!context.auth) {
          throw new functions.https.HttpsError(
            'unauthenticated',
            'User must be authenticated'
          );
        }

        const callerId = context.auth.uid;
        if (callerId !== data.userId) {
          throw new functions.https.HttpsError(
            'permission-denied',
            'Cannot resolve conflicts for other users'
          );
        }

        const preferenceId = `${data.userId}_${data.category}_${data.key}`;
        const prefRef = db.collection('ai_shared_preferences').doc(preferenceId);

        await prefRef.update({
          value: data.preferredValue,
          confidence: 1.0,
          updatedAt: Timestamp.now(),
        });

        logger.info('[Social Memory] Conflict resolved', {
          userId: data.userId,
          category: data.category,
          key: data.key,
        });

        return { ok: true };
      } catch (error: any) {
        logger.error('[resolvePreferenceConflict] Error:', error);

        if (error instanceof functions.https.HttpsError) {
          throw error;
        }

        throw new functions.https.HttpsError('internal', error.message);
      }
    }
  );

/**
 * Get memory analytics for transparency
 */
export const getMemoryAnalytics = functions
  .region('europe-west3')
  .https.onCall(async (data: { userId: string }, context) => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }

      const callerId = context.auth.uid;
      if (callerId !== data.userId) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Cannot access analytics for other users'
        );
      }

      const preferences = await db
        .collection('ai_shared_preferences')
        .where('userId', '==', data.userId)
        .get();

      const categoriesActive = Array.from(
        new Set(
          preferences.docs.map((doc) => doc.data().category as AllowedPreferenceCategory)
        )
      );

      const accessLogSnap = await db
        .collection('ai_memory_access_log')
        .where('userId', '==', data.userId)
        .orderBy('lastAccessAt', 'desc')
        .limit(20)
        .get();

      const aiAccessLog: AiMemoryAccess[] = accessLogSnap.docs.map(
        (doc) => doc.data() as AiMemoryAccess
      );

      const analytics: MemoryAnalytics = {
        userId: data.userId,
        totalPreferencesShared: preferences.size,
        categoriesActive,
        aiAccessLog,
        lastUpdated: Timestamp.now(),
      };

      return {
        ok: true,
        analytics,
      };
    } catch (error: any) {
      logger.error('[getMemoryAnalytics] Error:', error);

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError('internal', error.message);
    }
  });

/**
 * Wipe all shared memory for user
 */
export const wipeUserMemory = functions
  .region('europe-west3')
  .https.onCall(async (data: { userId: string }, context) => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }

      const callerId = context.auth.uid;
      if (callerId !== data.userId) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Cannot wipe memory for other users'
        );
      }

      const batch = db.batch();

      const preferences = await db
        .collection('ai_shared_preferences')
        .where('userId', '==', data.userId)
        .get();

      preferences.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      const storyProgress = await db
        .collection('ai_shared_story_progress')
        .where('userId', '==', data.userId)
        .get();

      storyProgress.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      const accessLogs = await db
        .collection('ai_memory_access_log')
        .where('userId', '==', data.userId)
        .get();

      accessLogs.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();

      logger.info('[Social Memory] User memory wiped', {
        userId: data.userId,
        deletedCount:
          preferences.size + storyProgress.size + accessLogs.size,
      });

      return {
        ok: true,
        deletedItems:
          preferences.size + storyProgress.size + accessLogs.size,
      };
    } catch (error: any) {
      logger.error('[wipeUserMemory] Error:', error);

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError('internal', error.message);
    }
  });

export default {
  sharePreferenceAcrossAis,
  getSharedPreferencesForAi,
  storeUserStoryProgress,
  updateMemoryPermissions,
  blockPreferenceSharing,
  resolvePreferenceConflict,
  getMemoryAnalytics,
  wipeUserMemory,
};