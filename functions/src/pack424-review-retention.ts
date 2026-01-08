/**
 * PACK 424 — Review-to-Retention Feedback Loop
 * Auto-triggers actions based on review ratings
 * Integrates with PACK 300A (Support) and PACK 301B (Win-back flows)
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { StoreReview } from './pack424-store-reviews.types';

const db = admin.firestore();

export class ReviewRetentionService {
  /**
   * Process review and trigger appropriate retention actions
   */
  async processReviewForRetention(review: StoreReview): Promise<void> {
    try {
      if (!review.linkedUserId) {
        functions.logger.info('Review not linked to user, skipping retention actions', {
          reviewId: review.id,
        });
        return;
      }

      const userId = review.linkedUserId;

      // Negative reviews (1-2 stars)
      if (review.rating <= 2) {
        await this.handleNegativeReview(userId, review);
      }
      // Positive reviews (4-5 stars)
      else if (review.rating >= 4) {
        await this.handlePositiveReview(userId, review);
      }

      functions.logger.info('Processed review for retention', {
        reviewId: review.id,
        userId,
        rating: review.rating,
      });
    } catch (error) {
      functions.logger.error('Error processing review for retention:', error);
      throw error;
    }
  }

  /**
   * Handle negative reviews - trigger support and win-back flows
   */
  private async handleNegativeReview(
    userId: string,
    review: StoreReview
  ): Promise<void> {
    // 1. Create support ticket automatically (PACK 300A)
    await this.createSupportTicket(userId, review);

    // 2. Trigger win-back flow (PACK 301B)
    await this.triggerWinBackFlow(userId, review);

    // 3. Send proactive outreach notification
    await this.sendProactiveOutreach(userId, review);

    // 4. Flag user for special attention
    await this.flagUserForRetention(userId, 'negative_review', review);

    // 5. Log to retention analytics
    await this.logRetentionEvent(userId, 'negative_review', {
      reviewId: review.id,
      rating: review.rating,
      platform: review.platform,
    });
  }

  /**
   * Handle positive reviews - encourage engagement and referrals
   */
  private async handlePositiveReview(
    userId: string,
    review: StoreReview
  ): Promise<void> {
    // 1. Send thank you notification
    await this.sendThankYouNotification(userId, review);

    // 2. Trigger referral prompt (if eligible)
    await this.offerReferralIncentive(userId, review);

    // 3. Award creator encouragement badge/points
    await this.awardEngagementBonus(userId, review);

    // 4. Log positive engagement
    await this.logRetentionEvent(userId, 'positive_review', {
      reviewId: review.id,
      rating: review.rating,
      platform: review.platform,
    });
  }

  /**
   * Create automatic support ticket for negative review
   */
  private async createSupportTicket(
    userId: string,
    review: StoreReview
  ): Promise<void> {
    try {
      const ticket = {
        userId,
        type: 'NEGATIVE_REVIEW_FOLLOWUP',
        priority: review.rating === 1 ? 'high' : 'medium',
        status: 'open',
        subject: `Follow-up on ${review.rating}-star review`,
        description: review.reviewText || 'User left negative review without comment',
        source: 'auto_generated',
        metadata: {
          reviewId: review.id,
          platform: review.platform,
          rating: review.rating,
          reviewText: review.reviewText,
        },
        createdAt: Date.now(),
        lastUpdated: Date.now(),
      };

      await db.collection('supportTickets').add(ticket);

      functions.logger.info('Created support ticket for negative review', {
        userId,
        reviewId: review.id,
      });
    } catch (error) {
      functions.logger.error('Error creating support ticket:', error);
    }
  }

  /**
   * Trigger win-back flow for user who left negative review
   */
  private async triggerWinBackFlow(
    userId: string,
    review: StoreReview
  ): Promise<void> {
    try {
      const winBackFlow = {
        userId,
        trigger: 'NEGATIVE_REVIEW',
        status: 'active',
        flowType: 'at_risk_user',
        metadata: {
          reviewId: review.id,
          rating: review.rating,
          reviewText: review.reviewText,
        },
        createdAt: Date.now(),
        scheduledActions: [
          {
            action: 'send_apology_email',
            scheduledFor: Date.now() + 1 * 60 * 60 * 1000, // 1 hour
            status: 'pending',
          },
          {
            action: 'offer_support',
            scheduledFor: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
            status: 'pending',
          },
          {
            action: 'offer_incentive',
            scheduledFor: Date.now() + 3 * 24 * 60 * 60 * 1000, // 3 days
            status: 'pending',
          },
        ],
      };

      await db.collection('winBackFlows').add(winBackFlow);

      functions.logger.info('Triggered win-back flow', {
        userId,
        reviewId: review.id,
      });
    } catch (error) {
      functions.logger.error('Error triggering win-back flow:', error);
    }
  }

  /**
   * Send proactive outreach notification
   */
  private async sendProactiveOutreach(
    userId: string,
    review: StoreReview
  ): Promise<void> {
    try {
      await db.collection('notifications').add({
        userId,
        type: 'SUPPORT_OUTREACH',
        title: "We're here to help! 💙",
        body: "We saw you had a less than perfect experience. Let's fix that together!",
        priority: 'high',
        data: {
          reviewId: review.id,
          action: 'open_support',
        },
        createdAt: Date.now(),
        read: false,
        delivered: false,
      });
    } catch (error) {
      functions.logger.error('Error sending proactive outreach:', error);
    }
  }

  /**
   * Flag user for special retention attention
   */
  private async flagUserForRetention(
    userId: string,
    reason: string,
    review: StoreReview
  ): Promise<void> {
    try {
      await db.collection('users').doc(userId).update({
        retentionFlags: admin.firestore.FieldValue.arrayUnion({
          type: reason,
          timestamp: Date.now(),
          reviewId: review.id,
          rating: review.rating,
        }),
        retentionPriority: 'high',
        lastRetentionAction: Date.now(),
      });
    } catch (error) {
      functions.logger.error('Error flagging user for retention:', error);
    }
  }

  /**
   * Send thank you notification for positive review
   */
  private async sendThankYouNotification(
    userId: string,
    review: StoreReview
  ): Promise<void> {
    try {
      await db.collection('notifications').add({
        userId,
        type: 'REVIEW_THANK_YOU',
        title: 'Thank you for your amazing review! ⭐',
        body: 'Your support means the world to us!',
        priority: 'low',
        data: {
          reviewId: review.id,
        },
        createdAt: Date.now(),
        read: false,
        delivered: false,
      });
    } catch (error) {
      functions.logger.error('Error sending thank you notification:', error);
    }
  }

  /**
   * Offer referral incentive to happy users
   */
  private async offerReferralIncentive(
    userId: string,
    review: StoreReview
  ): Promise<void> {
    try {
      // Check if user is eligible for referral program
      const userDoc = await db.collection('users').doc(userId).get();
      const userData = userDoc.data();

      if (!userData || userData.referralsSent >= 10) {
        return; // Already active referrer
      }

      await db.collection('notifications').add({
        userId,
        type: 'REFERRAL_INVITATION',
        title: 'Love Avalo? Share it with friends! 🎁',
        body: 'Get rewards when your friends join Avalo',
        priority: 'medium',
        data: {
          action: 'open_referral',
          incentive: 'both_get_premium_day',
        },
        createdAt: Date.now(),
        read: false,
        delivered: false,
      });
    } catch (error) {
      functions.logger.error('Error offering referral incentive:', error);
    }
  }

  /**
   * Award engagement bonus for positive review
   */
  private async awardEngagementBonus(
    userId: string,
    review: StoreReview
  ): Promise<void> {
    try {
      const bonusPoints = review.rating === 5 ? 100 : 50;

      await db.collection('users').doc(userId).update({
        influencerPoints: admin.firestore.FieldValue.increment(bonusPoints),
        'badges': admin.firestore.FieldValue.arrayUnion('avalo_advocate'),
      });

      // Send notification about bonus
      await db.collection('notifications').add({
        userId,
        type: 'BONUS_AWARDED',
        title: `+${bonusPoints} Influencer Points! 🎉`,
        body: 'Thank you for being an Avalo advocate!',
        priority: 'low',
        data: {
          points: bonusPoints,
          reason: 'positive_review',
        },
        createdAt: Date.now(),
        read: false,
        delivered: false,
      });

      functions.logger.info('Awarded engagement bonus', {
        userId,
        points: bonusPoints,
        reviewId: review.id,
      });
    } catch (error) {
      functions.logger.error('Error awarding engagement bonus:', error);
    }
  }

  /**
   * Log retention event for analytics
   */
  private async logRetentionEvent(
    userId: string,
    eventType: 'negative_review' | 'positive_review',
    metadata: any
  ): Promise<void> {
    try {
      await db.collection('retentionEvents').add({
        userId,
        eventType,
        timestamp: Date.now(),
        source: 'pack424_review_retention',
        metadata,
      });
    } catch (error) {
      functions.logger.error('Error logging retention event:', error);
    }
  }
}

