/**
 * PACK 101 — Creator Success Toolkit Endpoints
 * Callable functions and scheduled jobs for success signals
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from './init';
import { logger } from 'firebase-functions/v2';
import {
  GetCreatorSuccessSignalsRequest,
  GetCreatorSuccessSignalsResponse,
} from './pack101-success-types';
import { rebuildSuccessSignalsForUser } from './pack101-success-engine';
import { logTechEvent } from './pack90-logging';

/**
 * Get creator success signals for authenticated user
 * Returns scorecard and actionable suggestions
 */
export const getCreatorSuccessSignals = onCall(
  { region: 'europe-west3' },
  async (request): Promise<GetCreatorSuccessSignalsResponse> => {
    // Require authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const requestData = request.data as GetCreatorSuccessSignalsRequest;
    const userId = requestData.userId || request.auth.uid;

    // Security: Users can only view their own success signals
    if (userId !== request.auth.uid) {
      throw new HttpsError(
        'permission-denied',
        'Cannot access another user\'s success signals'
      );
    }

    try {
      // Get success signals from Firestore
      const signalsDoc = await db
        .collection('creator_success_signals')
        .doc(userId)
        .get();

      if (!signalsDoc.exists) {
        // Signals don't exist yet - generate them now
        logger.info(`[SuccessToolkit] Generating signals on-demand for user ${userId}`);
        await rebuildSuccessSignalsForUser(userId);

        // Fetch again
        const newSignalsDoc = await db
          .collection('creator_success_signals')
          .doc(userId)
          .get();

        if (!newSignalsDoc.exists) {
          throw new HttpsError(
            'internal',
            'Failed to generate success signals'
          );
        }

        const data = newSignalsDoc.data()!;
        return {
          updatedAt: data.updatedAt.toDate().toISOString(),
          scorecard: data.scorecard,
          suggestions: data.suggestions,
        };
      }

      // Return existing signals
      const data = signalsDoc.data()!;
      return {
        updatedAt: data.updatedAt.toDate().toISOString(),
        scorecard: data.scorecard,
        suggestions: data.suggestions,
      };
    } catch (error: any) {
      logger.error('[SuccessToolkit] Error fetching success signals', {
        userId,
        error: error.message,
      });

      await logTechEvent({
        level: 'ERROR',
        category: 'FUNCTION',
        functionName: 'getCreatorSuccessSignals',
        message: `Failed to fetch success signals: ${error.message}`,
        context: { userId, error: error.message },
      });

      throw new HttpsError('internal', `Failed to fetch success signals: ${error.message}`);
    }
  }
);

/**
 * Scheduled job: Rebuild creator success signals daily
 * Runs every night at 5 AM UTC (after analytics aggregation)
 */
export const rebuildCreatorSuccessSignalsDaily = onSchedule(
  {
    schedule: '0 5 * * *', // Daily at 5 AM UTC
    timeZone: 'UTC',
    memory: '1GiB' as const,
    timeoutSeconds: 540,
  },
  async (event) => {
    try {
      logger.info('[SuccessToolkit] Starting daily success signals rebuild');

      const startTime = Date.now();
      let processedCount = 0;
      let errorCount = 0;

      // Get all creators who have earned tokens in the last 90 days
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      // Query creator balances to find active creators
      const creatorsSnapshot = await db
        .collection('creator_balances')
        .where('lifetimeEarned', '>', 0)
        .get();

      logger.info(`[SuccessToolkit] Found ${creatorsSnapshot.size} creators to process`);

      // Process in batches of 10 to avoid overwhelming the system
      const batchSize = 10;
      const creators = creatorsSnapshot.docs.map(doc => doc.id);

      for (let i = 0; i < creators.length; i += batchSize) {
        const batch = creators.slice(i, i + batchSize);

        // Process batch in parallel
        const batchResults = await Promise.allSettled(
          batch.map(userId => rebuildSuccessSignalsForUser(userId))
        );

        // Count results
        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            processedCount++;
          } else {
            errorCount++;
            logger.error('[SuccessToolkit] Error processing user', {
              error: result.reason,
            });
          }
        }

        // Add small delay between batches to avoid rate limits
        if (i + batchSize < creators.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      const duration = Date.now() - startTime;

      logger.info('[SuccessToolkit] Daily success signals rebuild complete', {
        processedCount,
        errorCount,
        durationMs: duration,
      });

      await logTechEvent({
        level: 'INFO',
        category: 'JOB',
        functionName: 'rebuildCreatorSuccessSignalsDaily',
        message: 'Daily success signals rebuild completed',
        context: {
          processedCount,
          errorCount,
          durationMs: duration,
        },
      });

      return null;
    } catch (error: any) {
      logger.error('[SuccessToolkit] Error in daily rebuild job', error);

      await logTechEvent({
        level: 'ERROR',
        category: 'JOB',
        functionName: 'rebuildCreatorSuccessSignalsDaily',
        message: `Daily rebuild failed: ${error.message}`,
        context: { error: error.message },
      });

      throw error;
    }
  }
);