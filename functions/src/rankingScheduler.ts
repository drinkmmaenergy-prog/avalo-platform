/**
 * Phase 11C - Ranking Scheduler
 * Scheduled functions for ranking updates and Top 10 bonus management
 *
 * Runs every 10 minutes to:
 * - Update daily/weekly/monthly leaderboards
 * - Apply/remove Top 10 bonuses automatically
 * - Clean up old score data
 */

import * as functions from 'firebase-functions';
import { applyTop10Bonuses, cleanupOldScores } from './rankingEngine';

/**
 * Main scheduler - runs every 10 minutes
 * Updates rankings and manages Top 10 bonuses
 */
export const updateRankingsScheduler = functions.pubsub
  .schedule('every 10 minutes')
  .timeZone('UTC')
  .onRun(async (context) => {
    try {
      // Apply/update Top 10 bonuses for daily worldwide ranking
      await applyTop10Bonuses();
      
      return { success: true, timestamp: new Date().toISOString() };
    } catch (error) {
      throw new Error(`Ranking scheduler failed: ${error}`);
    }
  });

/**
 * Cleanup scheduler - runs daily at midnight UTC
 * Removes expired score data to optimize database
 */
export const cleanupRankingsScheduler = functions.pubsub
  .schedule('every day 00:00')
  .timeZone('UTC')
  .onRun(async (context) => {
    try {
      await cleanupOldScores();
      
      return { success: true, timestamp: new Date().toISOString() };
    } catch (error) {
      throw new Error(`Cleanup scheduler failed: ${error}`);
    }
  });