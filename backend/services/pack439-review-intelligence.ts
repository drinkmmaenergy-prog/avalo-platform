/**
 * PACK 439 - App Store Trust, Ratings & Review Shield
 * ReviewIntelligenceLayer - Content classification and routing
 * 
 * Dependencies: PACK 296, 299, 324, 365, 437, 438
 * Status: ACTIVE
 */

import { db } from '../lib/firebase-admin';
import { auditLog } from './pack296-audit-logger';
import { Timestamp } from 'firebase-admin/firestore';

export type ReviewCategory =
  | 'bug_performance'
  | 'pricing_payment'
  | 'safety_abuse'
  | 'hate_spam'
  | 'feature_request'
  | 'positive_feedback'
  | 'user_experience'
  | 'onboarding'
  | 'other';

export type ReviewSentiment = 'very_positive' | 'positive' | 'neutral' | 'negative' | 'very_negative';

export type ReviewPriority = 'critical' | 'high' | 'medium' | 'low';

export interface ClassifiedReview {
  reviewId: string;
  platform: 'ios' | 'android';
  rating: number;
  text: string;
  
  // Classification
  category: ReviewCategory;
  subcategories: string[];
  sentiment: ReviewSentiment;
  priority: ReviewPriority;
  
  // Routing
  assignedTeam: string;
  requiresImmediate: boolean;
  suggestedActions: string[];
  
  // Insights
  keywords: string[];
  relatedIssues: string[];
  
  timestamp: Timestamp;
  classifiedAt: Timestamp;
}

export interface ReviewInsights {
  platform: 'ios' | 'android';
  period: '24h' | '7d' | '30d';
  
  // Category breakdown
  categoryDistribution: { [key in ReviewCategory]?: number };
  sentimentDistribution: { [key in ReviewSentiment]?: number };
  
  // Top issues
  topBugs: { issue: string; count: number; severity: string }[];
  topFeatureRequests: { feature: string; count: number; votes: number }[];
  topComplaints: { complaint: string; count: number }[];
  
  // Trends
  ratingTrend: 'improving' | 'stable' | 'declining';
  categoryTrends: { category: ReviewCategory; trend: 'up' | 'down' | 'stable' }[];
  
  // Action items
  criticalIssues: string[];
  recommendedFixes: { issue: string; priority: ReviewPriority; team: string }[];
  
  generatedAt: Timestamp;
}

export class ReviewIntelligenceLayer {
  // Keyword mappings for classification
  private readonly CATEGORY_KEYWORDS: { [key in ReviewCategory]: string[] } = {
    bug_performance: [
      'bug', 'crash', 'freeze', 'slow', 'lag', 'broken', 'error', 'glitch',
      'not working', 'issue', 'problem', 'fix', 'loading', 'stuck'
    ],
    pricing_payment: [
      'expensive', 'price', 'cost', 'payment', 'subscription', 'refund',
      'charge', 'billing', 'free', 'premium', 'paid', 'money'
    ],
    safety_abuse: [
      'harassment', 'abuse', 'scam', 'fake', 'inappropriate', 'unsafe',
      'report', 'block', 'spam', 'bot', 'fake profile'
    ],
    hate_spam: [
      'hate', 'racist', 'offensive', 'spam', 'ads', 'advertisement',
      'scam', 'phishing', 'inappropriate content'
    ],
    feature_request: [
      'add', 'want', 'wish', 'would be nice', 'feature', 'suggestion',
      'improve', 'enhancement', 'could you', 'please add'
    ],
    positive_feedback: [
      'love', 'great', 'awesome', 'amazing', 'excellent', 'perfect',
      'fantastic', 'wonderful', 'best', 'recommend'
    ],
    user_experience: [
      'interface', 'design', 'ui', 'ux', 'confusing', 'complicated',
      'easy', 'hard to use', 'navigation', 'layout'
    ],
    onboarding: [
      'signup', 'register', 'login', 'tutorial', 'getting started',
      'first time', 'setup', 'account creation'
    ],
    other: []
  };

