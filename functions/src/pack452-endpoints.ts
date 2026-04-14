import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK 452 — Monetization Engine vNext Endpoints
 *
 * Firebase Functions v2 callable endpoints for:
 * - Premium Offer Engine v1
 * - Configurable Entry Threshold
 * - Revenue Coach v1
 * - Exclusive Mode v2
 *
 * @module pack452-endpoints
 * @version 1.0.0
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import {
  createPremiumOffer,
  respondToPremiumOffer,
  cancelPremiumOffer,
  getPremiumOffersForChat,
  getPendingOffersForPayer,
  getPendingOffersForEarner,
} from './pack452-premium-offer-engine';
import {
  getChatEntryTokens,
  updateChatEntryTokens,
} from './pack452-entry-threshold';
import {
  getActiveSuggestions,
  dismissSuggestion,
} from './pack452-revenue-coach';
import {
  getExclusiveLock,
  canEarnerRespondInChat,
} from './pack452-exclusive-mode';
import {
  trackPremiumOfferCreated,
  trackPremiumOfferAccepted,
} from './pack452-kpi-engine';
import {
  CreatePremiumOfferRequest,
  RespondToPremiumOfferRequest,
  CancelPremiumOfferRequest,
  UpdateEntryThresholdRequest,
  DismissRevenueCoachSuggestionRequest,
  PremiumOfferStatus,
} from './types/pack452-monetization-vnext.types';

// ============================================================================
// PREMIUM OFFER ENDPOINTS
// ============================================================================

/**
 * Create a premium offer for a chat.
 * Caller must be the payer in the chat.
 */
export const pack452_createPremiumOffer = onCall(
  { region: 'us-central1', memory: '256MiB', timeoutSeconds: 30 },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const data = request.data as CreatePremiumOfferRequest;
    if (!data.chatId || !data.multiplier) {
      throw new HttpsError('invalid-argument', 'chatId and multiplier are required');
    }

    const result = await createPremiumOffer(auth.uid, {
      chatId: data.chatId,
      multiplier: data.multiplier,
      exclusive: data.exclusive || false,
    });

    if (!result.success) {
      throw new HttpsError('failed-precondition', result.error || 'Failed to create offer');
    }

    // Track KPI (async, non-blocking)
    trackPremiumOfferCreated().catch(err =>
      console.error('KPI tracking error:', err)
    );

    return result;
  }
);

/**
 * Respond to a premium offer (accept or decline).
 * Caller must be the earner in the chat.
 */
export const pack452_respondToPremiumOffer = onCall(
  { region: 'us-central1', memory: '256MiB', timeoutSeconds: 30 },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const data = request.data as RespondToPremiumOfferRequest;
    if (!data.offerId || typeof data.accept !== 'boolean') {
      throw new HttpsError('invalid-argument', 'offerId and accept are required');
    }

    const result = await respondToPremiumOffer(auth.uid, data);

    if (!result.success) {
      throw new HttpsError('failed-precondition', result.error || 'Failed to respond to offer');
    }

    // Track KPI on acceptance (async, non-blocking)
    if (data.accept && result.newMonetizationState) {
      // We need the offer data for KPI tracking
      const { db } = await import('./init');
      const offerDoc = await db.collection('premiumOffers').doc(data.offerId).get();
      if (offerDoc.exists) {
        const offer = offerDoc.data()!;
        trackPremiumOfferAccepted(offer.exclusive || false, offer.multiplier || 1)
          .catch(err => console.error('KPI tracking error:', err));
      }
    }

    return result;
  }
);

/**
 * Cancel a pending premium offer.
 * Caller must be the payer who created the offer.
 */
export const pack452_cancelPremiumOffer = onCall(
  { region: 'us-central1', memory: '256MiB', timeoutSeconds: 30 },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const data = request.data as CancelPremiumOfferRequest;
    if (!data.offerId) {
      throw new HttpsError('invalid-argument', 'offerId is required');
    }

    const result = await cancelPremiumOffer(auth.uid, data);

    if (!result.success) {
      throw new HttpsError('failed-precondition', result.error || 'Failed to cancel offer');
    }

    return result;
  }
);

