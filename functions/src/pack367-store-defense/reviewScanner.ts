/**
 * PACK 367: AI REVIEW SENTIMENT SCANNER
 * Analyzes store reviews for threats and sentiment
 */

import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import {
  StoreReview,
  ExternalReview,
  ReviewClassification,
  FlagLevel,
  ReviewScanResult,
  Platform,
} from './types';

/**
 * AI Sentiment Analysis using natural language processing
 * In production, integrate with OpenAI/Vertex AI for better accuracy
 */
export class ReviewSentimentAnalyzer {
  
  /**
   * Analyze sentiment score (-1 to 1)
   */
  async analyzeSentiment(text: string): Promise<number> {
    // Simple keyword-based sentiment (replace with AI model in production)
    const negativeWords = [
      'terrible', 'awful', 'horrible', 'worst', 'scam', 'fraud', 'fake',
      'useless', 'garbage', 'trash', 'hate', 'angry', 'disappointed',
      'broken', 'crash', 'bug', 'waste', 'refund', 'delete'
    ];
    
    const positiveWords = [
      'great', 'amazing', 'excellent', 'best', 'love', 'perfect', 'awesome',
      'fantastic', 'wonderful', 'helpful', 'easy', 'beautiful', 'impressed',
      'recommend', 'satisfied', 'happy', 'glad', 'thank'
    ];
    
    const lowerText = text.toLowerCase();
    let score = 0;
    let wordCount = 0;
    
    negativeWords.forEach(word => {
      const matches = (lowerText.match(new RegExp(word, 'g')) || []).length;
      score -= matches;
      wordCount += matches;
    });
    
    positiveWords.forEach(word => {
      const matches = (lowerText.match(new RegExp(word, 'g')) || []).length;
      score += matches;
      wordCount += matches;
    });
    
    // Normalize to -1 to 1
    if (wordCount === 0) return 0;
    return Math.max(-1, Math.min(1, score / Math.max(wordCount, 5)));
  }
  
  /**
   * Classify review type
   */
  async classifyReview(
    review: ExternalReview,
    sentimentScore: number,
    userRiskScore: number
  ): Promise<ReviewClassification> {
    const text = review.text.toLowerCase();
    
    // Check for fake review patterns
    if (this.isFakeReview(review, userRiskScore)) {
      return 'fake_review';
    }
    
    // Check for emotional rage
    if (this.isEmotionalRage(text, sentimentScore)) {
      return 'emotional_rage';
    }
    
    // Check for coordinated attack patterns
    if (await this.isCoordinatedAttack(review)) {
      return 'coordinated_attack';
    }
    
    // Positive review
    if (sentimentScore > 0.3 && review.rating >= 4) {
      return 'positive';
    }
    
    // Default to fair criticism
    return 'fair_criticism';
  }
  
  /**
   * Detect fake reviews
   */
  private isFakeReview(review: ExternalReview, userRiskScore: number): boolean {
    const text = review.text.toLowerCase();
    
    // Very short generic reviews
    if (text.length < 10 && review.rating === 1) return true;
    
    // High risk user
    if (userRiskScore > 80) return true;
    
    // Spam patterns
    const spamPatterns = [
      /(.)\1{4,}/, // repeated characters
      /https?:\/\//, // URLs
      /\b(buy|click|download|install)\b.*\b(now|here|link)\b/i,
    ];
    
    return spamPatterns.some(pattern => pattern.test(text));
  }
  
  /**
   * Detect emotional rage patterns
   */
  private isEmotionalRage(text: string, sentimentScore: number): boolean {
    // Very negative sentiment + excessive punctuation
    const hasExcessivePunctuation = /[!?]{3,}/.test(text);
    const hasAllCaps = /[A-Z]{10,}/.test(text);
    const veryNegative = sentimentScore < -0.6;
    
    return veryNegative && (hasExcessivePunctuation || hasAllCaps);
  }
  
  /**
   * Detect coordinated attack patterns
   */
  private async isCoordinatedAttack(review: ExternalReview): Promise<boolean> {
    const db = admin.firestore();
    
    // Check for similar reviews in short time window
    const recentReviews = await db.collection('storeReviewsMirror')
      .where('platform', '==', review.platform)
      .where('timestamp', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
      .where('rating', '==', 1)
      .limit(50)
      .get();
    
    if (recentReviews.empty) return false;
    
    // Check for text similarity
    const similarCount = recentReviews.docs.filter(doc => {
      const existingReview = doc.data() as StoreReview;
      return this.textSimilarity(review.text, existingReview.reviewText) > 0.7;
    }).length;
    
    return similarCount >= 3; // 3+ similar reviews = coordinated
  }
  
  /**
   * Calculate text similarity (simple Jaccard similarity)
   */
  private textSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }
  
