/**
 * PACK 424 — Reputation Defense Engine
 * Detects fake reviews, coordinated attacks, and review bombing
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import {
  StoreReview,
  ReviewBurst,
  ReviewDetectionResult,
} from './pack424-store-reviews.types';

const db = admin.firestore();

export class ReputationDefenseService {
  private readonly BURST_WINDOW = 2 * 60 * 60 * 1000; // 2 hours
  private readonly BURST_THRESHOLD = 10; // 10+ reviews in window
  private readonly SIMILARITY_THRESHOLD = 0.7; // 70% text similarity

  /**
   * Main detection routine - runs after new reviews are ingested
   */
  async detectAttacks(): Promise<void> {
    functions.logger.info('Running reputation defense checks');

    try {
      // Get recent reviews (last 7 days)
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const recentReviews = await this.getRecentReviews(sevenDaysAgo);

      // Run detection heuristics
      const burstResults = await this.detectReviewBursts(recentReviews);
      const similarityResults = await this.detectSimilarReviews(recentReviews);
      const anomalyResults = await this.detectAnomalousPatterns(recentReviews);

      // Flag suspicious reviews
      const allSuspicious = new Set<string>();
      
      // Collect from bursts
      for (const burst of burstResults) {
        burst.reviewIds.forEach(id => allSuspicious.add(id));
      }
      
      // Collect from similarity
      for (const result of similarityResults) {
        if (result.isSuspicious) {
          allSuspicious.add(result.reviewId);
          result.relatedReviewIds?.forEach(id => allSuspicious.add(id));
        }
      }
      
      // Collect from anomalies
      for (const result of anomalyResults) {
        if (result.isSuspicious) {
          allSuspicious.add(result.reviewId);
        }
      }

      // Update reviews with risk flags
      await this.flagSuspiciousReviews(Array.from(allSuspicious));

      // Send alerts if critical
      if (allSuspicious.size > 5) {
        await this.sendDefenseAlert(
          'high',
          `Detected ${allSuspicious.size} suspicious reviews`,
          {
            suspiciousCount: allSuspicious.size,
            burstsDetected: burstResults.length,
            similarGroups: similarityResults.filter(r => r.isSuspicious).length,
          }
        );
      }

      functions.logger.info('Defense check complete', {
        reviewsChecked: recentReviews.length,
        suspicious: allSuspicious.size,
        bursts: burstResults.length,
      });
    } catch (error) {
      functions.logger.error('Error in reputation defense:', error);
      throw error;
    }
  }

  /**
   * Detect sudden bursts of reviews (possible coordinated attack)
   */
  private async detectReviewBursts(
    reviews: StoreReview[]
  ): Promise<ReviewBurst[]> {
    const bursts: ReviewBurst[] = [];

    // Sort by time
    const sorted = [...reviews].sort((a, b) => a.createdAt - b.createdAt);

    // Sliding window to detect bursts
    for (let i = 0; i < sorted.length; i++) {
      const windowStart = sorted[i].createdAt;
      const windowEnd = windowStart + this.BURST_WINDOW;
      
      const windowReviews = sorted.filter(
        r => r.createdAt >= windowStart && r.createdAt <= windowEnd
      );

      if (windowReviews.length >= this.BURST_THRESHOLD) {
        const avgRating =
          windowReviews.reduce((sum, r) => sum + r.rating, 0) / windowReviews.length;

        // Calculate suspicion score
        let suspiciousScore = 0;

        // High volume is suspicious
        suspiciousScore += Math.min(windowReviews.length / 30, 0.3);

        // Low ratings are more suspicious
        if (avgRating < 2.5) {
          suspiciousScore += 0.3;
        }

        // Check for new accounts
        const linkedCount = windowReviews.filter(r => r.linkedUserId).length;
        const unlinkedRatio = 1 - linkedCount / windowReviews.length;
        suspiciousScore += unlinkedRatio * 0.2;

        // Check for same version
        const versions = new Set(windowReviews.map(r => r.version));
        if (versions.size === 1) {
          suspiciousScore += 0.2;
        }

        const reasons = [];
        if (windowReviews.length >= this.BURST_THRESHOLD) {
          reasons.push(`${windowReviews.length} reviews in 2 hours`);
        }
        if (avgRating < 2.5) {
          reasons.push(`Low average rating: ${avgRating.toFixed(1)}`);
        }
        if (unlinkedRatio > 0.7) {
          reasons.push(`${Math.round(unlinkedRatio * 100)}% unlinked accounts`);
        }

        bursts.push({
          id: `burst_${windowStart}`,
          platform: windowReviews[0].platform,
          startTime: windowStart,
          endTime: windowEnd,
          reviewCount: windowReviews.length,
          averageRating: avgRating,
          suspiciousScore: Math.min(suspiciousScore, 1.0),
          reasons,
          reviewIds: windowReviews.map(r => r.id),
        });

        // Skip ahead to avoid overlapping bursts
        i += windowReviews.length - 1;
      }
    }

    // Store burst records
    for (const burst of bursts) {
      if (burst.suspiciousScore > 0.5) {
        await db.collection('reviewBursts').doc(burst.id).set(burst);
      }
    }

    return bursts.filter(b => b.suspiciousScore > 0.5);
  }

  /**
   * Detect reviews with similar or identical text
   */
  private async detectSimilarReviews(
    reviews: StoreReview[]
  ): Promise<ReviewDetectionResult[]> {
    const results: ReviewDetectionResult[] = [];
    const reviewsWithText = reviews.filter(r => r.reviewText && r.reviewText.length > 20);

    for (let i = 0; i < reviewsWithText.length; i++) {
      const review1 = reviewsWithText[i];
      const similarReviews: string[] = [];

      for (let j = i + 1; j < reviewsWithText.length; j++) {
        const review2 = reviewsWithText[j];
        
        const similarity = this.calculateTextSimilarity(
          review1.reviewText!,
          review2.reviewText!
        );

        if (similarity >= this.SIMILARITY_THRESHOLD) {
          similarReviews.push(review2.id);
        }
      }

      if (similarReviews.length > 0) {
        const suspiciousScore = Math.min(similarReviews.length * 0.25, 1.0);
        
        results.push({
          reviewId: review1.id,
          isSuspicious: suspiciousScore > 0.5,
          suspiciousScore,
          reasons: [`${similarReviews.length} similar reviews found`],
          recommendedAction: suspiciousScore > 0.7 ? 'flag' : 'monitor',
          relatedReviewIds: similarReviews,
        });
      }
    }

    return results;
  }

  /**
   * Detect anomalous patterns
   */
  private async detectAnomalousPatterns(
    reviews: StoreReview[]
  ): Promise<ReviewDetectionResult[]> {
    const results: ReviewDetectionResult[] = [];

    for (const review of reviews) {
      let suspiciousScore = 0;
      const reasons: string[] = [];

      // Check 1: Low rating with no text
      if (review.rating <= 2 && !review.reviewText) {
        suspiciousScore += 0.3;
        reasons.push('Low rating without explanation');
      }

      // Check 2: Not linked to known user
      if (!review.linkedUserId) {
        suspiciousScore += 0.2;
        reasons.push('Cannot link to known user');
      }

      // Check 3: Review from region with no organic traffic
      const hasTrafficInRegion = await this.checkRegionTraffic(review.country);
      if (!hasTrafficInRegion) {
        suspiciousScore += 0.3;
        reasons.push('No organic traffic from region');
      }

      // Check 4: Very short or generic text
      if (review.reviewText) {
        const wordCount = review.reviewText.split(/\s+/).length;
        if (wordCount < 5) {
          suspiciousScore += 0.2;
          reasons.push('Very short review text');
        }

        // Check for generic/spam phrases
        const spamPhrases = [
          'dont download',
          'waste of time',
          'terrible app',
          'scam',
          'fake',
        ];
        
        for (const phrase of spamPhrases) {
          if (review.reviewText.toLowerCase().includes(phrase)) {
            suspiciousScore += 0.2;
            reasons.push(`Contains spam phrase: "${phrase}"`);
            break;
          }
        }
      }

      // Check 5: Extreme sentiment mismatch
      if (review.sentimentScore && review.rating) {
        const expectedSentiment = (review.rating - 3) / 2; // -1 to +1
        const sentimentDiff = Math.abs(review.sentimentScore - expectedSentiment);
        
        if (sentimentDiff > 0.5) {
          suspiciousScore += 0.2;
          reasons.push('Sentiment-rating mismatch');
        }
      }

      if (suspiciousScore > 0.4) {
        results.push({
          reviewId: review.id,
          isSuspicious: suspiciousScore > 0.6,
          suspiciousScore,
          reasons,
          recommendedAction:
            suspiciousScore > 0.7 ? 'flag' : suspiciousScore > 0.5 ? 'monitor' : 'ignore',
        });
      }
    }

    return results;
  }

  /**
   * Calculate text similarity using Levenshtein distance
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    const s1 = text1.toLowerCase().trim();
    const s2 = text2.toLowerCase().trim();

    // Quick check for identical text
    if (s1 === s2) return 1.0;

    // Calculate Levenshtein distance
    const matrix: number[][] = [];
    const len1 = s1.length;
    const len2 = s2.length;

    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        if (s1[i - 1] === s2[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    const distance = matrix[len1][len2];
    const maxLen = Math.max(len1, len2);
    
    return 1 - distance / maxLen;
  }

  /**
   * Check if region has organic traffic
   */
  private async checkRegionTraffic(country: string): Promise<boolean> {
    try {
      const last30Days = Date.now() - 30 * 24 * 60 * 60 * 1000;
      
      const users = await db
        .collection('users')
        .where('country', '==', country)
        .where('createdAt', '>=', last30Days)
        .limit(1)
        .get();

      return !users.empty;
    } catch (error) {
      functions.logger.error('Error checking region traffic:', error);
      return true; // Assume traffic exists if error
    }
  }

  /**
   * Flag suspicious reviews
   */
  private async flagSuspiciousReviews(reviewIds: string[]): Promise<void> {
    const batch = db.batch();

    for (const reviewId of reviewIds) {
      const ref = db.collection('storeReviews').doc(reviewId);
      batch.update(ref, { riskFlag: true });
    }

    await batch.commit();
    
    functions.logger.info(`Flagged ${reviewIds.length} suspicious reviews`);
  }

  /**
   * Get recent reviews for analysis
   */
  private async getRecentReviews(since: number): Promise<StoreReview[]> {
    const snapshot = await db
      .collection('storeReviews')
      .where('createdAt', '>=', since)
      .get();

    return snapshot.docs.map(doc => doc.data() as StoreReview);
  }

  /**
   * Send alert to admins
   */
  private async sendDefenseAlert(
    severity: 'low' | 'medium' | 'high' | 'critical',
    message: string,
    data: any
  ): Promise<void> {
    // Integration with PACK 293 — Notifications
    try {
      await db.collection('adminNotifications').add({
        type: 'REPUTATION_DEFENSE',
        severity,
        message,
        data,
        createdAt: Date.now(),
        read: false,
      });

      // Also log to audit (PACK 296)
      await db.collection('auditLogs').add({
        eventType: 'REPUTATION_ALERT',
        severity,
        message,
        data,
        timestamp: Date.now(),
        source: 'pack424-reputation-defense',
      });

      functions.logger.warn('Reputation defense alert sent', {
        severity,
        message,
        data,
      });
    } catch (error) {
      functions.logger.error('Error sending defense alert:', error);
    }
  }

  /**
   * Increase fraud risk score for suspicious patterns (PACK 302/352)
   */
  async increaseFraudRisk(userId: string, reason: string, score: number): Promise<void> {
    try {
      const userRef = db.collection('users').doc(userId);
      const fraudRef = db.collection('fraudScores').doc(userId);

      await db.runTransaction(async (transaction) => {
        const fraudDoc = await transaction.get(fraudRef);
        
        const currentScore = fraudDoc.exists 
          ? (fraudDoc.data()?.score || 0) 
          : 0;

        transaction.set(
          fraudRef,
          {
            userId,
            score: Math.min(currentScore + score, 100),
            lastUpdated: Date.now(),
            reasons: admin.firestore.FieldValue.arrayUnion(reason),
          },
          { merge: true }
        );
      });

      functions.logger.info('Increased fraud risk', { userId, reason, score });
    } catch (error) {
      functions.logger.error('Error increasing fraud risk:', error);
    }
  }
}

export const reputationDefenseService = new ReputationDefenseService();
