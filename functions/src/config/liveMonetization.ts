/**
 * Live Streaming 2.0 Monetization Configuration
 * 
 * This module defines all monetization rules, pricing, and revenue splits
 * for the Avalo live streaming feature.
 * 
 * IMPORTANT: Phase 14 live streaming monetization rules:
 * - NO deposit required (unlike chat monetization)
 * - All gifts are NON-REFUNDABLE
 * - 70% creator / 30% Avalo split on all live revenue
 * - Queue payments follow same 70/30 split
 * - No "hetero man pays" rule in live (anyone can gift/join queue)
 */

// ============================================================================
// TYPES
// ============================================================================

export type GiftRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface LiveGift {
  id: string;
  name: string;
  tokenCost: number;
  iconEmoji: string;
  rarity: GiftRarity;
  streakBonus: boolean; // Whether this gift contributes to streak multipliers
  displayName: string;
}

export interface LiveRevenueConfig {
  /** Creator's share of all live revenue (gifts + queue) */
  CREATOR_SPLIT: number; // 0.70
  
  /** Avalo's share of all live revenue */
  AVALO_SPLIT: number; // 0.30
  
  /** Whether gifts require deposit (NO for live) */
  REQUIRES_DEPOSIT: false;
  
  /** Whether gifts are refundable (NO for live) */
  GIFTS_REFUNDABLE: false;
}

export interface QueueConfig {
  /** Cost in tokens to enter the queue */
  QUEUE_ENTRY_COST_TOKENS: number;
  
  /** Optional additional cost per minute on stage (0 for v1) */
  ON_STAGE_PER_MINUTE_TOKENS: number;
  
  /** Maximum wait time before auto-refund (minutes) */
  MAX_QUEUE_WAIT_TIME_MINUTES: number;
}

// ============================================================================
// LIVE GIFTS CATALOG
// ============================================================================

/**
 * Complete catalog of available gifts for live streaming
 * 8-12 gifts ranging from 5 to 2000 tokens
 */
export const LIVE_GIFTS: LiveGift[] = [
  // Common gifts (5-20 tokens)
  {
    id: 'rose',
    name: 'Rose',
    tokenCost: 5,
    iconEmoji: '🌹',
    rarity: 'common',
    streakBonus: false,
    displayName: 'Rose (5 tokens)',
  },
  {
    id: 'heart',
    name: 'Heart',
    tokenCost: 10,
    iconEmoji: '❤️',
    rarity: 'common',
    streakBonus: false,
    displayName: 'Heart (10 tokens)',
  },
  {
    id: 'clap',
    name: 'Applause',
    tokenCost: 20,
    iconEmoji: '👏',
    rarity: 'common',
    streakBonus: false,
    displayName: 'Applause (20 tokens)',
  },
  
  // Rare gifts (50-200 tokens)
  {
    id: 'star',
    name: 'Star',
    tokenCost: 50,
    iconEmoji: '⭐',
    rarity: 'rare',
    streakBonus: true,
    displayName: 'Star (50 tokens)',
  },
  {
    id: 'diamond',
    name: 'Diamond',
    tokenCost: 100,
    iconEmoji: '💎',
    rarity: 'rare',
    streakBonus: true,
    displayName: 'Diamond (100 tokens)',
  },
  {
    id: 'fire',
    name: 'Fire',
    tokenCost: 200,
    iconEmoji: '🔥',
    rarity: 'rare',
    streakBonus: true,
    displayName: 'Fire (200 tokens)',
  },
  
  // Epic gifts (500-1000 tokens)
  {
    id: 'crown',
    name: 'Crown',
    tokenCost: 500,
    iconEmoji: '👑',
    rarity: 'epic',
    streakBonus: true,
    displayName: 'Crown (500 tokens)',
  },
  {
    id: 'rocket',
    name: 'Rocket',
    tokenCost: 750,
    iconEmoji: '🚀',
    rarity: 'epic',
    streakBonus: true,
    displayName: 'Rocket (750 tokens)',
  },
  {
    id: 'trophy',
    name: 'Trophy',
    tokenCost: 1000,
    iconEmoji: '🏆',
    rarity: 'epic',
    streakBonus: true,
    displayName: 'Trophy (1000 tokens)',
  },
  
  // Legendary gifts (1500-2000 tokens)
  {
    id: 'unicorn',
    name: 'Unicorn',
    tokenCost: 1500,
    iconEmoji: '🦄',
    rarity: 'legendary',
    streakBonus: true,
    displayName: 'Unicorn (1500 tokens)',
  },
  {
    id: 'castle',
    name: 'Castle',
    tokenCost: 2000,
    iconEmoji: '🏰',
    rarity: 'legendary',
    streakBonus: true,
    displayName: 'Castle (2000 tokens)',
  },
];

