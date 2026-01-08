/**
 * PACK 238 — Chat Motivation Engine
 * AI-driven conversation boosters that increase chemistry → paid chat duration → paid calls/meetings
 */

import { Timestamp, FieldValue } from 'firebase-admin/firestore';

/**
 * Booster Types
 */
export type BoosterType = 
  | 'topic'       // Topic discovery
  | 'memory'      // Memory recall from past conversations
  | 'chemistry'   // Chemistry amplifiers
  | 'challenge'   // Playful challenges
  | 'flirt';      // App-Store safe flirting prompts

/**
 * Activation Conditions
 */
export interface ActivationCondition {
  type: 
    | 'silence_after_read'         // 20+ seconds after message read, no reply
    | 'small_talk_loop'            // Low sentiment variance
    | 'compliment_no_follow'       // Compliments with no follow-up question
    | 'high_laughter'              // High laughter frequency
    | 'emotional_topic'            // Emotional topic detected
    | 'shared_interest';           // Shared interest detected
  
  threshold?: number;               // Value threshold for activation
  detectedAt: Timestamp;
  contextData?: Record<string, any>;
}

/**
 * Chat Motivation State
 */
export interface ChatMotivation {
  chatId: string;
  lastTriggered: Timestamp | null;
  lastType: BoosterType | 'none';
  chemistryScore: number;           // 0-10
  totalBoostersTriggered: number;
  totalBoostersUsed: number;
  conversionToCall: boolean;        // Did boosters lead to paid call?
  conversionToEvent: boolean;       // Did boosters lead to calendar booking?
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Chemistry Score Range
 */
export type ChemistryRange = 
  | 'very_low'   // 0-2
  | 'low'        // 3-4
  | 'medium'     // 5-6
  | 'high'       // 7-8
  | 'very_high'; // 9-10

/**
 * Booster Configuration by Chemistry Level
 */
export interface BoosterConfig {
  chemistryRange: ChemistryRange;
  frequency: 'none' | 'low' | 'medium' | 'high' | 'very_low';
  style: 'small_talk_rescue' | 'topic_discovery' | 'chemistry_amplifiers' | 'maintain_flow';
  cooldownMinutes: number;
}

/**
 * Active Booster Suggestion
 */
export interface Booster {
  id: string;
  chatId: string;
  type: BoosterType;
  prompt: string;                   // The actual suggestion text
  targetUserId: string;             // Who should see this booster
  
  // Activation context
  triggeredBy: ActivationCondition;
  chemistryScoreAtTrigger: number;
  
  // State
  active: boolean;
  seen: boolean;
  dismissed: boolean;
  used: boolean;                    // User acted on the suggestion
  
  // Monetization tracking
  leadToMessage: boolean;
  leadToCall: boolean;
  leadToEvent: boolean;
  paidWordsGenerated: number;
  
  // Timing
  createdAt: Timestamp;
  seenAt: Timestamp | null;
  dismissedAt: Timestamp | null;
  usedAt: Timestamp | null;
  expiresAt: Timestamp;             // Auto-expire after X minutes
}

/**
 * Message Analysis Result
 */
export interface MessageAnalysis {
  messageId: string;
  chatId: string;
  
  // Sentiment Analysis
  sentimentScore: number;           // -1 to 1 (negative to positive)
  emotionalIntensity: number;       // 0 to 1
  
  // Content Classification
  isCompliment: boolean;
  hasQuestion: boolean;
  hasLaughter: boolean;             // Emojis, "haha", etc.
  topicCategories: string[];        // ["travel", "food", "music"]
  
  // Conversation Flow
  isSmallTalk: boolean;
  isDeepConversation: boolean;
  energyLevel: 'low' | 'medium' | 'high';
  
  // Memory hooks
  mentionedInterests: string[];     // Interests mentioned in this message
  referencedPastTopic: boolean;
  
