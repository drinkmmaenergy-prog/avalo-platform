/**
 * PACK 148 - Scheduled Functions
 * Background jobs for ledger maintenance
 */

import * as functions from 'firebase-functions';
import { scheduledBlockchainIntegrityCheck } from './pack148-blockchain-verification';
import { cleanupExpiredExports } from './pack148-export-engine';
import { onSchedule } from './runtime';

/**
 * Daily blockchain integrity check
 * Verifies blockchain chain integrity and alerts on issues
 * Runs at 3 AM UTC daily
 */
export const dailyBlockchainIntegrityCheck = onSchedule({ schedule: "0 3 * * *", timeZone: "UTC" }, async (event) => {
    console.log('🔗 Starting daily blockchain integrity check...');
    
    try {
      await scheduledBlockchainIntegrityCheck();
      console.log('✅ Daily blockchain integrity check completed');
    } catch (error) {
      console.error('❌ Daily blockchain integrity check failed:', error);
      throw error;
    }
  });

/**
 * Cleanup expired exports
 * Deletes expired export files and records
 * Runs every 6 hours
 */
export const cleanupExpiredExportsJob = onSchedule({ schedule: "0 */6 * * *", timeZone: "UTC" }, async (event) => {
    console.log('🗑️ Starting expired exports cleanup...');
    
    try {
      const deleted = await cleanupExpiredExports();
      console.log(`✅ Expired exports cleanup completed: ${deleted} exports deleted`);
    } catch (error) {
      console.error('❌ Expired exports cleanup failed:', error);
      throw error;
    }
  });









