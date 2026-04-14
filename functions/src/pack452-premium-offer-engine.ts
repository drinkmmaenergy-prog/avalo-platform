import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * @deprecated LEGACY — SUPERSEDED by canonical-chat-engine.ts (v2_canonical)
 *
 * PACK 452 mid-chat premium offers are ELIMINATED.
 * Multiplier changes can only apply to the NEXT paid session via
 * setMultiplierForNextSession in canonical-chat-engine.ts.
 *
 * What changed:
 * - createPremiumOffer → REMOVED (use setMultiplierForNextSession)
 * - acceptPremiumOffer → REMOVED (multiplier applied at next deposit)
 * - declinePremiumOffer → REMOVED
 * - Wallet reservation model → REMOVED (deposit handles escrow)
 * - Exclusive mode → REMOVED
 *
 * See: canonical-chat-legacy-shim.ts for error stubs.
 *
 * ORIGINAL: PACK 452 — Premium Offer Engine v1
 * Allows payers to create premium offers for chats with multiplied burn rates.
 *
 * @module pack452-premium-offer-engine
 * @version 1.0.0 (DEPRECATED)
 */

import { db, serverTimestamp, generateId } from './init';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  PremiumOffer,
  PremiumOfferStatus,
  PremiumMultiplier,
  PREMIUM_MULTIPLIERS,
  PREMIUM_OFFER_VALIDITY_MS,
  PREMIUM_SAFETY_LIMITS,
  EXCLUSIVE_MIN_MULTIPLIER,
  ChatMonetizationState,
  PremiumPricingSnapshot,
  CreatePremiumOfferRequest,
  CreatePremiumOfferResponse,
  RespondToPremiumOfferRequest,
  RespondToPremiumOfferResponse,
  CancelPremiumOfferRequest,
  CancelPremiumOfferResponse,
} from './types/pack452-monetization-vnext.types';
import { getChatEntryTokens } from './pack452-entry-threshold';
import { TOKEN_PAYOUT_USD } from './config/economyConfig';

// ============================================================================
// PREMIUM OFFER CREATION
// ============================================================================

/**
 * Create a premium offer for a chat.
 *
 * Steps:
 * 1. Validate multiplier and exclusive constraints
 * 2. Check safety limits (max pending per payer, cooldown)
 * 3. Auto-cancel any existing PENDING offer on this chat
 * 4. Calculate reservation amount
 * 5. Atomically reserve tokens from payer wallet
 * 6. Create offer document
 *
 * @param payerId - The payer creating the offer
 * @param request - Offer parameters
 * @returns Response with offer ID and reserved tokens
 */
