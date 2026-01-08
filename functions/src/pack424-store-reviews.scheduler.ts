/**
 * PACK 424 — Store Review Scheduler
 * Automatically polls store reviews every 30 minutes
 */

import * as functions from 'firebase-functions';
import { storeReviewService } from './pack424-store-reviews.service';
import { reputationDefenseService } from './pack424-reputation-defense';

// Configuration
const APP_CONFIG = {
  android: {
    packageName: functions.config().avalo?.android_package || 'com.avalo.app',
  },
  ios: {
    appId: functions.config().avalo?.ios_app_id || '123456789',
    countries: ['us', 'gb', 'ca', 'au', 'de', 'fr', 'es', 'it'],
  },
};

/**
 * Scheduled function: Run every 30 minutes
 * Fetches latest reviews from both stores
 */
export const scheduledReviewSync = functions.pubsub
  .schedule('every 30 minutes')
  .timeZone('UTC')
  .onRun(async (context) => {
    functions.logger.info('Starting scheduled review sync');

    try {
      // Fetch Android reviews
      const androidReviews = await storeReviewService.fetchGooglePlayReviews(
        APP_CONFIG.android.packageName,
        100
      );

      functions.logger.info(`Fetched ${androidReviews.length} Android reviews`);

      // Fetch iOS reviews from multiple regions
      const iosReviews = [];
      for (const country of APP_CONFIG.ios.countries) {
        const countryReviews = await storeReviewService.fetchAppStoreReviews(
          APP_CONFIG.ios.appId,
          country,
          50
        );
        iosReviews.push(...countryReviews);
        
        // Rate limit between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      functions.logger.info(`Fetched ${iosReviews.length} iOS reviews`);

      // Combine and store
      const allReviews = [...androidReviews, ...iosReviews];
      
      if (allReviews.length > 0) {
        await storeReviewService.storeReviews(allReviews);

        // Process each new review
        for (const review of allReviews) {
          await storeReviewService.processReview(review);
        }

        // Run defense check on new reviews
        await reputationDefenseService.detectAttacks();

        functions.logger.info(`Processed ${allReviews.length} total reviews`);
      } else {
        functions.logger.info('No new reviews found');
      }

      return { success: true, reviewsProcessed: allReviews.length };
    } catch (error) {
      functions.logger.error('Error in scheduled review sync:', error);
      throw error;
    }
  });

/**
 * Manual trigger for immediate review sync
 */
export const triggerReviewSync = functions.https.onCall(async (data, context) => {
  // Verify admin access
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Only admins can trigger manual review sync'
    );
  }

  functions.logger.info('Manual review sync triggered', {
    userId: context.auth.uid,
  });

  try {
    const platform = data.platform as 'android' | 'ios' | 'both';
    const maxResults = data.maxResults || 100;

    let allReviews = [];

    // Fetch based on platform
    if (platform === 'android' || platform === 'both') {
      const androidReviews = await storeReviewService.fetchGooglePlayReviews(
        APP_CONFIG.android.packageName,
        maxResults
      );
      allReviews.push(...androidReviews);
    }

    if (platform === 'ios' || platform === 'both') {
      for (const country of APP_CONFIG.ios.countries) {
        const iosReviews = await storeReviewService.fetchAppStoreReviews(
          APP_CONFIG.ios.appId,
          country,
          Math.floor(maxResults / APP_CONFIG.ios.countries.length)
        );
        allReviews.push(...iosReviews);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Store and process
    if (allReviews.length > 0) {
      await storeReviewService.storeReviews(allReviews);

      for (const review of allReviews) {
        await storeReviewService.processReview(review);
      }

      await reputationDefenseService.detectAttacks();
    }

    return {
      success: true,
      reviewsProcessed: allReviews.length,
      platform,
    };
  } catch (error) {
    functions.logger.error('Error in manual review sync:', error);
    throw new functions.https.HttpsError('internal', 'Failed to sync reviews');
  }
});

/**
 * Webhook endpoint for store notifications
 * Some stores support webhooks for new reviews
 */
export const storeReviewWebhook = functions.https.onRequest(async (req, res) => {
  // Verify webhook signature
  const signature = req.headers['x-store-signature'] as string;
  
  // TODO: Implement signature verification
  // For Google Play Developer API notifications
  // For App Store Server Notifications

  try {
    const notification = req.body;
    
    functions.logger.info('Received store webhook', {
      type: notification.type,
      platform: notification.platform,
    });

    // Process based on notification type
    if (notification.type === 'NEW_REVIEW') {
      // Fetch the specific review
      const platform = notification.platform;
      
      if (platform === 'android') {
        const reviews = await storeReviewService.fetchGooglePlayReviews(
          APP_CONFIG.android.packageName,
          10
        );
        
        if (reviews.length > 0) {
          await storeReviewService.storeReviews(reviews);
          
          for (const review of reviews) {
            await storeReviewService.processReview(review);
          }
        }
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    functions.logger.error('Error processing webhook:', error);
    res.status(500).json({ error: 'Processing failed' });
  }
});

/**
 * Scheduled function: Daily review metrics calculation
 * Runs at 3 AM UTC
 */
export const dailyReviewMetrics = functions.pubsub
  .schedule('0 3 * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    functions.logger.info('Starting daily review metrics calculation');

    try {
      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;
      const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

      // Calculate stats for different periods
      const stats24h = await storeReviewService.getReviewStats(oneDayAgo, now);
      const stats7d = await storeReviewService.getReviewStats(sevenDaysAgo, now);
      const stats30d = await storeReviewService.getReviewStats(thirtyDaysAgo, now);

      // Store metrics
      await functions.firestore().collection('reviewMetrics').add({
        timestamp: now,
        period_24h: stats24h,
        period_7d: stats7d,
        period_30d: stats30d,
        calculatedAt: now,
      });

      functions.logger.info('Daily review metrics calculated', {
        reviews24h: stats24h.totalReviews,
        reviews7d: stats7d.totalReviews,
        reviews30d: stats30d.totalReviews,
      });

      return { success: true };
    } catch (error) {
      functions.logger.error('Error calculating daily metrics:', error);
      throw error;
    }
  });
