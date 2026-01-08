/**
 * PACK 397 — App Store Defense & Review Intelligence Engine
 * 
 * Monitors external app store reviews, detects attacks, correlates with
 * in-app behavior, and triggers automated defense mechanisms.
 * 
 * Dependencies:
 * - PACK 190 (Abuse & Reports)
 * - PACK 296 (Audit Logs)
 * - PACK 300/300A/300B (Support & Safety)
 * - PACK 301/301B (Growth & Retention)
 * - PACK 302 (Fraud Detection)
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// ═══════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export interface StoreReview {
  reviewId: string;
  platform: 'google_play' | 'app_store' | 'web_trust';
  rating: number; // 1-5
  title?: string;
  text: string;
  language: string;
  authorId?: string; // Store's user ID (if available)
  deviceInfo?: string;
  appVersion: string;
  reviewDate: Date;
  
  // Avalo correlation
  userId?: string; // Matched Avalo user
  verified: boolean;
  
  // Analysis
  sentiment: 'positive' | 'neutral' | 'negative';
  keywords: string[];
  categories: ReviewCategory[];
  
  // Anomaly detection
  suspicionScore: number; // 0-100
  anomalyFlags: AnomalyFlag[];
  
  // Metadata
  importedAt: Date;
  processedAt?: Date;
  respondedAt?: Date;
}

export type ReviewCategory = 
  | 'bug_report'
  | 'payment_issue'
  | 'support_complaint'
  | 'feature_request'
  | 'performance'
  | 'ui_ux'
  | 'safety_concern'
  | 'content_quality'
  | 'spam'
  | 'generic_praise'
  | 'generic_complaint';

export type AnomalyFlag = 
  | 'IP_CLUSTER'
  | 'DEVICE_CLUSTER'
  | 'KEYWORD_BURST'
  | 'RATE_ANOMALY'
  | 'LANGUAGE_MISMATCH'
  | 'NEW_ACCOUNT'
  | 'COORDINATED_TIMING'
  | 'SIMILAR_TEXT'
  | 'NO_APP_USAGE'
  | 'COMPETITOR_PATTERN';

export type AttackType = 
  | 'RATING_BOMB'
  | 'KEYWORD_ATTACK'
  | 'COMPETITOR_SABOTAGE'
  | 'EXTORTION_CAMPAIGN'
  | 'ORGANIC_NEGATIVE'
  | 'BUG_REACTION'
  | 'PAYMENT_DISPUTE_WAVE';

export interface ReviewAnomaly {
  id: string;
  type: AttackType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  
  // Detection window
  detectedAt: Date;
  startTime: Date;
  endTime?: Date;
  
  // Statistics
  affectedReviews: number;
  averageRating: number;
  suspiciousCount: number;
  
  // Pattern details
  patterns: {
    ipClusters?: number;
    keywordBursts?: string[];
    timingPattern?: string;
    deviceClusters?: number;
  };
  
  // Correlation
  correlatedEvents: {
    supportTickets?: number;
    churnSpike?: boolean;
    fraudAlerts?: number;
    appVersionRelease?: string;
  };
  
  // Response
  status: 'detected' | 'responding' | 'mitigated' | 'resolved';
  actions: string[];
  assignedTo?: string;
  resolvedAt?: Date;
  
  // Store appeals
  appealSubmitted?: boolean;
  appealStatus?: 'pending' | 'approved' | 'rejected';
}

export interface ReputationScore {
  userId: string;
  
  // User scores (0-100 each)
  trustScore: number;
  fairUseScore: number;
  reliabilityScore: number;
  reportIndex: number;
  
  // Contributing factors
  factors: {
    accountAge: number;
    verifiedActions: number;
    completedInteractions: number;
    paymentHistory: number;
    reportCount: number;
    communityStanding: number;
  };
  
  // Metadata
  lastUpdated: Date;
  version: number;
}

export interface AppVersionScore {
  appVersion: string;
  platform: 'ios' | 'android' | 'web';
  
  // Version scores (0-100 each)
  stabilityScore: number;
  paymentScore: number;
  safetyScore: number;
  supportSLAScore: number;
  
  // Statistics
  totalUsers: number;
  crashRate: number;
  paymentSuccessRate: number;
  supportTicketRate: number;
  averageReviewRating: number;
  
  // Metadata
  releasedAt: Date;
  lastUpdated: Date;
}

export interface VerifiedReview {
  id: string;
  userId: string;
  
  // Verification requirements
  hasCompletedChat: boolean;
  hasCompletedCall: boolean;
  hasBookedCalendar: boolean;
  hasAttendedEvent: boolean;
  
  verifiedAt: Date;
  verificationScore: number; // Weighted score based on completions
  
  // Review content
  rating: number;
  title: string;
  text: string;
  category: ReviewCategory;
  
  // Usage context
  usageDays: number;
  totalInteractions: number;
  lastInteractionDate: Date;
  
  // Approval & display
  approved: boolean;
  featuredInMarketing: boolean;
  sharedToStores: boolean;
  
  // Metadata
  createdAt: Date;
  moderatedAt?: Date;
  moderatedBy?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// REVIEW INTELLIGENCE ENGINE
// ═══════════════════════════════════════════════════════════════════════════

export class ReviewIntelligenceEngine {
  
  /**
   * Process incoming store review and perform full analysis
   */
  async processStoreReview(review: Partial<StoreReview>): Promise<StoreReview> {
    const processedReview: StoreReview = {
      reviewId: review.reviewId!,
      platform: review.platform!,
      rating: review.rating!,
      title: review.title,
      text: review.text!,
      language: review.language || 'en',
      authorId: review.authorId,
      deviceInfo: review.deviceInfo,
      appVersion: review.appVersion!,
      reviewDate: review.reviewDate || new Date(),
      verified: false,
      sentiment: this.analyzeSentiment(review.text!, review.rating!),
      keywords: this.extractKeywords(review.text!),
      categories: this.categorizeReview(review.text!, review.rating!),
      suspicionScore: 0,
      anomalyFlags: [],
      importedAt: new Date(),
    };
    
    // Try to match with Avalo user
    if (review.authorId || review.deviceInfo) {
      processedReview.userId = await this.matchAvaloUser(
        review.authorId,
        review.deviceInfo,
        review.platform!
      );
      
      if (processedReview.userId) {
        processedReview.verified = await this.isUserVerified(processedReview.userId);
      }
    }
    
    // Anomaly detection
    const { suspicionScore, anomalyFlags } = await this.detectAnomalies(processedReview);
    processedReview.suspicionScore = suspicionScore;
    processedReview.anomalyFlags = anomalyFlags;
    
    // Save to Firestore
    await db.collection('store_reviews_raw').doc(processedReview.reviewId).set({
      ...processedReview,
      reviewDate: admin.firestore.Timestamp.fromDate(processedReview.reviewDate),
      importedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    // Update aggregate stats
    await this.updateReviewStats(processedReview);
    
    // Check for attack patterns
    await this.checkForAttackPatterns(processedReview);
    
    return processedReview;
  }
  
  /**
   * Analyze sentiment from text and rating
   */
  private analyzeSentiment(text: string, rating: number): 'positive' | 'neutral' | 'negative' {
    // Simple sentiment based primarily on rating
    if (rating >= 4) return 'positive';
    if (rating <= 2) return 'negative';
    
    // For 3-star, analyze text content
    const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'disappointing', 'poor', 'worst'];
    const positiveWords = ['good', 'great', 'excellent', 'love', 'amazing', 'best', 'perfect'];
    
    const lowerText = text.toLowerCase();
    const negativeCount = negativeWords.filter(w => lowerText.includes(w)).length;
    const positiveCount = positiveWords.filter(w => lowerText.includes(w)).length;
    
    if (negativeCount > positiveCount) return 'negative';
    if (positiveCount > negativeCount) return 'positive';
    return 'neutral';
  }
  
  /**
   * Extract keywords from review text
   */
  private extractKeywords(text: string): string[] {
    const keywords: string[] = [];
    const lowerText = text.toLowerCase();
    
    // Common issue keywords
    const keywordPatterns = [
      'crash', 'bug', 'slow', 'freeze', 'payment', 'charge', 'refund',
      'support', 'scam', 'fake', 'spam', 'privacy', 'data', 'safety',
      'expensive', 'price', 'cost', 'subscription', 'cancel',
    ];
    
    keywordPatterns.forEach(keyword => {
      if (lowerText.includes(keyword)) {
        keywords.push(keyword);
      }
    });
    
    return keywords;
  }
  
  /**
   * Categorize review based on content
   */
  private categorizeReview(text: string, rating: number): ReviewCategory[] {
    const categories: ReviewCategory[] = [];
    const lowerText = text.toLowerCase();
    
    // Bug reports
    if (lowerText.match(/crash|bug|error|broken|not work|freeze|glitch/)) {
      categories.push('bug_report');
    }
    
    // Payment issues
    if (lowerText.match(/payment|charge|refund|money|bill|subscription|price|expensive/)) {
      categories.push('payment_issue');
    }
    
    // Support complaints
    if (lowerText.match(/support|help|response|contact|email|service/)) {
      categories.push('support_complaint');
    }
    
    // Safety concerns
    if (lowerText.match(/scam|fake|fraud|unsafe|privacy|data|steal/)) {
      categories.push('safety_concern');
    }
    
    // Performance
    if (lowerText.match(/slow|lag|performance|speed|load/)) {
      categories.push('performance');
    }
    
    // UI/UX
    if (lowerText.match(/design|interface|confusing|difficult|complicated/)) {
      categories.push('ui_ux');
    }
    
    // Generic spam patterns
    if (text.length < 10 || lowerText.match(/^(good|bad|ok|nice|cool)\s*$/)) {
      categories.push('spam');
    }
    
    // Generic praise
    if (rating >= 4 && categories.length === 0) {
      categories.push('generic_praise');
    }
    
    // Generic complaint
    if (rating <= 2 && categories.length === 0) {
      categories.push('generic_complaint');
    }
    
    return categories.length > 0 ? categories : ['generic_praise'];
  }
  
  /**
   * Match store review to Avalo user
   */
  private async matchAvaloUser(
    authorId?: string,
    deviceInfo?: string,
    platform?: string
  ): Promise<string | undefined> {
    if (!authorId && !deviceInfo) return undefined;
    
    // Try to find user by store ID mapping
    if (authorId) {
      const storeMapping = await db.collection('user_store_mappings')
        .where('storeId', '==', authorId)
        .where('platform', '==', platform)
        .limit(1)
        .get();
      
      if (!storeMapping.empty) {
        return storeMapping.docs[0].data().userId;
      }
    }
    
    // Try device fingerprint
    if (deviceInfo) {
      const deviceMapping = await db.collection('device_fingerprints')
        .where('fingerprint', '==', deviceInfo)
        .limit(1)
        .get();
      
      if (!deviceMapping.empty) {
        return deviceMapping.docs[0].data().userId;
      }
    }
    
    return undefined;
  }
  
  /**
   * Check if user has verified status
   */
  private async isUserVerified(userId: string): Promise<boolean> {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return false;
    
    const data = userDoc.data()!;
    return (
      data.verificationLevel === 'verified' ||
      data.completedVerification === true
    );
  }
  
  /**
   * Detect anomalies in review
   */
  private async detectAnomalies(review: StoreReview): Promise<{
    suspicionScore: number;
    anomalyFlags: AnomalyFlag[];
  }> {
    const flags: AnomalyFlag[] = [];
    let suspicionScore = 0;
    
    // Check for coordinated timing (multiple reviews in short window)
    const recentReviews = await db.collection('store_reviews_raw')
      .where('platform', '==', review.platform)
      .where('importedAt', '>', new Date(Date.now() - 60 * 60 * 1000)) // Last hour
      .get();
    
    if (recentReviews.size > 10) {
      flags.push('RATE_ANOMALY');
      suspicionScore += 30;
    }
    
    // Check for keyword burst (same keywords in multiple recent reviews)
    if (review.keywords.length > 0) {
      const keywordMatches = recentReviews.docs.filter(doc => {
        const keywords = doc.data().keywords || [];
        return review.keywords.some(k => keywords.includes(k));
      });
      
      if (keywordMatches.length > 5) {
        flags.push('KEYWORD_BURST');
        suspicionScore += 25;
      }
    }
    
    // Check if user has no app usage
    if (!review.userId) {
      flags.push('NO_APP_USAGE');
      suspicionScore += 20;
    }
    
    // Check for language mismatch
    if (review.language && review.userId) {
      const userDoc = await db.collection('users').doc(review.userId).get();
      if (userDoc.exists) {
        const userLanguage = userDoc.data()!.language || 'en';
        if (review.language !== userLanguage) {
          flags.push('LANGUAGE_MISMATCH');
          suspicionScore += 15;
        }
      }
    }
    
    // Check for new account reviews
    if (review.userId) {
      const userDoc = await db.collection('users').doc(review.userId).get();
      if (userDoc.exists) {
        const createdAt = userDoc.data()!.createdAt?.toDate();
        const accountAgeDays = createdAt 
          ? (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
          : 0;
        
        if (accountAgeDays < 7) {
          flags.push('NEW_ACCOUNT');
          suspicionScore += 10;
        }
      }
    }
    
    // Check for similar text patterns
    const similarText = recentReviews.docs.filter(doc => {
      const docText = doc.data().text || '';
      const similarity = this.calculateTextSimilarity(review.text, docText);
      return similarity > 0.8;
    });
    
    if (similarText.length > 2) {
      flags.push('SIMILAR_TEXT');
      suspicionScore += 35;
    }
    
    return { suspicionScore, anomalyFlags: flags };
  }
  
  /**
   * Calculate text similarity (simple Jaccard similarity)
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const words1Array = Array.from(words1);
    const words2Array = Array.from(words2);
    
    const intersection = new Set(words1Array.filter(x => words2.has(x)));
    const union = new Set([...words1Array, ...words2Array]);
    
    return intersection.size / union.size;
  }
  
  /**
   * Update aggregate review statistics
   */
  private async updateReviewStats(review: StoreReview): Promise<void> {
    const statsRef = db.collection('review_stats').doc('aggregate');
    
    await statsRef.set({
      [`platform_${review.platform}_count`]: admin.firestore.FieldValue.increment(1),
      [`rating_${review.rating}_count`]: admin.firestore.FieldValue.increment(1),
      [`sentiment_${review.sentiment}_count`]: admin.firestore.FieldValue.increment(1),
      lastReviewAt: admin.firestore.FieldValue.serverTimestamp(),
      totalReviews: admin.firestore.FieldValue.increment(1),
    }, { merge: true });
  }
  
  /**
   * Check for attack patterns across recent reviews
   */
  private async checkForAttackPatterns(review: StoreReview): Promise<void> {
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    // Get recent reviews
    const recentReviews = await db.collection('store_reviews_raw')
      .where('platform', '==', review.platform)
      .where('importedAt', '>', hourAgo)
      .get();
    
    const reviews = recentReviews.docs.map(doc => doc.data() as StoreReview);
    
    // Check for rating bomb (sudden spike of 1-2 star reviews)
    const lowRatings = reviews.filter(r => r.rating <= 2);
    if (lowRatings.length >= 10) {
      await this.createReviewAnomaly({
        type: 'RATING_BOMB',
        severity: 'critical',
        affectedReviews: lowRatings.length,
        averageRating: lowRatings.reduce((sum, r) => sum + r.rating, 0) / lowRatings.length,
      });
    }
    
    // Check for keyword attack
    const keywordCounts = new Map<string, number>();
    reviews.forEach(r => {
      r.keywords.forEach(k => {
        keywordCounts.set(k, (keywordCounts.get(k) || 0) + 1);
      });
    });
    
    const suspiciousKeywords = Array.from(keywordCounts.entries())
      .filter(([_, count]) => count >= 5);
    
    if (suspiciousKeywords.length > 0) {
      await this.createReviewAnomaly({
        type: 'KEYWORD_ATTACK',
        severity: 'high',
        affectedReviews: reviews.length,
        patterns: {
          keywordBursts: suspiciousKeywords.map(([keyword]) => keyword),
        },
      });
    }
    
    // Check for bug reaction wave
    const bugReports = reviews.filter(r => r.categories.includes('bug_report'));
    if (bugReports.length >= 8) {
      await this.createReviewAnomaly({
        type: 'BUG_REACTION',
        severity: 'medium',
        affectedReviews: bugReports.length,
        correlatedEvents: {
          appVersionRelease: review.appVersion,
        },
      });
    }
    
    // Check for payment dispute wave
    const paymentIssues = reviews.filter(r => r.categories.includes('payment_issue'));
    if (paymentIssues.length >= 5) {
      await this.createReviewAnomaly({
        type: 'PAYMENT_DISPUTE_WAVE',
        severity: 'high',
        affectedReviews: paymentIssues.length,
      });
    }
  }
  
  /**
   * Create review anomaly detection record
   */
  private async createReviewAnomaly(partial: Partial<ReviewAnomaly>): Promise<void> {
    const anomalyId = db.collection('review_anomalies').doc().id;
    
    const anomaly: ReviewAnomaly = {
      id: anomalyId,
      type: partial.type || 'ORGANIC_NEGATIVE',
      severity: partial.severity || 'medium',
      detectedAt: new Date(),
      startTime: new Date(Date.now() - 60 * 60 * 1000),
      affectedReviews: partial.affectedReviews || 0,
      averageRating: partial.averageRating || 0,
      suspiciousCount: 0,
      patterns: partial.patterns || {},
      correlatedEvents: partial.correlatedEvents || {},
      status: 'detected',
      actions: [],
    };
    
    await db.collection('review_anomalies').doc(anomalyId).set({
      ...anomaly,
      detectedAt: admin.firestore.FieldValue.serverTimestamp(),
      startTime: admin.firestore.Timestamp.fromDate(anomaly.startTime),
    });
    
    // Trigger defense actions
    await this.triggerDefenseActions(anomaly);
  }
  
  /**
   * Trigger automated defense actions
   */
  private async triggerDefenseActions(anomaly: ReviewAnomaly): Promise<void> {
    const actions: string[] = [];
    
    // Critical severity actions
    if (anomaly.severity === 'critical') {
      actions.push('FREEZE_PUBLIC_RATING');
      actions.push('EMERGENCY_MODERATION_MODE');
      actions.push('ALERT_TRUST_ADMINS');
      
      // Notify admins
      await db.collection('admin_notifications').add({
        type: 'REVIEW_ATTACK_CRITICAL',
        severity: 'critical',
        title: `Critical Review Attack Detected: ${anomaly.type}`,
        message: `${anomaly.affectedReviews} suspicious reviews detected`,
        anomalyId: anomaly.id,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
      });
    }
    
    // High severity actions
    if (anomaly.severity === 'high' || anomaly.severity === 'critical') {
      actions.push('BOOST_VERIFIED_USER_WEIGHT');
      actions.push('ACTIVATE_FAST_RESPONSE_SUPPORT');
    }
    
    // All anomalies
    actions.push('LOG_TO_AUDIT');
    actions.push('CORRELATE_WITH_FRAUD');
    
    // Update anomaly with actions
    await db.collection('review_anomalies').doc(anomaly.id).update({
      actions,
      status: 'responding',
    });
    
    // Log to audit trail (PACK 296)
    await db.collection('audit_logs').add({
      action: 'REVIEW_ANOMALY_DETECTED',
      resource: 'review_intelligence',
      resourceId: anomaly.id,
      details: {
        type: anomaly.type,
        severity: anomaly.severity,
        actions,
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      system: 'pack397',
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// REPUTATION SCORE ENGINE
// ═══════════════════════════════════════════════════════════════════════════

export class ReputationScoreEngine {
  
  /**
   * Calculate user reputation score
   */
  async calculateUserReputation(userId: string): Promise<ReputationScore> {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      throw new Error('User not found');
    }
    
    const userData = userDoc.data()!;
    const createdAt = userData.createdAt?.toDate() || new Date();
    const accountAgeDays = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
    
    // Get user stats
    const [interactions, payments, reports] = await Promise.all([
      this.getUserInteractionCount(userId),
      this.getUserPaymentHistory(userId),
      this.getUserReportCount(userId),
    ]);
    
    // Calculate factors (0-100 each)
    const factors = {
      accountAge: Math.min(accountAgeDays * 2, 100), // Full score at 50 days
      verifiedActions: Math.min(userData.verifiedActions || 0 * 5, 100),
      completedInteractions: Math.min(interactions * 2, 100),
      paymentHistory: payments.successRate * 100,
      reportCount: Math.max(0, 100 - (reports * 10)),
      communityStanding: userData.communityScore || 50,
    };
    
    // Calculate composite scores
    const trustScore = (
      factors.accountAge * 0.2 +
      factors.verifiedActions * 0.3 +
      factors.completedInteractions * 0.2 +
      factors.communityStanding * 0.3
    );
    
    const fairUseScore = (
      factors.paymentHistory * 0.4 +
      factors.reportCount * 0.3 +
      factors.completedInteractions * 0.3
    );
    
    const reliabilityScore = (
      factors.accountAge * 0.3 +
      factors.completedInteractions * 0.4 +
      factors.paymentHistory * 0.3
    );
    
    const reportIndex = 100 - factors.reportCount;
    
    const reputation: ReputationScore = {
      userId,
      trustScore: Math.round(trustScore),
      fairUseScore: Math.round(fairUseScore),
      reliabilityScore: Math.round(reliabilityScore),
      reportIndex: Math.round(reportIndex),
      factors,
      lastUpdated: new Date(),
      version: 1,
    };
    
    // Save to Firestore
    await db.collection('reputation_scores').doc(userId).set({
      ...reputation,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    return reputation;
  }
  
  /**
   * Calculate app version score
   */
  async calculateAppVersionScore(
    appVersion: string,
    platform: 'ios' | 'android' | 'web'
  ): Promise<AppVersionScore> {
    const versionId = `${platform}_${appVersion}`;
    
    // Get version statistics
    const [crashes, payments, support, reviews] = await Promise.all([
      this.getVersionCrashRate(appVersion, platform),
      this.getVersionPaymentStats(appVersion, platform),
      this.getVersionSupportStats(appVersion, platform),
      this.getVersionReviewStats(appVersion, platform),
    ]);
    
    // Calculate scores (0-100)
    const stabilityScore = Math.max(0, 100 - (crashes.rate * 1000));
    const paymentScore = payments.successRate * 100;
    const supportSLAScore = Math.max(0, 100 - (support.ticketRate * 10));
    const safetyScore = 100 - (support.safetyIssues * 5);
    
    const versionScore: AppVersionScore = {
      appVersion,
      platform,
      stabilityScore: Math.round(stabilityScore),
      paymentScore: Math.round(paymentScore),
      safetyScore: Math.round(safetyScore),
      supportSLAScore: Math.round(supportSLAScore),
      totalUsers: crashes.totalUsers || 0,
      crashRate: crashes.rate,
      paymentSuccessRate: payments.successRate,
      supportTicketRate: support.ticketRate,
      averageReviewRating: reviews.averageRating,
      releasedAt: new Date(), // Should come from version metadata
      lastUpdated: new Date(),
    };
    
    // Save to Firestore
    await db.collection('app_version_scores').doc(versionId).set({
      ...versionScore,
      releasedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    return versionScore;
  }
  
  private async getUserInteractionCount(userId: string): Promise<number> {
    const interactions = await db.collection('interactions')
      .where('userId', '==', userId)
      .where('completed', '==', true)
      .count()
      .get();
    
    return interactions.data().count;
  }
  
  private async getUserPaymentHistory(userId: string): Promise<{
    totalPayments: number;
    successRate: number;
  }> {
    const payments = await db.collection('payments')
      .where('userId', '==', userId)
      .get();
    
    const total = payments.size;
    const successful = payments.docs.filter(
      doc => doc.data().status === 'succeeded'
    ).length;
    
    return {
      totalPayments: total,
      successRate: total > 0 ? successful / total : 1,
    };
  }
  
  private async getUserReportCount(userId: string): Promise<number> {
    const reports = await db.collection('abuse_reports')
      .where('reportedUserId', '==', userId)
      .where('status', 'in', ['confirmed', 'actioned'])
      .count()
      .get();
    
    return reports.data().count;
  }
  
  private async getVersionCrashRate(
    version: string,
    platform: string
  ): Promise<{ rate: number; totalUsers: number }> {
    // This would integrate with crash reporting (e.g., Firebase Crashlytics)
    return { rate: 0.001, totalUsers: 1000 }; // Placeholder
  }
  
  private async getVersionPaymentStats(
    version: string,
    platform: string
  ): Promise<{ successRate: number }> {
    const payments = await db.collection('payments')
      .where('appVersion', '==', version)
      .where('platform', '==', platform)
      .get();
    
    const total = payments.size;
    const successful = payments.docs.filter(
      doc => doc.data().status === 'succeeded'
    ).length;
    
    return { successRate: total > 0 ? successful / total : 1 };
  }
  
  private async getVersionSupportStats(
    version: string,
    platform: string
  ): Promise<{ ticketRate: number; safetyIssues: number }> {
    const tickets = await db.collection('support_tickets')
      .where('appVersion', '==', version)
      .where('platform', '==', platform)
      .get();
    
    const safetyIssues = tickets.docs.filter(
      doc => doc.data().category === 'safety' || doc.data().category === 'abuse'
    ).length;
    
    return {
      ticketRate: tickets.size / 1000, // Per 1000 users
      safetyIssues,
    };
  }
  
  private async getVersionReviewStats(
    version: string,
    platform: string
  ): Promise<{ averageRating: number }> {
    const reviews = await db.collection('store_reviews_raw')
      .where('appVersion', '==', version)
      .where('platform', '==', platform)
      .get();
    
    if (reviews.empty) return { averageRating: 0 };
    
    const totalRating = reviews.docs.reduce(
      (sum, doc) => sum + (doc.data().rating || 0),
      0
    );
    
    return { averageRating: totalRating / reviews.size };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// VERIFIED REVIEW SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

export class VerifiedReviewSystem {
  
  /**
   * Check if user can leave verified review
   */
  async canUserLeaveVerifiedReview(userId: string): Promise<{
    eligible: boolean;
    requirements: {
      hasCompletedChat: boolean;
      hasCompletedCall: boolean;
      hasBookedCalendar: boolean;
      hasAttendedEvent: boolean;
    };
    verificationScore: number;
  }> {
    // Check completed interactions
    const [chats, calls, bookings, events] = await Promise.all([
      db.collection('chats')
        .where('participants', 'array-contains', userId)
        .where('messageCount', '>', 5) // At least 5 messages
        .limit(1)
        .get(),
      
      db.collection('calls')
        .where('participants', 'array-contains', userId)
        .where('duration', '>', 60) // At least 1 minute
        .limit(1)
        .get(),
      
      db.collection('calendar_bookings')
        .where('userId', '==', userId)
        .where('status', '==', 'completed')
        .limit(1)
        .get(),
      
      db.collection('event_participants')
        .where('userId', '==', userId)
        .where('attended', '==', true)
        .limit(1)
        .get(),
    ]);
    
    const requirements = {
      hasCompletedChat: !chats.empty,
      hasCompletedCall: !calls.empty,
      hasBookedCalendar: !bookings.empty,
      hasAttendedEvent: !events.empty,
    };
    
    // Calculate verification score (weighted)
    let score = 0;
    if (requirements.hasCompletedChat) score += 25;
    if (requirements.hasCompletedCall) score += 30;
    if (requirements.hasBookedCalendar) score += 25;
    if (requirements.hasAttendedEvent) score += 20;
    
    // Minimum requirement: at least one interaction type
    const eligible = score >= 25;
    
    return { eligible, requirements, verificationScore: score };
  }
  
  /**
   * Create verified review
   */
  async createVerifiedReview(
    userId: string,
    rating: number,
    title: string,
    text: string
  ): Promise<VerifiedReview> {
    // Check eligibility
    const { eligible, requirements, verificationScore } = 
      await this.canUserLeaveVerifiedReview(userId);
    
    if (!eligible) {
      throw new Error('User not eligible for verified review');
    }
    
    // Get user stats
    const userDoc = await db.collection('users').doc(userId).get();
    const createdAt = userDoc.data()?.createdAt?.toDate() || new Date();
    const usageDays = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
    
    const reviewEngine = new ReviewIntelligenceEngine();
    const categories = reviewEngine['categorizeReview'](text, rating);
    
    const reviewId = db.collection('verified_reviews').doc().id;
    
    const verifiedReview: VerifiedReview = {
      id: reviewId,
      userId,
      hasCompletedChat: requirements.hasCompletedChat,
      hasCompletedCall: requirements.hasCompletedCall,
      hasBookedCalendar: requirements.hasBookedCalendar,
      hasAttendedEvent: requirements.hasAttendedEvent,
      verifiedAt: new Date(),
      verificationScore,
      rating,
      title,
      text,
      category: categories[0] || 'generic_praise',
      usageDays: Math.floor(usageDays),
      totalInteractions: 0, // Would count from interactions collection
      lastInteractionDate: new Date(),
      approved: false, // Requires moderation
      featuredInMarketing: false,
      sharedToStores: false,
      createdAt: new Date(),
    };
    
    await db.collection('verified_reviews').doc(reviewId).set({
      ...verifiedReview,
      verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    return verifiedReview;
  }
  
  /**
   * Approve verified review for display
   */
  async approveVerifiedReview(
    reviewId: string,
    moderatorId: string,
    featuredInMarketing: boolean = false
  ): Promise<void> {
    await db.collection('verified_reviews').doc(reviewId).update({
      approved: true,
      featuredInMarketing,
      moderatedAt: admin.firestore.FieldValue.serverTimestamp(),
      moderatedBy: moderatorId,
    });
    
    // Log to audit
    await db.collection('audit_logs').add({
      action: 'VERIFIED_REVIEW_APPROVED',
      resource: 'verified_reviews',
      resourceId: reviewId,
      userId: moderatorId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// REVIEW RECOVERY ENGINE
// ═══════════════════════════════════════════════════════════════════════════

export class ReviewRecoveryEngine {
  
  /**
   * Identify users eligible for review request
   */
  async identifyReviewCandidates(): Promise<string[]> {
    const candidates: string[] = [];
    
    // Target satisfied users who:
    // 1. Have completed multiple successful interactions
    // 2. Haven't left a review yet
    // 3. Had recent positive experience
    
    const recentInteractions = await db.collection('interactions')
      .where('completed', '==', true)
      .where('rating', '>=', 4)
      .where('createdAt', '>', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
      .limit(100)
      .get();
    
    for (const doc of recentInteractions.docs) {
      const userId = doc.data().userId;
      
      // Check if user already left a verified review
      const existingReview = await db.collection('verified_reviews')
        .where('userId', '==', userId)
        .limit(1)
        .get();
      
      if (existingReview.empty) {
        candidates.push(userId);
      }
    }
    
    return candidates;
  }
  
  /**
   * Optimal timing for review request
   */
  async getOptimalReviewTiming(userId: string): Promise<Date | null> {
    // Find the best time after a positive interaction
    const recentPositive = await db.collection('interactions')
      .where('userId', '==', userId)
      .where('rating', '>=', 4)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    
    if (recentPositive.empty) return null;
    
    const lastPositive = recentPositive.docs[0].data().createdAt.toDate();
    
    // Wait 24-48 hours after positive interaction
    const optimalTime = new Date(lastPositive.getTime() + 36 * 60 * 60 * 1000);
    
    return optimalTime;
  }
  
  /**
   * Send review request (store policy compliant)
   */
  async sendReviewRequest(userId: string): Promise<void> {
    // Check if user is eligible
    const verifiedSystem = new VerifiedReviewSystem();
    const { eligible } = await verifiedSystem.canUserLeaveVerifiedReview(userId);
    
    if (!eligible) {
      console.log(`User ${userId} not eligible for review request`);
      return;
    }
    
    // Check if we've already asked recently
    const recentRequest = await db.collection('review_requests')
      .where('userId', '==', userId)
      .where('sentAt', '>', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      .limit(1)
      .get();
    
    if (!recentRequest.empty) {
      console.log(`Already requested review from ${userId} recently`);
      return;
    }
    
    // Create review request
    await db.collection('review_requests').add({
      userId,
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      method: 'in_app_prompt',
      status: 'sent',
    });
    
    // Trigger in-app notification (handled by notification system)
    await db.collection('notifications').add({
      userId,
      type: 'REVIEW_REQUEST',
      title: 'Enjoying Avalo?',
      message: 'Share your experience with the community',
      action: 'OPEN_REVIEW_FORM',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      read: false,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CLOUD FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Process incoming store review
 */
export const processStoreReview = functions.https.onCall(async (data, context) => {
  // Admin only
  if (!context.auth || !context.auth.token.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }
  
  const engine = new ReviewIntelligenceEngine();
  const review = await engine.processStoreReview(data);
  
  return { success: true, review };
});

/**
 * Calculate user reputation score
 */
export const calculateUserReputation = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = data.userId || context.auth.uid;
  
  // Users can only check their own score, unless admin
  if (userId !== context.auth.uid && !context.auth.token.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Cannot access other user scores');
  }
  
  const engine = new ReputationScoreEngine();
  const reputation = await engine.calculateUserReputation(userId);
  
  return { success: true, reputation };
});

/**
 * Create verified review
 */
export const createVerifiedReview = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { rating, title, text } = data;
  
  if (!rating || !title || !text) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }
  
  const system = new VerifiedReviewSystem();
  const review = await system.createVerifiedReview(
    context.auth.uid,
    rating,
    title,
    text
  );
  
  return { success: true, review };
});

/**
 * Scheduled: Daily reputation score updates
 */
export const scheduledReputationUpdate = functions.pubsub
  .schedule('0 2 * * *') // 2 AM daily
  .timeZone('UTC')
  .onRun(async (context) => {
    const engine = new ReputationScoreEngine();
    
    // Update active users (interacted in last 30 days)
    const activeUsers = await db.collection('users')
      .where('lastActiveAt', '>', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      .limit(1000)
      .get();
    
    for (const userDoc of activeUsers.docs) {
      try {
        await engine.calculateUserReputation(userDoc.id);
      } catch (error) {
        console.error(`Failed to update reputation for ${userDoc.id}:`, error);
      }
    }
    
    console.log(`Updated reputation for ${activeUsers.size} users`);
  });

/**
 * Scheduled: Review recovery automation
 */
export const scheduledReviewRecovery = functions.pubsub
  .schedule('0 10 * * *') // 10 AM daily
  .timeZone('UTC')
  .onRun(async (context) => {
    const engine = new ReviewRecoveryEngine();
    
    // Identify candidates
    const candidates = await engine.identifyReviewCandidates();
    
    console.log(`Found ${candidates.length} review candidates`);
    
    // Send requests (with rate limiting)
    let sent = 0;
    for (const userId of candidates.slice(0, 50)) { // Max 50 per day
      try {
        await engine.sendReviewRequest(userId);
        sent++;
      } catch (error) {
        console.error(`Failed to send review request to ${userId}:`, error);
      }
    }
    
    console.log(`Sent ${sent} review requests`);
  });

/**
 * Scheduled: Anomaly detection sweep
 */
export const scheduledAnomalyDetection = functions.pubsub
  .schedule('*/15 * * * *') // Every 15 minutes
  .timeZone('UTC')
  .onRun(async (context) => {
    // Check for unresolved anomalies
    const activeAnomalies = await db.collection('review_anomalies')
      .where('status', 'in', ['detected', 'responding'])
      .get();
    
    console.log(`Monitoring ${activeAnomalies.size} active anomalies`);
    
    // Auto-resolve if pattern subsides
    for (const doc of activeAnomalies.docs) {
      const anomaly = doc.data() as ReviewAnomaly;
      const hoursSinceDetection = (Date.now() - anomaly.detectedAt.getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceDetection > 24) {
        // Check if pattern continues
        const recentSimilar = await db.collection('store_reviews_raw')
          .where('platform', '==', 'google_play')
          .where('importedAt', '>', new Date(Date.now() - 60 * 60 * 1000))
          .get();
        
        if (recentSimilar.size < 5) {
          // Pattern subsided, resolve
          await db.collection('review_anomalies').doc(doc.id).update({
            status: 'resolved',
            resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
            endTime: admin.firestore.FieldValue.serverTimestamp(),
          });
          
          console.log(`Auto-resolved anomaly ${doc.id}`);
        }
      }
    }
  });