  /**
   * Classify a single review
   */
  async classifyReview(
    reviewId: string,
    platform: 'ios' | 'android',
    rating: number,
    text: string,
    userId?: string
  ): Promise<ClassifiedReview> {
    // Determine category
    const category = this.categorizeText(text);
    const subcategories = this.extractSubcategories(text, category);
    
    // Analyze sentiment
    const sentiment = this.analyzeSentiment(rating, text);
    
    // Determine priority
    const priority = this.determinePriority(rating, category, text);
    
    // Route to team
    const assignedTeam = this.routeToTeam(category, priority);
    const requiresImmediate = priority === 'critical' || priority === 'high';
    
    // Extract insights
    const keywords = this.extractKeywords(text);
    const relatedIssues = await this.findRelatedIssues(keywords, category);
    
    // Generate suggested actions
    const suggestedActions = this.generateSuggestedActions(category, priority, text);

    const classified: ClassifiedReview = {
      reviewId,
      platform,
      rating,
      text,
      category,
      subcategories,
      sentiment,
      priority,
      assignedTeam,
      requiresImmediate,
      suggestedActions,
      keywords,
      relatedIssues,
      timestamp: Timestamp.now(),
      classifiedAt: Timestamp.now(),
    };

    // Save classification
    await this.saveClassification(classified);

    // Log to audit trail
    await auditLog({
      action: 'review_classified',
      userId: 'system',
      metadata: {
        reviewId,
        category,
        priority,
        assignedTeam,
      },
      packId: 'PACK-439',
    });

    return classified;
  }

  /**
   * Batch classify reviews
   */
  async batchClassifyReviews(
    platform: 'ios' | 'android',
    limit: number = 100
  ): Promise<ClassifiedReview[]> {
    // Fetch unclassified reviews
    const snapshot = await db
      .collection('appStoreReviews')
      .where('platform', '==', platform)
      .where('classified', '==', false)
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();

    const classifications: ClassifiedReview[] = [];

    for (const doc of snapshot.docs) {
      const review = doc.data();
      const classified = await this.classifyReview(
        doc.id,
        platform,
        review.rating,
        review.text || '',
        review.userId
      );
      classifications.push(classified);

      // Mark as classified
      await doc.ref.update({ classified: true });
    }

    return classifications;
  }

  /**
   * Generate insights from classified reviews
   */
  async generateInsights(
    platform: 'ios' | 'android',
    period: '24h' | '7d' | '30d' = '7d'
  ): Promise<ReviewInsights> {
    const since = this.getPeriodStart(period);

    // Fetch classified reviews
    const snapshot = await db
      .collection('classifiedReviews')
      .where('platform', '==', platform)
      .where('timestamp', '>=', since)
      .get();

    const reviews = snapshot.docs.map(doc => doc.data() as ClassifiedReview);

    // Calculate distributions
    const categoryDistribution = this.calculateCategoryDistribution(reviews);
    const sentimentDistribution = this.calculateSentimentDistribution(reviews);

    // Extract top issues
    const topBugs = this.extractTopBugs(reviews);
    const topFeatureRequests = this.extractTopFeatureRequests(reviews);
    const topComplaints = this.extractTopComplaints(reviews);

    // Analyze trends
    const ratingTrend = await this.analyzeRatingTrend(platform, period);
    const categoryTrends = await this.analyzeCategoryTrends(platform, period);

    // Generate action items
    const criticalIssues = this.identifyCriticalIssues(reviews);
    const recommendedFixes = this.generateRecommendedFixes(reviews);

    const insights: ReviewInsights = {
      platform,
      period,
      categoryDistribution,
      sentimentDistribution,
      topBugs,
      topFeatureRequests,
      topComplaints,
      ratingTrend,
      categoryTrends,
      criticalIssues,
      recommendedFixes,
      generatedAt: Timestamp.now(),
    };

    // Save insights
    await this.saveInsights(insights);

    return insights;
  }

