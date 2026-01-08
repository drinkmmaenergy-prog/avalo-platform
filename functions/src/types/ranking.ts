/**
 * Phase 11C - Creator Ranking System Types
 * Type definitions for global ranking and creator dashboard
 */

export type RankingPeriod = 'daily' | 'weekly' | 'monthly' | 'lifetime';
export type RankingSegment = 'worldwide' | 'country' | 'city';
export type GenderFilter = 'all' | 'women' | 'men' | 'other';
export type CategoryFilter = 'all' | 'video' | 'chat' | 'tips' | 'content';

/**
 * Action types that generate ranking points
 */
export interface RankingAction {
  type: 'tip' | 'paid_chat' | 'voice_call' | 'video_call' | 'content_purchase' | 'boost' | 'first_time_fan';
  creatorId: string;
  payerId: string;
  points: number;
  tokensAmount?: number;
  minutesDuration?: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}

/**
 * Creator's ranking score for a specific period
 */
export interface RankingScore {
  creatorId: string;
  period: RankingPeriod;
  segment: RankingSegment;
  genderFilter: GenderFilter;
  categoryFilter: CategoryFilter;
  
  // Points breakdown
  points: number;
  tipPoints: number;
  chatPoints: number;
  voiceCallPoints: number;
  videoCallPoints: number;
  contentPoints: number;
  boostPoints: number;
  firstTimeFanPoints: number;
  
  // Metadata
  uniquePayingFans: string[]; // List of unique payer IDs
  totalActions: number;
  lastUpdated: Date;
  
  // Geographic data (for country/city segments)
  country?: string;
  city?: string;
}

/**
 * Leaderboard entry with ranking position
 */
export interface LeaderboardEntry {
  rank: number;
  creatorId: string;
  displayName: string;
  avatar?: string;
  gender: 'male' | 'female' | 'other';
  points: number;
  
  // Badge priorities: Royal > VIP > Influencer > EarnOn > Incognito
  badges: {
    royal?: boolean;
    vip?: boolean;
    influencer?: boolean;
    earnOn?: boolean;
    incognito?: boolean;
  };
  
  // Preview stats for UI
  stats: {
    tips: number;
    chats: number;
    calls: number;
    content: number;
  };
  
  // Geographic info
  country?: string;
  city?: string;
  
  // Top 10 bonus indicator
  hasTop10Bonus?: boolean;
}

/**
 * Creator Dashboard data
 */
export interface CreatorDashboard {
  creatorId: string;
  
  // Current rankings
  rankings: {
    daily: {
      worldwide: number | null;
      country: number | null;
      city: number | null;
    };
    weekly: {
      worldwide: number | null;
      country: number | null;
      city: number | null;
    };
    monthly: {
      worldwide: number | null;
      country: number | null;
      city: number | null;
    };
    lifetime: {
      worldwide: number | null;
      country: number | null;
      city: number | null;
    };
  };
  
  // Points by period
  points: {
    daily: number;
    weekly: number;
    monthly: number;
    lifetime: number;
  };
  
  // Category-specific rankings
  categoryRankings: {
    video: number | null;
    chat: number | null;
    tips: number | null;
    content: number | null;
  };
  
  // Predictions
  predictions: {
    dailyPositionChange: number; // e.g., +3, -2
    weeklyPositionChange: number;
    monthlyPositionChange: number;
    pointsNeededForNextRank: number;
  };
  
  // Action suggestions
  suggestions: string[];
  
  // Milestones achieved
  milestones: Milestone[];
  
  // 30-day improvement timeline
  improvementTimeline: TimelinePoint[];
  
  // Active bonuses
  hasTop10Bonus: boolean;
  bonusExpiresAt?: Date;
  
  lastUpdated: Date;
}

/**
 * Milestone achievement
 */
export interface Milestone {
  id: string;
  title: string;
  description: string;
  achievedAt: Date;
  icon: string;
}

/**
 * Timeline point for improvement chart
 */
export interface TimelinePoint {
  date: Date;
  rank: number;
  points: number;
  period: RankingPeriod;
}

/**
 * Top 10 bonus status
 */
export interface Top10Bonus {
  creatorId: string;
  rank: number;
  activatedAt: Date;
  expiresAt: Date;
  bonuses: {
    discoveryVisibility: number; // +15%
    matchPriority: number; // +15%
    feedPriority: number; // +15%
  };
  isActive: boolean;
}

/**
 * Ranking query parameters
 */
export interface RankingQuery {
  period: RankingPeriod;
  segment?: RankingSegment;
  gender?: GenderFilter;
  category?: CategoryFilter;
  country?: string;
  city?: string;
  limit?: number;
  offset?: number;
}

/**
 * Leaderboard response
 */
export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  total: number;
  period: RankingPeriod;
  segment: RankingSegment;
  filters: {
    gender: GenderFilter;
    category: CategoryFilter;
    country?: string;
    city?: string;
  };
  lastUpdated: Date;
}