export async function createPremiumOffer(
  payerId: string,
  request: CreatePremiumOfferRequest
): Promise<CreatePremiumOfferResponse> {
  const { chatId, multiplier, exclusive } = request;

  // ---- Validate multiplier ----
  if (!PREMIUM_MULTIPLIERS.includes(multiplier)) {
    return {
      success: false,
      error: `Invalid multiplier. Allowed values: ${PREMIUM_MULTIPLIERS.join(', ')}`,
    };
  }

  if (multiplier < PREMIUM_SAFETY_LIMITS.MIN_MULTIPLIER) {
    return {
      success: false,
      error: `Minimum multiplier is ${PREMIUM_SAFETY_LIMITS.MIN_MULTIPLIER}`,
    };
  }

  // ---- Validate exclusive constraints ----
  if (exclusive && multiplier < EXCLUSIVE_MIN_MULTIPLIER) {
    return {
      success: false,
      error: `Exclusive mode requires minimum multiplier of ${EXCLUSIVE_MIN_MULTIPLIER}`,
    };
  }

  // ---- Validate chat exists and payer is the payer ----
  const chatDoc = await db.collection('chats').doc(chatId).get();
  if (!chatDoc.exists) {
    return { success: false, error: 'Chat not found' };
  }

  const chatData = chatDoc.data()!;
  if (chatData.roles?.payerId !== payerId) {
    return { success: false, error: 'Only the payer can create premium offers' };
  }

  const earnerId = chatData.roles?.earnerId;
  if (!earnerId) {
    return { success: false, error: 'Cannot create premium offer for chats without an earner' };
  }

  // ---- Check safety: max pending per payer ----
  const pendingOffersSnap = await db.collection('premiumOffers')
    .where('payerId', '==', payerId)
    .where('status', '==', 'PENDING')
    .get();

  if (pendingOffersSnap.size >= PREMIUM_SAFETY_LIMITS.MAX_PENDING_PER_PAYER) {
    return {
      success: false,
      error: `Maximum ${PREMIUM_SAFETY_LIMITS.MAX_PENDING_PER_PAYER} pending offers allowed`,
    };
  }

  // ---- Check safety: cooldown per chat ----
  const recentOffersSnap = await db.collection('premiumOffers')
    .where('chatId', '==', chatId)
    .where('payerId', '==', payerId)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();

  if (!recentOffersSnap.empty) {
    const lastOffer = recentOffersSnap.docs[0].data();
    const lastCreatedAt = lastOffer.createdAt?.toDate?.() || new Date(0);
    const elapsed = Date.now() - lastCreatedAt.getTime();

    if (elapsed < PREMIUM_SAFETY_LIMITS.COOLDOWN_PER_CHAT_MS) {
      const remainingSec = Math.ceil(
        (PREMIUM_SAFETY_LIMITS.COOLDOWN_PER_CHAT_MS - elapsed) / 1000
      );
      return {
        success: false,
        error: `Please wait ${remainingSec} seconds before creating another offer in this chat`,
      };
    }
  }

  // ---- Get base entry tokens for the earner ----
  const baseChatEntryTokens = await getChatEntryTokens(earnerId);

  // ---- Calculate reservation ----
  const reserveTokens = baseChatEntryTokens * multiplier;

  // ---- Auto-cancel existing PENDING offer on this chat ----
  const existingPendingSnap = await db.collection('premiumOffers')
    .where('chatId', '==', chatId)
    .where('payerId', '==', payerId)
    .where('status', '==', 'PENDING')
    .get();

  // ---- Atomic transaction: reserve tokens + create offer ----
  const offerId = generateId();
  const now = Timestamp.now();
  const expiresAt = Timestamp.fromMillis(now.toMillis() + PREMIUM_OFFER_VALIDITY_MS);

  try {
    await db.runTransaction(async (transaction) => {
      // Get payer wallet
      const walletRef = db.collection('wallets').doc(payerId);
      const walletDoc = await transaction.get(walletRef);

      if (!walletDoc.exists) {
        throw new Error('WALLET_NOT_FOUND');
      }

      const walletData = walletDoc.data()!;
      const currentBalance = walletData.tokensBalance || 0;
      const currentReserved = walletData.reservedTokens || 0;
      const availableTokens = currentBalance - currentReserved;

      // Refund any existing pending offers being cancelled
      let refundFromCancelled = 0;
      for (const doc of existingPendingSnap.docs) {
        const existingOffer = doc.data();
        refundFromCancelled += existingOffer.reserveTokens || 0;

        transaction.update(db.collection('premiumOffers').doc(doc.id), {
          status: 'CANCELLED' as PremiumOfferStatus,
          cancelReason: 'NEW_OFFER_REPLACED',
          resolvedAt: serverTimestamp(),
        });
      }

      // Calculate net reservation needed
      const netReservation = reserveTokens - refundFromCancelled;

      // Check if payer has enough available tokens
      if (availableTokens < netReservation) {
        throw new Error('INSUFFICIENT_AVAILABLE_TOKENS');
      }

      // Update wallet: adjust reserved tokens
      transaction.update(walletRef, {
        reservedTokens: FieldValue.increment(netReservation),
        lastUpdated: serverTimestamp(),
      });

      // Create the offer document
      const offerRef = db.collection('premiumOffers').doc(offerId);
      const offer: PremiumOffer = {
        offerId,
        chatId,
        payerId,
        earnerId,
        multiplier,
        exclusive,
        status: 'PENDING',
        reserveTokens,
        burnedFromReserved: 0,
        baseChatEntryTokens,
        createdAt: now,
        expiresAt,
      };

      transaction.set(offerRef, offer);
    });

    return {
      success: true,
      offerId,
      reserveTokens,
    };
  } catch (error: any) {
    if (error.message === 'WALLET_NOT_FOUND') {
      return { success: false, error: 'Wallet not found' };
    }
    if (error.message === 'INSUFFICIENT_AVAILABLE_TOKENS') {
      return {
        success: false,
        error: `Insufficient available tokens. Need ${reserveTokens} tokens for this offer.`,
      };
    }
    console.error('Create premium offer error:', error);
    return { success: false, error: 'Failed to create premium offer' };
  }
}