  /**
   * Calculate flag level
   */
  calculateFlagLevel(
    classification: ReviewClassification,
    sentimentScore: number,
    userRiskScore: number
  ): FlagLevel {
    if (classification === 'coordinated_attack') return 'critical';
    if (classification === 'fake_review' && userRiskScore > 70) return 'high';
    if (classification === 'fake_review') return 'medium';
    if (classification === 'emotional_rage') return 'medium';
    if (sentimentScore < -0.7) return 'low';
    return 'none';
  }
}

/**
 * Main Review Scanner Function
 */
export class ReviewScanner {
  private analyzer = new ReviewSentimentAnalyzer();
  
  /**
   * Scan and import external reviews
   */
  async scanReviews(
    platform: Platform,
    externalReviews: ExternalReview[]
  ): Promise<ReviewScanResult> {
    const db = admin.firestore();
    const batch = db.batch();
    
    let flaggedCount = 0;
    let fakeReviewCount = 0;
    let totalSentiment = 0;
    let totalRating = 0;
    const coordinatedReviewIds: string[] = [];
    
    logger.info(`Scanning ${externalReviews.length} reviews for platform ${platform}`);
    
    for (const externalReview of externalReviews) {
      try {
        // Get user risk score (from PACK 400 if user identifiable)
        const userRiskScore = await this.getUserRiskScore(externalReview);
        
        // Analyze sentiment
        const sentimentScore = await this.analyzer.analyzeSentiment(externalReview.text);
        totalSentiment += sentimentScore;
        totalRating += externalReview.rating;
        
        // Classify review
        const classification = await this.analyzer.classifyReview(
          externalReview,
          sentimentScore,
          userRiskScore
        );
        
        if (classification === 'fake_review') fakeReviewCount++;
        if (classification === 'coordinated_attack') {
          coordinatedReviewIds.push(externalReview.externalId);
        }
        
        // Calculate flag level
        const flagLevel = this.analyzer.calculateFlagLevel(
          classification,
          sentimentScore,
          userRiskScore
        );
        
        if (flagLevel !== 'none') flaggedCount++;
        
        // Create review document
        const reviewDoc: Partial<StoreReview> = {
          platform,
          rating: externalReview.rating,
          reviewText: externalReview.text,
          authorName: externalReview.author,
          externalReviewId: externalReview.externalId,
          sentimentScore,
          classification,
          userRiskScore,
          flagLevel,
          isVerified: false,
          isFlagged: flagLevel !== 'none',
          timestamp: admin.firestore.Timestamp.now(),
          importedAt: admin.firestore.Timestamp.now(),
          reviewDate: admin.firestore.Timestamp.fromDate(new Date(externalReview.date)),
          version: externalReview.version,
          lastAnalyzedAt: admin.firestore.Timestamp.now(),
          analyzedBy: 'system',
        };
        
        const reviewRef = db.collection('storeReviewsMirror').doc();
        batch.set(reviewRef, reviewDoc);
        
        // Log to audit (PACK 296)
        await this.logToAudit({
          action: 'review_scanned',
          platform,
          reviewId: reviewRef.id,
          classification,
          flagLevel,
        });
        
      } catch (error) {
        logger.error(`Error scanning review ${externalReview.externalId}:`, error);
      }
    }
    
    await batch.commit();
    
    // Analyze for crises
    const newCrisisEvents = await this.detectCrises(platform, {
      averageRating: totalRating / externalReviews.length,
      averageSentiment: totalSentiment / externalReviews.length,
      fakeReviewCount,
      coordinatedAttackDetected: coordinatedReviewIds.length >= 5,
    });
    
    // Trigger defense actions if needed
    const triggeredActions = await this.triggerDefenseActions(newCrisisEvents);
    
    return {
      scannedCount: externalReviews.length,
      flaggedCount,
      newCrisisEvents,
      triggeredActions,
      summary: {
        averageRating: totalRating / externalReviews.length,
        averageSentiment: totalSentiment / externalReviews.length,
        fakeReviewCount,
        coordinatedAttackDetected: coordinatedReviewIds.length >= 5,
      },
    };
  }
  
