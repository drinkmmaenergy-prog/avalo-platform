import { MONETIZATION_SPLITS, SPLITS } from "../config/monetizationSplits";

/**
 * MONETIZATION V2 — Barrel Export
 *
 * Consolidated non-chat monetization flows.
 * All features route through the central SplitEngine.
 *
 * USAGE:
 *   import { chargeMediaUnlock, chargeTip, chargeCalendarBooking } from '../monetization';
 *   import { refundCalendarBooking, refundCallEscrow } from '../monetization';
 */

// ── Types ───────────────────────────────────────────────────────────────────
export type {
  ChargeRequest,
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
  CalendarRefundRequest,
  CallEscrowRefundRequest,
  RefundResult,
  RefundReason,
  EventPayoutValidation,
} from './monetizationV2.types';

// ── Charge Flows ────────────────────────────────────────────────────────────
export {
  chargeMediaUnlock,
  chargeTip,
  chargeGift,
  chargeCallBill,
  reserveCallEscrow,
  chargeSubscriptionPayment,
  chargeRoyalMembership,
  chargeCalendarBooking,
  chargeEventTicket,
  chargeAICompanion,
  chargeBoostBurn,
  validateEventPayout,
} from './monetizationV2.service';

// ── Refund Flows ────────────────────────────────────────────────────────────
export {
  refundCalendarBooking,
  refundCallEscrow,
  denyBoostRefund,
  denyRoyalRefund,
  isRefundable,
} from './refundV2.service';



























