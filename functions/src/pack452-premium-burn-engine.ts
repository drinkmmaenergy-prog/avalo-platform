/**
 * PACK 452 — Premium Burn Engine
 *
 * Extends the existing burn logic to support premium multipliers.
 *
 * Burn logic:
 *   If PAID_PREMIUM or EXCLUSIVE_ACTIVE:
 *     tokensPerBucket = 1 * multiplier
 *   Else:
 *     tokensPerBucket = 1 (unchanged)
 *
 * Burn order:
 *   1. reservedTokens (from premium offer)
 *   2. availableTokens (regular wallet balance)
 *
 * Premium applies from the next bucket after ACCEPT.
 *
 * INVARIANTS PRESERVED:
 * - Word buckets unchanged: Standard = 11, Royal = 7
 * - Base burn = 1 token per bucket (when no premium)
 * - 65/35 split unchanged
 * - Payout per token = 0.03 USD unchanged
 * - Historical ledger never recalculated
 *
 * @module pack452-premium-burn-engine
 * @version 1.0.0
 */

import { db, serverTimestamp, generateId } from './init';
import { FieldValue } from 'firebase-admin/firestore';
import {
  ChatMonetizationState,
  PremiumLedgerFields,
  PremiumMultiplier,
} from './types/pack452-monetization-vnext.types';
import { TOKEN_PAYOUT_USD } from './config/economyConfig';

// ============================================================================
// CONSTANTS (unchanged from existing system)
// ============================================================================

/** Standard word bucket size — 11 words per token */
const WORDS_PER_TOKEN_STANDARD = 11;

/** Royal word bucket size — 7 words per token */
const WORDS_PER_TOKEN_ROYAL = 7;

/** Base burn rate — 1 token per bucket */
const BASE_BURN_PER_BUCKET = 1;

/** Platform fee — 35% */
const PLATFORM_FEE_RATE = MONETIZATION_SPLITS.CHAT.avalo;

/** Earner share — 65% */
const EARNER_SHARE_RATE = MONETIZATION_SPLITS.CHAT.creator;

// ============================================================================
// PREMIUM BURN CALCULATION
// ============================================================================

/**
 * Result of a premium burn calculation for a single message.
 */
export interface PremiumBurnResult {
  /** Total tokens burned for this message */
  totalTokensBurned: number;
  /** Tokens burned from reserved balance */
  burnedFromReserved: number;
  /** Tokens burned from available balance */
  burnedFromAvailable: number;
  /** Tokens earned by the earner (after 65/35 split) */
  earnerReceives: number;
  /** Tokens received by the platform (35%) */
  platformReceives: number;
  /** The multiplier applied */
  multiplier: number;
  /** Number of word buckets in this message */
  bucketCount: number;
  /** Whether premium pricing was applied */
  isPremium: boolean;
  /** Ledger fields for this burn event */
  ledgerFields: PremiumLedgerFields;
}

/**
 * Calculate the premium burn for a message.
 *
 * This function determines how many tokens to burn based on:
 * - The message word count
 * - The word bucket size (Standard=11, Royal=7)
 * - The current monetization state (standard vs premium)
 * - The premium multiplier (if active)
 *
 * @param messageText - The message content
 * @param wordsPerToken - Word bucket size (7 or 11)
 * @param monetizationState - Current chat monetization state
 * @param premiumMultiplier - The active premium multiplier (1 if standard)
 * @param offerId - The premium offer ID (null if standard)
 * @param exclusive - Whether exclusive mode is active
 * @returns Burn calculation result
 */
