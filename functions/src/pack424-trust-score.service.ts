/**
 * PACK 424 — Store Trust Score Calculator
 * Calculates overall reputation health score
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { StoreTrustScore, StoreReview, Platform } from './pack424-store-reviews.types';

const db = admin.firestore();

export class TrustScoreService {
  /**
   * Calculate the current store trust score
   */
  async calculateTrustScore(): Promise<StoreTrustScore> {
    const now = Date.now();
    const last14d = now - 14 * 24 * 60 * 60 * 1000;
    const last30d = now - 30 * 24 * 60 * 60 * 1000;

    // Get reviews for different periods
    const reviews14d = await this.getReviews(last14d, now);
    const reviews30d = await this.getReviews(last30d, now);

    // Calculate component scores
    const avgRatingLast14d = this.calculateAvgRating(reviews14d);
    const avgRatingLast30d = this.calculateAvgRating(reviews30d);
    const reviewVelocity = this.calculateReviewVelocity(reviews14d);
    const avgSentimentScore = this.calculateAvgSentiment(reviews14d);
    const fakeReviewRatio = await this.calculateFakeRatio(reviews14d);
    const responseTimeToNegativeReviews = await this.calculateAvgResponseTime(reviews14d);

    // Calculate platform-specific scores
    const iosReviews = reviews14d.filter(r => r.platform === 'IOS');
    const androidReviews = reviews14d.filter(r => r.platform === 'ANDROID');
    
    const iosScore = iosReviews.length > 0 
      ? this.calculatePlatformScore(iosReviews, reviewVelocity)
      : undefined;
    
    const androidScore = androidReviews.length > 0
      ? this.calculatePlatformScore(androidReviews, reviewVelocity)
      : undefined;

    // Weight the components
    const weights = {
      avgRating: 0.35,
      sentiment: 0.25,
      velocity: 0.15,
      fakeRatio: 0.15,
      responseTime: 0.10,
    };

    // Normalize each component to 0-1 scale
    const normalizedRating = Math.max(0, (avgRatingLast14d - 1) / 4); // 1-5 stars -> 0-1
    const normalizedSentiment = (avgSentimentScore + 1) / 2; // -1 to +1 -> 0-1
    const normalizedVelocity = Math.min(1, reviewVelocity / 50); // Cap at 50 reviews/day = 1.0
    const normalizedFakeRatio = 1 - fakeReviewRatio; // Lower fake ratio = higher score
    const normalizedResponseTime = responseTimeToNegativeReviews > 0
      ? Math.max(0, 1 - responseTimeToNegativeReviews / 48) // 48 hours = 0, 0 hours = 1
      : 0.5; // No negative reviews = neutral

    // Calculate weighted score
    const score = 
      normalizedRating * weights.avgRating +
      normalizedSentiment * weights.sentiment +
      normalizedVelocity * weights.velocity +
      normalizedFakeRatio * weights.fakeRatio +
      normalizedResponseTime * weights.responseTime;

    // Determine trend
    const previousScoreDoc = await db
      .collection('storeTrustScores')
      .orderBy('calculatedAt', 'desc')
      .limit(1)
      .get();

    let trend: 'improving' | 'stable' | 'declining' = 'stable';
    let previousScore: number | undefined;

    if (!previousScoreDoc.empty) {
      previousScore = previousScoreDoc.docs[0].data().score;
      const scoreDiff = score - previousScore;
      
      if (scoreDiff > 0.05) {
        trend = 'improving';
      } else if (scoreDiff < -0.05) {
        trend = 'declining';
      }
    }

    const trustScore: StoreTrustScore = {
      id: `trust_${now}`,
      calculatedAt: now,
      score: Math.round(score * 1000) / 1000, // 3 decimal places
      avgRatingLast14d,
      avgRatingLast30d,
      reviewVelocity,
      avgSentimentScore,
      fakeReviewRatio,
      responseTimeToNegativeReviews,
      iosScore,
      androidScore,
      trend,
      previousScore,
    };

    // Store the score
    await db.collection('storeTrustScores').doc(trustScore.id).set(trustScore);

    functions.logger.info('Trust score calculated', {
      score: trustScore.score,
      trend: trustScore.trend,
    });

    return trustScore;
  }

  /**
   * Get reviews for a time period
   */
  private async getReviews(startTime: number, endTime: number): Promise<StoreReview[]> {
    const snapshot = await db
      .collection('storeReviews')
      .where('createdAt', '>=', startTime)
      .where('createdAt', '<=', endTime)
      .get();

    return snapshot.docs.map(doc => doc.data() as StoreReview);
  }

  /**
   * Calculate average rating
   */
  private calculateAvgRating(reviews: StoreReview[]): number {
    if (reviews.length === 0) return 0;
    
    const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
    return sum / reviews.length;
  }

  /**
   * Calculate review velocity (reviews per day)
   */
  private calculateReviewVelocity(reviews: StoreReview[]): number {
    if (reviews.length === 0) return 0;

    const timeSpan = Date.now() - Math.min(...reviews.map(r => r.createdAt));
    const days = timeSpan / (24 * 60 * 60 * 1000);
    
    return reviews.length / Math.max(days, 1);
  }

  /**
   * Calculate average sentiment
   */
  private calculateAvgSentiment(reviews: StoreReview[]): number {
    const reviewsWithSentiment = reviews.filter(r => r.sentimentScore !== undefined);
    
    if (reviewsWithSentiment.length === 0) return 0;

    const sum = reviewsWithSentiment.reduce((acc, r) => acc + (r.sentimentScore || 0), 0);
    return sum / reviewsWithSentiment.length;
  }

  /**
   * Calculate ratio of fake/suspicious reviews
   */
  private async calculateFakeRatio(reviews: StoreReview[]): Promise<number> {
    if (reviews.length === 0) return 0;

    const flaggedCount = reviews.filter(r => r.riskFlag === true).length;
    return flaggedCount / reviews.length;
  }

  /**
   * Calculate average response time to negative reviews
   */
  private async calculateAvgResponseTime(reviews: StoreReview[]): Promise<number> {
    const negativeReviews = reviews.filter(r => r.rating <= 2);
    
    if (negativeReviews.length === 0) return 0;

    const respondedReviews = negativeReviews.filter(r => r.responseAt);
    
    if (respondedReviews.length === 0) return 999; // No responses = maximum time

    const responseTimes = respondedReviews.map(r => {
      const responseTime = (r.responseAt || 0) - r.createdAt;
      return responseTime / (60 * 60 * 1000); // Convert to hours
    });

    const avgTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    return avgTime;
  }

  /**
   * Calculate platform-specific score
   */
  private calculatePlatformScore(
    reviews: StoreReview[],
    overallVelocity: number
  ): number {
    if (reviews.length === 0) return 0;

    const avgRating = this.calculateAvgRating(reviews);
    const fakeCount = reviews.filter(r => r.riskFlag).length;
    const fakeRatio = fakeCount / reviews.length;

    // Simple weighted calculation
    const normalizedRating = (avgRating - 1) / 4;
    const normalizedFakeRatio = 1 - fakeRatio;

    return (normalizedRating * 0.7 + normalizedFakeRatio * 0.3);
  }

  /**
   * Get current trust score
   */
  async getCurrentTrustScore(): Promise<StoreTrustScore | null> {
    const snapshot = await db
      .collection('storeTrustScores')
      .orderBy('calculatedAt', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) return null;

    return snapshot.docs[0].data() as StoreTrustScore;
  }

  /**
   * Get trust score history
   */
  async getTrustScoreHistory(
    startTime: number,
    endTime: number
  ): Promise<StoreTrustScore[]> {
    const snapshot = await db
      .collection('storeTrustScores')
      .where('calculatedAt', '>=', startTime)
      .where('calculatedAt', '<=', endTime)
      .orderBy('calculatedAt', 'asc')
      .get();

    return snapshot.docs.map(doc => doc.data() as StoreTrustScore);
  }

  /**
   * Get trust score health status
   */
  getHealthStatus(score: number): 'excellent' | 'good' | 'fair' | 'poor' | 'critical' {
    if (score >= 0.85) return 'excellent';
    if (score >= 0.70) return 'good';
    if (score >= 0.55) return 'fair';
    if (score >= 0.40) return 'poor';
    return 'critical';
  }
}