  /**
   * Get reviews by category
   */
  async getReviewsByCategory(
    platform: 'ios' | 'android',
    category: ReviewCategory,
    limit: number = 50
  ): Promise<ClassifiedReview[]> {
    const snapshot = await db
      .collection('classifiedReviews')
      .where('platform', '==', platform)
      .where('category', '==', category)
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map(doc => doc.data() as ClassifiedReview);
  }

  /**
   * Get reviews requiring immediate attention
   */
  async getCriticalReviews(platform?: 'ios' | 'android'): Promise<ClassifiedReview[]> {
    let query = db
      .collection('classifiedReviews')
      .where('requiresImmediate', '==', true)
      .orderBy('timestamp', 'desc');

    if (platform) {
      query = query.where('platform', '==', platform);
    }

    const snapshot = await query.limit(100).get();

    return snapshot.docs.map(doc => doc.data() as ClassifiedReview);
  }

  // Private classification methods

  private categorizeText(text: string): ReviewCategory {
    const normalizedText = text.toLowerCase();
    
    const scores: { [key in ReviewCategory]?: number } = {};
    
    for (const [category, keywords] of Object.entries(this.CATEGORY_KEYWORDS)) {
      let score = 0;
      for (const keyword of keywords) {
        if (normalizedText.includes(keyword)) {
          score++;
        }
      }
      if (score > 0) {
        scores[category as ReviewCategory] = score;
      }
    }

    if (Object.keys(scores).length === 0) {
      return 'other';
    }

    // Return category with highest score
    return Object.entries(scores).reduce((a, b) => (b[1] > a[1] ? b : a))[0] as ReviewCategory;
  }

  private extractSubcategories(text: string, category: ReviewCategory): string[] {
    const subcategories: string[] = [];
    const normalizedText = text.toLowerCase();

    // Define subcategory mappings
    const subcategoryMappings: { [key: string]: string[] } = {
      bug_performance: ['crash', 'freeze', 'loading', 'battery drain'],
      pricing_payment: ['too expensive', 'subscription', 'refund issue'],
      safety_abuse: ['harassment', 'fake profile', 'scam'],
      // Add more as needed
    };

    const mapping = subcategoryMappings[category] || [];
    for (const sub of mapping) {
      if (normalizedText.includes(sub)) {
        subcategories.push(sub);
      }
    }

    return subcategories;
  }

  private analyzeSentiment(rating: number, text: string): ReviewSentiment {
    // Simple sentiment based on rating and text
    if (rating >= 4.5) return 'very_positive';
    if (rating >= 4) return 'positive';
    if (rating >= 3) return 'neutral';
    if (rating >= 2) return 'negative';
    return 'very_negative';
  }

  private determinePriority(rating: number, category: ReviewCategory, text: string): ReviewPriority {
    // Critical: 1-star + safety/abuse/bugs
    if (rating === 1 && (category === 'safety_abuse' || category === 'hate_spam')) {
      return 'critical';
    }
    
    if (rating <= 2 && category === 'bug_performance' && text.toLowerCase().includes('crash')) {
      return 'critical';
    }

    // High: Low ratings + important categories
    if (rating <= 2 && (category === 'bug_performance' || category === 'safety_abuse')) {
      return 'high';
    }

    // Medium: Mid-range ratings or feature requests
    if (rating === 3 || category === 'feature_request') {
      return 'medium';
    }

    return 'low';
  }

  private routeToTeam(category: ReviewCategory, priority: ReviewPriority): string {
    const routing: { [key in ReviewCategory]: string } = {
      bug_performance: 'engineering',
      pricing_payment: 'billing',
      safety_abuse: 'trust_safety',
      hate_spam: 'content_moderation',
      feature_request: 'product',
      positive_feedback: 'marketing',
      user_experience: 'design',
      onboarding: 'growth',
      other: 'support',
    };

    return routing[category];
  }

