/**
 * PACK 291 — AI Assist for Creators Types
 * Smart optimization engine with AI-powered insights
 * 
 * Purpose:
 * - Provide actionable insights for creators
 * - Optimize earnings through behavioral patterns
 * - Read-only layer on top of existing analytics
 * - NO modifications to tokenomics or economic rules
 * 
 * Dependencies:
 * - PACK 290 (Creator Analytics)
 * - PACK 267 (Economics)
 * - PACK 286 (Calendar & Events)
 * - Claude Sonnet 4.5 AI
 * 
 * @package avaloapp
 * @version 1.0.0
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// CONSTANTS
// ============================================================================

export const AI_ASSIST_CONSTANTS = {
  MAX_INSIGHT_LENGTH: 2000,  // chars
  MAX_DAILY_INSIGHTS: 10,
  MAX_WEEKLY_INSIGHTS: 5,
  CACHE_TTL_HOURS: 6,  // Cache AI responses for 6 hours
  MIN_DATA_DAYS: 7,  // Minimum days of data needed for insights
  CLAUDE_MODEL: 'claude-sonnet-4.5',
};

// ============================================================================
// AI INSIGHT TYPES
// ============================================================================

export type InsightType =
  | 'DAILY_SUMMARY'
  | 'WEEKLY_OPTIMIZATION'
  | 'POSTING_TIME'
  | 'CHAT_OPTIMIZATION'
  | 'CALENDAR_OPTIMIZATION'
  | 'EVENT_OPTIMIZATION'
  | 'PRICING_RECOMMENDATION'
  | 'PROFILE_HEALTH';

export type InsightPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export interface AIInsight {
  id: string;
  userId: string;
  type: InsightType;
  priority: InsightPriority;
  title: string;
  description: string;
  actionableSteps?: string[];
  metrics?: Record<string, number | string>;
  createdAt: Timestamp;
  expiresAt?: Timestamp;
}

// ============================================================================
// DAILY INSIGHTS
// ============================================================================

export interface DailyHighlight {
  metric: string;
  value: number | string;
  change?: number;  // Percentage change
  trend?: 'UP' | 'DOWN' | 'STABLE';
}

export interface DailySummaryInsight {
  date: string;  // YYYY-MM-DD
  highlights: DailyHighlight[];
  topPerformingFeature: string;
  earningsToday: number;
  earningsTodayPLN: number;
  profileViews: number;
  newPayers: number;
  summary: string;  // AI-generated text
}

// ============================================================================
// WEEKLY OPTIMIZATION
// ============================================================================

export interface WeeklyTip {
  category: string;
  tip: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  basedOn: string;  // Data source explanation
}

export interface WeeklyOptimization {
  weekStart: string;  // YYYY-MM-DD
  weekEnd: string;    // YYYY-MM-DD
  tips: WeeklyTip[];
  bestPostingTimes: string[];
  peakChatHours: string[];
  performanceSummary: string;  // AI-generated text
}

// ============================================================================
// CONTENT OPTIMIZATION
// ============================================================================

export interface ContentRecommendation {
  type: 'PHOTO' | 'VIDEO' | 'TEXT';
  suggestion: string;
  reasoning: string;
  expectedImpact: string;
  bestTime?: string;  // HH:MM format
}

export interface PostingTimeRecommendation {
  bestTime: string;  // HH:MM format
  bestDays: string[];  // e.g., ['Friday', 'Saturday', 'Sunday']
  reasoning: string;
  basedOnData: {
    visitorActivity: boolean;
    pastPerformance: boolean;
    regionalPatterns: boolean;
  };
}

// ============================================================================
// CHAT OPTIMIZATION
// ============================================================================

export interface ChatMetrics {
  averageResponseTime: number;  // minutes
  conversionRate: number;  // percentage
  averageMessageLength: number;  // words
  longestPaidChatDuration: number;  // minutes
  topPayerAgeRange?: string;
}

export interface ChatOptimizationSuggestion {
  area: 'RESPONSE_TIME' | 'CONVERSION' | 'ENGAGEMENT' | 'RETENTION';
  current: number | string;
  target: number | string;
  suggestion: string;
  impact: string;
}

// ============================================================================
// CALENDAR OPTIMIZATION
// ============================================================================

export interface CalendarInsight {
  mostBookedHours: string[];
  cancellationRate: number;  // percentage
  highCancellationSlots: string[];
  recommendations: string[];
  optimalPricing?: {
    current: number;
    suggested: number;
    reasoning: string;
  };
}

// ============================================================================
// EVENT OPTIMIZATION
// ============================================================================

export interface EventInsight {
  bestEventTimes: string[];
  bestLocations: string[];
  averageAttendance: number;
  conversionRate: number;  // ticket sales / views
  recommendations: string[];
}

// ============================================================================
// PRICING RECOMMENDATIONS
// ============================================================================

export interface PricingRecommendation {
  feature: 'CHAT' | 'CALL' | 'CALENDAR' | 'EVENT';
  currentPrice?: number;
  suggestedPrice?: number;
  reasoning: string;
  expectedImpact: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

// ============================================================================
// PROFILE HEALTH
// ============================================================================

export interface ProfileHealthScore {
  overall: number;  // 0-100
  components: {
    photoQuality: number;
    activityLevel: number;
    responseRate: number;
    verificationStatus: number;
    earningPotential: number;
  };
  suggestions: string[];
  strengths: string[];
  weaknesses: string[];
}

// ============================================================================
// AI INPUT DATA (What we feed to Claude)
// ============================================================================

export interface AIInputData {
  userId: string;
  timeRange: {
    from: string;
    to: string;
  };
  
  // Analytics data
  earnings: {
    total: number;
    byFeature: Record<string, number>;
    trend: number;  // percentage change
  };
  
  // Activity data
  activity: {
    paidChats: number;
    paidCalls: number;
    calendarBookings: number;
    eventTickets: number;
    profileViews: number;
    contentPosts: number;
  };
  
  // Engagement data
  engagement: {
    averageResponseTime: number;
    uniquePayers: number;
    newPayers: number;
    returningPayers: number;
    conversionRate: number;
  };
  
  // Timing data
  timing: {
    peakActivityHours: number[];
    bestPostingHours: number[];
    mostSuccessfulDays: string[];
  };
  
  // Profile data
  profile: {
    hasVerifiedPhotos: boolean;
    photoCount: number;
    completionScore: number;
    accountAgeDays: number;
  };
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

export interface GetDailyInsightsRequest {
  userId: string;
  date?: string;  // YYYY-MM-DD, defaults to today
}

export interface GetDailyInsightsResponse {
  success: boolean;
  data?: DailySummaryInsight;
  insights?: AIInsight[];
  error?: string;
}

export interface GetWeeklyOptimizationRequest {
  userId: string;
  weekStart?: string;  // YYYY-MM-DD, defaults to this week
}

export interface GetWeeklyOptimizationResponse {
  success: boolean;
  data?: WeeklyOptimization;
  error?: string;
}

export interface GetContentRecommendationsRequest {
  userId: string;
}

export interface GetContentRecommendationsResponse {
  success: boolean;
  data?: ContentRecommendation[];
  postingTime?: PostingTimeRecommendation;
  error?: string;
}

export interface GetChatOptimizationRequest {
  userId: string;
  timeRangeDays?: number;
}

export interface GetChatOptimizationResponse {
  success: boolean;
  metrics?: ChatMetrics;
  suggestions?: ChatOptimizationSuggestion[];
  error?: string;
}

export interface GetCalendarOptimizationRequest {
  userId: string;
  timeRangeDays?: number;
}

export interface GetCalendarOptimizationResponse {
  success: boolean;
  data?: CalendarInsight;
  error?: string;
}

export interface GetEventOptimizationRequest {
  userId: string;
  timeRangeDays?: number;
}

export interface GetEventOptimizationResponse {
  success: boolean;
  data?: EventInsight;
  error?: string;
}

export interface GetProfileHealthRequest {
  userId: string;
}

export interface GetProfileHealthResponse {
  success: boolean;
  data?: ProfileHealthScore;
  error?: string;
}

// ============================================================================
// CLAUDE AI TYPES
// ============================================================================

export interface ClaudePrompt {
  system: string;
  user: string;
  maxTokens: number;
  temperature: number;
}

export interface ClaudeResponse {
  content: string;
  model: string;
  tokensUsed: number;
  cached?: boolean;
}

// ============================================================================
// CACHE TYPES
// ============================================================================

export interface CachedInsight {
  userId: string;
  type: InsightType;
  data: any;
  generatedAt: Timestamp;
  expiresAt: Timestamp;
}

// ============================================================================
// SAFETY & COMPLIANCE
// ============================================================================

export interface SafetyConstraints {
  noNSFWSuggestions: boolean;
  noAppearanceComments: boolean;
  noSexualContent: boolean;
  focusOnMetrics: boolean;
  complianceLevel: 'GOOGLE_PLAY' | 'APP_STORE';
}

export const DEFAULT_SAFETY_CONSTRAINTS: SafetyConstraints = {
  noNSFWSuggestions: true,
  noAppearanceComments: true,
  noSexualContent: true,
  focusOnMetrics: true,
  complianceLevel: 'GOOGLE_PLAY',
};

// ============================================================================
// ANALYTICS AGGREGATION
// ============================================================================

export interface AggregatedBehaviorData {
  userId: string;
  period: string;  // e.g., "2025-12-01_to_2025-12-07"
  
  // Aggregated metrics
  totalEarnings: number;
  earningsByFeature: Record<string, number>;
  
  // Activity patterns
  hourlyActivity: Record<number, number>;  // 0-23 hours
  dailyActivity: Record<string, number>;   // Mon-Sun
  
  // Engagement patterns
  responseTimeDistribution: Record<string, number>;  // Fast/Medium/Slow
  conversionRates: Record<string, number>;  // By feature
  
  // Audience patterns
  payerDemographics: {
    ageRanges: Record<string, number>;
    returningRate: number;
    averageSpend: number;
  };
  
  // Content patterns
  postingTimes: Record<number, number>;  // Hour of day
  contentTypes: Record<string, number>;  // Photo/Video counts
  
  createdAt: Timestamp;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Validate if sufficient data exists for AI insights
 */