// ============================================================================
// REVENUE SPLIT CONFIGURATION
// ============================================================================

/**
 * Live streaming revenue split rules
 * Applies to ALL live monetization (gifts + queue)
 */
export const LIVE_REVENUE: LiveRevenueConfig = {
  CREATOR_SPLIT: 0.70,  // 70% to creator
  AVALO_SPLIT: 0.30,    // 30% to Avalo
  REQUIRES_DEPOSIT: false,
  GIFTS_REFUNDABLE: false,
};

// ============================================================================
// QUEUE CONFIGURATION
// ============================================================================

/**
 * Queue system for joining host on stage
 */
export const QUEUE_CONFIG: QueueConfig = {
  QUEUE_ENTRY_COST_TOKENS: 50,
  ON_STAGE_PER_MINUTE_TOKENS: 0, // Free for v1 - can be enabled later
  MAX_QUEUE_WAIT_TIME_MINUTES: 30,
};

// ============================================================================
// ELIGIBILITY REQUIREMENTS
// ============================================================================

/**
 * Requirements to go live as a host
 */
export const HOST_ELIGIBILITY = {
  /** Must be 18+ verified */
  REQUIRES_18_PLUS: true,
  
  /** Must be account verified */
  REQUIRES_VERIFICATION: true,
  
  /** Minimum account age (days) */
  MIN_ACCOUNT_AGE_DAYS: 1,
  
  /** Cannot be shadowbanned */
  CANNOT_BE_SHADOWBANNED: true,
} as const;

/**
 * Requirements to send gifts or join queue
 */
export const VIEWER_ELIGIBILITY = {
  /** Must be authenticated */
  REQUIRES_AUTH: true,
  
  /** Must have sufficient token balance */
  REQUIRES_BALANCE: true,
  
  /** Cannot be banned/shadowbanned */
  CANNOT_BE_BANNED: true,
} as const;

// ============================================================================
// LIMITS AND CONSTRAINTS
// ============================================================================

/**
 * Operational limits for live streaming
 */
export const LIVE_LIMITS = {
  /** Maximum session duration (hours) */
  MAX_SESSION_DURATION_HOURS: 8,
  
  /** Minimum session duration to count (seconds) */
  MIN_SESSION_DURATION_SECONDS: 60,
  
  /** Maximum concurrent viewers (soft limit) */
  MAX_VIEWERS: 10000,
  
  /** Maximum queue size */
  MAX_QUEUE_SIZE: 100,
  
  /** Auto-end session after this many minutes of inactivity */
  AUTO_END_INACTIVITY_MINUTES: 30,
} as const;

// ============================================================================
// FIRESTORE COLLECTION NAMES
// ============================================================================

/**
 * Centralized collection names for live streaming
 * Used consistently across all live modules
 */
export const LIVE_COLLECTIONS = {
  LIVE_ROOMS: 'liveRooms',
  LIVE_SESSIONS: 'liveSessions',
  LIVE_GIFTS: 'liveGifts',
  LIVE_QUEUE: 'liveQueue',
  LIVE_EARNINGS: 'liveEarnings',
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate creator and Avalo earnings from total tokens
 */
export function calculateLiveSplit(totalTokens: number): {
  creatorTokens: number;
  avaloTokens: number;
} {
  const creatorTokens = Math.floor(totalTokens * LIVE_REVENUE.CREATOR_SPLIT);
  const avaloTokens = totalTokens - creatorTokens;
  
  return {
    creatorTokens,
    avaloTokens,
  };
}

/**
 * Get gift by ID
 */
export function getGiftById(giftId: string): LiveGift | undefined {
  return LIVE_GIFTS.find(gift => gift.id === giftId);
}

/**
 * Get gifts by rarity
 */
export function getGiftsByRarity(rarity: GiftRarity): LiveGift[] {
  return LIVE_GIFTS.filter(gift => gift.rarity === rarity);
}

/**
 * Validate if user can afford a gift
 */
export function canAffordGift(userBalance: number, giftId: string): boolean {
  const gift = getGiftById(giftId);
  return gift ? userBalance >= gift.tokenCost : false;
}

/**
 * Validate if user can afford queue entry
 */
export function canAffordQueue(userBalance: number): boolean {
  return userBalance >= QUEUE_CONFIG.QUEUE_ENTRY_COST_TOKENS;
}