export function calculatePremiumBurn(
  messageText: string,
  wordsPerToken: number,
  monetizationState: ChatMonetizationState,
  premiumMultiplier: number = 1,
  offerId: string | null = null,
  exclusive: boolean = false
): PremiumBurnResult {
  // Count billable words
  const wordCount = countBillableWords(messageText);

  // Calculate bucket count
  const bucketCount = Math.ceil(wordCount / wordsPerToken);

  if (bucketCount === 0) {
    return {
      totalTokensBurned: 0,
      burnedFromReserved: 0,
      burnedFromAvailable: 0,
      earnerReceives: 0,
      platformReceives: 0,
      multiplier: premiumMultiplier,
      bucketCount: 0,
      isPremium: false,
      ledgerFields: {
        pricingMode: 'standard',
        premiumMultiplier: 1,
        offerId: null,
        exclusiveFlag: false,
      },
    };
  }

  // Determine effective multiplier
  const isPremium = monetizationState === 'PAID_PREMIUM' || monetizationState === 'EXCLUSIVE_ACTIVE';
  const effectiveMultiplier = isPremium ? premiumMultiplier : 1;

  // Calculate total burn
  const tokensPerBucket = BASE_BURN_PER_BUCKET * effectiveMultiplier;
  const totalTokensBurned = bucketCount * tokensPerBucket;

  // Calculate split
  const platformReceives = Math.floor(totalTokensBurned * PLATFORM_FEE_RATE);
  const earnerReceives = totalTokensBurned - platformReceives;

  return {
    totalTokensBurned,
    burnedFromReserved: 0, // Will be calculated during execution
    burnedFromAvailable: 0, // Will be calculated during execution
    earnerReceives,
    platformReceives,
    multiplier: effectiveMultiplier,
    bucketCount,
    isPremium,
    ledgerFields: {
      pricingMode: isPremium ? 'premium' : 'standard',
      premiumMultiplier: effectiveMultiplier,
      offerId: isPremium ? offerId : null,
      exclusiveFlag: exclusive,
    },
  };
}

/**
 * Execute a premium burn transaction.
 *
 * Burns tokens in order:
 * 1. reservedTokens first
 * 2. availableTokens (tokensBalance - reservedTokens) second
 *
 * Credits earner and platform according to 65/35 split.
 * Records ledger entry with premium fields.
 *
 * @param chatId - The chat ID
 * @param payerId - The payer's user ID
 * @param earnerId - The earner's user ID
 * @param burnResult - The calculated burn result
 * @returns Updated burn result with actual reserved/available split
 */
