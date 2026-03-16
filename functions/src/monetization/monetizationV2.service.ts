import { MONETIZATION_SPLITS, SPLITS } from "../config/monetizationSplits";

/**
 * MONETIZATION V2 SERVICE — Consolidated Non-Chat Monetization Flows
 *
 * Every non-chat monetization event in AVALO passes through this service.
 * No feature may bypass this service or define its own split locally.
 *
 * All flows:
 *   1. Call SplitEngine.computeSplit() for the canonical split.
 *   2. Call WalletService.transactTokens() for the atomic wallet mutation.
 *   3. Ledger entry is written automatically by WalletService.
 *   4. Idempotency is enforced by WalletService.
 *
 * HARD RULES:
 *   - No discounts, promo codes, free token grants.
 *   - No dynamic splits.
 *   - No experimental branches.
 *   - Integer arithmetic only.
 *
 * @module monetization/monetizationV2.service
 */

import { transactTokens, creditTokens } from '../wallet/walletService';
import {
  computeSplit,
  featureToLedgerType,
  hasCreatorPayout,
  MonetizationFeature,
} from '../wallet/splitEngine';
import { PLATFORM_WALLET_ID } from '../wallet/types';
import {
  ChargeResult,
  MediaUnlockRequest,
  TipRequest,
  GiftRequest,
  CallBillRequest,
  CallEscrowRequest,
  SubscriptionPaymentRequest,
  RoyalMembershipRequest,
  CalendarBookingRequest,
  EventTicketRequest,
  AICompanionChargeRequest,
  BoostBurnRequest,
  EventPayoutValidation,
} from './monetizationV2.types';

// ============================================================================
// INTERNAL HELPER — Unified charge execution
// ============================================================================

/**
 * Execute a charge through the unified wallet path with centralized split.
 *
 * This is the ONLY internal function that calls WalletService.transactTokens().
 * All public flow methods delegate here.
 */
async function executeCharge(
  feature: MonetizationFeature,
  actorId: string,
  counterpartyId: string | null,
  amountTokens: number,
  idempotencyKey: string,
  metadata?: Record<string, unknown>,
): Promise<ChargeResult> {
  // 1. Compute canonical split
  const split = computeSplit(feature, amountTokens);

  // 2. Determine ledger type
  const ledgerType = featureToLedgerType(feature);

  // 3. Determine effective counterparty
  // For 100% Avalo features, counterpartyId is null (no earner payout).
  const effectiveCounterparty = hasCreatorPayout(feature) ? counterpartyId : null;

  // 4. Execute atomic wallet mutation
  const walletResult = await transactTokens({
    type: ledgerType,
    actorId,
    counterpartyId: effectiveCounterparty,
    amountTokens,
    split: {
      creatorTokens: split.creatorTokens,
      avaloTokens: split.avaloTokens,
    },
    idempotencyKey,
    metadata: {
      ...metadata,
      feature,
      monetizationVersion: 'v2',
    },
  });

  return {
    walletResult,
    split,
    feature,
    ledgerType,
  };
}

// ============================================================================
// 1. PAID MEDIA UNLOCKS — Photos, Videos, Albums, Locked Content
//    Split: 65% Creator / 35% Avalo
// ============================================================================

/**
 * Charge a user for unlocking paid media content.
 *
 * @param request — MediaUnlockRequest
 * @returns ChargeResult
 */
export async function chargeMediaUnlock(request: MediaUnlockRequest): Promise<ChargeResult> {
  if (!request.counterpartyId) {
    throw new Error('[MonetizationV2] Media unlock requires a counterpartyId (content earner)');
  }
  if (!request.mediaId) {
    throw new Error('[MonetizationV2] Media unlock requires a mediaId');
  }

  return executeCharge(
    'MEDIA_UNLOCK',
    request.actorId,
    request.counterpartyId,
    request.amountTokens,
    request.idempotencyKey,
    {
      mediaId: request.mediaId,
      mediaType: request.mediaType,
    },
  );
}

// ============================================================================
// 2. TIPS — Direct appreciation transfers
//    Split: 65% Creator / 35% Avalo
// ============================================================================

/**
 * Charge a user for sending a tip.
 *
 * @param request — TipRequest
 * @returns ChargeResult
 */
export async function chargeTip(request: TipRequest): Promise<ChargeResult> {
  if (!request.counterpartyId) {
    throw new Error('[MonetizationV2] Tip requires a counterpartyId (tip recipient)');
  }

  return executeCharge(
    'TIP',
    request.actorId,
    request.counterpartyId,
    request.amountTokens,
    request.idempotencyKey,
    {
      tipMessage: request.message ?? null,
    },
  );
}

// ============================================================================
// 3. GIFTS — Direct appreciation transfers
//    Split: 65% Creator / 35% Avalo
// ============================================================================

/**
 * Charge a user for sending a gift.
 *
 * @param request — GiftRequest
 * @returns ChargeResult
 */