/**
 * Get premium offers for a chat.
 * Caller must be a participant in the chat.
 */
export const pack452_getPremiumOffers = onCall(
  { region: 'us-central1', memory: '128MiB' },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { chatId, status } = request.data as {
      chatId?: string;
      status?: PremiumOfferStatus;
    };

    if (chatId) {
      // Verify caller is a participant
      const { db } = await import('./init');
      const chatDoc = await db.collection('chats').doc(chatId).get();
      if (!chatDoc.exists) {
        throw new HttpsError('not-found', 'Chat not found');
      }
      const chatData = chatDoc.data()!;
      if (!chatData.participants?.includes(auth.uid)) {
        throw new HttpsError('permission-denied', 'Not a participant in this chat');
      }

      const offers = await getPremiumOffersForChat(chatId, status);
      return { success: true, offers };
    }

    // Get pending offers for the caller (as payer or earner)
    const [payerOffers, earnerOffers] = await Promise.all([
      getPendingOffersForPayer(auth.uid),
      getPendingOffersForEarner(auth.uid),
    ]);

    return {
      success: true,
      offers: [...payerOffers, ...earnerOffers],
    };
  }
);

// ============================================================================
// ENTRY THRESHOLD ENDPOINTS
// ============================================================================

/**
 * Get the current chat entry threshold for the caller.
 */
export const pack452_getEntryThreshold = onCall(
  { region: 'us-central1', memory: '128MiB' },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const chatEntryTokens = await getChatEntryTokens(auth.uid);
    return { success: true, chatEntryTokens };
  }
);

/**
 * Update the chat entry threshold for the caller.
 * Caller must have earnOnChat enabled.
 */
export const pack452_updateEntryThreshold = onCall(
  { region: 'us-central1', memory: '128MiB' },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const data = request.data as UpdateEntryThresholdRequest;
    if (typeof data.chatEntryTokens !== 'number') {
      throw new HttpsError('invalid-argument', 'chatEntryTokens must be a number');
    }

    const result = await updateChatEntryTokens(auth.uid, data);

    if (!result.success) {
      throw new HttpsError('failed-precondition', result.error || 'Failed to update threshold');
    }

    return result;
  }
);

// ============================================================================
// REVENUE COACH ENDPOINTS
// ============================================================================

/**
 * Get active revenue coach suggestions for the caller.
 */
export const pack452_getRevenueCoachSuggestions = onCall(
  { region: 'us-central1', memory: '128MiB' },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const suggestions = await getActiveSuggestions(auth.uid);
    return { success: true, suggestions };
  }
);

/**
 * Dismiss a revenue coach suggestion.
 */
export const pack452_dismissRevenueCoachSuggestion = onCall(
  { region: 'us-central1', memory: '128MiB' },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const data = request.data as DismissRevenueCoachSuggestionRequest;
    if (!data.suggestionId) {
      throw new HttpsError('invalid-argument', 'suggestionId is required');
    }

    await dismissSuggestion(auth.uid, data.suggestionId);
    return { success: true };
  }
);

// ============================================================================
// EXCLUSIVE MODE ENDPOINTS
// ============================================================================

/**
 * Check if the caller has an active exclusive lock.
 */
export const pack452_getExclusiveStatus = onCall(
  { region: 'us-central1', memory: '128MiB' },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const lock = await getExclusiveLock(auth.uid);
    return {
      success: true,
      isExclusive: lock !== null,
      lock: lock ? {
        chatId: lock.chatId,
        offerId: lock.offerId,
        payerId: lock.payerId,
        activatedAt: lock.activatedAt,
      } : null,
    };
  }
);

/**
 * Check if the caller (earner) can respond in a specific chat.
 * Used by the chat UI to show/hide the response input.
 */
export const pack452_canRespondInChat = onCall(
  { region: 'us-central1', memory: '128MiB' },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { chatId } = request.data as { chatId: string };
    if (!chatId) {
      throw new HttpsError('invalid-argument', 'chatId is required');
    }

    const result = await canEarnerRespondInChat(auth.uid, chatId);
    return result;
  }
);

