export async function executePremiumBurn(
  chatId: string,
  payerId: string,
  earnerId: string,
  burnResult: PremiumBurnResult
): Promise<PremiumBurnResult> {
  if (burnResult.totalTokensBurned === 0) {
    return burnResult;
  }

  const updatedResult = { ...burnResult };

  await db.runTransaction(async (transaction) => {
    // Get payer wallet
    const walletRef = db.collection('wallets').doc(payerId);
    const walletDoc = await transaction.get(walletRef);

    if (!walletDoc.exists) {
      throw new Error('Payer wallet not found');
    }

    const walletData = walletDoc.data()!;
    const currentBalance = walletData.tokensBalance || 0;
    const currentReserved = walletData.reservedTokens || 0;
    const totalBurn = burnResult.totalTokensBurned;

    // Determine burn order: reserved first, then available
    const burnFromReserved = Math.min(currentReserved, totalBurn);
    const burnFromAvailable = totalBurn - burnFromReserved;

    // ================================================================
    // PACK 452 HARD PATCH: Mixed burn validation
    // We burn reserved first, then available. Validation must only
    // check the portion that exceeds reserved against available balance.
    //
    //   requiredFromAvailable = totalBurn - burnFromReserved
    //   availableBalance      = currentBalance - currentReserved
    //   availableBalance >= requiredFromAvailable
    // ================================================================
    const availableAfterReserved = currentBalance - currentReserved;

    if (availableAfterReserved < (totalBurn - burnFromReserved)) {
      throw new Error('INSUFFICIENT_AVAILABLE_TOKENS_FOR_BURN');
    }

    updatedResult.burnedFromReserved = burnFromReserved;
    updatedResult.burnedFromAvailable = burnFromAvailable;

    // ================================================================
    // Compute post-transaction wallet state for invariant enforcement
    // ================================================================
    const newBalance = currentBalance - totalBurn;
    const newReserved = currentReserved - burnFromReserved;

    // HARD INVARIANTS — if any fail, the entire transaction rolls back
    if (newBalance < 0) {
      throw new Error('WALLET_INVARIANT_VIOLATION: tokensBalance would be negative');
    }
    if (newReserved < 0) {
      throw new Error('WALLET_INVARIANT_VIOLATION: reservedTokens would be negative');
    }
    if (newReserved > newBalance) {
      throw new Error('WALLET_INVARIANT_VIOLATION: reservedTokens would exceed tokensBalance');
    }

    // Update payer wallet
    const walletUpdate: Record<string, any> = {
      tokensBalance: FieldValue.increment(-totalBurn),
      lifetimeSpentTokens: FieldValue.increment(totalBurn),
      lastUpdated: serverTimestamp(),
    };

    if (burnFromReserved > 0) {
      walletUpdate.reservedTokens = FieldValue.increment(-burnFromReserved);
    }

    transaction.update(walletRef, walletUpdate);

    // ================================================================
    // PACK 452 HARD PATCH: Track burnedFromReserved on the offer doc
    // so releasePremiumOnChatEnd() knows how much was already consumed.
    // ================================================================
    const offerId = burnResult.ledgerFields.offerId;
    if (offerId && burnFromReserved > 0) {
      const offerRef = db.collection('premiumOffers').doc(offerId);
      transaction.update(offerRef, {
        burnedFromReserved: FieldValue.increment(burnFromReserved),
      });
    }

    // Credit earner
    if (burnResult.earnerReceives > 0) {
      const earnerWalletRef = db.collection('wallets').doc(earnerId);
      transaction.update(earnerWalletRef, {
        tokensBalance: FieldValue.increment(burnResult.earnerReceives),
        lifetimeEarnedTokens: FieldValue.increment(burnResult.earnerReceives),
        lastUpdated: serverTimestamp(),
      });
    }

    // Credit platform
    if (burnResult.platformReceives > 0) {
      const revenueRef = db.collection('platformRevenue').doc('total');
      transaction.set(revenueRef, {
        totalRevenue: FieldValue.increment(burnResult.platformReceives),
        lastUpdated: serverTimestamp(),
      }, { merge: true });
    }

    // Update chat billing
    const chatRef = db.collection('chats').doc(chatId);
    transaction.update(chatRef, {
      'billing.escrowBalance': FieldValue.increment(-totalBurn),
      'billing.totalConsumed': FieldValue.increment(totalBurn),
      'billing.messageCount': FieldValue.increment(1),
      lastActivityAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Record ledger entry with premium fields + PACK 452 audit fields
    const ledgerRef = db.collection('earningsLedger').doc(generateId());
    transaction.set(ledgerRef, {
      chatId,
      payerId,
      earnerId,
      tokensBurned: totalBurn,
      burnedFromReserved: burnFromReserved,
      burnedFromAvailable: burnFromAvailable,
      earnerReceives: burnResult.earnerReceives,
      platformReceives: burnResult.platformReceives,
      multiplier: burnResult.multiplier,
      bucketCount: burnResult.bucketCount,
      // Premium ledger fields
      pricingMode: burnResult.ledgerFields.pricingMode,
      premiumMultiplier: burnResult.ledgerFields.premiumMultiplier,
      offerId: burnResult.ledgerFields.offerId,
      exclusiveFlag: burnResult.ledgerFields.exclusiveFlag,
      // PACK 452 HARD PATCH: Per-burn source audit trail
      burnSource: burnFromReserved > 0 && burnFromAvailable > 0
        ? 'MIXED'
        : burnFromReserved > 0
          ? 'RESERVED'
          : 'AVAILABLE',
      reservedRemainingAfter: newReserved,
      availableRemainingAfter: newBalance - newReserved,
      // Pricing snapshot
      payoutPerToken: TOKEN_PAYOUT_USD,
      split: {
        earnerShare: EARNER_SHARE_RATE,
        platformShare: PLATFORM_FEE_RATE,
      },
      createdAt: serverTimestamp(),
    });

    // Record wallet transactions
    const spendTxRef = db.collection('walletTransactions').doc(generateId());
    transaction.set(spendTxRef, {
      txId: spendTxRef.id,
      userId: payerId,
      type: 'SPEND',
      source: 'CHAT',
      amountTokens: -totalBurn,
      metadata: {
        chatId,
        relatedId: chatId,
        creatorId: earnerId,
        pricingMode: burnResult.ledgerFields.pricingMode,
        premiumMultiplier: burnResult.ledgerFields.premiumMultiplier,
        offerId: burnResult.ledgerFields.offerId,
        exclusiveFlag: burnResult.ledgerFields.exclusiveFlag,
        burnedFromReserved: burnFromReserved,
        burnedFromAvailable: burnFromAvailable,
        burnSource: burnFromReserved > 0 && burnFromAvailable > 0
          ? 'MIXED'
          : burnFromReserved > 0
            ? 'RESERVED'
            : 'AVAILABLE',
        reservedRemainingAfter: newReserved,
        availableRemainingAfter: newBalance - newReserved,
      },
      timestamp: serverTimestamp(),
    });

    if (burnResult.earnerReceives > 0) {
      const earnTxRef = db.collection('walletTransactions').doc(generateId());
      transaction.set(earnTxRef, {
        txId: earnTxRef.id,
        userId: earnerId,
        type: 'EARN',
        source: 'CHAT',
        amountTokens: burnResult.earnerReceives,
        metadata: {
          chatId,
          relatedId: chatId,
          payerId,
          pricingMode: burnResult.ledgerFields.pricingMode,
          premiumMultiplier: burnResult.ledgerFields.premiumMultiplier,
          offerId: burnResult.ledgerFields.offerId,
          exclusiveFlag: burnResult.ledgerFields.exclusiveFlag,
        },
        timestamp: serverTimestamp(),
      });
    }
  });

  return updatedResult;
}

// ============================================================================
// HELPER: Count billable words (mirrors existing chatMonetization logic)
// ============================================================================

/**
 * Count words in text, excluding URLs and emojis.
 * This is identical to the existing countBillableWords in chatMonetization.ts.
 */
function countBillableWords(text: string): number {
  if (!text || text.trim().length === 0) return 0;

  // Remove URLs
  let cleaned = text.replace(/https?:\/\/[^\s]+/gi, '');

  // Remove emojis (basic ranges)
  cleaned = cleaned.replace(
    /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu,
    ''
  );

  // Split and count
  const words = cleaned.trim().split(/\s+/).filter(w => w.length > 0);
  return words.length;
}

// ============================================================================
// INTEGRATION: Get burn parameters for a chat message
// ============================================================================

/**
 * Get the current burn parameters for a chat.
 * Used by the message processing pipeline to determine burn rate.
 *
 * @param chatId - The chat ID
 * @returns Burn parameters including multiplier and monetization state
 */
export async function getChatBurnParameters(chatId: string): Promise<{
  monetizationState: ChatMonetizationState;
  multiplier: number;
  offerId: string | null;
  exclusive: boolean;
  wordsPerToken: number;
}> {
  const chatDoc = await db.collection('chats').doc(chatId).get();

  if (!chatDoc.exists) {
    throw new Error('Chat not found');
  }

  const chatData = chatDoc.data()!;
  const monetizationState = (chatData.monetizationState || 'PAID_STANDARD') as ChatMonetizationState;
  const premiumContext = chatData.premiumContext;
  const wordsPerToken = chatData.billing?.wordsPerToken || WORDS_PER_TOKEN_STANDARD;

  if (premiumContext && (monetizationState === 'PAID_PREMIUM' || monetizationState === 'EXCLUSIVE_ACTIVE')) {
    return {
      monetizationState,
      multiplier: premiumContext.multiplier || 1,
      offerId: premiumContext.offerId || null,
      exclusive: premiumContext.exclusive || false,
      wordsPerToken,
    };
  }

  return {
    monetizationState: 'PAID_STANDARD',
    multiplier: 1,
    offerId: null,
    exclusive: false,
    wordsPerToken,
  };
}