  analyzedAt: Timestamp;
  model: 'local' | 'cloud';         // Privacy: local model preferred
}

/**
 * Chemistry Score Calculation Input
 */
export interface ChemistryInput {
  recentMessages: MessageAnalysis[];
  conversationDuration: number;      // minutes
  messageFrequency: number;          // messages per hour
  averageSentiment: number;
  sentimentVariance: number;
  questionsAsked: number;
  complimentsGiven: number;
  sharedInterests: string[];
  emotionalDepth: number;
}

/**
 * Chemistry History Entry
 */
export interface ChemistryHistoryEntry {
  chatId: string;
  score: number;
  range: ChemistryRange;
  factors: {
    sentiment: number;
    engagement: number;
    depth: number;
    reciprocity: number;
  };
  timestamp: Timestamp;
}

/**
 * Booster Prompt Templates
 */
export interface BoosterTemplate {
  type: BoosterType;
  chemistryRange: ChemistryRange;
  templates: string[];
  variables: string[];              // e.g., ["interest", "topic"]
  safetyLevel: 'safe' | 'moderate'; // All must be App Store compliant
}

/**
 * Safety Check Result
 */
export interface SafetyCheckResult {
  allowed: boolean;
  reason?: string;
  blockedBy?: 
    | 'sleep_mode'
    | 'breakup_recovery'
    | 'safety_incident'
    | 'age_gap_threshold'
    | 'stalker_risk';
}

/**
 * Monetization Intent Classification
 */
export type MonetizationIntent = 
  | 'chemistry_increase'        // Higher paid word count
  | 'emotional_connection'      // Paid voice/video calls
  | 'shared_plans'              // Calendar booking
  | 'shared_passions'           // Event booking
  | 'playful_vibe'              // Digital gifts
  | 'nostalgia';                // Memory Log unlocks

/**
 * Intent Tracking
 */
export interface IntentTracking {
  boosterId: string;
  detectedIntent: MonetizationIntent;
  convertedToAction: boolean;
  actionType?: 'message' | 'call' | 'calendar' | 'event' | 'gift' | 'memory';
  revenueGenerated: number;         // in tokens
  timestamp: Timestamp;
}

/**
 * User Booster Preferences
 */
export interface UserBoosterPreferences {
  userId: string;
  frequency: 'none' | 'low' | 'medium' | 'high';
  enabledTypes: BoosterType[];
  disabledCategories: string[];     // User can disable certain topics
  lastUpdated: Timestamp;
}

/**
 * Conversation Context (for AI analysis)
 */
export interface ConversationContext {
  chatId: string;
  participants: {
    userId: string;
    profile: {
      interests: string[];
      recentTopics: string[];
      communicationStyle: 'brief' | 'detailed' | 'playful' | 'serious';
    };
  }[];
  
  // Recent conversation state
  lastMessages: Array<{
    senderId: string;
    content: string;
    sentimentScore: number;
    timestamp: Timestamp;
  }>;
  
  // Timing data
  averageResponseTime: number;      // seconds
  lastMessageReadAt: Timestamp;
  lastMessageRepliedAt: Timestamp | null;
  silenceDuration: number;          // seconds since read
  
  // Patterns
  conversationEnergy: 'rising' | 'falling' | 'stable';
  topicExhaustion: boolean;
  
  analyzedAt: Timestamp;
}

/**
 * Booster Analytics
 */
export interface BoosterAnalytics {
  period: 'daily' | 'weekly' | 'monthly';
  startDate: Timestamp;
  endDate: Timestamp;
  
  totalTriggered: number;
  totalSeen: number;
  totalUsed: number;
  totalDismissed: number;
  
  conversionRate: number;           // used / seen
  effectivenessScore: number;       // 0-100
  
  byType: Record<BoosterType, {
    triggered: number;
    used: number;
    conversionRate: number;
    averageRevenuePerUse: number;
  }>;
  
  byChemistryRange: Record<ChemistryRange, {
    averageBoostsNeeded: number;
    conversionRate: number;
  }>;
  
  monetizationImpact: {
    additionalMessages: number;
    additionalCalls: number;
    additionalEvents: number;
    totalRevenueGenerated: number;  // in tokens
  };
}

/**
 * Cloud Function Trigger Event
 */
export interface ChatMotivationTrigger {
  chatId: string;
  eventType: 
    | 'message_read'
    | 'message_sent'
    | 'conversation_analysis'
    | 'silence_detected'
    | 'chemistry_score_update';
  
  timestamp: Timestamp;
  context: ConversationContext;
}

/**
 * Booster Selection Algorithm Result
 */
export interface BoosterSelectionResult {
  shouldTrigger: boolean;
  selectedBooster: Booster | null;
  reason: string;
  confidence: number;               // 0-1
  alternativeOptions?: Booster[];
}