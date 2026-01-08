/**
 * PACK 257 Types for Firebase Functions
 * Shared types between frontend and backend
 */

export type PerformanceTier = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6';

export interface EarningsOverview {
  lifetimeTokens: number;
  last7DaysTokens: number;
  todayTokens: number;
  escrowExpected: number;
  escrowBreakdown: EscrowItem[];
  last7DaysTrend: number;
}

export interface EscrowItem {
  id: string;
  type: 'calendar_event' | 'scheduled_call' | 'pre_order';
  title: string;
  scheduledDate: Date;
  expectedTokens: number;
  status: 'pending' | 'confirmed' | 'completed';
}

export interface EngagementMetrics {
  profileViews: {
    last7Days: number;
    trend: number;
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
  id: string;
  viewCount: number;
  lastViewedAt: Date;
  hasPaidInteraction: boolean;
  displayName?: string;
  profilePictureUrl?: string;
  paidIntentScore: number;
}

export interface ConversationAnalytics {
  newChatStarts: {
    count: number;
    last7Days: number;
  };
  paidChats: {
    count: number;
    conversionRate: number;
    averageValue: number;
  };
  averageRepliesPerConvo: number;
  responseRate: number;
  topChatHours: HourlyStats[];
  bestOnlineHours: string[];
}

export interface HourlyStats {
  hour: number;
  messageCount: number;
  paidChatsCount: number;
  tokensEarned: number;
}

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

export interface PerformanceLevel {
  currentTier: PerformanceTier;
  nextTier: PerformanceTier | null;
  currentProgress: number;
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

export interface OptimizationSuggestion {
  id: string;
  type: 'timing' | 'content' | 'engagement' | 'pricing' | 'activity';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  expectedImpact: string;
  actionable: boolean;
  actionLabel?: string;
  actionRoute?: string;
  dataPoints?: SuggestionDataPoint[];
  createdAt: Date;
}

export interface SuggestionDataPoint {
  label: string;
  value: string | number;
  comparison?: string;
}

export interface RoyalAdvancedAnalytics {
  topSpenders: TopSpender[];
  conversionFunnel: ConversionFunnelData;
  wordToTokenEfficiency: {
    averageWordsPerToken: number;
    royalBonus: number;
    comparisonToNonRoyal: number;
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
  averageResponseTime: number;
  messageQualityScore: number;
  engagementDepth: number;
  retentionRate: number;
  peakEngagementWindows: TimeWindow[];
}

export interface TimeWindow {
  startHour: number;
  endHour: number;
  dayOfWeek?: number;
  engagementScore: number;
}

export interface RoyalBenchmark {
  yourPerformance: PerformanceMetrics;
  royalAverage: PerformanceMetrics;
  percentile: number;
}

export interface PerformanceMetrics {
  earningsPerDay: number;
  conversionRate: number;
  fanRetention: number;
  avgTransactionSize: number;
}

export interface CreatorDashboardData {
  earnings: EarningsOverview;
  engagement: EngagementMetrics;
  conversations: ConversationAnalytics;
  mediaSales: MediaSalesAnalytics;
  performanceLevel: PerformanceLevel;
  suggestions: OptimizationSuggestion[];
  royalAnalytics?: RoyalAdvancedAnalytics;
  lastUpdated: Date;
}

export interface DashboardFilters {
  timeframe: '7d' | '30d' | '90d' | 'all';
  includeRoyalFeatures: boolean;
}