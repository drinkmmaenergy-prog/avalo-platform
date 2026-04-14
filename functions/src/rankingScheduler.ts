import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

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
import { timestamp, logger, onSchedule } from './runtime';

/**
 * Main scheduler - runs every 10 minutes
 * Updates rankings and manages Top 10 bonuses
 */
export const updateRankingsScheduler = onSchedule({ schedule: "every 10 minutes", timeZone: "UTC" }, async (event) => {
    try {
      // Apply/update Top 10 bonuses for daily worldwide ranking
      await applyTop10Bonuses();
      
      console.log('Scheduled job result:', { success: true, timestamp: new Date().toISOString() });

      
      return;
    } catch (error) {
      throw new Error(`Ranking scheduler failed: ${error}`);
    }
  });

/**
 * Cleanup scheduler - runs daily at midnight UTC
 * Removes expired score data to optimize database
 */
export const cleanupRankingsScheduler = onSchedule({ schedule: "every day 00:00", timeZone: "UTC" }, async (event) => {
    try {
      await cleanupOldScores();
      
      console.log('Scheduled job result:', { success: true, timestamp: new Date().toISOString() });

      
      return;
    } catch (error) {
      throw new Error(`Cleanup scheduler failed: ${error}`);
    }
  });

























