/**
 * PACK 344 — In-App AI Helpers
 * TypeScript Type Definitions
 */

export interface MessageSuggestion {
  id: string;
  text: string;
  tone: 'playful' | 'polite' | 'confident' | 'curious';
}

export interface ReceiverProfileSummary {
  nickname: string;
  age?: number;
  interests?: string[];
  locationCountry?: string;
}

export type MessageContextType = 'FIRST_MESSAGE' | 'REPLY';

export interface ProfileSummary {
  gender: 'female' | 'male' | 'nonbinary';
  age?: number;
  bio?: string;
  interests?: string[];
  photosCount: number;
  hasVideoBio: boolean;
}

export interface StatsSummary {
  matchesLast7Days?: number;
  chatsStartedLast7Days?: number;
  paidChatsLast7Days?: number;
}

export interface ProfileAndDiscoveryTips {
  profileTips: string[];
  discoveryTips: string[];
}

export interface SpamCheckResult {
  isSpamLike: boolean;
  recipientsCount: number;
}

export interface MessageHashCache {
  hash: string;
  chatId: string;
  timestamp: number;
}

// Backend function request/response types

export interface GetMessageSuggestionsRequest {
  sessionId: string;
  receiverProfileSummary: ReceiverProfileSummary;
  contextType: MessageContextType;
  lastUserMessage?: string;
  lastPartnerMessage?: string;
  locale: string;
}

export interface GetMessageSuggestionsResponse {
  suggestions: MessageSuggestion[];
}

export interface FlagRepeatedMessagePatternRequest {
  messageHash: string;
  chatId: string;
}

export interface FlagRepeatedMessagePatternResponse {
  isSpamLike: boolean;
  recipientsCount: number;
  threshold: number;
}

export interface GetProfileAndDiscoveryTipsRequest {
  profileSummary: ProfileSummary;
  statsSummary?: StatsSummary;
  locale: string;
  countryCode?: string;
}

export interface GetProfileAndDiscoveryTipsResponse {
  profileTips: string[];
  discoveryTips: string[];
}
