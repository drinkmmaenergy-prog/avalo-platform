/**
 * PACK 452 — Configurable Entry Threshold System
 *
 * Allows earn_on users to configure how many tokens a payer must deposit
 * to start a paid chat session with them.
 *
 * Rules:
 * - Minimum = 100 tokens
 * - No visible maximum in UI
 * - Internal hard cap = 50,000 tokens (system safety)
 * - Changes apply only to NEW paid sessions
 * - Existing chats unaffected
 *
 * INVARIANTS PRESERVED:
 * - Free chemistry messages unchanged
 * - Chat initiation never blocked
 * - Base burn = 1 token per bucket unchanged
 * - 65/35 split unchanged
 *
 * @module pack452-entry-threshold
 * @version 1.0.0
 */

import { db, serverTimestamp } from './init';
import { FieldValue } from 'firebase-admin/firestore';
import {
  ENTRY_THRESHOLD_LIMITS,
  UpdateEntryThresholdRequest,
  UpdateEntryThresholdResponse,
} from './types/pack452-monetization-vnext.types';

// ============================================================================
// ENTRY THRESHOLD OPERATIONS
// ============================================================================

/**
 * Get the current chat entry threshold for a user.
 * Returns the default (100) if not explicitly set.
 *
 * @param userId - The earner's user ID
 * @returns The current chatEntryTokens value
 */
export async function getChatEntryTokens(userId: string): Promise<number> {
  const userDoc = await db.collection('users').doc(userId).get();

  if (!userDoc.exists) {
    return ENTRY_THRESHOLD_LIMITS.DEFAULT;
  }

  const data = userDoc.data();
  const chatEntryTokens = data?.chatEntryTokens;

  if (typeof chatEntryTokens !== 'number' || chatEntryTokens < ENTRY_THRESHOLD_LIMITS.MIN) {
    return ENTRY_THRESHOLD_LIMITS.DEFAULT;
  }

  return Math.min(chatEntryTokens, ENTRY_THRESHOLD_LIMITS.HARD_CAP);
}

/**
 * Update the chat entry threshold for an earner.
 * Validates against min/max limits.
 * Only applies to new paid sessions — existing chats are unaffected.
 *
 * @param userId - The earner's user ID
 * @param request - The update request containing the new threshold
 * @returns Response with the new threshold or error
 */
export async function updateChatEntryTokens(
  userId: string,
  request: UpdateEntryThresholdRequest
): Promise<UpdateEntryThresholdResponse> {
  const { chatEntryTokens } = request;

  // Validate: must be a positive integer
  if (!Number.isInteger(chatEntryTokens) || chatEntryTokens <= 0) {
    return {
      success: false,
      error: 'chatEntryTokens must be a positive integer',
    };
  }

  // Validate: minimum threshold
  if (chatEntryTokens < ENTRY_THRESHOLD_LIMITS.MIN) {
    return {
      success: false,
      error: `Minimum entry threshold is ${ENTRY_THRESHOLD_LIMITS.MIN} tokens`,
    };
  }

  // Validate: hard cap (system safety)
  if (chatEntryTokens > ENTRY_THRESHOLD_LIMITS.HARD_CAP) {
    return {
      success: false,
      error: `Maximum entry threshold is ${ENTRY_THRESHOLD_LIMITS.HARD_CAP} tokens`,
    };
  }

  // Verify user exists and has earn_on
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) {
    return {
      success: false,
      error: 'User not found',
    };
  }

  const userData = userDoc.data();
  if (!userData?.earnOnChat) {
    return {
      success: false,
      error: 'Only users with earning enabled can set entry threshold',
    };
  }

  // Update the threshold
  await db.collection('users').doc(userId).update({
    chatEntryTokens,
    chatEntryTokensUpdatedAt: serverTimestamp(),
  });

  return {
    success: true,
    chatEntryTokens,
  };
}

/**
 * Get the effective deposit amount for a new paid chat session.
 * This is the entry threshold of the earner, clamped to system limits.
 *
 * NOTE: This function is called during chat deposit flow.
 * It does NOT modify the existing PACK 242 dynamic pricing —
 * it provides the base entry tokens that PACK 242 may further adjust.
 *
 * @param earnerId - The earner's user ID
 * @returns The deposit amount in tokens
 */
export async function getEffectiveChatEntryTokens(earnerId: string): Promise<number> {
  return getChatEntryTokens(earnerId);
}
