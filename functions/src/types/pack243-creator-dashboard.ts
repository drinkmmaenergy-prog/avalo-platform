/**
 * PACK 243: Creator Ego Metrics Dashboard
 * TypeScript type definitions for creator analytics
 */

export interface CreatorDashboard {
  profileViews: number;
  profileViewsChange: number; // % change from previous period
  swipeInterest: number;
  swipeInterestChange: number;
  chatRequests: number;
  chatRequestsChange: number;
  missedEarnings: number; // Users who couldn't afford current price
  topPayingAgeRange: string; // e.g., "25-34"
  topCountries: string[]; // ISO country codes
  tokenEarnings: {
    daily: number;
    weekly: number;
    monthly: number;
  };
  meetingConversion: number; // % of chats → bookings
  eventPopularity: number; // Expected attendance
  retentionPercentile: number; // 0-100, percentile ranking vs region
  topCreatorBadge: boolean;
  lastUpdated: FirebaseFirestore.Timestamp;
}

export interface DailyStats {
  date: string; // YYYY-MM-DD
  profileViews: number;
  swipeInterest: number;
  chatRequests: number;
  tokenEarnings: number;
  meetingsBooked: number;
  averageResponseTime: number; // in minutes
  onlineTime: number; // in minutes
  contentUploads: number;
  calculatedAt: FirebaseFirestore.Timestamp;
}

export interface WeeklyStats {
  weekStart: string; // YYYY-MM-DD (Monday)
  weekEnd: string; // YYYY-MM-DD (Sunday)
  profileViews: number;
  swipeInterest: number;
  chatRequests: number;
  tokenEarnings: number;
  meetingsBooked: number;
  averageResponseTime: number;
  onlineTime: number;
  contentUploads: number;
  peakDay: string; // Day of week with highest earnings
  calculatedAt: FirebaseFirestore.Timestamp;
}

export interface MonthlyStats {
  monthStart: string; // YYYY-MM-01
  monthEnd: string; // Last day of month
  profileViews: number;
  swipeInterest: number;
  chatRequests: number;
  tokenEarnings: number;
  meetingsBooked: number;
  averageResponseTime: number;
  onlineTime: number;
  contentUploads: number;
  peakWeek: string; // Week with highest earnings
  calculatedAt: FirebaseFirestore.Timestamp;
}

export interface AgeRangeMetrics {
  ageRange: string; // e.g., "18-24", "25-34"
  interactions: number;
  earnings: number;
  conversionRate: number;
}

export interface CountryMetrics {
  country: string; // ISO country code
  interactions: number;
  earnings: number;
  popularity: number; // 0-100 score
}

export interface MotivationalNudge {
  id: string;
  userId: string;
  type: 'visibility' | 'response_speed' | 'ranking' | 'demand' | 'content' | 'availability';
  message: string;
  priority: number; // 1-10, higher = more important
  actionable: boolean;
  suggestedAction?: string;
  createdAt: FirebaseFirestore.Timestamp;
  expiresAt: FirebaseFirestore.Timestamp;
  dismissed: boolean;
  dismissedAt?: FirebaseFirestore.Timestamp;
}

export interface ActionSuggestion {
  id: string;
  userId: string;
  type: 'pricing' | 'availability' | 'content' | 'promotion';
  title: string;
  description: string;
  metric: string; // Which metric triggered this suggestion
  expectedImpact: string; // e.g., "Increase earnings by 15%"
  actionType: 'enable_premium_chat' | 'add_calendar_slots' | 'promote_video_calls' | 
               'add_icebreakers' | 'adjust_price' | 'host_event' | 'upload_content';
  priority: number;
  active: boolean;
  createdAt: FirebaseFirestore.Timestamp;
  completedAt?: FirebaseFirestore.Timestamp;
}

export interface DashboardRanking {
  region: string; // Country or region code
  totalCreators: number;
  percentiles: {
    [percentile: number]: {
      minEarnings: number;
      minProfileViews: number;
      minResponseTime: number;
    };
  };
  calculatedAt: FirebaseFirestore.Timestamp;
}

export interface TopCreatorBadge {
  userId: string;
  country: string;
  percentile: number; // 1-100
  badgeType: 'top_1_percent' | 'top_5_percent' | 'top_10_percent';
  earnedAt: FirebaseFirestore.Timestamp;
  lastUpdated: FirebaseFirestore.Timestamp;
  visible: boolean; // Whether to show on profile
}

