/**
 * PACK 147 — Scheduled Jobs
 * 
 * Background tasks for refund & dispute system.
 */


import * as logger from 'firebase-functions/logger';
import { autoReleaseExpiredEscrows } from './pack147-escrow-engine';
import { functions, onSchedule } from './runtime';

/**
 * Auto-release expired escrows
 * Runs every hour
 */
export const pack147_autoReleaseEscrows = onSchedule(
  {
    schedule: 'every 1 hours',
    region: 'europe-west1',
    timeZone: 'UTC'
  },
  async () => {
    try {
      const releasedCount = await autoReleaseExpiredEscrows();
      logger.info(`Auto-release job completed: ${releasedCount} escrows released`);
    } catch (error) {
      logger.error('Auto-release job failed:', error);
    }
  }
);

logger.info('✅ PACK 147 scheduled jobs loaded successfully');









