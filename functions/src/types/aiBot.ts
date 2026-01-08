/**
 * AI Bot Type Definitions
 * Phase 12: AI Companions 2.0 (Creator Bots)
 */

// Note: Timestamp type is available through firebase-admin
// at runtime through init.ts
type Timestamp = any;

// ============================================================================
// BOT CONFIGURATION
// ============================================================================

export type BotGender = 'male' | 'female' | 'other';

export type BotRoleArchetype = 
  | 'friend'
  | 'mentor'
  | 'therapist'
  | 'companion'
  | 'coach'
  | 'advisor'
  | 'entertainer'
  | 'teacher'
  | 'custom';

export type WritingTone = 
  | 'formal'
  | 'casual'
  | 'friendly'
  | 'professional'
  | 'flirty'
  | 'humorous'
  | 'supportive'
  | 'direct';

export interface BotPricing {
  perMessage: number;        // Minimum 1 token
  perImage?: number;         // Future: AI-generated images
  perVoiceNote?: number;     // Future: TTS voice messages
  perVideo?: number;         // Future: AI video responses
}

export interface BotStats {
  totalMessages: number;
  totalEarnings: number;
  uniqueChats: number;
  returningUsers: number;
}

export interface AIBot {
  botId: string;
  creatorId: string;
  
  // Identity
  name: string;
  gender: BotGender;
  age: number;
  avatarUrl: string;
  
  // Personality
  personality: string;
  roleArchetype: BotRoleArchetype;
  interests: string[];
  languages: string[];
  writingTone: WritingTone;
  
  // Content Settings
  nsfwEnabled: boolean;
  systemPrompt: string;
  
  // Monetization
  pricing: BotPricing;
  
  // Status
  isActive: boolean;
  isPaused: boolean;
  
  // Stats
  stats: BotStats;
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastActiveAt?: Timestamp;
}

// ============================================================================
// CHAT STATE
// ============================================================================

export type AiChatState = 
  | 'FREE_ACTIVE'        // Using free welcome messages
  | 'AWAITING_DEPOSIT'   // Free messages used, needs deposit
  | 'PAID_ACTIVE'        // Active with escrow
  | 'CLOSED';            // Chat ended

export interface AiChatBilling {
  wordsPerToken: number;           // 7 (Royal) or 11 (Standard)
  freeMessagesRemaining: number;   // Starts at 3
  escrowBalance: number;
  totalConsumed: number;
  messageCount: number;
}

export interface AiChatContextWindow {
  lastMessages: string[];    // Last 15 messages for context
  summary?: string;          // Optional conversation summary
}

export interface AIChat {
  chatId: string;
  botId: string;
  userId: string;
  creatorId: string;
  
  // State
  state: AiChatState;
  
  // Billing
  billing: AiChatBilling;
  pricePerMessage: number;   // Base price from bot config
  
  // AI Context
  contextWindow: AiChatContextWindow;
  
  // Metadata
  createdAt: Timestamp;
  lastMessageAt: Timestamp;
  updatedAt: Timestamp;
  closedAt?: Timestamp;
}

// ============================================================================
// MESSAGES
// ============================================================================

export type MessageRole = 'user' | 'bot';

export interface AiMessage {
  messageId: string;
  chatId: string;
  
  // Content
  role: MessageRole;
  content: string;
  wordCount: number;
  
  // Billing
  tokensCost: number;
  wasFree: boolean;
  
  // Metadata
  timestamp: Timestamp;
  readAt?: Timestamp;
}

// ============================================================================
// EARNINGS & ANALYTICS
// ============================================================================

export interface BotEarningRecord {
  recordId: string;
  botId: string;
  creatorId: string;
  chatId: string;
  userId: string;
  
  // Earnings
  tokensEarned: number;
  creatorShare: number;    // 80%
  avaloShare: number;      // 20%
  
  // Message Info
  messageCount: number;
  wordCount: number;
  
  // Metadata
  timestamp: Timestamp;
  period: string;          // YYYY-MM for aggregation
}

export interface TopPayer {
  userId: string;
  username: string;
  totalSpent: number;
}

export type AnalyticsPeriod = 'daily' | 'weekly' | 'monthly' | 'lifetime';

export interface BotAnalytics {
  botId: string;
  creatorId: string;
  period: AnalyticsPeriod;
  periodKey: string;       // e.g., "2025-11-20" or "2025-11"
  
  // Message Stats
  totalMessages: number;
  uniqueUsers: number;
  returningUsers: number;
  avgMessagesPerUser: number;
  
  // Revenue Stats
  totalEarnings: number;
  creatorEarnings: number;
  avaloEarnings: number;
  
  // Top Payers
  topPayers: TopPayer[];
  
  // Ranking Points
  rankingPointsEarned: number;
  
  // Metadata
  updatedAt: Timestamp;
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

export interface CreateBotRequest {
  name: string;
  gender: BotGender;
  age: number;
  avatarUrl?: string;
  personality: string;
  roleArchetype: BotRoleArchetype;
  interests: string[];
  languages: string[];
  writingTone: WritingTone;
  nsfwEnabled: boolean;
  pricing: BotPricing;
}

export interface CreateBotResponse {
  botId: string;
}

export interface UpdateBotRequest {
  botId: string;
  updates: Partial<{
    name: string;
    personality: string;
    pricing: BotPricing;
    isPaused: boolean;
    nsfwEnabled: boolean;
    interests: string[];
    writingTone: WritingTone;
  }>;
}

export interface DeleteBotRequest {
  botId: string;
}

export interface StartAiChatRequest {
  botId: string;
}

export interface StartAiChatResponse {
  chatId: string;
  existing: boolean;
}

export interface ProcessAiMessageRequest {
  chatId: string;
  message: string;
}

export interface ProcessAiMessageResponse {
  success: boolean;
  response?: string;
  tokensCost: number;
  wasFree: boolean;
  error?: 'DEPOSIT_REQUIRED' | 'INSUFFICIENT_BALANCE' | 'BOT_UNAVAILABLE';
  message?: string;
  required?: number;
}

export interface GetBotAnalyticsRequest {
  botId: string;
  period?: AnalyticsPeriod;
}

export interface GetBotAnalyticsResponse extends BotAnalytics {}

// ============================================================================
// CLAUDE API TYPES
// ============================================================================

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface GenerateAiResponseRequest {
  botPersonality: string;
  systemPrompt: string;
  contextMessages: string[];
  userMessage: string;
  nsfwEnabled: boolean;
  isMinor?: boolean;
}

export interface ClaudeApiRequest {
  model: string;
  max_tokens: number;
  messages: ClaudeMessage[];
  system?: string;
  temperature?: number;
}

export interface ClaudeApiResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text: string;
  }>;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

// ============================================================================
// HELPER TYPES
// ============================================================================

export interface BotListItem {
  botId: string;
  name: string;
  avatarUrl: string;
  roleArchetype: BotRoleArchetype;
  pricing: BotPricing;
  stats: BotStats;
  isPaused: boolean;
}

export interface CreatorBotDashboard {
  creatorId: string;
  totalBots: number;
  activeBots: number;
  totalEarnings: number;
  totalMessages: number;
  bots: BotListItem[];
}