export async function chargeGift(request: GiftRequest): Promise<ChargeResult> {
  if (!request.counterpartyId) {
    throw new Error('[MonetizationV2] Gift requires a counterpartyId (gift recipient)');
  }

  return executeCharge(
    'GIFT',
    request.actorId,
    request.counterpartyId,
    request.amountTokens,
    request.idempotencyKey,
    {
      giftType: request.giftType,
    },
  );
}

// ============================================================================
// 4. VOICE / VIDEO CALLS — Token per minute billing
//    Split: 65% Creator / 35% Avalo
// ============================================================================

/**
 * Bill a completed call (post-call settlement).
 * Called after call ends with actual consumed minutes.
 *
 * Pre-authorized escrow is handled separately.
 * Refund of unused pre-authorized minutes is handled by refundV2.service.
 *
 * @param request — CallBillRequest
 * @returns ChargeResult
 */
export async function chargeCallBill(request: CallBillRequest): Promise<ChargeResult> {
  if (!request.counterpartyId) {
    throw new Error('[MonetizationV2] Call bill requires a counterpartyId (call earner)');
  }
  if (!request.sessionId) {
    throw new Error('[MonetizationV2] Call bill requires a sessionId');
  }

  return executeCharge(
    'CALL_BILL',
    request.actorId,
    request.counterpartyId,
    request.amountTokens,
    request.idempotencyKey,
    {
      sessionId: request.sessionId,
      durationMinutes: request.durationMinutes,
      ratePerMinute: request.ratePerMinute,
      callType: request.callType,
    },
  );
}

/**
 * Reserve escrow tokens for a pre-authorized call.
 * Tokens are escrowed from the payer's wallet.
 * On call completion, consumed tokens are settled via chargeCallBill().
 * Unused tokens are refunded via refundCallEscrow().
 *
 * Escrow reservation debits the payer and holds in platform pending.
 *
 * @param request — CallEscrowRequest
 * @returns ChargeResult (using CALL_ESCROW_RESERVE ledger type)
 */
export async function reserveCallEscrow(request: CallEscrowRequest): Promise<ChargeResult> {
  if (!request.counterpartyId) {
    throw new Error('[MonetizationV2] Call escrow requires a counterpartyId');
  }

  // Escrow: debit payer, 100% held by platform (no earner split yet)
  const walletResult = await transactTokens({
    type: 'CALL_ESCROW_RESERVE',
    actorId: request.actorId,
    counterpartyId: null, // No payout yet — held in escrow by platform
    amountTokens: request.reserveTokens,
    split: {
      creatorTokens: 0,
      avaloTokens: request.reserveTokens, // Platform holds entire escrow
    },
    idempotencyKey: request.idempotencyKey,
    metadata: {
      sessionId: request.sessionId,
      preAuthorizedMinutes: request.preAuthorizedMinutes,
      ratePerMinute: request.ratePerMinute,
      counterpartyId: request.counterpartyId,
      feature: 'CALL_ESCROW_RESERVE',
      monetizationVersion: 'v2',
    },
  });

  return {
    walletResult,
    split: {
      creatorTokens: 0,
      avaloTokens: request.reserveTokens,
      totalTokens: request.reserveTokens,
      feature: 'CALL_BILL',
    },
    feature: 'CALL_BILL',
    ledgerType: 'CALL_ESCROW_RESERVE',
  };
}

// ============================================================================
// 5. CREATOR SUBSCRIPTIONS — Monthly recurring token payment
//    Split: 70% Creator / 30% Avalo
// ============================================================================

/**
 * Charge a subscription payment.
 *
 * @param request — SubscriptionPaymentRequest
 * @returns ChargeResult
 */
export async function chargeSubscriptionPayment(
  request: SubscriptionPaymentRequest,
): Promise<ChargeResult> {
  if (!request.counterpartyId) {
    throw new Error('[MonetizationV2] Subscription payment requires a counterpartyId (earner)');
  }
  if (!request.subscriptionId) {
    throw new Error('[MonetizationV2] Subscription payment requires a subscriptionId');
  }

  return executeCharge(
    'SUBSCRIPTION_PAYMENT',
    request.actorId,
    request.counterpartyId,
    request.amountTokens,
    request.idempotencyKey,
    {
      subscriptionId: request.subscriptionId,
      billingPeriod: request.billingPeriod,
    },
  );
}

// ============================================================================
// 6. ROYAL MEMBERSHIP — 100 tokens/month, 100% Avalo
//    No earner split. Must not interfere with earned Royal status.
// ============================================================================

/**
 * Charge for Royal Membership (paid).
 *
 * RULES:
 * - Always exactly 100 tokens.
 * - 100% Avalo revenue.
 * - No earner payout.
 * - Earned Royal takes priority over paid Royal.
 *
 * @param request — RoyalMembershipRequest
 * @returns ChargeResult
 */
export async function chargeRoyalMembership(
  request: RoyalMembershipRequest,
): Promise<ChargeResult> {
  if (request.amountTokens !== 100) {
    throw new Error('[MonetizationV2] Royal membership must be exactly 100 tokens');
  }

  return executeCharge(
    'ROYAL_MEMBERSHIP',
    request.actorId,
    null, // No earner — 100% Avalo
    request.amountTokens,
    request.idempotencyKey,
    {
      billingPeriod: request.billingPeriod,
      membershipType: 'ROYAL_PAID',
    },
  );
}

