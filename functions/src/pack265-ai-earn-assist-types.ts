/**
 * PACK 265: AI EARN ASSIST ENGINE
 * Type definitions for smart revenue optimization
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// SUGGESTION TYPES
// ============================================================================

export enum SuggestionType {
  LIVE_SCHEDULING = 'live_scheduling',
  DM_PRIORITY = 'dm_priority',
  CONTENT_OPTIMIZATION = 'content_optimization',
  FEATURE_AWARENESS = 'feature_awareness',
  SUPPORTER_ENGAGEMENT = 'supporter_engagement',
  PRICING_STRATEGY = 'pricing_strategy',
}

export enum SuggestionPriority {
  HIGH = 'high',      // 🔥 Critical - immediate action recommended
  MEDIUM = 'medium',  // ⭐ Important - consider soon
  LOW = 'low',        // 💡 Nice to have - when convenient
}

export interface AIEarningSuggestion {
  id: string;
  creatorId: string;
  type: SuggestionType;
  priority: SuggestionPriority;
  title: string;
  description: string;
  expectedImpact: string; // e.g., "+19% gifts", "+22% conversion"
  actionable: boolean;
  actionLabel?: string; // e.g., "Go Live Now", "Message Them"
  actionData?: Record<string, any>;
  
  // Evidence/reasoning
  reasoning: string;
  confidence: number; // 0-100, how confident the AI is
  basedOn: {
    dataPoints: number;
    timeframe: string; // e.g., "last 30 days"
    sources: string[]; // e.g., ["live_analytics", "supporter_behavior"]
  };
  
  // Lifecycle
  createdAt: Date;
  expiresAt?: Date; // Some suggestions are time-sensitive
  dismissedAt?: Date;
  actedUponAt?: Date;
  
  // Safety
  compliant: boolean;
  safetyChecked: boolean;
}

// ============================================================================
// BEHAVIOR PREDICTION
// ============================================================================

export interface SupporterBehaviorSignal {
  supporterId: string;
  creatorId: string;
  
  // Signals with weights
  recentChatActivity: {
    messageCount: number;
    lastMessageAt: Date;
    weight: 'very_high' | 'high' | 'medium' | 'low';
  };
  
  previousGiftingBehavior: {
    totalGiftsSent: number;
    averageGiftValue: number;
    lastGiftAt?: Date;
    weight: 'very_high' | 'high' | 'medium' | 'low';
  };
  
  profileViewActivity: {
    viewCount: number;
    lastViewAt: Date;
    weight: 'high' | 'medium' | 'low';
  };
  
  liveEngagement: {
    watchedFullLive: boolean;
    totalMinutesWatched: number;
    weight: 'high' | 'medium' | 'low';
  };
  
  recentSwipeMatch: {
    matched: boolean;
    matchedAt?: Date;
    weight: 'medium' | 'low';
  };
  
  likesWithoutChat: {
    likeCount: number;
    weight: 'low';
  };
  
  // Computed
  conversionProbability: number; // 0-100
  predictedValue: number; // Expected tokens
  lastAnalyzedAt: Date;
}

export interface ConversionTarget {
  supporterId: string;
  displayName?: string; // Only if already had paid interaction
  conversionProbability: number;
  predictedValue: number;
  topSignals: string[];
  recommendedAction: string;
  urgency: 'immediate' | 'soon' | 'normal';
}

// ============================================================================
// LIVE SCHEDULING
// ============================================================================

export interface LiveScheduleRecommendation {
  creatorId: string;
  
  recommendedDay: string; // e.g., "Saturday"
  recommendedTime: string; // e.g., "20:30"
  recommendedDuration: number; // minutes
  
  topicSuggestions: string[];
  
  predictions: {
    estimatedViewers: number;
    estimatedGifts: number;
    percentageAboveAverage: number; // e.g., 19 means +19%
  };
  
  reasoning: {
    dayReason: string;
    timeReason: string;
    durationReason: string;
  };
  
  basedOnHistoricalData: {
    totalLivesSampled: number;
    bestPerformingTimeSlots: Array<{
      day: string;
      hour: number;
      avgGifts: number;
    }>;
  };
  
  generatedAt: Date;
  validUntil: Date;
}

// ============================================================================
// DM PRIORITY
// ============================================================================

export enum DMPriority {
  HIGH = 'high',      // 🔥 High-spending VIP or likely conversion
  MEDIUM = 'medium',  // ⭐ Medium conversion potential
  STANDARD = 'standard', // • Standard
}

export interface DMPriorityLabel {
  chatId: string;
  supporterId: string;
  creatorId: string;
  priority: DMPriority;
  
  reasoning: string;
  signals: string[];
  
  // Metrics that influenced priority
  metrics: {
    lifetimeSpent: number;
    recentActivity: number; // messages in last 7 days
    conversionProbability: number;
    avgResponseTime: number; // creator's typical response time to this user
  };
  
  updatedAt: Date;
}

// ============================================================================
// CONTENT OPTIMIZATION
// ============================================================================

export interface ContentOptimizationTip {
  creatorId: string;
  type: 'profile_photo' | 'story_content' | 'pricing' | 'description';
  
  suggestion: string;
  expectedImpact: string;
  reasoning: string;
  
  // Comparison data
  basedOnPeers: {
    sampleSize: number;
    region?: string;
    creatorType?: string;
  };
  
  createdAt: Date;
  dismissedAt?: Date;
}

// ============================================================================
// FEATURE AWARENESS
// ============================================================================

export interface FeatureAwarenessPrompt {
  creatorId: string;
  featureId: string;
  featureName: string;
  
  title: string;
  description: string;
  benefit: string;
  
  // Why this feature is recommended now
  reasoning: string;
  relevanceScore: number; // 0-100
  
  // Has creator used this feature before?
  neverUsed: boolean;
  lastUsedAt?: Date;
  
  // Potential earnings increase
  potentialEarnings: {
    estimate: string; // e.g., "+15% revenue"
    basedOn: string;
  };
  
  createdAt: Date;
  shownAt?: Date;
  dismissedAt?: Date;
  actionTaken?: boolean;
}

// ============================================================================
// ANALYTICS & TRACKING
// ============================================================================

export interface AIEarnAssistMetrics {
  creatorId: string;
  period: string; // 'YYYY-MM'
  
  suggestionsGenerated: number;
  suggestionsActedUpon: number;
  suggestionsDismissed: number;
  
  impactTracking: {
    estimatedAdditionalRevenue: number;
    actualMeasuredImpact?: number;
    conversionRate: number; // % of suggestions acted upon
  };
  
  byType: Record<SuggestionType, {
    generated: number;
    actedUpon: number;
    avgImpact?: number;
  }>;
  
  updatedAt: Date;
}

// ============================================================================
// CREATOR SETTINGS
// ============================================================================

export interface AIEarnAssistSettings {
  creatorId: string;
  
  enabled: boolean;
  
  preferences: {
    suggestionFrequency: 'real_time' | 'daily' | 'weekly';
    notificationsEnabled: boolean;
    priorityTypes: SuggestionType[]; // Which types to show first
  };
  
  dismissed: string[]; // IDs of permanently dismissed suggestions
  
  updatedAt: Date;
}

// ============================================================================
// SAFETY & COMPLIANCE
// ============================================================================

export interface SafetyCheckResult {
  suggestionId: string;
  compliant: boolean;
  flags: string[];
  checkedAt: Date;
}

export const PROHIBITED_KEYWORDS = [
  'escort', 'sex', 'sexual', 'porn', 'xxx', 'nude', 'naked',
  'prostitution', 'selling body', 'selling sex',
  // Add more as needed
];

export const ALLOWED_SUGGESTION_TEMPLATES = {
  photo: [
    'Add {count} more full-body photo',
    'Smiling photos increase match rate',
    'Take photos in natural light',
    'Wear an elegant dress',
  ],
  story: [
    'Pin your Story from {date}',
    'Post Stories in {language}',
  ],
  live: [
    'Going Live between {time} usually gives you {percent} more gifts',
    'Stream for {duration} minutes for optimal engagement',
  ],
  dm: [
    'Reply within {minutes} minutes to {country} supporters',
    'Send a DM to your Top {count} supporters',
  ],
};

// ============================================================================
// FIREBASE COLLECTIONS STRUCTURE
// ============================================================================

/**
 * Firestore Collections:
 * 
 * aiEarnAssist/{creatorId}
 *   - settings: AIEarnAssistSettings
 *   - suggestions/{suggestionId}: AIEarningSuggestion
 *   - conversionTargets/{supporterId}: ConversionTarget
 *   - dmPriorities/{chatId}: DMPriorityLabel
 *   - metrics/{period}: AIEarnAssistMetrics
 * 
 * aiEarnAssist_schedule/{creatorId}
 *   - liveRecommendations/{date}: LiveScheduleRecommendation
 * 
 * aiEarnAssist_content/{creatorId}
 *   - optimizations/{id}: ContentOptimizationTip
 * 
 * aiEarnAssist_features/{creatorId}
 *   - prompts/{featureId}: FeatureAwarenessPrompt
 * 
 * supporterBehavior/{creatorId}/signals/{supporterId}
 *   - SupporterBehaviorSignal
 */