  /**
   * Get user risk score from RetentionEngine (PACK 400)
   */
  private async getUserRiskScore(review: ExternalReview): Promise<number> {
    // TODO: Integrate with PACK 400 RetentionEngine
    // For now, return default
    return 0;
  }
  
  /**
   * Detect crisis events
   */
  private async detectCrises(
    platform: Platform,
    summary: ReviewScanResult['summary']
  ): Promise<string[]> {
    const db = admin.firestore();
    const crisisIds: string[] = [];
    
    // Get config
    const config = await this.getDefenseConfig();
    
    // Check for coordinated attack
    if (summary.coordinatedAttackDetected) {
      const crisisId = await this.createCrisisEvent({
        crisisType: 'coordinated_attack',
        platform,
        severity: 90,
        triggerMetrics: {
          fraudReviewCount: summary.fakeReviewCount,
          timeWindow: 24,
        },
      });
      crisisIds.push(crisisId);
    }
    
    // Check for rating drop
    const previousRating = await this.getPreviousAverageRating(platform);
    if (previousRating && previousRating - summary.averageRating > config.crisisThresholds.ratingDrop) {
      const crisisId = await this.createCrisisEvent({
        crisisType: 'rating_drop',
        platform,
        severity: 80,
        triggerMetrics: {
          ratingDrop: previousRating - summary.averageRating,
          timeWindow: config.crisisThresholds.ratingDropWindow,
        },
      });
      crisisIds.push(crisisId);
    }
    
    return crisisIds;
  }
  
  /**
   * Get previous average rating
   */
  private async getPreviousAverageRating(platform: Platform): Promise<number | null> {
    const db = admin.firestore();
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    
    const reviews = await db.collection('storeReviewsMirror')
      .where('platform', '==', platform)
      .where('timestamp', '<', twoDaysAgo)
      .orderBy('timestamp', 'desc')
      .limit(100)
      .get();
    
    if (reviews.empty) return null;
    
    const sum = reviews.docs.reduce((acc, doc) => acc + (doc.data() as StoreReview).rating, 0);
    return sum / reviews.size;
  }
  
  /**
   * Create crisis event
   */
  private async createCrisisEvent(data: any): Promise<string> {
    const db = admin.firestore();
    const crisisRef = db.collection('storeCrisisEvents').doc();
    
    await crisisRef.set({
      ...data,
      active: true,
      triggeredActions: [],
      activeActionIds: [],
      startedAt: admin.firestore.Timestamp.now(),
      detectedAt: admin.firestore.Timestamp.now(),
      adminsNotified: [],
      escalationLevel: data.severity > 80 ? 5 : data.severity > 60 ? 4 : 3,
    });
    
    logger.warn(`Crisis event created: ${crisisRef.id}`, data);
    
    return crisisRef.id;
  }
  
  /**
   * Trigger defense actions based on crises
   */
  private async triggerDefenseActions(crisisIds: string[]): Promise<string[]> {
    if (crisisIds.length === 0) return [];
    
    // Import defense actions module
    const { DefenseActionManager } = await import('./defenseActions');
    const manager = new DefenseActionManager();
    
    const actionIds: string[] = [];
    
    for (const crisisId of crisisIds) {
      const actions = await manager.triggerCrisisDefense(crisisId);
      actionIds.push(...actions);
    }
    
    return actionIds;
  }
  
  /**
   * Get defense configuration
   */
  private async getDefenseConfig(): Promise<any> {
    const db = admin.firestore();
    const configDoc = await db.collection('storeDefenseConfig').doc('default').get();
    
    if (!configDoc.exists) {
      // Return default config
      return {
        crisisThresholds: {
          ratingDrop: 0.3,
          ratingDropWindow: 48,
          uninstallSpikePercent: 50,
          uninstallSpikeWindow: 24,
          fraudReviewClusterSize: 10,
          fraudReviewClusterWindow: 24,
        },
      };
    }
    
    return configDoc.data();
  }
  
  /**
   * Log to audit system (PACK 296)
   */
  private async logToAudit(data: any): Promise<void> {
    const db = admin.firestore();
    await db.collection('auditLogs').add({
      ...data,
      system: 'store-defense',
      pack: 'PACK367',
      timestamp: admin.firestore.Timestamp.now(),
    });
  }
}
