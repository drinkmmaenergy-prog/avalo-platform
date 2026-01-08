/**
 * PACK 257 — Creator Analytics Dashboard Types
 * Revenue, Engagement, Fan Growth & Optimization Suggestions
 */

// ============================================================================
// EARNINGS METRICS
// ============================================================================

export interface EarningsOverview {
  lifetimeTokens: number;
  last7DaysTokens: number;
  todayTokens: number;
  escrowExpected: number;
  escrowBreakdown: EscrowItem[];
  last7DaysTrend: number; // percentage change
}

export interface EscrowItem {
  id: string;
  type: 'calendar_event' | 'scheduled_call' | 'pre_order';
  title: string;
  scheduledDate: Date;
  expectedTokens: number;
  status: 'pending' | 'confirmed' | 'completed';
}

// ============================================================================
// ENGAGEMENT METRICS
// ============================================================================

export interface EngagementMetrics {
  profileViews: {
    last7Days: number;
    trend: number; // percentage change
    peakDay: string;
  };
  likes: {
    last7Days: number;
    trend: number;
  };
  newFollowers: {
    last7Days: number;
    trend: number;
  };
  topViewers: TopViewer[];
}

export interface TopViewer {
  id: string; // anonymized unless paid interaction
  viewCount: number;
  lastViewedAt: Date;
  hasPaidInteraction: boolean;
  displayName?: string; // only if hasPaidInteraction
  profilePictureUrl?: string; // only if hasPaidInteraction
  paidIntentScore: number; // 0-100
}

// ============================================================================
// CONVERSATION ANALYTICS
// ============================================================================

export interface ConversationAnalytics {
  newChatStarts: {
    count: number;
    last7Days: number;
  };
  paidChats: {
    count: number;
    conversionRate: number; // percentage
    averageValue: number; // tokens per paid chat
  };
  averageRepliesPerConvo: number;
  responseRate: number; // percentage of messages replied to
  topChatHours: HourlyStats[];
  bestOnlineHours: string[]; // e.g. ["20:00-21:00", "21:00-22:00"]
}

export interface HourlyStats {
  hour: number; // 0-23
  messageCount: number;
  paidChatsCount: number;
  tokensEarned: number;
}

// ============================================================================
// MEDIA SALES ANALYTICS
// ============================================================================

export interface MediaSalesAnalytics {
  albums: {
    soldCount: number;
    tokensEarned: number;
    last7Days: number;
  };
  videos: {
    soldCount: number;
    tokensEarned: number;
    last7Days: number;
  };
  storyDrops: {
    soldCount: number;
    tokensEarned: number;
    last7Days: number;
  };
  topSellingMedia: TopMedia[];
}

export interface TopMedia {
  id: string;
  type: 'album' | 'video' | 'story';
  title: string;
  thumbnailUrl?: string;
  salesCount: number;
  tokensEarned: number;
  uploadedat: Date;
}

// ============================================================================
// PERFORMANCE TIERS
// ============================================================================

export type PerformanceTier = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6';

export interface PerformanceLevel {
  currentTier: PerformanceTier;
  nextTier: PerformanceTier | null;
  currentProgress: number; // 0-100 percentage to next level
  requirements: TierRequirement[];
  unlockedFeatures: string[];
  nextFeatures: string[];
}

export interface TierRequirement {
  type: 'earnings' | 'engagement' | 'activity' | 'retention';
  label: string;
  current: number;
  required: number;
  met: boolean;
}

export const TIER_INFO: Record<PerformanceTier, { title: string; minEarnings: number }> = {
  L1: { title: 'Starter', minEarnings: 0 },
  L2: { title: 'Rising', minEarnings: 5000 },
  L3: { title: 'Influencer', minEarnings: 25000 },
  L4: { title: 'Trending', minEarnings: 100000 },
  L5: { title: 'Elite', minEarnings: 500000 },
  L6: { title: 'Royal', minEarnings: 2000000 },
};

// ============================================================================
// AI OPTIMIZATION SUGGESTIONS
// ============================================================================

export interface OptimizationSuggestion {
  id: string;
  type: 'timing' | 'content' | 'engagement' | 'pricing' | 'activity';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  expectedImpact: string; // e.g., "+28% earnings potential"
  actionable: boolean;
  actionLabel?: string;
  actionRoute?: string;
  dataPoints?: SuggestionDataPoint[];
  createdAt: Date;
}

export interface SuggestionDataPoint {
  label: string;
  value: string | number;
  comparison?: string; // e.g., "3× more than average"
}

// ============================================================================
// ROYAL ADVANCED ANALYTICS
// ============================================================================

export interface RoyalAdvancedAnalytics {
  topSpenders: TopSpender[];
  conversionFunnel: ConversionFunnelData;
  wordToTokenEfficiency: {
    averageWordsPerToken: number;
    royalBonus: number; // improved ratio
    comparisonToNonRoyal: number; // percentage better
  };
  deepChatAnalysis: DeepChatAnalysis;
  royalComparison: RoyalBenchmark;
}

export interface TopSpender {
  userId: string;
  displayName: string;
  profilePictureUrl?: string;
  lifetimeSpent: number;
  last30DaysSpent: number;
  lastInteractionAt: Date;
  favoriteContentType: string;
}

export interface ConversionFunnelData {
  profileViews: number;
  chatStarts: number;
  firstPaidInteraction: number;
  repeatPayers: number;
  conversionRates: {
    viewToChat: number;
    chatToPaid: number;
    paidToRepeat: number;
  };
}

export interface DeepChatAnalysis {
  averageResponseTime: number; // minutes
  messageQualityScore: number; // 0-100
  engagementDepth: number; // average messages per conversation
  retentionRate: number; // percentage of users who return
  peakEngagementWindows: TimeWindow[];
}

export interface TimeWindow {
  startHour: number;
  endHour: number;
  dayOfWeek?: number; // 0-6
  engagementScore: number;
}

export interface RoyalBenchmark {
  yourPerformance: PerformanceMetrics;
  royalAverage: PerformanceMetrics;
  percentile: number; // where you rank among Royal creators (0-100)
}

export interface PerformanceMetrics {
  earningsPerDay: number;
  conversionRate: number;
  fanRetention: number;
  avgTransactionSize: number;
}

// ============================================================================
// DASHBOARD STATE
// ============================================================================

export interface CreatorDashboardData {
  earnings: EarningsOverview;
  engagement: EngagementMetrics;
  conversations: ConversationAnalytics;
  mediaSales: MediaSalesAnalytics;
  performanceLevel: PerformanceLevel;
  suggestions: OptimizationSuggestion[];
  royalAnalytics?: RoyalAdvancedAnalytics; // Only for Royal users
  lastUpdated: Date;
}

export interface DashboardFilters {
  timeframe: '7d' | '30d' | '90d' | 'all';
  includeRoyalFeatures: boolean;
}