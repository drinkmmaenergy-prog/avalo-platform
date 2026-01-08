/**
 * PACK 310 — AI Companions & Avatar Builder
 * Type definitions for AI avatar system
 */

export type AvatarStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'BANNED';

export type AvatarTone = 'SOFT_FLIRTY' | 'FRIENDLY' | 'COACH' | 'CONFIDANT';

export type AvatarFormality = 'CASUAL' | 'NEUTRAL';

export type EmojiUsage = 'LOW' | 'MEDIUM' | 'HIGH';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface PersonaProfile {
  ageRange: string; // e.g., "18-25", "25-35", "35-45"
  locationHint: string; // e.g., "Warsaw, Poland"
  vibe: string[]; // e.g., ["playful", "romantic", "elegant"]
  topics: string[]; // e.g., ["dating", "travel", "lifestyle"]
  boundaries: string[]; // e.g., ["no illegal content", "no minors"]
}

export interface StyleConfig {
  tone: AvatarTone;
  formality: AvatarFormality;
  emojiUsage: EmojiUsage;
}

export interface AvatarMedia {
  avatarPhotoIds: string[]; // Array of storage paths
  primaryPhotoId: string; // Storage path of primary photo
}

export interface AvatarSafety {
  lastSafetyReviewAt: string | null; // ISO_DATETIME
  nsfwScore: number;
  riskLevel: RiskLevel;
}

export interface AIAvatar {
  avatarId: string;
  ownerId: string; // creator user id
  createdAt: string; // ISO_DATETIME
  updatedAt: string; // ISO_DATETIME
  
  displayName: string;
  shortTagline: string;
  languageCodes: string[]; // e.g., ["pl", "en"]
  
  personaProfile: PersonaProfile;
  styleConfig: StyleConfig;
  media: AvatarMedia;
  
  status: AvatarStatus;
  safety: AvatarSafety;
}

export interface AISession {
  sessionId: string;
  avatarId: string;
  ownerId: string; // Avatar owner (earner)
  payerId: string; // User chatting with avatar
  
  createdAt: string; // ISO_DATETIME
  lastMessageAt: string; // ISO_DATETIME
  
  active: boolean;
  closedReason?: 'EXPIRED' | 'USER_CLOSED' | 'SYSTEM_BLOCKED';
  
  tokensCharged: number;
  tokensCreatorShare: number; // 65% of charged tokens
  tokensAvaloShare: number; // 35% of charged tokens
}

export interface AIChatMessage {
  messageId: string;
  chatId: string;
  sessionId: string;
  senderId: string;
  text: string;
  
  isAI: boolean;
  avatarId?: string | null;
  
  numWords: number;
  tokensCharged: number;
  
  createdAt: string; // ISO_DATETIME
  moderationFlags?: string[];
}

export interface AIAvatarAnalytics {
  avatarId: string;
  ownerId: string;
  
  totalSessions: number;
  activeSessions: number;
  totalMessages: number;
  totalEarnings: number;
  
  averageSessionDuration: number; // in minutes
  averageTokensPerSession: number;
  
  lastSessionAt: string | null; // ISO_DATETIME
  updatedAt: string; // ISO_DATETIME
}

export interface AIGenerationRequest {
  sessionId: string;
  avatarId: string;
  userMessage: string;
  chatHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  userLanguage: string;
}

export interface AIGenerationResponse {
  response: string;
  numWords: number;
  tokensCharged: number;
  moderationPassed: boolean;
  moderationFlags?: string[];
}

export interface AvatarCreationRequest {
  displayName: string;
  shortTagline: string;
  languageCodes: string[];
  personaProfile: PersonaProfile;
  styleConfig: StyleConfig;
  photoIds: string[]; // Storage paths for uploaded photos
  primaryPhotoId: string;
}

export interface AvatarUpdateRequest {
  avatarId: string;
  displayName?: string;
  shortTagline?: string;
  languageCodes?: string[];
  personaProfile?: Partial<PersonaProfile>;
  styleConfig?: Partial<StyleConfig>;
  status?: AvatarStatus;
}

// Analytics event types for PACK 310
export type AIAvatarEventType = 
  | 'AI_AVATAR_VIEWED'
  | 'AI_AVATAR_CHAT_STARTED'
  | 'AI_AVATAR_EARNED_TOKENS'
  | 'AI_AVATAR_BANNED'
  | 'AI_AVATAR_CREATED'
  | 'AI_AVATAR_UPDATED'
  | 'AI_AVATAR_PAUSED'
  | 'AI_AVATAR_ACTIVATED';

export interface AIAvatarEvent {
  eventType: AIAvatarEventType;
  userId: string;
  avatarId?: string;
  ownerId?: string;
  metadata?: Record<string, any>;
  timestamp: string; // ISO_DATETIME
}