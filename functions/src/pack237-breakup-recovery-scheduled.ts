/**
 * PACK 237: Breakup Recovery & Restart Path - Scheduled Functions
 * 
 * Automated progression of recovery stages and cleanup tasks.
 */

import * as functions from 'firebase-functions';
import { progressRestartStages } from './pack237-breakup-recovery-engine';
import { db } from './init';
import { onSchedule } from './runtime';

/**
 * Daily cron job to progress recovery stages
 * Runs at 2 AM UTC every day
 */
export const dailyRecoveryProgression = onSchedule({ schedule: "0 2 * * *", timeZone: "UTC" }, async (event) => {
    try {
      console.log('Starting daily recovery progression...');
      
      const result = await progressRestartStages();
      
      console.log(`Recovery progression complete: ${result.updated} states updated`);
      
      console.log('Scheduled job result:', { success: true, updated: result.updated });

      
      return;
    } catch (error) {
      console.error('Error in daily recovery progression:', error);
      throw error;
    }
  });

/**
 * Hourly check for expired end connection requests
 * Runs every hour
 */
export const hourlyExpiredRequestsCleanup = onSchedule({ schedule: "0 * * * *", timeZone: "UTC" }, async (event) => {
    try {
      console.log('Checking for expired end connection requests...');
      
      const now = new Date();
      
      // Find expired pending requests
      const expiredRequests = await db.collection('end_connection_requests')
        .where('status', '==', 'pending_confirmation')
        .where('expiresAt', '<', now)
        .get();
      
      let expired = 0;
      
      // Mark as expired
      for (const doc of expiredRequests.docs) {
        await doc.ref.update({
          status: 'expired',
          updatedAt: new Date()
        });
        expired++;
      }
      
      console.log(`Expired requests cleanup complete: ${expired} requests expired`);
      
      console.log('Scheduled job result:', { success: true, expired });

      
      return;
    } catch (error) {
      console.error('Error in expired requests cleanup:', error);
      throw error;
    }
  });

/**
 * Daily cleanup of completed recovery states older than 30 days
 * Runs at 3 AM UTC every day
 */
export const dailyCompletedRecoveryCleanup = onSchedule({ schedule: "0 3 * * *", timeZone: "UTC" }, async (event) => {
    try {
      console.log('Cleaning up old completed recovery states...');
      
      const thirtyDaysAgo = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000));
      
      // Find completed recovery states older than 30 days
      const oldRecoveries = await db.collection('breakup_recovery_states')
        .where('status', '==', 'inactive')
        .where('completedAt', '<', thirtyDaysAgo)
        .limit(100) // Process in batches
        .get();
      
      let archived = 0;
      
      // Archive to a separate collection
      for (const doc of oldRecoveries.docs) {
        const data = doc.data();
        
        // Copy to archive
        await db.collection('breakup_recovery_archives').doc(doc.id).set({
          ...data,
          archivedAt: new Date()
        });
        
        // Delete from active collection
        await doc.ref.delete();
        archived++;
      }
      
      console.log(`Completed recovery cleanup: ${archived} states archived`);
      
      console.log('Scheduled job result:', { success: true, archived });

      
      return;
    } catch (error) {
      console.error('Error in completed recovery cleanup:', error);
      throw error;
    }
  });

/**
 * Hourly generation of new recovery feed items
 * Runs every 6 hours
 */
export const generateRecoveryFeedItems = onSchedule({ schedule: "0 */6 * * *", timeZone: "UTC" }, async (event) => {
    try {
      console.log('Generating new recovery feed items...');
      
      // Get active recovery states
      const activeRecoveries = await db.collection('breakup_recovery_states')
        .where('status', '==', 'active')
        .limit(100) // Process in batches
        .get();
      
      let generated = 0;
      
      for (const doc of activeRecoveries.docs) {
        const recovery = doc.data();
        
        // Check if user needs new feed items
        const recentItems = await db.collection('recovery_feed_items')
          .where('userId', '==', recovery.userId)
          .where('recoveryId', '==', recovery.recoveryId)
          .where('createdAt', '>', new Date(Date.now() - (6 * 60 * 60 * 1000)))
          .get();
        
        // Only generate if no recent items
        if (recentItems.empty) {
          // Generate affirmation or milestone based on stage
          const feedItem = generateFeedItemForStage(recovery);
          
          if (feedItem) {
            await db.collection('recovery_feed_items').add({
              ...feedItem,
              userId: recovery.userId,
              recoveryId: recovery.recoveryId,
              createdAt: new Date()
            });
            generated++;
          }
        }
      }
      
      console.log(`Recovery feed generation complete: ${generated} items generated`);
      
      console.log('Scheduled job result:', { success: true, generated });

      
      return;
    } catch (error) {
      console.error('Error generating recovery feed items:', error);
      throw error;
    }
  });

/**
 * Helper to generate feed item based on recovery stage
 */
function generateFeedItemForStage(recovery: any): any {
  const affirmations = [
    {
      type: 'affirmation',
      title: 'Progress is personal',
      message: 'You\'re moving forward at exactly the right pace for you.',
      icon: '🌱'
    },
    {
      type: 'self_esteem_booster',
      title: 'Your worth is constant',
      message: 'One connection ending doesn\'t diminish your value.',
      icon: '💎'
    },
    {
      type: 'affirmation',
      title: 'Better matches ahead',
      message: 'Space is being created for someone more aligned with you.',
      icon: '✨'
    }
  ];
  
  // Return random affirmation
  return affirmations[Math.floor(Math.random() * affirmations.length)];
}










