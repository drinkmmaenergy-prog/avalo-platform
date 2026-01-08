/**
 * PACK 424 — Public Launch, ASO, Reviews & Store Reputation Defense Engine
 * Store Review Types and Models
 * 
 * Dependencies:
 * - PACK 423 (Ratings & Sentiment)
 * - PACK 302/352 (Fraud Detection)
 * - PACK 293 (Notifications)
 */

export type Platform = 'IOS' | 'ANDROID';

export type ReviewRating = 1 | 2 | 3 | 4 | 5;

export interface StoreReview {
  id: string;
  platform: Platform;
  locale: string;

  storeUserName: string;
  rating: ReviewRating;
  reviewText?: string;

  createdAt: number;
  scrapedAt: number;

  version: string;       // app version at time of review
  country: string;

  sentimentScore?: number; // -1.0 to +1.0 (AI derived)
  riskFlag?: boolean;      // suspected attack or fake

  linkedUserId?: string;  // if review matches known user
  
  // Response tracking
  responseText?: string;
  responseAt?: number;
  respondedBy?: string; // admin user ID
  
  // Metadata
  helpfulCount?: number;
  reportedCount?: number;
  lastUpdatedAt?: number;
}

export interface ReviewResponse {
  reviewId: string;
  responseText: string;
  respondedBy: string;
  respondedAt: number;
  platform: Platform;
  publishedToStore: boolean;
  publishedAt?: number;
}

export interface ReviewBurst {
  id: string;
  platform: Platform;
  startTime: number;
  endTime: number;
  reviewCount: number;
  averageRating: number;
  suspiciousScore: number; // 0.0 to 1.0
  reasons: string[];
  reviewIds: string[];
}

export interface StoreTrustScore {
  id: string;
  calculatedAt: number;
  score: number; // 0.0 to 1.0
  
  // Components
  avgRatingLast14d: number;
  avgRatingLast30d: number;
  reviewVelocity: number;
  avgSentimentScore: number;
  fakeReviewRatio: number;
  responseTimeToNegativeReviews: number; // in hours
  
  // Breakdown by platform
  iosScore?: number;
  androidScore?: number;
  
  // Trends
  trend: 'improving' | 'stable' | 'declining';
  previousScore?: number;
}

export interface ASOMetrics {
  id: string;
  timestamp: number;
  country: string;
  
  // Keyword tracking
  keywords: {
    keyword: string;
    rank: number;
    previousRank?: number;
    searchVolume?: number;
  }[];
  
  // Conversion metrics
  storeVisits: number;
  installs: number;
  firstLaunches: number;
  conversionRate: number; // installs / storeVisits
  
  // A/B test variants (if active)
  activeTests?: {
    testId: string;
    variant: string;
    impressions: number;
    conversions: number;
  }[];
}

export interface ReviewDetectionResult {
  reviewId: string;
  isSuspicious: boolean;
  suspiciousScore: number; // 0.0 to 1.0
  reasons: string[];
  recommendedAction: 'flag' | 'monitor' | 'ignore';
  relatedReviewIds?: string[]; // similar reviews
}

export interface ReviewAnalytics {
  period: {
    start: number;
    end: number;
  };
  
  totalReviews: number;
  averageRating: number;
  
  // Rating distribution
  ratings: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
  
  // By platform
  byPlatform: {
    ios: {
      count: number;
      averageRating: number;
    };
    android: {
      count: number;
      averageRating: number;
    };
  };
  
  // Top countries
  topCountries: {
    country: string;
    count: number;
    averageRating: number;
  }[];
  
  // Sentiment analysis
  avgSentimentScore: number;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
  
  // Suspicious activity
  flaggedReviews: number;
  detectedBursts: number;
  
  // Response metrics
  responseRate: number;
  avgResponseTime: number; // in hours
}

export interface AIReviewSuggestion {
  reviewId: string;
  suggestedType: 'apology' | 'bug_acknowledgment' | 'safety_reassurance' | 'refund_guidance' | 'appreciation';
  suggestedText: string;
  tone: 'formal' | 'friendly' | 'empathetic' | 'professional';
  confidence: number; // 0.0 to 1.0
  keyPoints: string[];
}

export interface StoreHealthDashboard {
  timestamp: number;
  
  // Overall health
  trustScore: number;
  healthStatus: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  
  // Recent activity
  last24h: {
    reviews: number;
    installs: number;
    averageRating: number;
    flaggedReviews: number;
  };
  
  last7d: {
    reviews: number;
    installs: number;
    averageRating: number;
    flaggedReviews: number;
    trustScoreTrend: number; // percentage change
  };
  
  last30d: {
    reviews: number;
    installs: number;
    averageRating: number;
    flaggedReviews: number;
    trustScoreTrend: number;
  };
  
  // Active alerts
  alerts: {
    type: 'review_burst' | 'rating_drop' | 'fake_reviews' | 'negative_sentiment';
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    timestamp: number;
  }[];
  
  // Action items
  pendingResponses: number;
  unresolvedFlags: number;
}
