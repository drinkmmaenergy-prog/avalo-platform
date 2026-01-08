/**
 * PACK 401 — Fraud Detection via Behavior & Support Correlation
 * Cloud Functions
 *
 * Provides callable and scheduled functions for fraud profile recomputation.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { Timestamp } from 'firebase-admin/firestore';
import {
  recomputeFraudProfileForUser,
  recomputeFraudProfilesForWindow,
} from './pack401-fraud-correlation-service';

/**
 * Callable function to recompute fraud profile for a specific user
 * Admin-only access
 *
 * Input: { userId: string }
 * Returns: { success: boolean, message: string }
 */
export const pack401_recomputeFraudProfileForUser = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 300,
    memory: '512MiB',
  },
  async (request) => {
    try {
      // Authentication check
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Authentication required');
      }

      // Admin check - verify user has admin role
      const customClaims = request.auth.token;
      if (!customClaims.admin && !customClaims.moderator) {
        throw new HttpsError(
          'permission-denied',
          'Admin or moderator access required'
        );
      }

      // Validate input
      const { userId } = request.data;
      if (!userId || typeof userId !== 'string') {
        throw new HttpsError(
          'invalid-argument',
          'userId is required and must be a string'
        );
      }

      logger.info(`[PACK401] Admin ${request.auth.uid} requested fraud profile recomputation for user ${userId}`);

      // Recompute profile
      await recomputeFraudProfileForUser(userId);

      return {
        success: true,
        message: `Fraud profile recomputed successfully for user ${userId}`,
      };
    } catch (error: any) {
      logger.error('[PACK401] Error in recomputeFraudProfileForUser:', error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        'internal',
        `Failed to recompute fraud profile: ${error.message}`
      );
    }
  }
);

/**
 * Scheduled function to recompute fraud profiles for users with recent activity
 * Runs every 6 hours
 *
 * Recomputes profiles for users with activity in the last 6 hours
 */
export const pack401_cronRecomputeFraudProfiles = onSchedule(
  {
    schedule: 'every 6 hours',
    timeZone: 'UTC',
    region: 'us-central1',
    timeoutSeconds: 540,
    memory: '1GiB',
  },
  async (event) => {
    try {
      logger.info('[PACK401] Starting scheduled fraud profile recomputation');

      const now = Timestamp.now();
      // Look back 6 hours
      const lookbackHours = 6;
      const sinceTimestamp = Timestamp.fromMillis(
        now.toMillis() - lookbackHours * 60 * 60 * 1000
      );

      await recomputeFraudProfilesForWindow(sinceTimestamp);

      logger.info('[PACK401] Scheduled fraud profile recomputation completed');
    } catch (error) {
      logger.error('[PACK401] Error in scheduled fraud profile recomputation:', error);
      // Don't throw - we want the cron to continue even if one run fails
    }
  }
);

/**
 * Optional: Callable function for batch recomputation with custom time window
 * Admin-only access
 *
 * Input: { hoursAgo?: number } (defaults to 24)
 * Returns: { success: boolean, message: string }
 */
export const pack401_batchRecomputeFraudProfiles = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 540,
    memory: '1GiB',
  },
  async (request) => {
    try {
      // Authentication check
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Authentication required');
      }

      // Admin check
      const customClaims = request.auth.token;
      if (!customClaims.admin) {
        throw new HttpsError(
          'permission-denied',
          'Admin access required'
        );
      }

      // Validate input
      const hoursAgo = request.data?.hoursAgo || 24;
      if (typeof hoursAgo !== 'number' || hoursAgo < 1 || hoursAgo > 168) {
        throw new HttpsError(
          'invalid-argument',
          'hoursAgo must be a number between 1 and 168 (7 days)'
        );
      }

      logger.info(`[PACK401] Admin ${request.auth.uid} requested batch fraud profile recomputation for last ${hoursAgo} hours`);

      const now = Timestamp.now();
      const sinceTimestamp = Timestamp.fromMillis(
        now.toMillis() - hoursAgo * 60 * 60 * 1000
      );

      await recomputeFraudProfilesForWindow(sinceTimestamp);

      return {
        success: true,
        message: `Batch fraud profile recomputation completed for last ${hoursAgo} hours`,
      };
    } catch (error: any) {
      logger.error('[PACK401] Error in batch fraud profile recomputation:', error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        'internal',
        `Failed to batch recompute fraud profiles: ${error.message}`
      );
    }
  }
);