export const trustScoreService = new TrustScoreService();

/**
 * Scheduled function: Calculate trust score every 6 hours
 */
export const scheduledTrustScoreCalculation = functions.pubsub
  .schedule('0 */6 * * *') // Every 6 hours
  .timeZone('UTC')
  .onRun(async (context) => {
    functions.logger.info('Starting scheduled trust score calculation');

    try {
      const score = await trustScoreService.calculateTrustScore();
      
      // Alert if score is declining or critical
      if (score.trend === 'declining' || score.score < 0.5) {
        await db.collection('adminNotifications').add({
          type: 'TRUST_SCORE_ALERT',
          severity: score.score < 0.4 ? 'high' : 'medium',
          message: `Trust score is ${score.trend}: ${score.score.toFixed(3)}`,
          data: score,
          createdAt: Date.now(),
          read: false,
        });
      }

      return { success: true, score: score.score };
    } catch (error) {
      functions.logger.error('Error calculating trust score:', error);
      throw error;
    }
  });

/**
 * HTTP endpoint to get current trust score
 */
export const getTrustScore = functions.https.onCall(async (data, context) => {
  // Verify admin or authorized access
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'Must be authenticated to view trust score'
    );
  }

  try {
    const currentScore = await trustScoreService.getCurrentTrustScore();
    
    if (!currentScore) {
      // Calculate if none exists
      return await trustScoreService.calculateTrustScore();
    }

    // Recalculate if older than 6 hours
    const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;
    if (currentScore.calculatedAt < sixHoursAgo) {
      return await trustScoreService.calculateTrustScore();
    }

    return currentScore;
  } catch (error) {
    functions.logger.error('Error getting trust score:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get trust score');
  }
});
