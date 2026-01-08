/**
 * PACK 411 — Rating Trigger Logic
 * Determines when and if to prompt users for in-app ratings
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  RatingPromptDecision,
  RatingPromptLog,
  InAppRatingConfig,
} from '../../shared/types/pack411-reviews';

const db = admin.firestore();

const DEFAULT_CONFIG: InAppRatingConfig = {
  enabled: true,
  eligibility: {
    minActiveDays: 7,
    minActiveSessions: 10,
    minUserAge: 18,
    requireVerified: true,
  },
  throttling: {
    maxPromptsPerVersion: 1,
    maxPromptsPer90Days: 3,
    minDaysBetweenPrompts: 30,
  },
  deflection: {
    lowRatingThreshold: 3,
    enableFeedbackSheet: true,
    autoCreateSupportTicket: true,
  },
};

/**
 * Get in-app rating configuration
 */
async function getRatingConfig(): Promise<InAppRatingConfig> {
  const configDoc = await db.collection('config').doc('pack411InAppRating').get();
  if (configDoc.exists) {
    return configDoc.data() as InAppRatingConfig;
  }
  return DEFAULT_CONFIG;
}

/**
 * Check if user has open critical support tickets
 */
async function hasOpenCriticalTicket(userId: string): Promise<boolean> {
  const ticketsSnapshot = await db
    .collection('supportTickets')
    .where('userId', '==', userId)
    .where('status', 'in', ['NEW', 'OPEN', 'IN_PROGRESS'])
    .where('priority', 'in', ['HIGH', 'CRITICAL'])
    .limit(1)
    .get();

  return !ticketsSnapshot.empty;
}

/**
 * Check if user has recent safety incidents
 */
async function hasRecentSafetyIncident(userId: string): Promise<boolean> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const incidentsSnapshot = await db
    .collection('riskCases')
    .where('userId', '==', userId)
    .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(thirtyDaysAgo))
    .where('severity', 'in', ['HIGH', 'CRITICAL'])
    .limit(1)
    .get();

  return !incidentsSnapshot.empty;
}

/**
 * Get user's rating prompt history
 */
async function getUserPromptHistory(
  userId: string,
  appVersion?: string
): Promise<RatingPromptLog[]> {
  let query: FirebaseFirestore.Query = db
    .collection('ratingPromptLogs')
    .where('userId', '==', userId)
    .orderBy('promptedAt', 'desc');

  const snapshot = await query.get();
  const logs = snapshot.docs.map((doc) => doc.data() as RatingPromptLog);

  if (appVersion) {
    return logs.filter((log) => log.appVersion === appVersion);
  }

  return logs;
}

/**
 * Get user activity metrics
 */
async function getUserActivityMetrics(userId: string): Promise<{
  activeDays: number;
  activeSessions: number;
}> {
  // This would integrate with PACK 410 analytics
  // For now, we'll use a simple query
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();

  return {
    activeDays: userData?.activityMetrics?.activeDays || 0,
    activeSessions: userData?.activityMetrics?.activeSessions || 0,
  };
}

/**
 * Determine if user should be prompted for rating
 */