export function hasSufficientData(data: AIInputData): boolean {
  const hasEarnings = data.earnings.total > 0;
  const hasActivity = Object.values(data.activity).some(v => v > 0);
  const hasEngagement = data.engagement.uniquePayers > 0;
  
  return hasEarnings && hasActivity && hasEngagement;
}

/**
 * Calculate priority based on impact potential
 */
export function calculateInsightPriority(
  impact: string,
  confidence: string
): InsightPriority {
  if (impact === 'HIGH' && confidence === 'HIGH') return 'HIGH';
  if (impact === 'HIGH' || confidence === 'HIGH') return 'MEDIUM';
  return 'LOW';
}

/**
 * Sanitize AI-generated text to ensure compliance
 */
export function sanitizeAIResponse(text: string): string {
  // Remove any potentially sensitive content
  const sanitized = text
    .replace(/\b(sexy|hot|attractive|beautiful|gorgeous)\b/gi, '')
    .replace(/\b(nsfw|adult|explicit)\b/gi, '')
    .trim();
  
  return sanitized;
}

/**
 * Format time for display
 */
export function formatTimeRange(hour: number): string {
  const end = (hour + 1) % 24;
  return `${hour.toString().padStart(2, '0')}:00–${end.toString().padStart(2, '0')}:00`;
}