// ============================================================================
// PREMIUM OFFER RESPONSE (ACCEPT / DECLINE)
// ============================================================================

/**
 * Respond to a premium offer (accept or decline).
 *
 * On ACCEPT:
 * - Chat monetizationState transitions to PAID_PREMIUM or EXCLUSIVE_ACTIVE
 * - Premium context is stored on the chat document
 * - If exclusive, an exclusive lock is created on the earner
 * - Pricing snapshot is stored for ledger integrity
 *
 * On DECLINE:
 * - Reserved tokens are returned to payer's available balance
 * - Offer status set to DECLINED
 *
 * @param earnerId - The earner responding to the offer
 * @param request - Accept or decline
 * @returns Response with new monetization state
 */
export async function respondToPremiumOffer(
  earnerId: string,
  request: RespondToPremiumOfferRequest
): Promise<RespondToPremiumOfferResponse> {
  const { offerId, accept } = request;

  const offerRef = db.collection('premiumOffers').doc(offerId);
  const offerDoc = await offerRef.get();

  if (!offerDoc.exists) {
    return { success: false, error: 'Offer not found' };
  }

  const offer = offerDoc.data() as PremiumOffer;

  // Validate earner
  if (offer.earnerId !== earnerId) {
    return { success: false, error: 'Only the earner can respond to this offer' };
  }

  // Validate status
  if (offer.status !== 'PENDING') {
    return { success: false, error: `Offer is already ${offer.status}` };
  }

  // Check expiry
  const now = Timestamp.now();
  if (now.toMillis() >= offer.expiresAt.toMillis()) {
    // Auto-expire and refund
    await expirePremiumOffer(offerId);
    return { success: false, error: 'Offer has expired' };
  }

  if (!accept) {
    // ---- DECLINE ----
    return declinePremiumOffer(offer);
  }

  // ---- ACCEPT ----
  return acceptPremiumOffer(offer);
}

/**
 * Accept a premium offer.
 * Transitions chat to PAID_PREMIUM or EXCLUSIVE_ACTIVE.
 */
