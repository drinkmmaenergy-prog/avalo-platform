import { MONETIZATION_SPLITS, SPLITS } from "../config/monetizationSplits";

/**
 * MONETIZATION V2 — Types
 *
 * Canonical types for all non-chat monetization flows.
 * Every feature flow uses these types for input/output.
 *
 * @module monetization/monetizationV2.types
 */

import { MonetizationFeature, ComputedSplit } from '../wallet/splitEngine';
import { LedgerEntryType, WalletMutationResult } from '../wallet/types';

// ============================================================================
// CHARGE REQUEST — Input to all monetization flows
// ============================================================================

/**
 * Base charge request shared by all monetization features.
 */
export interface ChargeRequest {
  /** The user being charged (spender / buyer). */
  actorId: string;
  /** The earner receiving the split (null for 100% Avalo features). */
  counterpartyId: string | null;
  /** Total tokens to charge. Must be a positive integer. */
  amountTokens: number;
  /** Idempotency key to prevent duplicate processing. */
  idempotencyKey: string;
  /** Optional metadata for domain-specific context. */
  metadata?: Record<string, unknown>;
}

/**
 * Charge result returned by all monetization flows.
 */
export interface ChargeResult {
  /** Wallet mutation result (txId, balances). */
  walletResult: WalletMutationResult;
  /** The computed split applied. */
  split: ComputedSplit;
  /** The feature that was charged. */
  feature: MonetizationFeature;
  /** The ledger entry type written. */
  ledgerType: LedgerEntryType;
}

// ============================================================================
// FEATURE-SPECIFIC REQUEST TYPES
// ============================================================================

/**
 * Paid media unlock (photo, video, album, locked content).
 */
export interface MediaUnlockRequest extends ChargeRequest {
  /** The media ID being unlocked. */
  mediaId: string;
  /** Media type label. */
  mediaType: 'photo' | 'video' | 'album' | 'locked_content';
}

/**
 * Tip (direct appreciation transfer).
 */
export interface TipRequest extends ChargeRequest {
  /** Optional message with the tip. */
  message?: string;
}

/**
 * Gift (direct appreciation transfer, same split as tip).
 */
export interface GiftRequest extends ChargeRequest {
  /** The gift type / visual. */
  giftType: string;
}

/**
 * Voice or video call billing.
 */
export interface CallBillRequest extends ChargeRequest {
  /** Call session ID. */
  sessionId: string;
  /** Duration in minutes (used for metadata). */
  durationMinutes: number;
  /** Rate per minute in tokens. */
  ratePerMinute: number;
  /** Call mode. */
  callType: 'voice' | 'video';
}

/**
 * Call escrow pre-authorization.
 */
export interface CallEscrowRequest {
  /** The payer user. */
  actorId: string;
  /** The earner (earner). */
  counterpartyId: string;
  /** Tokens to reserve. Must be a positive integer. */
  reserveTokens: number;
  /** Pre-authorized minutes. */
  preAuthorizedMinutes: number;
  /** Rate per minute in tokens. */
  ratePerMinute: number;
  /** Idempotency key. */
  idempotencyKey: string;
  /** Call session ID. */
  sessionId: string;
}

/**
 * Creator subscription payment.
 */
export interface SubscriptionPaymentRequest extends ChargeRequest {
  /** Subscription plan ID. */
  subscriptionId: string;
  /** Billing period descriptor (e.g., "2026-03"). */
  billingPeriod: string;
}

/**
 * Royal membership payment (100% Avalo).
 */
export interface RoyalMembershipRequest {
  /** The user paying for Royal membership. */
  actorId: string;
  /** Always 100 tokens. */
  amountTokens: 100;
  /** Billing period. */
  billingPeriod: string;
  /** Idempotency key. */
  idempotencyKey: string;
}

/**
 * Calendar booking / IRL meeting.
 */
export interface CalendarBookingRequest extends ChargeRequest {
  /** Booking ID. */
  bookingId: string;
  /** Meeting date/time ISO string. */
  meetingDate: string;
}

/**
 * Event ticket purchase.
 */
export interface EventTicketRequest extends ChargeRequest {
  /** Event ID. */
  eventId: string;
  /** Ticket ID (unique per attendee). */
  ticketId: string;
}

/**
 * AI companion session charge.
 */
export interface AICompanionChargeRequest extends ChargeRequest {
  /** AI companion ID. */
  companionId: string;
  /** Whether the AI is owned by Avalo (true) or a user (false). */
  isAvaloOwned: boolean;
  /** Session ID. */
  sessionId: string;
}

/**
 * Boost / paid visibility burn.
 */
export interface BoostBurnRequest {
  /** The advertiser user. */
  actorId: string;
  /** Tokens to burn per impression. */
  amountTokens: number;
  /** Boost campaign ID. */
  campaignId: string;
  /** Impression batch ID. */
  impressionBatchId: string;
  /** Idempotency key. */
  idempotencyKey: string;
}

// ============================================================================
// REFUND TYPES
// ============================================================================

/**
 * Refund reason categories.
 */
export type RefundReason =
  | 'EARNER_CANCELLATION'
  | 'VERIFIED_SAFETY_ISSUE'
  | 'NO_SHOW'
  | 'UNUSED_CALL_MINUTES';

/**
 * Refund request for calendar/meeting flows.
 */
export interface CalendarRefundRequest {
  /** The original booking actor (buyer). */
  actorId: string;
  /** The earner who was booked. */
  counterpartyId: string;
  /** Original charge amount. */
  originalAmountTokens: number;
  /** Refund reason. */
  reason: RefundReason;
  /** Original booking idempotency key (for reference). */
  originalIdempotencyKey: string;
  /** Refund idempotency key. */
  refundIdempotencyKey: string;
  /** Original booking ID. */
  bookingId: string;
}

/**
 * Refund request for unused call escrow.
 */
export interface CallEscrowRefundRequest {
  /** The payer who reserved escrow. */
  actorId: string;
  /** The earner. */
  counterpartyId: string;
  /** Unused tokens to refund. */
  unusedTokens: number;
  /** Call session ID. */
  sessionId: string;
  /** Idempotency key for the refund. */
  refundIdempotencyKey: string;
}

/**
 * Refund result.
 */
export interface RefundResult {
  /** Was the refund applied? */
  refunded: boolean;
  /** Amount refunded to the actor. */
  refundedTokens: number;
  /** Ledger txId for the refund entry. */
  txId: string;
  /** Reason for refund or denial. */
  reason: string;
}

// ============================================================================
// VALIDATION RESULT
// ============================================================================

/**
 * Event payout validation result.
 */
export interface EventPayoutValidation {
  /** Event ID. */
  eventId: string;
  /** Whether validation passed (QR or selfie). */
  validated: boolean;
  /** Validation method used. */
  method: 'qr' | 'selfie' | 'none';
  /** When validation occurred. */
  validatedAt: string | null;
}

