// ============================================================================
// 7. CALENDAR BOOKINGS / IRL MEETINGS — 80% Creator / 20% Avalo
// ============================================================================

/**
 * Charge for a calendar booking / IRL meeting.
 *
 * Refund rules:
 *   - Earner cancellation → 100% refund (handled by refundV2.service)
 *   - Verified mismatch/safety issue → 100% refund
 *   - No-show logic handled per calendar rules
 *
 * @param request — CalendarBookingRequest
 * @returns ChargeResult
 */
export async function chargeCalendarBooking(
  request: CalendarBookingRequest,
): Promise<ChargeResult> {
  if (!request.counterpartyId) {
    throw new Error('[MonetizationV2] Calendar booking requires a counterpartyId (earner/host)');
  }
  if (!request.bookingId) {
    throw new Error('[MonetizationV2] Calendar booking requires a bookingId');
  }

  return executeCharge(
    'CALENDAR_BOOK',
    request.actorId,
    request.counterpartyId,
    request.amountTokens,
    request.idempotencyKey,
    {
      bookingId: request.bookingId,
      meetingDate: request.meetingDate,
    },
  );
}

// ============================================================================
// 8. EVENTS / TICKET SALES — 80% Creator / 20% Avalo
//    Payout eligibility only after QR or selfie validation.
// ============================================================================

/**
 * Charge for an event ticket purchase.
 *
 * Payout to the host is NOT released until event validation.
 * Use validateEventPayout() to check validation status.
 *
 * @param request — EventTicketRequest
 * @returns ChargeResult
 */
export async function chargeEventTicket(request: EventTicketRequest): Promise<ChargeResult> {
  if (!request.counterpartyId) {
    throw new Error('[MonetizationV2] Event ticket requires a counterpartyId (event host)');
  }
  if (!request.eventId) {
    throw new Error('[MonetizationV2] Event ticket requires an eventId');
  }

  return executeCharge(
    'EVENT_TICKET',
    request.actorId,
    request.counterpartyId,
    request.amountTokens,
    request.idempotencyKey,
    {
      eventId: request.eventId,
      ticketId: request.ticketId,
      payoutLocked: true, // Payout locked until validation
    },
  );
}

/**
 * Validate event payout eligibility.
 * Payout is only unlocked after QR or selfie validation.
 *
 * This is a read-only check — does not mutate wallet or ledger.
 *
 * @param eventId — The event to check.
 * @param validationData — Validation status from the event system.
 * @returns EventPayoutValidation
 */
export function validateEventPayout(
  eventId: string,
  validationData: { validated: boolean; method: 'qr' | 'selfie' | 'none'; validatedAt: string | null },
): EventPayoutValidation {
  return {
    eventId,
    validated: validationData.validated,
    method: validationData.method,
    validatedAt: validationData.validatedAt,
  };
}

// ============================================================================
// 9. AI COMPANION MONETIZATION
//    Platform AI → 100% Avalo
//    User-created AI → 65% Creator / 35% Avalo
// ============================================================================

/**
 * Charge for an AI companion interaction.
 *
 * Split depends on ownership:
 *   - Avalo-owned AI: 100% Avalo
 *   - User-created AI: 65% Creator / 35% Avalo
 *
 * @param request — AICompanionChargeRequest
 * @returns ChargeResult
 */
export async function chargeAICompanion(
  request: AICompanionChargeRequest,
): Promise<ChargeResult> {
  const feature: MonetizationFeature = request.isAvaloOwned
    ? 'AI_COMPANION_AVALO'
    : 'AI_COMPANION_USER';

  const counterpartyId = request.isAvaloOwned ? null : request.counterpartyId;

  if (!request.isAvaloOwned && !counterpartyId) {
    throw new Error('[MonetizationV2] User-created AI requires a counterpartyId (AI owner)');
  }

  return executeCharge(
    feature,
    request.actorId,
    counterpartyId,
    request.amountTokens,
    request.idempotencyKey,
    {
      companionId: request.companionId,
      sessionId: request.sessionId,
      isAvaloOwned: request.isAvaloOwned,
    },
  );
}

// ============================================================================
// 10. PAID VISIBILITY / BOOST — 100% Avalo
//     No split. No refund. Budget burned per impression.
// ============================================================================

/**
 * Burn tokens for a boost impression batch.
 *
 * RULES:
 * - 100% Avalo. No earner payout.
 * - No refund under any circumstances.
 * - Ledger entry required per burn.
 *
 * @param request — BoostBurnRequest
 * @returns ChargeResult
 */
export async function chargeBoostBurn(request: BoostBurnRequest): Promise<ChargeResult> {
  return executeCharge(
    'BOOST_IMPRESSION',
    request.actorId,
    null, // No earner — 100% Avalo
    request.amountTokens,
    request.idempotencyKey,
    {
      campaignId: request.campaignId,
      impressionBatchId: request.impressionBatchId,
    },
  );
}

