async function acceptPremiumOffer(
  offer: PremiumOffer
): Promise<RespondToPremiumOfferResponse> {
  const newState: ChatMonetizationState = offer.exclusive
    ? 'EXCLUSIVE_ACTIVE'
    : 'PAID_PREMIUM';

  try {
    await db.runTransaction(async (transaction) => {
      const chatRef = db.collection('chats').doc(offer.chatId);
      const chatDoc = await transaction.get(chatRef);

      if (!chatDoc.exists) {
        throw new Error('CHAT_NOT_FOUND');
      }

      // If exclusive, check earner doesn't already have an active exclusive lock
      if (offer.exclusive) {
        const existingLockRef = db.collection('exclusiveLocks').doc(offer.earnerId);
        const existingLock = await transaction.get(existingLockRef);

        if (existingLock.exists) {
          throw new Error('EARNER_ALREADY_IN_EXCLUSIVE');
        }

        // Create exclusive lock
        transaction.set(existingLockRef, {
          chatId: offer.chatId,
          offerId: offer.offerId,
          payerId: offer.payerId,
          activatedAt: serverTimestamp(),
          lastActivityAt: serverTimestamp(),
        });
      }

      // Create pricing snapshot
      const snapshot: PremiumPricingSnapshot = {
        multiplier: offer.multiplier,
        entryAtAcceptance: offer.baseChatEntryTokens,
        payoutPerToken: TOKEN_PAYOUT_USD,
        split: {
          earner: MONETIZATION_SPLITS.CHAT.earner,
          platform: MONETIZATION_SPLITS.CHAT.platform,
        },
      };

      // Update chat with premium context
      transaction.update(chatRef, {
        monetizationState: newState,
        premiumContext: {
          offerId: offer.offerId,
          multiplier: offer.multiplier,
          exclusive: offer.exclusive,
          premiumStartedAt: serverTimestamp(),
          ...(offer.exclusive ? {
            exclusiveExpiresAt: null, // Active until chat ends or 30 min inactivity
          } : {}),
        },
        premiumPricingSnapshot: snapshot,
        updatedAt: serverTimestamp(),
      });

      // Update offer status
      transaction.update(db.collection('premiumOffers').doc(offer.offerId), {
        status: 'ACCEPTED' as PremiumOfferStatus,
        resolvedAt: serverTimestamp(),
      });
    });

    return {
      success: true,
      newMonetizationState: newState,
    };
  } catch (error: any) {
    if (error.message === 'CHAT_NOT_FOUND') {
      return { success: false, error: 'Chat not found' };
    }
    if (error.message === 'EARNER_ALREADY_IN_EXCLUSIVE') {
      return { success: false, error: 'Earner is already in an exclusive session' };
    }
    console.error('Accept premium offer error:', error);
    return { success: false, error: 'Failed to accept premium offer' };
  }
}

/**
 * Decline a premium offer.
 * Returns reserved tokens to payer's available balance.
 */
async function declinePremiumOffer(
  offer: PremiumOffer
): Promise<RespondToPremiumOfferResponse> {
  try {
    await db.runTransaction(async (transaction) => {
      // Return reserved tokens to payer
      const walletRef = db.collection('wallets').doc(offer.payerId);
      transaction.update(walletRef, {
        reservedTokens: FieldValue.increment(-offer.reserveTokens),
        lastUpdated: serverTimestamp(),
      });

      // Update offer status
      transaction.update(db.collection('premiumOffers').doc(offer.offerId), {
        status: 'DECLINED' as PremiumOfferStatus,
        resolvedAt: serverTimestamp(),
      });
    });

    return { success: true };
  } catch (error: any) {
    console.error('Decline premium offer error:', error);
    return { success: false, error: 'Failed to decline premium offer' };
  }
}

// ============================================================================
// PREMIUM OFFER EXPIRY
// ============================================================================

/**
 * Expire a premium offer and return reserved tokens.
 * Called by scheduled job or on-demand when checking offer validity.
 *
 * @param offerId - The offer to expire
 */
export async function expirePremiumOffer(offerId: string): Promise<void> {
  const offerRef = db.collection('premiumOffers').doc(offerId);

  await db.runTransaction(async (transaction) => {
    const offerDoc = await transaction.get(offerRef);

    if (!offerDoc.exists) return;

    const offer = offerDoc.data() as PremiumOffer;

    // Only expire PENDING offers
    if (offer.status !== 'PENDING') return;

    // Return reserved tokens to payer
    const walletRef = db.collection('wallets').doc(offer.payerId);
    transaction.update(walletRef, {
      reservedTokens: FieldValue.increment(-offer.reserveTokens),
      lastUpdated: serverTimestamp(),
    });

    // Update offer status
    transaction.update(offerRef, {
      status: 'EXPIRED' as PremiumOfferStatus,
      resolvedAt: serverTimestamp(),
    });
  });
}

