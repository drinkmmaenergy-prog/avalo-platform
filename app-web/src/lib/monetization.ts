import { MONETIZATION_SPLITS } from "@constants/monetization";
/**
 * Monetization Configuration for Avalo Web
 * Matches mobile app-mobile/config/monetization.ts
 */

export interface TokenPack {
  packId: string;
  tokens: number;
  price: number;
  displayName: string;
  popular?: boolean;
  bonus?: number;
}

export const TOKEN_PACKS: TokenPack[] = [
  { packId: 'mini', tokens: 100, price: 7.99, displayName: 'Mini', bonus: 0 },
  { packId: 'basic', tokens: 300, price: 21.49, displayName: 'Basic', bonus: 0 },
  { packId: 'standard', tokens: 500, price: 33.74, displayName: 'Standard', popular: true, bonus: 0 },
  { packId: 'premium', tokens: 1000, price: 61.24, displayName: 'Premium', bonus: 0 },
  { packId: 'pro', tokens: 2000, price: 117.49, displayName: 'Pro', bonus: 0 },
  { packId: 'elite', tokens: 5000, price: 281.49, displayName: 'Elite', bonus: 0 },
  { packId: 'royal', tokens: 10000, price: 537.49, displayName: 'Royal', bonus: 0 },
];

export const CALL_CONFIG = {
  VOICE: {
    BASE_COST_VIP: 10,
    BASE_COST_ROYAL: 6,
    BASE_COST_STANDARD: 10,
    AVALO_CUT_PERCENT: 20,
    EARNER_CUT_PERCENT: 80,
  },
  VIDEO: {
    BASE_COST_VIP: 15,
    BASE_COST_ROYAL: 10,
    BASE_COST_STANDARD: 15,
    AVALO_CUT_PERCENT: 20,
    EARNER_CUT_PERCENT: 80,
  },
  AUTO_DISCONNECT_IDLE_MINUTES: 6,
};

export const CHAT_CONFIG = {
  FREE_MESSAGES_PER_PARTICIPANT: 3,
  WORDS_PER_TOKEN_ROYAL: 7,
  WORDS_PER_TOKEN_STANDARD: 11,
  CHAT_DEPOSIT_TOKENS: 100,
  PLATFORM_FEE_PERCENT: 35,
  ESCROW_PERCENT: 65,
};

export const CONTENT_CONFIG = {
  FEED_PHOTO_UNLOCK_COST: 20,
  FEED_VIDEO_UNLOCK_COST: 50,
  PREMIUM_STORY_MIN: 50,
  PREMIUM_STORY_MAX: 500,
  CREATOR_SPLIT: MONETIZATION_SPLITS.CHAT.creator,
  AVALO_COMMISSION: MONETIZATION_SPLITS.CHAT.avalo,
};

export const CALENDAR_CONFIG = {
  MIN_BOOKING_PRICE: 100,
  MAX_BOOKING_PRICE: 100000,
  HOST_SPLIT: MONETIZATION_SPLITS.EVENT_TICKET.creator,
  AVALO_FEE_PERCENT: 20,
  BOOKING_REQUIRES_VIP_OR_ROYAL: true,
};

export const AI_CHAT_CONFIG = {
  BASIC_MESSAGE_COST: 1,
  PREMIUM_MESSAGE_COST: 2,
  NSFW_MESSAGE_COST: 4,
};

export type CallType = 'VOICE' | 'VIDEO';
export type UserStatus = 'STANDARD' | 'VIP' | 'ROYAL';
export type AICompanionTier = 'basic' | 'premium' | 'nsfw';