  private extractKeywords(text: string): string[] {
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3);
    
    // Return unique words
    return [...new Set(words)].slice(0, 10);
  }

  private async findRelatedIssues(keywords: string[], category: ReviewCategory): Promise<string[]> {
    // Simplified - would use more sophisticated matching in production
    return [];
  }

  private generateSuggestedActions(category: ReviewCategory, priority: ReviewPriority, text: string): string[] {
    const actions: string[] = [];

    if (priority === 'critical') {
      actions.push('Immediate escalation required');
    }

    switch (category) {
      case 'bug_performance':
        actions.push('Create bug ticket');
        actions.push('Investigate crash logs');
        break;
      case 'pricing_payment':
        actions.push('Review pricing feedback');
        actions.push('Consider support outreach');
        break;
      case 'safety_abuse':
        actions.push('Review for TOS violation');
        actions.push('Escalate to trust & safety');
        break;
      case 'feature_request':
        actions.push('Add to product roadmap');
        actions.push('Track request volume');
        break;
    }

    return actions;
  }

  private calculateCategoryDistribution(reviews: ClassifiedReview[]): ReviewInsights['categoryDistribution'] {
    const dist: { [key in ReviewCategory]?: number } = {};
    reviews.forEach(r => {
      dist[r.category] = (dist[r.category] || 0) + 1;
    });
    return dist;
  }

  private calculateSentimentDistribution(reviews: ClassifiedReview[]): ReviewInsights['sentimentDistribution'] {
    const dist: { [key in ReviewSentiment]?: number } = {};
    reviews.forEach(r => {
      dist[r.sentiment] = (dist[r.sentiment] || 0) + 1;
    });
    return dist;
  }

  private extractTopBugs(reviews: ClassifiedReview[]): ReviewInsights['topBugs'] {
    const bugs = reviews
      .filter(r => r.category === 'bug_performance')
      .map(r => ({ issue: r.keywords[0] || 'Unknown', severity: r.priority }));
    
    // Count occurrences
    const counts: { [key: string]: { count: number; severity: string } } = {};
    bugs.forEach(b => {
      if (!counts[b.issue]) counts[b.issue] = { count: 0, severity: b.severity };
      counts[b.issue].count++;
    });

    return Object.entries(counts)
      .map(([issue, data]) => ({ issue, count: data.count, severity: data.severity }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  private extractTopFeatureRequests(reviews: ClassifiedReview[]): ReviewInsights['topFeatureRequests'] {
    return [];
  }

  private extractTopComplaints(reviews: ClassifiedReview[]): ReviewInsights['topComplaints'] {
    return [];
  }

  private async analyzeRatingTrend(platform: string, period: string): Promise<'improving' | 'stable' | 'declining'> {
    return 'stable';
  }

  private async analyzeCategoryTrends(platform: string, period: string): Promise<any[]> {
    return [];
  }

  private identifyCriticalIssues(reviews: ClassifiedReview[]): string[] {
    return reviews
      .filter(r => r.priority === 'critical')
      .map(r => r.suggestedActions[0] || r.category)
      .slice(0, 5);
  }

  private generateRecommendedFixes(reviews: ClassifiedReview[]): ReviewInsights['recommendedFixes'] {
    return [];
  }

  private getPeriodStart(period: '24h' | '7d' | '30d'): Timestamp {
    const hours = period === '24h' ? 24 : period === '7d' ? 168 : 720;
    return Timestamp.fromDate(new Date(Date.now() - hours * 60 * 60 * 1000));
  }

  private async saveClassification(classified: ClassifiedReview): Promise<void> {
    await db.collection('classifiedReviews').doc(classified.reviewId).set(classified);
  }

  private async saveInsights(insights: ReviewInsights): Promise<void> {
    await db.collection('reviewInsights').add(insights);
  }
}

export const reviewIntelligenceLayer = new ReviewIntelligenceLayer();