export interface DashboardEvent {
  userId: string;
  type: 'action_taken' | 'nudge_viewed' | 'nudge_dismissed' | 'suggestion_completed';
  actionType?: string;
  nudgeId?: string;
  suggestionId?: string;
  metadata: {
    [key: string]: any;
  };
  timestamp: FirebaseFirestore.Timestamp;
}

// Nudge generation contexts
export interface NudgeContext {
  recentUpload?: {
    timestamp: FirebaseFirestore.Timestamp;
    viewIncrease: number;
  };
  responseSpeedImprovement?: {
    previousAverage: number;
    currentAverage: number;
    revenueImpact: number;
  };
  rankingAchievement?: {
    percentile: number;
    country: string;
    trend: 'up' | 'stable' | 'down';
  };
  missedOpportunities?: {
    chatRequests: number;
    estimatedRevenue: number;
    reason: 'unavailable' | 'slow_response' | 'price_too_high';
  };
}

// Action suggestion contexts
export interface SuggestionContext {
  highProfileInterest?: {
    views: number;
    swipes: number;
    currentChatPrice: number;
  };
  highChatConversion?: {
    chatsToMeetings: number;
    conversionRate: number;
  };
  lowCallConversion?: {
    callAttempts: number;
    successRate: number;
  };
  missedEarningsOpportunity?: {
    affordabilityIssues: number;
    currentPrice: number;
    suggestedPrice: number;
  };
  localDemand?: {
    country: string;
    localInterest: number;
    eventPotential: number;
  };
}

// Analytics calculation input
export interface AnalyticsInput {
  userId: string;
  timeframe: 'daily' | 'weekly' | 'monthly';
  startDate: Date;
  endDate: Date;
}

// Analytics calculation output
export interface AnalyticsOutput {
  dashboard: CreatorDashboard;
  stats: DailyStats | WeeklyStats | MonthlyStats;
  nudges: MotivationalNudge[];
  suggestions: ActionSuggestion[];
  ranking: {
    percentile: number;
    region: string;
  };
}

// Motivational nudge templates
export const NUDGE_TEMPLATES = {
  visibility_increase: (viewIncrease: number) => 
    `Your visibility increased by ${viewIncrease}% after uploading new content — want to try again today?`,
  
  response_speed_impact: (revenueIncrease: number) => 
    `Your reply speed increased revenue by ${revenueIncrease}% last week.`,
  
  ranking_achievement: (percentile: number, country: string) => 
    `You reached Top ${percentile}% in ${country} — keep momentum going!`,
  
  missed_bookings: (missedCount: number) => 
    `${missedCount} users tried to book time with you yesterday — maybe open ${Math.min(missedCount, 5)} more calendar slots?`,
  
  content_momentum: () => 
    `Creators who upload weekly earn 40% more on average.`,
  
  availability_opportunity: (requestCount: number) => 
    `${requestCount} chat requests came while you were offline — consider extending your active hours.`,
} as const;

// Action suggestion templates
export const SUGGESTION_TEMPLATES = {
  enable_premium_chat: (views: number) => ({
    title: 'Enable Premium Chat Pricing',
    description: `With ${views} weekly profile views, you could increase chat revenue by enabling premium pricing.`,
    expectedImpact: 'Increase chat earnings by up to 30%',
  }),
  
  promote_video_calls: (conversionRate: number) => ({
    title: 'Promote Video Calls',
    description: `Your ${conversionRate}% chat-to-meeting conversion shows high interest in deeper connections.`,
    expectedImpact: 'Convert more chats into profitable video calls',
  }),
  
  add_calendar_slots: (missedCount: number) => ({
    title: 'Add Calendar Availability',
    description: `${missedCount} users couldn't find available slots this week.`,
    expectedImpact: 'Capture missed booking opportunities',
  }),
  
  adjust_pricing: (missedEarnings: number, currentPrice: number) => ({
    title: 'Consider Price Adjustment',
    description: `${missedEarnings} users viewed your profile but couldn't afford ${currentPrice} tokens.`,
    expectedImpact: 'Potentially increase total revenue volume',
  }),
  
  host_event: (localInterest: number, country: string) => ({
    title: 'Host Local Event',
    description: `High demand from ${country} (${localInterest} interested users).`,
    expectedImpact: 'Monetize local popularity with events',
  }),
} as const;