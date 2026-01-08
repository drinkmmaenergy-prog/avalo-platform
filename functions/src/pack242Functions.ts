/**
 * PACK 242 - Cloud Functions
 * Callable functions and scheduled jobs for Dynamic Chat Pricing
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import {
  checkPack242Eligibility,
  changePack242PriceTier,
  getPack242ChatPrice,
  getPack242Analytics,
  unlockPack242Pricing,
  trackMonthlyEarningsForPack242,
  type Pack242PriceTier
} from './pack242DynamicChatPricing.js';

// ============================================================================
// CALLABLE FUNCTIONS
// ============================================================================

/**
 * Check if user is eligible for dynamic pricing
 * Callable from client
 */
export const checkPack242EligibilityCallable = onCall(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;
    
    try {
      const eligibility = await checkPack242Eligibility(userId);
      return { success: true, data: eligibility };
    } catch (error: any) {
      logger.error('Error checking Pack242 eligibility:', error);
      throw new HttpsError('internal', error.message || 'Failed to check eligibility');
    }
  }
);

/**
 * Change price tier
 * Callable from client
 */
export const changePack242PriceTierCallable = onCall(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;
    const { newLevel } = request.data;

    if (typeof newLevel !== 'number' || newLevel < 0 || newLevel > 5) {
      throw new HttpsError('invalid-argument', 'newLevel must be 0-5');
    }

    try {
      const result = await changePack242PriceTier(userId, newLevel as Pack242PriceTier, 'manual');
      return result;
    } catch (error: any) {
      logger.error('Error changing Pack242 price tier:', error);
      throw new HttpsError('internal', error.message || 'Failed to change price tier');
    }
  }
);

/**
 * Get current chat price for a user
 * Callable from client
 */
export const getPack242ChatPriceCallable = onCall(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;

    try {
      const price = await getPack242ChatPrice(userId);
      return { success: true, price };
    } catch (error: any) {
      logger.error('Error getting Pack242 chat price:', error);
      throw new HttpsError('internal', error.message || 'Failed to get chat price');
    }
  }
);

/**
 * Get analytics (admin only)
 * Callable from client
 */
export const getPack242AnalyticsCallable = onCall(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Check if user is admin
    const { db } = await import('./init.js');
    const userDoc = await db.collection('users').doc(request.auth.uid).get();
    const userData = userDoc.data();
    
    if (!userData?.role || userData.role !== 'admin') {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    try {
      const analytics = await getPack242Analytics();
      return { success: true, data: analytics };
    } catch (error: any) {
      logger.error('Error getting Pack242 analytics:', error);
      throw new HttpsError('internal', error.message || 'Failed to get analytics');
    }
  }
);

/**
 * Unlock user pricing (admin only)
 * Callable from client
 */
export const unlockPack242PricingCallable = onCall(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const adminId = request.auth.uid;
    const { targetUserId } = request.data;

    if (!targetUserId || typeof targetUserId !== 'string') {
      throw new HttpsError('invalid-argument', 'targetUserId is required');
    }

    // Check if user is admin
    const { db } = await import('./init.js');
    const userDoc = await db.collection('users').doc(adminId).get();
    const userData = userDoc.data();
    
    if (!userData?.role || userData.role !== 'admin') {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    try {
      const result = await unlockPack242Pricing(targetUserId, adminId);
      return result;
    } catch (error: any) {
      logger.error('Error unlocking Pack242 pricing:', error);
      throw new HttpsError('internal', error.message || 'Failed to unlock pricing');
    }
  }
);

// ============================================================================
// SCHEDULED FUNCTIONS
// ============================================================================

/**
 * Weekly eligibility evaluation
 * Runs every Sunday at 2 AM UTC
 */
export const pack242WeeklyEligibilityCheck = onSchedule(
  {
    schedule: 'every sunday 02:00',
    timeZone: 'UTC',
    region: 'us-central1'
  },
  async () => {
    logger.info('Starting PACK 242 weekly eligibility check');
    
    try {
      const { db } = await import('./init.js');
      
      // Get all users with earnFromChat enabled
      const earners = await db.collection('users')
        .where('modes.earnFromChat', '==', true)
        .get();
      
      let evaluated = 0;
      let eligible = 0;

      for (const earnerDoc of earners.docs) {
        try {
          const userId = earnerDoc.id;
          const eligibility = await checkPack242Eligibility(userId);
          
          // Store eligibility result
          await db.collection('pack242_dynamic_pricing').doc(userId).set({
            userId,
            eligibility: eligibility.eligible,
            requirements: eligibility.requirements,
            canUse: eligibility.canUse,
            lastEligibilityCheck: new Date()
          }, { merge: true });
          
          if (eligibility.eligible) eligible++;
          evaluated++;
        } catch (error) {
          logger.error(`Failed to evaluate eligibility for ${earnerDoc.id}:`, error);
        }
      }
      
      logger.info(`PACK 242 weekly eligibility check complete: ${evaluated} evaluated, ${eligible} eligible`);
    } catch (error) {
      logger.error('Error in PACK 242 weekly eligibility check:', error);
      throw error;
    }
  }
);

/**
 * Monthly earnings tracking
 * Runs on the 1st of each month at 3 AM UTC
 */
export const pack242MonthlyEarningsTracking = onSchedule(
  {
    schedule: 'every month 1 03:00',
    timeZone: 'UTC',
    region: 'us-central1'
  },
  async () => {
    logger.info('Starting PACK 242 monthly earnings tracking');
    
    try {
      const tracked = await trackMonthlyEarningsForPack242();
      logger.info(`PACK 242 monthly earnings tracking complete: ${tracked} users tracked`);
    } catch (error) {
      logger.error('Error in PACK 242 monthly earnings tracking:', error);
      throw error;
    }
  }
);

/**
 * Daily analytics snapshot (for monitoring)
 * Runs every day at 4 AM UTC
 */
export const pack242DailyAnalyticsSnapshot = onSchedule(
  {
    schedule: 'every day 04:00',
    timeZone: 'UTC',
    region: 'us-central1'
  },
  async () => {
    logger.info('Starting PACK 242 daily analytics snapshot');
    
    try {
      const analytics = await getPack242Analytics();
      const { db, serverTimestamp } = await import('./init.js');
      
      // Store snapshot in analytics collection
      await db.collection('pack242_analytics_snapshots').add({
        totalEligible: analytics.totalEligible,
        totalLocked: analytics.totalLocked,
        priceDistribution: analytics.priceDistribution,
        averageMonthlyEarnings: analytics.averageMonthlyEarnings,
        timestamp: serverTimestamp()
      });
      
      logger.info('PACK 242 daily analytics snapshot complete:', {
        eligible: analytics.totalEligible,
        locked: analytics.totalLocked,
        avgEarnings: analytics.averageMonthlyEarnings
      });
    } catch (error) {
      logger.error('Error in PACK 242 daily analytics snapshot:', error);
      throw error;
    }
  }
);