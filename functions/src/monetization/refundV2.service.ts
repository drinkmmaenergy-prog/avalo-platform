/**
 * REFUND V2 SERVICE — Canonical Refund Logic
 *
 * Explicitly defined refund rules for Monetization v2.
 *
 * REFUND RULES (LOCKED):
 *
 * 1. CALENDAR / IRL MEETINGS:
 *    - Earner cancellation → 100% refund to the buyer.
 *    - Verified mismatch/safety issue → 100% refund to the buyer.
 *    - No-show → handled per calendar rules (100% refund).
 *    - Each refund writes a ledger entry.
 *
 * 2. VOICE / VIDEO CALLS — Escrow:
 *    - Unused pre-authorized minutes are refunded to the payer.
 *    - Creator share is NEVER refunded once consumed.
 *    - Only the unused portion of the escrow is returned.
 *
 * 3. BOOST / PAID VISIBILITY:
 *    - NO refund under any circumstances.
 *
 * 4. ROYAL MEMBERSHIP:
 *    - NO refund.
 *
 * 5. ALL OTHER FEATURES:
 *    - No standard refund path. Disputes handled via support.
 *
 * AVALO COMMISSION HANDLING:
 *   - In calendar refunds: Avalo returns its 20% share as well (100% full refund).
 *   - In call escrow refunds: Unused tokens are fully returned (no split was applied yet).
 *   - Avalo commission is NEVER refunded in chat (out of scope — chat is excluded).
 *
 * @module monetization/refundV2.service
 */

import { creditTokens } from '../wallet/walletService';
import { PLATFORM_WALLET_ID } from '../wallet/types';
import { computeSplit } from '../wallet/splitEngine';
import {
  CalendarRefundRequest,
  CallEscrowRefundRequest,
  RefundResult,
  RefundReason,
} from './monetizationV2.types';

// ============================================================================
// CALENDAR / IRL MEETING REFUND
// ============================================================================

/**
 * Valid calendar refund reasons that trigger a 100% refund.
 */
const CALENDAR_FULL_REFUND_REASONS: readonly RefundReason[] = [
  'EARNER_CANCELLATION',
  'VERIFIED_SAFETY_ISSUE',
  'NO_SHOW',
] as const;

/**
 * Process a calendar booking refund.
 *
 * RULES:
 *   - Earner cancellation → 100% refund to buyer.
 *   - Verified safety issue → 100% refund to buyer.
 *   - No-show → 100% refund to buyer.
 *   - Ledger entry required for each refund.
 *
 * The refund credits the FULL original amount back to the buyer.
 * Both the creator's share and Avalo's share are reversed.
 *
 * @param request — CalendarRefundRequest
 * @returns RefundResult
 */
export async function refundCalendarBooking(
  request: CalendarRefundRequest,
): Promise<RefundResult> {
  // Validate reason
  if (!CALENDAR_FULL_REFUND_REASONS.includes(request.reason)) {
    return {
      refunded: false,
      refundedTokens: 0,
      txId: '',
      reason: `Invalid refund reason for calendar: ${request.reason}. ` +
        `Allowed: ${CALENDAR_FULL_REFUND_REASONS.join(', ')}`,
    };
  }

  // Validate amount
  if (request.originalAmountTokens <= 0 || !Number.isInteger(request.originalAmountTokens)) {
    throw new Error('[RefundV2] originalAmountTokens must be a positive integer');
  }

  // Full 100% refund to buyer
  const refundAmount = request.originalAmountTokens;

  // Credit refund to buyer's wallet via creditTokens (CALENDAR_REFUND ledger type)
  const result = await creditTokens({
    userId: request.actorId,
    amountTokens: refundAmount,
    type: 'CALENDAR_REFUND',
    idempotencyKey: request.refundIdempotencyKey,
    metadata: {
      originalIdempotencyKey: request.originalIdempotencyKey,
      bookingId: request.bookingId,
      counterpartyId: request.counterpartyId,
      reason: request.reason,
      refundType: 'CALENDAR_FULL_REFUND',
      originalAmount: request.originalAmountTokens,
      monetizationVersion: 'v2',
    },
  });

  return {
    refunded: true,
    refundedTokens: refundAmount,
    txId: result.txId,
    reason: `Calendar refund: ${request.reason}. Full ${refundAmount} tokens returned.`,
  };
}

// ============================================================================
// CALL ESCROW REFUND — Unused pre-authorized minutes only
// ============================================================================

/**
 * Refund unused call escrow tokens.
 *
 * RULES:
 *   - Only unused portion of pre-authorized escrow is refunded.
 *   - Creator share is NEVER refunded once consumed.
 *   - Refund writes a ledger entry.
 *
 * @param request — CallEscrowRefundRequest
 * @returns RefundResult
 */
export async function refundCallEscrow(
  request: CallEscrowRefundRequest,
): Promise<RefundResult> {
  if (request.unusedTokens <= 0) {
    return {
      refunded: false,
      refundedTokens: 0,
      txId: '',
      reason: 'No unused tokens to refund.',
    };
  }

  if (!Number.isInteger(request.unusedTokens)) {
    throw new Error('[RefundV2] unusedTokens must be a positive integer');
  }

  // Credit unused tokens back to payer using CALL_ESCROW_RELEASE type
  const result = await creditTokens({
    userId: request.actorId,
    amountTokens: request.unusedTokens,
    type: 'CALL_ESCROW_RELEASE',
    idempotencyKey: request.refundIdempotencyKey,
    metadata: {
      sessionId: request.sessionId,
      counterpartyId: request.counterpartyId,
      unusedTokens: request.unusedTokens,
      refundType: 'CALL_ESCROW_UNUSED',
      monetizationVersion: 'v2',
    },
  });

  return {
    refunded: true,
    refundedTokens: request.unusedTokens,
    txId: result.txId,
    reason: `Call escrow refund: ${request.unusedTokens} unused tokens returned.`,
  };
}

// ============================================================================
// BOOST REFUND — DENIED
// ============================================================================

/**
 * Boost tokens are NEVER refunded.
 * This function exists for completeness and always returns denial.
 */
export function denyBoostRefund(): RefundResult {
  return {
    refunded: false,
    refundedTokens: 0,
    txId: '',
    reason: 'Boost tokens are non-refundable. No refund issued.',
  };
}

// ============================================================================
// ROYAL MEMBERSHIP REFUND — DENIED
// ============================================================================

/**
 * Royal membership tokens are NEVER refunded.
 * This function exists for completeness and always returns denial.
 */
export function denyRoyalRefund(): RefundResult {
  return {
    refunded: false,
    refundedTokens: 0,
    txId: '',
    reason: 'Royal membership is non-refundable. No refund issued.',
  };
}

// ============================================================================
// REFUND ELIGIBILITY CHECK
// ============================================================================

/**
 * Check if a feature supports refunds.
 *
 * Only CALENDAR_BOOK and call escrow (CALL_BILL) have explicit refund paths.
 * All other features have no standard refund.
 */
export function isRefundable(feature: string): boolean {
  return feature === 'CALENDAR_BOOK' || feature === 'CALL_BILL';
}









