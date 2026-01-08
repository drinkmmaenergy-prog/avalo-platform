/**
 * PACK 439 - App Store Trust, Ratings & Review Shield
 * ReviewBombingDetector - Detects coordinated review attacks
 * 
 * Dependencies: PACK 296, 299, 324, 365, 437, 438
 * Status: ACTIVE
 */

import { db } from '../lib/firebase-admin';
import { auditLog } from './pack296-audit-logger';
import { sendAlert } from './pack299-analytics-safety';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';

export interface Review {
  id: string;
  userId: string;
  platform: 'ios' | 'android';
  rating: number; // 1-5
  text?: string;
  timestamp: Timestamp;
  version: string;
  region: string;
  language: string;
  accountAge?: number; // days
  previousReviews?: number;
  verified?: boolean;
}

export interface BombingSignal {
  type: 'velocity_spike' | 'pattern_match' | 'new_accounts' | 'coordinated_language';
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number; // 0-1
  affectedCount: number;
  details: string;
  timestamp: Timestamp;
}

export interface BombingDetectionResult {
  isBombing: boolean;
  confidence: number;
  signals: BombingSignal[];
  affectedReviews: string[];
  recommendation: 'monitor' | 'alert' | 'mitigate' | 'escalate';
}

export class ReviewBombingDetector {
  private readonly VELOCITY_THRESHOLD = 5; // reviews per hour baseline
  private readonly SPIKE_MULTIPLIER = 3; // 3x normal is suspicious
  private readonly NEW_ACCOUNT_THRESHOLD = 7; // days
  private readonly PATTERN_SIMILARITY_THRESHOLD = 0.85;
  private readonly MIN_BOMBING_SIZE = 10; // minimum reviews to consider bombing

  /**
   * Main detection entry point - analyzes recent reviews for bombing patterns
   */
  async detectBombing(
    platform: 'ios' | 'android',
    timeWindowHours: number = 24
  ): Promise<BombingDetectionResult> {
    try {
      const windowStart = new Date(Date.now() - timeWindowHours * 60 * 60 * 1000);
      
      // Fetch recent reviews
      const reviews = await this.fetchReviews(platform, windowStart);

      if (reviews.length === 0) {
        return this.createNegativeResult();
      }

      const signals: BombingSignal[] = [];

      // 1. Velocity spike detection
      const velocitySignal = await this.detectVelocitySpike(reviews, platform);
      if (velocitySignal) signals.push(velocitySignal);

      // 2. Pattern matching (coordinated language)
      const patternSignal = await this.detectLanguagePatterns(reviews);
      if (patternSignal) signals.push(patternSignal);

      // 3. New/low-reputation accounts
      const accountSignal = await this.detectNewAccounts(reviews);
      if (accountSignal) signals.push(accountSignal);

      // 4. Rating distribution anomaly
      const distributionSignal = await this.detectRatingAnomaly(reviews, platform);
      if (distributionSignal) signals.push(distributionSignal);

      // Calculate overall confidence and recommendation
      const result = this.calculateBombingResult(signals, reviews);

      // Log to audit trail
      await auditLog({
        action: 'review_bombing_detection',
        userId: 'system',
        metadata: {
          platform,
          reviewCount: reviews.length,
          signalCount: signals.length,
          confidence: result.confidence,
          isBombing: result.isBombing,
        },
        packId: 'PACK-439',
      });

      // Send alert if bombing detected
      if (result.isBombing && result.confidence > 0.7) {
        await sendAlert({
          type: 'review_bombing_detected',
          severity: this.getSeverityLevel(result.confidence),
          data: {
            platform,
            affectedCount: result.affectedReviews.length,
            confidence: result.confidence,
            signals: signals.map(s => s.type),
          },
        });
      }

      return result;

    } catch (error) {
      console.error('[ReviewBombingDetector] Detection error:', error);
      throw error;
    }
  }