export const pack411_ratingPromptDecision = functions.https.onCall(
  async (data, context) => {
    try {
      // Must be authenticated
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }

      const userId = context.auth.uid;
      const appVersion = data.appVersion as string;

      if (!appVersion) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'appVersion is required'
        );
      }

      const config = await getRatingConfig();

      // Check if rating prompts are enabled
      if (!config.enabled) {
        return {
          shouldPrompt: false,
          reason: 'ELIGIBLE',
          metadata: {},
        } as RatingPromptDecision;
      }

      // Get user document
      const userDoc = await db.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        return {
          shouldPrompt: false,
          reason: 'NEW_USER',
          metadata: {},
        } as RatingPromptDecision;
      }

      const userData = userDoc.data()!;

      // Check age requirement
      if (userData.age && userData.age < config.eligibility.minUserAge) {
        return {
          shouldPrompt: false,
          reason: 'AGE_RESTRICTION',
          metadata: {},
        } as RatingPromptDecision;
      }

      // Check verification requirement
      if (config.eligibility.requireVerified && !userData.verified) {
        return {
          shouldPrompt: false,
          reason: 'NEW_USER',
          metadata: {},
        } as RatingPromptDecision;
      }

      // Check open critical tickets
      const hasCriticalTicket = await hasOpenCriticalTicket(userId);
      if (hasCriticalTicket) {
        return {
          shouldPrompt: false,
          reason: 'OPEN_TICKET',
          metadata: {},
        } as RatingPromptDecision;
      }

      // Check recent safety incidents
      const hasSafetyFlag = await hasRecentSafetyIncident(userId);
      if (hasSafetyFlag) {
        return {
          shouldPrompt: false,
          reason: 'SAFETY_FLAG',
          metadata: {},
        } as RatingPromptDecision;
      }

      // Get activity metrics
      const activityMetrics = await getUserActivityMetrics(userId);

      // Check activity requirements
      if (activityMetrics.activeDays < config.eligibility.minActiveDays) {
        return {
          shouldPrompt: false,
          reason: 'NEW_USER',
          metadata: {
            activeDays: activityMetrics.activeDays,
          },
        } as RatingPromptDecision;
      }

      if (activityMetrics.activeSessions < config.eligibility.minActiveSessions) {
        return {
          shouldPrompt: false,
          reason: 'NEW_USER',
          metadata: {
            activeSessions: activityMetrics.activeSessions,
          },
        } as RatingPromptDecision;
      }

      // Get prompt history
      const allPrompts = await getUserPromptHistory(userId);
      const versionPrompts = allPrompts.filter((log) => log.appVersion === appVersion);

      // Check version-specific quota
      if (versionPrompts.length >= config.throttling.maxPromptsPerVersion) {
        return {
          shouldPrompt: false,
          reason: 'VERSION_ALREADY_PROMPTED',
          metadata: {
            promptCountLast90Days: versionPrompts.length,
          },
        } as RatingPromptDecision;
      }

      // Check 90-day quota
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const recentPrompts = allPrompts.filter(
        (log) => new Date(log.promptedAt) >= ninetyDaysAgo
      );

      if (recentPrompts.length >= config.throttling.maxPromptsPer90Days) {
        return {
          shouldPrompt: false,
          reason: 'QUOTA_EXCEEDED',
          metadata: {
            promptCountLast90Days: recentPrompts.length,
          },
        } as RatingPromptDecision;
      }

      // Check minimum days between prompts
      if (allPrompts.length > 0) {
        const lastPrompt = allPrompts[0];
        const daysSinceLastPrompt = Math.floor(
          (Date.now() - new Date(lastPrompt.promptedAt).getTime()) /
            (1000 * 60 * 60 * 24)
        );

        if (daysSinceLastPrompt < config.throttling.minDaysBetweenPrompts) {
          return {
            shouldPrompt: false,
            reason: 'RECENTLY_PROMPTED',
            metadata: {
              daysSinceLastPrompt,
            },
          } as RatingPromptDecision;
        }
      }

      // All checks passed!
      return {
        shouldPrompt: true,
        reason: 'ELIGIBLE',
        metadata: {
          activeDays: activityMetrics.activeDays,
          activeSessions: activityMetrics.activeSessions,
          promptCountLast90Days: recentPrompts.length,
        },
      } as RatingPromptDecision;
    } catch (error) {
      console.error('Error checking rating prompt eligibility:', error);
      throw new functions.https.HttpsError('internal', 'Internal server error');
    }
  }
);

/**
 * Log a rating prompt event
 */
export const pack411_logRatingPrompt = functions.https.onCall(
  async (data, context) => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }

      const userId = context.auth.uid;
      const {
        appVersion,
        decision,
        userAction,
        redirectedToStore,
        linkedSupportTicketId,
      } = data;

      const log: RatingPromptLog = {
        id: db.collection('ratingPromptLogs').doc().id,
        userId,
        appVersion,
        promptedAt: new Date().toISOString(),
        decision,
        userAction,
        redirectedToStore: redirectedToStore || false,
        linkedSupportTicketId,
      };

      await db.collection('ratingPromptLogs').doc(log.id).set(log);

      // Log analytics event (PACK 410)
      const eventType = userAction
        ? userAction === 'FEEDBACK'
          ? 'IN_APP_FEEDBACK_OPENED'
          : 'RATING_SELECTED'
        : 'RATING_PROMPT_SHOWN';

      await db.collection('analyticsEvents').add({
        eventType,
        userId,
        metadata: {
          appVersion,
          userAction,
          redirectedToStore,
          decision,
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { success: true, logId: log.id };
    } catch (error) {
      console.error('Error logging rating prompt:', error);
      throw new functions.https.HttpsError('internal', 'Internal server error');
    }
  }
);

/**
 * Create support ticket from negative rating feedback
 */
export const pack411_createFeedbackTicket = functions.https.onCall(
  async (data, context) => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }

      const userId = context.auth.uid;
      const { rating, feedback, appVersion, screenshot } = data;

      const ticketData = {
        source: 'IN_APP_RATING',
        category: rating <= 2 ? 'BUG' : 'APP_QUALITY',
        subject: `In-App Feedback: ${rating}★`,
        description: feedback || 'No description provided',
        userId,
        metadata: {
          appVersion,
          rating,
          screenshot,
        },
        priority: rating === 1 ? 'HIGH' : 'MEDIUM',
        status: 'NEW',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const ticketRef = await db.collection('supportTickets').add(ticketData);

      // Log analytics event
      await db.collection('analyticsEvents').add({
        eventType: 'IN_APP_FEEDBACK_OPENED',
        userId,
        metadata: {
          supportTicketId: ticketRef.id,
          rating,
          appVersion,
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { success: true, ticketId: ticketRef.id };
    } catch (error) {
      console.error('Error creating feedback ticket:', error);
      throw new functions.https.HttpsError('internal', 'Internal server error');
    }
  }
);
