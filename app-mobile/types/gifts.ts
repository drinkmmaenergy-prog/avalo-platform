/**
 * PACK 79 — In-Chat Paid Gifts
 * TypeScript types for gift system
 */

import { Timestamp } from 'firebase/firestore';

/**
 * Gift rarity levels
 */
export type GiftRarity = 'common' | 'rare' | 'epic' | 'legendary';

/**
 * Gift transaction status
 */
export type GiftTransactionStatus = 'completed' | 'failed';

/**
 * Gift catalog item from Firestore
 */
export interface GiftCatalog {
  id: string;
  name: string;
  priceTokens: number;
  animationUrl: string;
  imageUrl: string;
  soundUrl?: string;
  createdAt: Timestamp;
  isActive: boolean;
  category?: string;
  rarity?: GiftRarity;
  description?: string;
  sortOrder?: number;
}

/**
 * Gift transaction record
 */
export interface GiftTransaction {
  id: string;
  senderId: string;
  receiverId: string;
  chatId: string;
  giftId: string;
  priceTokens: number;
  commissionAvalo: number;
  receiverEarnings: number;
  createdAt: Timestamp;
  status: GiftTransactionStatus;
  metadata?: {
    senderName: string;
    receiverName: string;
    giftName: string;
    animationUrl: string;
    imageUrl: string;
  };
}

/**
 * Gift metadata embedded in chat messages
 */
export interface GiftMessageMetadata {
  giftId: string;
  giftName: string;
  priceTokens: number;
  animationUrl: string;
  imageUrl: string;
  soundUrl?: string;
  transactionId: string;
}

/**
 * Send gift request payload
 */
export interface SendGiftRequest {
  giftId: string;
  receiverId: string;
  chatId: string;
}

/**
 * Send gift response
 */
export interface SendGiftResponse {
  success: boolean;
  transactionId?: string;
  error?: string;
  errorCode?: GiftErrorCode;
}

/**
 * Gift error codes
 */
export enum GiftErrorCode {
  INSUFFICIENT_TOKENS = 'insufficient_tokens',
  INVALID_GIFT = 'invalid_gift',
  SELF_GIFTING = 'self_gifting',
  GIFT_INACTIVE = 'gift_inactive',
  RATE_LIMIT = 'rate_limit',
  TRANSACTION_FAILED = 'transaction_failed',
  UNAUTHORIZED = 'unauthorized',
  INVALID_RECEIVER = 'invalid_receiver',
  CHAT_NOT_FOUND = 'chat_not_found',
}

/**
 * Gift analytics event types
 */
export enum GiftAnalyticsEvent {
  OPEN_CATALOG = 'gift_open_catalog',
  PREVIEW = 'gift_preview',
  SEND = 'gift_send',
  ANIMATION_VIEWED = 'gift_animation_viewed',
  EARNINGS_VIEWED = 'gift_earnings_viewed',
}

/**
 * Gift analytics event data
 */
export interface GiftOpenCatalogEvent {
  chatId: string;
  receiverId: string;
  timestamp: number;
}

export interface GiftPreviewEvent {
  giftId: string;
  giftName: string;
  priceTokens: number;
  timestamp: number;
}

export interface GiftSendEvent {
  giftId: string;
  giftName: string;
  priceTokens: number;
  receiverId: string;
  chatId: string;
  timestamp: number;
}

export interface GiftAnimationViewedEvent {
  giftTransactionId: string;
  viewerId: string;
  viewerRole: 'sender' | 'receiver';
  timestamp: number;
}

/**
 * Gift statistics for user profile
 */
export interface UserGiftStats {
  totalSent: number;
  totalReceived: number;
  tokensSpent: number;
  tokensEarned: number;
  favoriteGiftSent?: string;
  favoriteGiftReceived?: string;
  lastGiftSentAt?: Timestamp;
  lastGiftReceivedAt?: Timestamp;
}

/**
 * Gift push notification data
 */
export interface GiftNotificationData {
  type: 'gift_received';
  giftTransactionId: string;
  chatId: string;
  senderId: string;
  senderName: string;
  tokensEarned: number;
  giftName: string;
  giftImageUrl: string;
}

