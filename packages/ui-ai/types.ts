/**
 * PACK 340 - AI Companions UI Types
 * Shared TypeScript types for AI companions across mobile and web
 */

export type Gender = 'MALE' | 'FEMALE' | 'NON_BINARY' | 'OTHER';
export type Language = 'en' | 'es' | 'fr' | 'de' | 'it' | 'pl' | 'pt' | 'ru' | 'zh' | 'ja' | 'ko';
export type CreatorType = 'USER' | 'AVALO';
export type StyleTag = 'romantic' | 'dominant' | 'friendly' | 'professional' | 'playful' | 'mysterious' | 'caring' | 'adventurous';
export type SessionType = 'CHAT' | 'VOICE' | 'VIDEO';
export type SessionStatus = 'ACTIVE' | 'ENDED' | 'PAUSED';

export interface AICompanion {
  companionId: string;
  name: string;
  shortBio: string;
  avatarUrl: string;
  gender: Gender;
  language: Language;
  creatorType: CreatorType;
  creatorId?: string;
  styleTags: StyleTag[];
  
  // Stats
  totalChats: number;
  averageRating: number;
  
  // Pricing
  chatBucketPrice: number; // tokens per bucket
  wordsPerBucket: number;
  voicePricePerMinute: number; // tokens per minute
  videoPricePerMinute: number; // tokens per minute
  
  // Flags
  isActive: boolean;
  isErotic: boolean;
  isFeatured: boolean;
  
  createdAt: string;
  updatedAt: string;
}

export interface AICompanionFilters {
  gender?: Gender;
  language?: Language;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  creatorType?: CreatorType;
}

export type SortOption = 'popular' | 'new' | 'priceLow' | 'priceHigh' | 'rating';

export interface AIDiscoveryParams {
  filters?: AICompanionFilters;
  sortBy?: SortOption;
  limit?: number;
  offset?: number;
}

export interface AIChatSession {
  sessionId: string;
  companionId: string;
  userId: string;
  sessionType: SessionType;
  status: SessionStatus;
  
  // Token tracking
  tokensSpent: number;
  remainingWords?: number; // for chat buckets
  remainingMinutes?: number; // for voice/video
  
  // Session info
  startedAt: string;
  endedAt?: string;
  durationSeconds?: number;
  
  messages: AIChatMessage[];
}

export interface AIChatMessage {
  messageId: string;
  sessionId: string;
  sender: 'USER' | 'AI';
  content: string;
  timestamp: string;
  tokensUsed?: number;
}

export interface AISessionSummary {
  sessionId: string;
  companionName: string;
  sessionType: SessionType;
  tokensSpent: number;
  durationSeconds: number;
  messageCount: number;
  startedAt: string;
  endedAt: string;
}

export interface AIEarningsPreview {
  todayTokens: number;
  last7DaysTokens: number;
  last30DaysTokens: number;
  bestPerformingAI?: {
    companionId: string;
    name: string;
    tokensEarned: number;
  };
  conversionRate: number; // percentage
  totalCompanions: number;
}

export interface TokenSafetyInfo {
  currentBalance: number;
  priceToDisplay: number;
  noRefundWarning: boolean;
  vipDiscount?: number; // percentage for VIP
  royalDiscount?: number; // percentage for Royal
}

export interface UserTier {
  tier: 'FREE' | 'VIP' | 'ROYAL';
  ageVerified: boolean;
  kycVerified: boolean;
}

export interface GeoRestriction {
  countryCode: string;
  blockErotic: boolean;
  blockAI: boolean;
}

export type AIErrorCode = 
  | 'INSUFFICIENT_TOKENS'
  | 'AI_OFFLINE'
  | 'SAFETY_BLOCK'
  | 'GEO_BLOCK'
  | 'KYC_REQUIRED'
  | 'AGE_VERIFICATION_REQUIRED'
  | 'SESSION_EXPIRED'
  | 'RATE_LIMIT_EXCEEDED';

export interface AIError {
  code: AIErrorCode;
  message: string;
  details?: any;
}
