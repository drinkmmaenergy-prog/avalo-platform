/**
 * PACK 439 - App Store Trust, Ratings & Review Shield
 * StoreTrustScoreService - Calculates and monitors Store Trust Score
 * 
 * Dependencies: PACK 296, 299, 324, 365, 437, 438
 * Status: ACTIVE
 */

import { db } from '../lib/firebase-admin';
import { auditLog } from './pack296-audit-logger';
import { Timestamp } from 'firebase-admin/firestore';

export interface StoreTrustMetrics {
  platform: 'ios' | 'android';
  region: string;
  
  // Rating metrics
  averageRating: number;
  ratingCount: number;
  ratingVelocity: number; // reviews per day
  ratingTrend: 'improving' | 'stable' | 'declining';
  
  // Health metrics
  crashRate: number;
  uninstallRate: number;
  reviewResponseRate: number;
  
  // Risk metrics
  negativeReviewRatio: number;
  reportCount: number;
  appealsPending: number;
  
  // Engagement
  updateFrequency: number; // days since last update
  bugFixResponseTime: number; // avg days to fix reported bugs
  
  timestamp: Timestamp;
}

export interface StoreTrustScore {
  platform: 'ios' | 'android';
  region: string;
  
  // Overall score (0-100)
  score: number;
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  
  // Component scores
  ratingHealth: number; // 0-100
  technicalHealth: number; // 0-100
  riskLevel: number; // 0-100 (lower is better)
  responsiveness: number; // 0-100
  
  // Risk assessment
  delistingRisk: 'none' | 'low' | 'medium' | 'high' | 'critical';
  delistingProbability: number; // 0-1
  
  // Actionable insights
  topIssues: string[];
  recommendations: string[];
  
  lastUpdated: Timestamp;
  nextUpdate: Timestamp;
}

export interface TrustScoreHistory {
  platform: 'ios' | 'android';
  region: string;
  scores: {
    timestamp: Timestamp;
    score: number;
    grade: string;
  }[];
}

export class StoreTrustScoreService {
  // Scoring weights
  private readonly WEIGHTS = {
    rating: 0.30,
    technical: 0.25,
    risk: 0.25,
    responsiveness: 0.20,
  };

  // Thresholds
  private readonly CRITICAL_RATING = 3.0;
  private readonly CRITICAL_CRASH_RATE = 0.02; // 2%
  private readonly CRITICAL_UNINSTALL_RATE = 0.30; // 30%
  private readonly HIGH_NEGATIVE_RATIO = 0.40; // 40% negative

  /**
   * Calculate comprehensive Store Trust Score
   */
  async calculateTrustScore(
    platform: 'ios' | 'android',
    region: string = 'global'
  ): Promise<StoreTrustScore> {
    try {
      // Gather all metrics
      const metrics = await this.gatherMetrics(platform, region);

      // Calculate component scores
      const ratingHealth = this.calculateRatingHealth(metrics);
      const technicalHealth = this.calculateTechnicalHealth(metrics);
      const riskLevel = this.calculateRiskLevel(metrics);
      const responsiveness = this.calculateResponsiveness(metrics);

      // Calculate weighted overall score
      const score = Math.round(
        ratingHealth * this.WEIGHTS.rating +
        technicalHealth * this.WEIGHTS.technical +
        (100 - riskLevel) * this.WEIGHTS.risk +
        responsiveness * this.WEIGHTS.responsiveness
      );

      const grade = this.scoreToGrade(score);
      const delistingRisk = this.assessDelistingRisk(metrics, score);
      const delistingProbability = this.calculateDelistingProbability(metrics, score);

      const trustScore: StoreTrustScore = {
        platform,
        region,
        score,
        grade,
        ratingHealth,
        technicalHealth,
        riskLevel,
        responsiveness,
        delistingRisk,
        delistingProbability,
        topIssues: this.identifyTopIssues(metrics, {
          ratingHealth,
          technicalHealth,
          riskLevel,
          responsiveness,
        }),
        recommendations: this.generateRecommendations(metrics, score),
        lastUpdated: Timestamp.now(),
        nextUpdate: Timestamp.fromDate(new Date(Date.now() + 4 * 60 * 60 * 1000)), // 4 hours
      };

      // Save to database
      await this.saveTrustScore(trustScore);

      // Log to audit trail
      await auditLog({
        action: 'trust_score_calculated',
        userId: 'system',
        metadata: {
          platform,
          region,
          score,
          grade,
          delistingRisk,
        },
        packId: 'PACK-439',
      });

      return trustScore;

    } catch (error) {
      console.error('[StoreTrustScoreService] Calculation error:', error);
      throw error;
    }
  }

  /**
   * Get current trust score (from cache or calculate)
   */
  async getTrustScore(
    platform: 'ios' | 'android',
    region: string = 'global'
  ): Promise<StoreTrustScore> {
    const docId = `${platform}_${region}`;
    const doc = await db.collection('storeTrustScores').doc(docId).get();

    if (doc.exists) {
      const data = doc.data() as StoreTrustScore;
      
      // Check if needs refresh (older than 4 hours)
      const age = Date.now() - data.lastUpdated.toMillis();
      if (age < 4 * 60 * 60 * 1000) {
        return data;
      }
    }

    // Calculate fresh score
    return this.calculateTrustScore(platform, region);
  }