/**
 * Commission split configuration (non-negotiable)
 */
export const GIFT_COMMISSION = {
  AVALO_PERCENTAGE: 0.35,
  RECEIVER_PERCENTAGE: 0.65,
} as const;

/**
 * Gift rate limiting configuration
 */
export const GIFT_RATE_LIMITS = {
  MAX_GIFTS_PER_MINUTE: 10,
  MAX_GIFTS_PER_HOUR: 100,
  MAX_GIFTS_PER_DAY: 500,
} as const;

/**
 * Gift animation configuration
 */
export const GIFT_ANIMATION_CONFIG = {
  DURATION_MS: 1500,
  FADE_OUT_MS: 300,
  MAX_AUDIO_DURATION_MS: 1000,
  AUTO_PLAY: true,
  LOOP: false,
} as const;

/**
 * Helper to calculate commission split
 */
export function calculateGiftCommission(priceTokens: number): {
  avaloCommission: number;
  receiverEarnings: number;
} {
  const avaloCommission = Math.floor(priceTokens * GIFT_COMMISSION.AVALO_PERCENTAGE);
  const receiverEarnings = priceTokens - avaloCommission;
  
  return {
    avaloCommission,
    receiverEarnings,
  };
}

/**
 * Helper to validate gift transaction
 */
export function validateGiftTransaction(
  senderId: string,
  receiverId: string,
  gift: GiftCatalog | null
): { valid: boolean; error?: GiftErrorCode } {
  if (!gift) {
    return { valid: false, error: GiftErrorCode.INVALID_GIFT };
  }

  if (!gift.isActive) {
    return { valid: false, error: GiftErrorCode.GIFT_INACTIVE };
  }

  if (senderId === receiverId) {
    return { valid: false, error: GiftErrorCode.SELF_GIFTING };
  }

  return { valid: true };
}

/**
 * Helper to format gift error message
 */
export function formatGiftError(errorCode: GiftErrorCode): string {
  const errorMessages: Record<GiftErrorCode, string> = {
    [GiftErrorCode.INSUFFICIENT_TOKENS]: 'You don\'t have enough tokens. Buy more to send this gift.',
    [GiftErrorCode.INVALID_GIFT]: 'This gift is no longer available.',
    [GiftErrorCode.SELF_GIFTING]: 'You cannot send a gift to yourself.',
    [GiftErrorCode.GIFT_INACTIVE]: 'This gift is currently unavailable.',
    [GiftErrorCode.RATE_LIMIT]: 'You\'re sending gifts too quickly. Please wait a moment.',
    [GiftErrorCode.TRANSACTION_FAILED]: 'Gift transaction failed. Please try again.',
    [GiftErrorCode.UNAUTHORIZED]: 'You must be logged in to send gifts.',
    [GiftErrorCode.INVALID_RECEIVER]: 'Cannot send gift to this user.',
    [GiftErrorCode.CHAT_NOT_FOUND]: 'Chat not found.',
  };

  return errorMessages[errorCode] || 'An error occurred while sending the gift.';
}

/**
 * Helper to get gift rarity color
 */
export function getGiftRarityColor(rarity?: GiftRarity): string {
  const colors: Record<GiftRarity, string> = {
    common: '#9CA3AF',
    rare: '#3B82F6',
    epic: '#8B5CF6',
    legendary: '#F59E0B',
  };

  return rarity ? colors[rarity] : colors.common;
}

/**
 * Helper to sort gifts by rarity and price
 */
export function sortGiftsByRarity(gifts: GiftCatalog[]): GiftCatalog[] {
  const rarityOrder: Record<GiftRarity, number> = {
    common: 1,
    rare: 2,
    epic: 3,
    legendary: 4,
  };

  return gifts.sort((a, b) => {
    const rarityA = rarityOrder[a.rarity || 'common'];
    const rarityB = rarityOrder[b.rarity || 'common'];

    if (rarityA !== rarityB) {
      return rarityB - rarityA; // Higher rarity first
    }

    return b.priceTokens - a.priceTokens; // Higher price first within same rarity
  });
}