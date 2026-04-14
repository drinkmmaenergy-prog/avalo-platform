import { MONETIZATION_SPLITS, SPLITS } from "../config/monetizationSplits";

/**
 * =====================================================
 * PRIORITY REPLY — Multi-Room Priority Message Helpers
 * =====================================================
 *
 * Provides priority message configuration, pin expiry calculation,
 * and tier resolution used by multiChatRoom.ts.
 *
 * Priority tiers:
 *   BRONZE  — 20 tokens, pinned 5 min,  yellow, earner response optional
 *   SILVER  — 50 tokens, pinned 15 min, orange, earner response optional
 *   GOLD    — 100 tokens, pinned 30 min, red,    earner MUST respond
 *   DIAMOND — 200 tokens, pinned 60 min, diamond, earner MUST respond
 *
 * All config sourced from MULTI_ROOM_CONFIG — no hardcoded values.
 *
 * @module chat/priorityReply
 * @version 1.0.0
 */

import { Timestamp } from 'firebase-admin/firestore';
import {
  MULTI_ROOM_CONFIG,
  isValidPriorityTier,
  type PriorityTierName,
} from '../config/multiRoomConfig';

// ============================================================================
// LEGACY INTERFACE (preserved for backward compatibility)
// ============================================================================

export interface PriorityMessage {
  chatId: string;
  messageId: string;
  senderId: string;
  priorityTokens: number;
  createdAt: number;
}

// ============================================================================
// TYPES
// ============================================================================

export interface PriorityConfig {
  tokens: number;
  pinMinutes: number;
  color: string;
  earnerMustReply: boolean;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the full configuration for a priority tier.
 * Returns token cost, pin duration, color, and earner reply obligation.
 *
 * @param tier - Priority tier name (BRONZE, SILVER, GOLD, DIAMOND)
 * @returns PriorityConfig object
 * @throws Error if tier is invalid
 */
export function getPriorityConfig(tier: string): PriorityConfig {
  if (!isValidPriorityTier(tier)) {
    throw new Error(`[priorityReply] Invalid priority tier: ${tier}`);
  }

  const tierName = tier as PriorityTierName;
  const config = MULTI_ROOM_CONFIG.PRIORITY[tierName];

  return {
    tokens: config.tokens,
    pinMinutes: config.pinMinutes,
    color: config.color,
    earnerMustReply: config.earnerMustReply,
  };
}

/**
 * Calculate the pin expiry timestamp for a priority message.
 * The pin expires after the tier's pinMinutes from the current time.
 *
 * @param tier - Priority tier name (BRONZE, SILVER, GOLD, DIAMOND)
 * @returns Firestore Timestamp representing when the pin expires
 * @throws Error if tier is invalid
 */
export function calculatePinExpiry(tier: string): Timestamp {
  if (!isValidPriorityTier(tier)) {
    throw new Error(`[priorityReply] Invalid priority tier: ${tier}`);
  }

  const tierName = tier as PriorityTierName;
  const config = MULTI_ROOM_CONFIG.PRIORITY[tierName];
  const expiryMs = Date.now() + config.pinMinutes * 60 * 1000;

  return Timestamp.fromMillis(expiryMs);
}

/**
 * Check if a pinned priority message has expired.
 *
 * @param pinExpiresAt - The Firestore Timestamp when the pin expires
 * @returns true if the pin has expired, false otherwise
 */
export function isPinExpired(pinExpiresAt: Timestamp): boolean {
  if (!pinExpiresAt) return true;
  return Timestamp.now().toMillis() >= pinExpiresAt.toMillis();
}

/**
 * Determine the priority tier from a token amount.
 * Returns the tier name that matches the exact token cost, or null if no match.
 *
 * @param tokens - Token amount to match against tier costs
 * @returns Priority tier name or null if no tier matches
 */
export function getPriorityTierFromTokens(tokens: number): PriorityTierName | null {
  const tiers: PriorityTierName[] = ['BRONZE', 'SILVER', 'GOLD', 'DIAMOND'];

  for (const tier of tiers) {
    if (MULTI_ROOM_CONFIG.PRIORITY[tier].tokens === tokens) {
      return tier;
    }
  }

  return null;
}

/**
 * Get all priority tiers ordered by cost (ascending).
 * Useful for UI display.
 */
export function getAllPriorityTiers(): Array<{ name: PriorityTierName; config: PriorityConfig }> {
  const tiers: PriorityTierName[] = ['BRONZE', 'SILVER', 'GOLD', 'DIAMOND'];
  return tiers.map((tier) => ({
    name: tier,
    config: getPriorityConfig(tier),
  }));
}

/**
 * Get all priority tier configs as a structured array for client consumption.
 */
export function getPriorityTierList(): Array<{ name: PriorityTierName } & PriorityConfig> {
  const tiers: PriorityTierName[] = ['BRONZE', 'SILVER', 'GOLD', 'DIAMOND'];
  return tiers.map((tier) => ({
    name: tier,
    ...getPriorityConfig(tier),
  }));
}