// ============================================================================
// PREMIUM OFFER CANCELLATION
// ============================================================================

/**
 * Cancel a pending premium offer (by payer).
 * Returns reserved tokens to payer's available balance.
 *
 * @param payerId - The payer cancelling the offer
 * @param request - Cancel request with offer ID
 * @returns Response with refunded tokens
 */
export async function cancelPremiumOffer(
  payerId: string,
  request: CancelPremiumOfferRequest
): Promise<CancelPremiumOfferResponse> {
  const { offerId } = request;

  const offerRef = db.collection('premiumOffers').doc(offerId);
  const offerDoc = await offerRef.get();

  if (!offerDoc.exists) {
    return { success: false, error: 'Offer not found' };
  }

  const offer = offerDoc.data() as PremiumOffer;

  if (offer.payerId !== payerId) {
    return { success: false, error: 'Only the payer can cancel this offer' };
  }

  if (offer.status !== 'PENDING') {
    return { success: false, error: `Cannot cancel offer with status ${offer.status}` };
  }

  try {
    await db.runTransaction(async (transaction) => {
      // Return reserved tokens
      const walletRef = db.collection('wallets').doc(payerId);
      transaction.update(walletRef, {
        reservedTokens: FieldValue.increment(-offer.reserveTokens),
        lastUpdated: serverTimestamp(),
      });

      // Update offer status
      transaction.update(offerRef, {
        status: 'CANCELLED' as PremiumOfferStatus,
        cancelReason: 'PAYER_CANCELLED',
        resolvedAt: serverTimestamp(),
      });
    });

    return {
      success: true,
      refundedTokens: offer.reserveTokens,
    };
  } catch (error: any) {
    console.error('Cancel premium offer error:', error);
    return { success: false, error: 'Failed to cancel premium offer' };
  }
}

// ============================================================================
// QUERY HELPERS
// ============================================================================

/**
 * Get all premium offers for a chat.
 */
export async function getPremiumOffersForChat(
  chatId: string,
  status?: PremiumOfferStatus
): Promise<PremiumOffer[]> {
  let query = db.collection('premiumOffers')
    .where('chatId', '==', chatId) as FirebaseFirestore.Query;

  if (status) {
    query = query.where('status', '==', status);
  }

  const snap = await query.orderBy('createdAt', 'desc').get();
  return snap.docs.map(doc => doc.data() as PremiumOffer);
}

/**
 * Get all pending premium offers for a payer.
 */
export async function getPendingOffersForPayer(payerId: string): Promise<PremiumOffer[]> {
  const snap = await db.collection('premiumOffers')
    .where('payerId', '==', payerId)
    .where('status', '==', 'PENDING')
    .orderBy('createdAt', 'desc')
    .get();

  return snap.docs.map(doc => doc.data() as PremiumOffer);
}

/**
 * Get all pending premium offers for an earner.
 */
export async function getPendingOffersForEarner(earnerId: string): Promise<PremiumOffer[]> {
  const snap = await db.collection('premiumOffers')
    .where('earnerId', '==', earnerId)
    .where('status', '==', 'PENDING')
    .orderBy('createdAt', 'desc')
    .get();

  return snap.docs.map(doc => doc.data() as PremiumOffer);
}

/**
 * Get the active premium context for a chat (if any).
 * Returns null if no premium offer is currently active.
 */
export async function getActivePremiumContext(chatId: string): Promise<{
  multiplier: PremiumMultiplier;
  exclusive: boolean;
  offerId: string;
} | null> {
  const chatDoc = await db.collection('chats').doc(chatId).get();
  if (!chatDoc.exists) return null;

  const chatData = chatDoc.data()!;
  const state = chatData.monetizationState as ChatMonetizationState | undefined;

  if (state !== 'PAID_PREMIUM' && state !== 'EXCLUSIVE_ACTIVE') {
    return null;
  }

  const ctx = chatData.premiumContext;
  if (!ctx) return null;

  return {
    multiplier: ctx.multiplier,
    exclusive: ctx.exclusive,
    offerId: ctx.offerId,
  };
}

