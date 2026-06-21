import { MONETIZATION_SPLITS, SPLITS } from "../../../config/monetizationSplits";

// Pack 423 - Ratings Types (flexible)
export interface Rating {
  id?: string;
  fromUserId?: string;
  toUserId?: string;
  score?: number;
  review?: string;
  tags?: string[];
  createdAt?: any;
  [key: string]: any;
}

export interface RatingAggregation {
  userId?: string;
  averageScore?: number;
  totalRatings?: number;
  distribution?: Record<number, number>;
  [key: string]: any;
}

export interface RatingPrompt {
  id?: string;
  userId?: string;
  contextType?: string;
  contextId?: string;
  promptedAt?: any;
  respondedAt?: any;
  [key: string]: any;
}

export interface RatingConfig {
  minScore?: number;
  maxScore?: number;
  requireReview?: boolean;
  cooldownHours?: number;
  [key: string]: any;
}

export interface RatingModeration {
  ratingId?: string;
  status?: 'PENDING' | 'APPROVED' | 'REJECTED';
  reason?: string;
  moderatedBy?: string;
  [key: string]: any;
}

// Additional exports for pack423-ratings.service.ts, pack423-nps.service.ts, pack423-integrations.ts, pack423-metrics.ts
export type InteractionType = 
  | 'CHAT'
  | 'CALL'
  | 'VIDEO_CALL'
  | 'VOICE_CALL'
  | 'MEETING'
  | 'EVENT'
  | 'PURCHASE'
  | 'CHAT_SESSION'
  | 'AI_COMPANION_SESSION';

export interface UserInteractionRating {
  id?: string;
  fromUserId?: string;
  toUserId?: string;
  interactionType?: InteractionType;
  interactionId?: string;
  score?: number;
  review?: string;
  tags?: string[];
  createdAt?: any;
  [key: string]: any;
}

export interface CreateRatingInput {
  toUserId?: string;
  raterUserId?: string;
  interactionType?: InteractionType;
  interactionId?: string;
  score?: number;
  rating?: number;
  review?: string;
  tags?: string[];
  thumbsUp?: boolean;
  comment?: string;
  [key: string]: any;
}

export interface UserRatingSummary {
  userId?: string;
  averageScore?: number;
  totalRatings?: number;
  totalRatings90d?: number;
  avgRating90d?: number;
  ratingsByType?: Record<InteractionType, number>;
  byType?: Record<string, { avgRating?: number; count?: number; [key: string]: any }>;
  recentTrend?: 'UP' | 'DOWN' | 'STABLE';
  [key: string]: any;
}

export interface CompanionRatingSummary {
  companionId?: string;
  averageScore?: number;
  totalRatings?: number;
  topTags?: string[];
  [key: string]: any;
}

export interface RatingEligibility {
  canRate?: boolean;
  eligible?: boolean;
  reason?: string;
  cooldownEndsAt?: any;
  [key: string]: any;
}

export interface NpsSurveyResponse {
  id?: string;
  userId?: string;
  score?: number;
  feedback?: string;
  comment?: string;
  segment?: UserSegment;
  segmentAtTime?: UserSegment;
  productArea?: ProductArea;
  tagProductArea?: ProductArea;
  channel?: string;
  locale?: string;
  platform?: string;
  createdAt?: any;
  [key: string]: any;
}

export interface CreateNpsInput {
  userId?: string;
  score?: number;
  feedback?: string;
  comment?: string;
  productArea?: ProductArea;
  tagProductArea?: ProductArea;
  channel?: string;
  locale?: string;
  platform?: string;
  [key: string]: any;
}

export interface NpsAnalytics {
  npsScore?: number;
  promoters?: number;
  passives?: number;
  detractors?: number;
  totalResponses?: number;
  bySegment?: Record<UserSegment, number>;
  byProductArea?: Record<ProductArea, number>;
  timeRange?: string | { start: number; end: number };
  [key: string]: any;
}

export interface NpsCooldown {
  userId?: string;
  lastPromptedAt?: any;
  lastResponseAt?: any;
  nextEligibleAt?: any;
  [key: string]: any;
}

export type UserSegment = 
  | 'NEW_USER'
  | 'NEW'
  | 'ACTIVE_USER'
  | 'ACTIVE'
  | 'POWER_USER'
  | 'CHURNED'
  | 'REACTIVATED'
  | 'DORMANT'
  | 'CHURN_RISK'
  | 'RETURNING';

export type ProductArea = 
  | 'DISCOVERY'
  | 'CHAT'
  | 'CALLS'
  | 'EVENTS'
  | 'PAYMENTS'
  | 'PROFILE'
  | 'OVERALL';




