  /**
   * Fetch reviews from the database within time window
   */
  private async fetchReviews(
    platform: 'ios' | 'android',
    since: Date
  ): Promise<Review[]> {
    const snapshot = await db
      .collection('appStoreReviews')
      .where('platform', '==', platform)
      .where('timestamp', '>=', Timestamp.fromDate(since))
      .orderBy('timestamp', 'desc')
      .limit(1000)
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as Review));
  }

  /**
   * Detect sudden velocity spikes (reviews per hour)
   */
  private async detectVelocitySpike(
    reviews: Review[],
    platform: 'ios' | 'android'
  ): Promise<BombingSignal | null> {
    // Get baseline velocity (30-day average)
    const baseline = await this.getBaselineVelocity(platform);
    
    // Calculate current velocity (reviews per hour)
    const hourlyBuckets = this.groupByHour(reviews);
    const maxHourlyRate = Math.max(...Object.values(hourlyBuckets));
    const avgHourlyRate = Object.values(hourlyBuckets).reduce((a, b) => a + b, 0) / Object.keys(hourlyBuckets).length;

    if (maxHourlyRate > baseline * this.SPIKE_MULTIPLIER) {
      const spikeRatio = maxHourlyRate / baseline;
      return {
        type: 'velocity_spike',
        severity: spikeRatio > 5 ? 'critical' : spikeRatio > 3 ? 'high' : 'medium',
        confidence: Math.min(0.95, spikeRatio / 10),
        affectedCount: maxHourlyRate,
        details: `Review velocity ${spikeRatio.toFixed(1)}x baseline (${maxHourlyRate}/hr vs ${baseline.toFixed(1)}/hr)`,
        timestamp: Timestamp.now(),
      };
    }

    return null;
  }

  /**
   * Detect coordinated language patterns
   */
  private async detectLanguagePatterns(reviews: Review[]): Promise<BombingSignal | null> {
    const reviewsWithText = reviews.filter(r => r.text && r.text.length > 10);
    
    if (reviewsWithText.length < this.MIN_BOMBING_SIZE) {
      return null;
    }

    // Check for similar phrases and patterns
    const similarities: number[] = [];
    
    for (let i = 0; i < reviewsWithText.length - 1; i++) {
      for (let j = i + 1; j < reviewsWithText.length; j++) {
        const similarity = this.calculateTextSimilarity(
          reviewsWithText[i].text!,
          reviewsWithText[j].text!
        );
        similarities.push(similarity);
      }
    }

    if (similarities.length === 0) return null;

    const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;
    const highSimilarityCount = similarities.filter(s => s > this.PATTERN_SIMILARITY_THRESHOLD).length;

    if (highSimilarityCount > similarities.length * 0.3) {
      return {
        type: 'coordinated_language',
        severity: avgSimilarity > 0.9 ? 'critical' : avgSimilarity > 0.85 ? 'high' : 'medium',
        confidence: avgSimilarity,
        affectedCount: reviewsWithText.length,
        details: `${highSimilarityCount} review pairs show high similarity (avg: ${(avgSimilarity * 100).toFixed(1)}%)`,
        timestamp: Timestamp.now(),
      };
    }

    return null;
  }

  /**
   * Detect high concentration of new/low-reputation accounts
   */
  private async detectNewAccounts(reviews: Review[]): Promise<BombingSignal | null> {
    const newAccountReviews = reviews.filter(
      r => r.accountAge !== undefined && r.accountAge < this.NEW_ACCOUNT_THRESHOLD
    );

    const newAccountRatio = newAccountReviews.length / reviews.length;

    if (newAccountRatio > 0.5 && newAccountReviews.length >= this.MIN_BOMBING_SIZE) {
      return {
        type: 'new_accounts',
        severity: newAccountRatio > 0.8 ? 'critical' : newAccountRatio > 0.65 ? 'high' : 'medium',
        confidence: newAccountRatio,
        affectedCount: newAccountReviews.length,
        details: `${(newAccountRatio * 100).toFixed(1)}% of reviews from accounts < ${this.NEW_ACCOUNT_THRESHOLD} days old`,
        timestamp: Timestamp.now(),
      };
    }

    return null;
  }

  /**
   * Detect anomalous rating distribution
   */
  private async detectRatingAnomaly(
    reviews: Review[],
    platform: 'ios' | 'android'
  ): Promise<BombingSignal | null> {
    const ratingCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    reviews.forEach(r => ratingCounts[r.rating as keyof typeof ratingCounts]++);

    // Get historical distribution
    const historicalDist = await this.getHistoricalRatingDistribution(platform);

    // Check for abnormal concentration of 1-star reviews
    const oneStarRatio = ratingCounts[1] / reviews.length;
    const historicalOneStarRatio = historicalDist[1];

    if (oneStarRatio > historicalOneStarRatio * 2 && ratingCounts[1] >= this.MIN_BOMBING_SIZE) {
      const anomalyScore = oneStarRatio / historicalOneStarRatio;
      return {
        type: 'velocity_spike',
        severity: anomalyScore > 4 ? 'critical' : anomalyScore > 2.5 ? 'high' : 'medium',
        confidence: Math.min(0.9, anomalyScore / 5),
        affectedCount: ratingCounts[1],
        details: `1-star reviews ${anomalyScore.toFixed(1)}x higher than baseline (${(oneStarRatio * 100).toFixed(1)}% vs ${(historicalOneStarRatio * 100).toFixed(1)}%)`,
        timestamp: Timestamp.now(),
      };
    }

    return null;
  }

  /**
   * Calculate overall bombing result from signals
   */
  private calculateBombingResult(
    signals: BombingSignal[],
    reviews: Review[]
  ): BombingDetectionResult {
    if (signals.length === 0) {
      return this.createNegativeResult();
    }

    // Weight signals by severity
    const severityWeights = { low: 0.25, medium: 0.5, high: 0.75, critical: 1.0 };
    const weightedConfidence = signals.reduce(
      (sum, signal) => sum + signal.confidence * severityWeights[signal.severity],
      0
    ) / signals.length;

    const isBombing = signals.length >= 2 && weightedConfidence > 0.6;
    const affectedReviews = reviews.slice(0, Math.max(...signals.map(s => s.affectedCount))).map(r => r.id);

    let recommendation: BombingDetectionResult['recommendation'] = 'monitor';
    if (weightedConfidence > 0.85) recommendation = 'escalate';
    else if (weightedConfidence > 0.7) recommendation = 'mitigate';
    else if (weightedConfidence > 0.5) recommendation = 'alert';

    return {
      isBombing,
      confidence: weightedConfidence,
      signals,
      affectedReviews,
      recommendation,
    };
  }

  /**
   * Get baseline review velocity (reviews per hour)
   */
  private async getBaselineVelocity(platform: 'ios' | 'android'): Promise<number> {
    const doc = await db.collection('storeMetrics').doc(`${platform}_baseline`).get();
    return doc.exists ? (doc.data()?.averageReviewsPerHour || this.VELOCITY_THRESHOLD) : this.VELOCITY_THRESHOLD;
  }

  /**
   * Get historical rating distribution
   */
  private async getHistoricalRatingDistribution(
    platform: 'ios' | 'android'
  ): Promise<{ [key: number]: number }> {
    const doc = await db.collection('storeMetrics').doc(`${platform}_distribution`).get();
    return doc.exists ? doc.data()?.distribution || { 1: 0.05, 2: 0.05, 3: 0.15, 4: 0.25, 5: 0.5 }
      : { 1: 0.05, 2: 0.05, 3: 0.15, 4: 0.25, 5: 0.5 };
  }

  /**
   * Group reviews by hour
   */
  private groupByHour(reviews: Review[]): { [hour: string]: number } {
    const buckets: { [hour: string]: number } = {};
    
    reviews.forEach(review => {
      const hour = new Date(review.timestamp.toDate()).toISOString().slice(0, 13);
      buckets[hour] = (buckets[hour] || 0) + 1;
    });

    return buckets;
  }

  /**
   * Calculate text similarity using Jaccard similarity
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    const normalize = (text: string) => 
      text.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 2);

    const words1 = new Set(normalize(text1));
    const words2 = new Set(normalize(text2));

    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  /**
   * Get severity level string from confidence
   */
  private getSeverityLevel(confidence: number): 'low' | 'medium' | 'high' | 'critical' {
    if (confidence > 0.85) return 'critical';
    if (confidence > 0.7) return 'high';
    if (confidence > 0.5) return 'medium';
    return 'low';
  }

  /**
   * Create negative result (no bombing detected)
   */
  private createNegativeResult(): BombingDetectionResult {
    return {
      isBombing: false,
      confidence: 0,
      signals: [],
      affectedReviews: [],
      recommendation: 'monitor',
    };
  }

  /**
   * Manual review of specific review IDs
   */
  async reviewManualInspection(reviewIds: string[], decision: 'legitimate' | 'malicious'): Promise<void> {
    const batch = db.batch();

    for (const reviewId of reviewIds) {
      const ref = db.collection('appStoreReviews').doc(reviewId);
      batch.update(ref, {
        manualReview: decision,
        reviewedAt: FieldValue.serverTimestamp(),
        reviewedBy: 'admin',
      });
    }

    await batch.commit();

    await auditLog({
      action: 'manual_review_decision',
      userId: 'admin',
      metadata: { reviewIds, decision },
      packId: 'PACK-439',
    });
  }
}

export const reviewBombingDetector = new ReviewBombingDetector();