export const reviewRetentionService = new ReviewRetentionService();

/**
 * Firestore trigger: Process new reviews for retention
 */
export const processNewReviewForRetention = functions.firestore
  .document('storeReviews/{reviewId}')
  .onCreate(async (snap, context) => {
    const review = snap.data() as StoreReview;

    try {
      // Only process if review is linked to a user
      if (review.linkedUserId) {
        await reviewRetentionService.processReviewForRetention(review);
      }
    } catch (error) {
      functions.logger.error('Error in review retention trigger:', error);
    }
  });

/**
 * HTTP endpoint: Manually trigger retention flow for review
 */
export const triggerRetentionForReview = functions.https.onCall(
  async (data, context) => {
    if (!context.auth?.token?.admin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only admins can trigger retention flows'
      );
    }

    try {
      const reviewId = data.reviewId;

      if (!reviewId) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'reviewId is required'
        );
      }

      const reviewDoc = await db.collection('storeReviews').doc(reviewId).get();
      
      if (!reviewDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Review not found');
      }

      const review = reviewDoc.data() as StoreReview;

      await reviewRetentionService.processReviewForRetention(review);

      return {
        success: true,
        reviewId,
        userId: review.linkedUserId,
      };
    } catch (error) {
      functions.logger.error('Error triggering retention:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to trigger retention flow'
      );
    }
  }
);
