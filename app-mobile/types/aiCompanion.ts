// Stub for AI Companion types (MVP - not implemented)
export type Gender = 'MALE' | 'FEMALE' | 'NON_BINARY' | 'OTHER';
export type Language = 'en' | 'es' | 'fr' | 'de' | 'it' | 'pl' | 'pt' | 'ru' | 'zh' | 'ja' | 'ko';
export type CreatorType = 'USER' | 'AVALO';
export type SessionType = 'CHAT' | 'VOICE' | 'VIDEO';

export interface AICompanion {
  companionId: string;
  id?: string; // alias for companionId
  name: string;
  avatarUrl: string;
  gender: Gender;
  language: Language;
  shortBio: string;
  styleTags: string[];
  totalChats: number;
  averageRating: number;
  chatBucketPrice: number;
  wordsPerBucket: number;
  voicePricePerMinute: number;
  videoPricePerMinute: number;
  creatorType: CreatorType;
  creatorId?: string;
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

export interface AIChatMessage {
  messageId: string;
  sessionId: string;
  sender: 'USER' | 'AI';
  content: string;
  timestamp: string;
  tokensUsed?: number;
}

export interface AIChatSession {
  sessionId: string;
  companionId: string;
  userId: string;
  sessionType: SessionType;
  status: 'ACTIVE' | 'ENDED' | 'PAUSED';
  tokensSpent: number;
  remainingWords?: number;
  remainingMinutes?: number;
  startedAt: string;
  endedAt?: string;
  durationSeconds?: number;
  messages: AIChatMessage[];
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
  conversionRate: number;
  totalCompanions: number;
}

// Stub functions - MVP placeholders
export const discoverAICompanions = async (params: AIDiscoveryParams): Promise<{
  companions: AICompanion[];
  total: number;
}> => {
  throw new Error('AI companions not implemented in MVP');
};

export const sortCompanions = (
  companions: AICompanion[],
  sortBy: SortOption
): AICompanion[] => {
  const sorted = [...companions];
  
  switch (sortBy) {
    case 'popular':
      return sorted.sort((a, b) => b.totalChats - a.totalChats);
    
    case 'new':
      return sorted.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    
    case 'priceLow':
      return sorted.sort((a, b) => a.chatBucketPrice - b.chatBucketPrice);
    
    case 'priceHigh':
      return sorted.sort((a, b) => b.chatBucketPrice - a.chatBucketPrice);
    
    case 'rating':
      return sorted.sort((a, b) => b.averageRating - a.averageRating);
    
    default:
      return sorted;
  }
};

export const getAICompanion = async (id: string): Promise<AICompanion> => {
  throw new Error('AI companions not implemented in MVP');
};

export const createAIChatSession = async (id: string, type: SessionType): Promise<{ sessionId: string }> => {
  throw new Error('AI chat sessions not implemented in MVP');
};

export const getAIChatSession = async (sessionId: string): Promise<AIChatSession> => {
  throw new Error('AI chat sessions not implemented in MVP');
};

export const sendAIChatMessage = async (
  sessionId: string,
  content: string
): Promise<{
  userMessage: AIChatMessage;
  aiResponse: AIChatMessage;
  tokensUsed: number;
  remaining: number;
}> => {
  throw new Error('AI chat messages not implemented in MVP');
};

export const endAIChatSession = async (sessionId: string): Promise<AISessionSummary> => {
  throw new Error('AI chat sessions not implemented in MVP');
};

export const getAIEarningsPreview = async (): Promise<AIEarningsPreview> => {
  throw new Error('AI earnings not implemented in MVP');
};

export const formatTokens = (tokens: number): string => {
  return tokens.toLocaleString();
};

export const formatRating = (rating: number): string => {
  return rating.toFixed(1);
};

export const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
};

export const getCreatorBadge = (companion: AICompanion): { text: string; color: string } => {
  return { text: 'AI', color: '#007AFF' };
};

export const calculateEffectivePrice = (
  basePrice: number,
  sessionType: SessionType,
  userTier: { tier: string; ageVerified: boolean; kycVerified: boolean }
): { price: number; discount: number } => {
  return { price: basePrice, discount: 0 };
};