  /**
   * Get historical trust scores
   */
  async getTrustScoreHistory(
    platform: 'ios' | 'android',
    region: string = 'global',
    days: number = 30
  ): Promise<TrustScoreHistory> {
    const since = Timestamp.fromDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000));

    const snapshot = await db
      .collection('storeTrustScoreHistory')
      .where('platform', '==', platform)
      .where('region', '==', region)
      .where('timestamp', '>=', since)
      .orderBy('timestamp', 'asc')
      .get();

    const scores = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        timestamp: data.timestamp,
        score: data.score,
        grade: data.grade,
      };
    });

    return {
      platform,
      region,
      scores,
    };
  }

  /**
   * Gather all metrics from various sources
   */
  private async gatherMetrics(
    platform: 'ios' | 'android',
    region: string
  ): Promise<StoreTrustMetrics> {
    // Fetch from multiple collections
    const [ratingData, technicalData, riskData, engagementData] = await Promise.all([
      this.fetchRatingMetrics(platform, region),
      this.fetchTechnicalMetrics(platform, region),
      this.fetchRiskMetrics(platform, region),
      this.fetchEngagementMetrics(platform, region),
    ]);

    return {
      platform,
      region,
      ...ratingData,
      ...technicalData,
      ...riskData,
      ...engagementData,
      timestamp: Timestamp.now(),
    };
  }

  private async fetchRatingMetrics(platform: string, region: string) {
    const doc = await db.collection('storeMetrics').doc(`${platform}_${region}_rating`).get();
    return doc.exists ? doc.data() : {
      averageRating: 0,
      ratingCount: 0,
      ratingVelocity: 0,
      ratingTrend: 'stable',
    };
  }

  private async fetchTechnicalMetrics(platform: string, region: string) {
    const doc = await db.collection('storeMetrics').doc(`${platform}_${region}_technical`).get();
    return doc.exists ? doc.data() : {
      crashRate: 0,
      uninstallRate: 0,
    };
  }

  private async fetchRiskMetrics(platform: string, region: string) {
    const doc = await db.collection('storeMetrics').doc(`${platform}_${region}_risk`).get();
    return doc.exists ? doc.data() : {
      negativeReviewRatio: 0,
      reportCount: 0,
      appealsPending: 0,
      reviewResponseRate: 0,
    };
  }

  private async fetchEngagementMetrics(platform: string, region: string) {
    const doc = await db.collection('storeMetrics').doc(`${platform}_${region}_engagement`).get();
    return doc.exists ? doc.data() : {
      updateFrequency: 30,
      bugFixResponseTime: 14,
    };
  }

  /**
   * Calculate rating health score (0-100)
   */
  private calculateRatingHealth(metrics: StoreTrustMetrics): number {
    let score = 0;

    // Average rating (60% of score)
    const ratingScore = (metrics.averageRating / 5) * 60;
    score += ratingScore;

    // Rating count (20% of score) - more reviews = more credible
    const countScore = Math.min(20, (metrics.ratingCount / 1000) * 20);
    score += countScore;

    // Rating trend (20% of score)
    const trendScores = { improving: 20, stable: 15, declining: 5 };
    score += trendScores[metrics.ratingTrend];

    return Math.round(Math.min(100, score));
  }

  /**
   * Calculate technical health score (0-100)
   */
  private calculateTechnicalHealth(metrics: StoreTrustMetrics): number {
    let score = 100;

    // Crash rate penalty
    const crashPenalty = (metrics.crashRate / this.CRITICAL_CRASH_RATE) * 50;
    score -= Math.min(50, crashPenalty);

    // Uninstall rate penalty
    const uninstallPenalty = (metrics.uninstallRate / this.CRITICAL_UNINSTALL_RATE) * 50;
    score -= Math.min(50, uninstallPenalty);

    return Math.round(Math.max(0, score));
  }

  /**
   * Calculate risk level (0-100, lower is better)
   */
  private calculateRiskLevel(metrics: StoreTrustMetrics): number {
    let risk = 0;

    // Negative review ratio
    risk += metrics.negativeReviewRatio * 40;

    // Report count
    risk += Math.min(30, metrics.reportCount * 3);

    // Pending appeals
    risk += Math.min(30, metrics.appealsPending * 5);

    return Math.round(Math.min(100, risk));
  }

  /**
   * Calculate responsiveness score (0-100)
   */
  private calculateResponsiveness(metrics: StoreTrustMetrics): number {
    let score = 100;

    // Review response rate bonus
    score = metrics.reviewResponseRate * 50;

    // Update frequency penalty (older = worse)
    const updatePenalty = Math.min(30, (metrics.updateFrequency / 90) * 30);
    score += (30 - updatePenalty);

    // Bug fix response time penalty
    const fixPenalty = Math.min(20, (metrics.bugFixResponseTime / 30) * 20);
    score += (20 - fixPenalty);

    return Math.round(Math.max(0, score));
  }

  /**
   * Convert score to letter grade
   */
  private scoreToGrade(score: number): StoreTrustScore['grade'] {
    if (score >= 95) return 'A+';
    if (score >= 85) return 'A';
    if (score >= 70) return 'B';
    if (score >= 55) return 'C';
    if (score >= 40) return 'D';
    return 'F';
  }

  /**
   * Assess delisting risk
   */
  private assessDelistingRisk(
    metrics: StoreTrustMetrics,
    score: number
  ): StoreTrustScore['delistingRisk'] {
    if (
      metrics.averageRating < 2.0 ||
      metrics.crashRate > 0.05 ||
      metrics.reportCount > 100
    ) {
      return 'critical';
    }

    if (
      metrics.averageRating < this.CRITICAL_RATING ||
      metrics.crashRate > this.CRITICAL_CRASH_RATE ||
      metrics.reportCount > 50
    ) {
      return 'high';
    }

    if (score < 55 || metrics.negativeReviewRatio > this.HIGH_NEGATIVE_RATIO) {
      return 'medium';
    }

    if (score < 70) {
      return 'low';
    }

    return 'none';
  }

  /**
   * Calculate probability of delisting (0-1)
   */
  private calculateDelistingProbability(
    metrics: StoreTrustMetrics,
    score: number
  ): number {
    let probability = 0;

    // Score-based baseline
    probability += (100 - score) / 200; // max 0.5

    // Critical factors
    if (metrics.averageRating < 2.0) probability += 0.3;
    if (metrics.crashRate > 0.05) probability += 0.2;
    if (metrics.reportCount > 100) probability += 0.2;

    return Math.min(1, probability);
  }

  /**
   * Identify top issues from metrics
   */
  private identifyTopIssues(
    metrics: StoreTrustMetrics,
    scores: {
      ratingHealth: number;
      technicalHealth: number;
      riskLevel: number;
      responsiveness: number;
    }
  ): string[] {
    const issues: { severity: number; message: string }[] = [];

    if (metrics.averageRating < this.CRITICAL_RATING) {
      issues.push({
        severity: 100,
        message: `Critical: Average rating ${metrics.averageRating.toFixed(1)}/5.0`,
      });
    }

    if (metrics.crashRate > this.CRITICAL_CRASH_RATE) {
      issues.push({
        severity: 90,
        message: `High crash rate: ${(metrics.crashRate * 100).toFixed(2)}%`,
      });
    }

    if (metrics.uninstallRate > this.CRITICAL_UNINSTALL_RATE) {
      issues.push({
        severity: 80,
        message: `High uninstall rate: ${(metrics.uninstallRate * 100).toFixed(1)}%`,
      });
    }

    if (metrics.negativeReviewRatio > this.HIGH_NEGATIVE_RATIO) {
      issues.push({
        severity: 70,
        message: `${(metrics.negativeReviewRatio * 100).toFixed(0)}% negative reviews`,
      });
    }

    if (metrics.reportCount > 20) {
      issues.push({
        severity: 75,
        message: `${metrics.reportCount} active reports`,
      });
    }

    if (metrics.updateFrequency > 60) {
      issues.push({
        severity: 50,
        message: `No updates in ${metrics.updateFrequency} days`,
      });
    }

    return issues
      .sort((a, b) => b.severity - a.severity)
      .slice(0, 5)
      .map(i => i.message);
  }

  /**
   * Generate actionable recommendations
   */
  private generateRecommendations(metrics: StoreTrustMetrics, score: number): string[] {
    const recommendations: string[] = [];

    if (metrics.averageRating < 4.0) {
      recommendations.push('Increase review response rate to address user concerns');
    }

    if (metrics.crashRate > 0.01) {
      recommendations.push('Priority: Reduce crash rate through stability testing');
    }

    if (metrics.reviewResponseRate < 0.5) {
      recommendations.push('Respond to more user reviews to show engagement');
    }

    if (metrics.updateFrequency > 45) {
      recommendations.push('Release update to show active development');
    }

    if (metrics.negativeReviewRatio > 0.25) {
      recommendations.push('Analyze negative feedback patterns and address common issues');
    }

    if (score < 70) {
      recommendations.push('Consider pausing UA campaigns until trust score improves');
    }

    return recommendations.slice(0, 5);
  }

  /**
   * Save trust score to database
   */
  private async saveTrustScore(trustScore: StoreTrustScore): Promise<void> {
    const docId = `${trustScore.platform}_${trustScore.region}`;
    
    // Save current score
    await db.collection('storeTrustScores').doc(docId).set(trustScore);

    // Save to history
    await db.collection('storeTrustScoreHistory').add({
      platform: trustScore.platform,
      region: trustScore.region,
      score: trustScore.score,
      grade: trustScore.grade,
      timestamp: trustScore.lastUpdated,
    });
  }
}

export const storeTrustScoreService = new StoreTrustScoreService();