// ============================================================================
// CHAT END: RELEASE RESERVED TOKENS
// ============================================================================

/**
 * Release unused reserved tokens when a chat ends.
 * Called during chat close/settlement flow.
 *
 * On chat end:
 * - Any remaining reserved tokens for accepted offers are returned to available
 * - The premium context is cleared
 * - Exclusive lock is released if active
 *
 * @param chatId - The chat being closed
 */
export async function releasePremiumOnChatEnd(chatId: string): Promise<void> {
  const chatDoc = await db.collection('chats').doc(chatId).get();
  if (!chatDoc.exists) return;

  const chatData = chatDoc.data()!;
  const premiumContext = chatData.premiumContext;

  if (!premiumContext) return;

  await db.runTransaction(async (transaction) => {
    // If there's an accepted offer with remaining reserved tokens,
    // the burn engine should have already consumed from reserved first.
    // Any remaining reserved tokens for this offer should be released.
    const offerRef = db.collection('premiumOffers').doc(premiumContext.offerId);
    const offerDoc = await transaction.get(offerRef);

    if (offerDoc.exists) {
      const offer = offerDoc.data() as PremiumOffer;

      // Only release if the offer was accepted (reserved tokens are in play)
      if (offer.status === 'ACCEPTED') {
        // ================================================================
        // PACK 452 HARD PATCH: Compute remaining reserved for this offer.
        // offer.burnedFromReserved tracks how many reserved tokens were
        // already consumed by the burn engine. We must NOT release those.
        //
        //   remainingReservedForOffer = reserveTokens - burnedFromReserved
        //
        // Never use raw offer.reserveTokens — it ignores partial burns.
        // ================================================================
        const totalBurnedFromReserved = offer.burnedFromReserved || 0;
        const remainingReservedForOffer = Math.max(0, offer.reserveTokens - totalBurnedFromReserved);

        if (remainingReservedForOffer > 0) {
          const walletRef = db.collection('wallets').doc(offer.payerId);
          const walletDoc = await transaction.get(walletRef);

          if (walletDoc.exists) {
            const currentReserved = walletDoc.data()?.reservedTokens || 0;
            // Clamp to wallet's actual reserved to prevent underflow
            const releaseAmount = Math.min(currentReserved, remainingReservedForOffer);

            if (releaseAmount > 0) {
              // HARD INVARIANT: reservedTokens must not go negative
              const newReserved = currentReserved - releaseAmount;
              if (newReserved < 0) {
                throw new Error('WALLET_INVARIANT_VIOLATION: release would make reservedTokens negative');
              }

              transaction.update(walletRef, {
                reservedTokens: FieldValue.increment(-releaseAmount),
                lastUpdated: serverTimestamp(),
              });
            }
          }
        }

        // Mark offer as COMPLETED to prevent double release
        transaction.update(offerRef, {
          status: 'COMPLETED' as PremiumOfferStatus,
          resolvedAt: serverTimestamp(),
        });
      }
    }

    // Clear premium context on chat
    const chatRef = db.collection('chats').doc(chatId);
    transaction.update(chatRef, {
      monetizationState: chatData.state === 'PAID_ACTIVE' ? 'PAID_STANDARD' : 'FREE_PHASE',
      premiumContext: FieldValue.delete(),
      updatedAt: serverTimestamp(),
    });

    // Release exclusive lock if present
    if (premiumContext.exclusive) {
      const lockRef = db.collection('exclusiveLocks').doc(chatData.roles?.earnerId);
      const lockDoc = await transaction.get(lockRef);
      if (lockDoc.exists && lockDoc.data()?.chatId === chatId) {
        transaction.delete(lockRef);
      }
    }
  });
}




























