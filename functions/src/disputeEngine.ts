/**
 * PACK 57 — Dispute Engine
 * Pure dispute logic for computing resolution actions
 */

export type DisputeType =
  | "PAYOUT"
  | "EARNING"
  | "RESERVATION"
  | "CONTENT"
  | "OTHER";

export type DisputeStatus =
  | "OPEN"
  | "UNDER_REVIEW"
  | "RESOLVED"
  | "ESCALATED"
  | "CLOSED";

export type DisputeOutcome =
  | "NO_ACTION"
  | "PARTIAL_COMPENSATION"
  | "FULL_COMPENSATION"
  | "PAYOUT_BLOCKED"
  | "PAYOUT_RELEASED"
  | "EARNING_REVOKED"
  | "ENFORCEMENT_UPDATE"
  | "OTHER";

export interface DisputeDomainContext {
  // High-level domain state
  payoutStatus?: string;
  payoutAmount?: number;
  earningTokens?: number;
  escrowTokens?: number;
  enforcementState?: {
    accountStatus: string;
    earningStatus: string;
  };
}

export interface DisputeResolutionAction {
  // Domain-neutral description of what to do
  tokensToRefund?: number;
  tokensToRevokeFromCreator?: number;
  adjustPayoutRequestStatus?: "BLOCKED" | "RELEASED";
  updateEnforcementState?: {
    accountStatus?: string;
    earningStatus?: string;
  };
  internalNotes?: string;
}

/**
 * Compute resolution actions based on dispute type, context, and desired outcome.
 * This function does NOT touch Firestore directly; it only encodes the logic.
 */
export function computeResolutionActions(
  type: DisputeType,
  context: DisputeDomainContext,
  desiredOutcome: DisputeOutcome
): DisputeResolutionAction {
  const actions: DisputeResolutionAction = {};

  switch (type) {
    case "PAYOUT":
      return computePayoutResolutionActions(context, desiredOutcome);
    
    case "EARNING":
      return computeEarningResolutionActions(context, desiredOutcome);
    
    case "RESERVATION":
      return computeReservationResolutionActions(context, desiredOutcome);
    
    case "CONTENT":
      return computeContentResolutionActions(context, desiredOutcome);
    
    case "OTHER":
      return computeOtherResolutionActions(context, desiredOutcome);
    
    default:
      return actions;
  }
}

/**
 * Compute actions for PAYOUT disputes
 */
function computePayoutResolutionActions(
  context: DisputeDomainContext,
  outcome: DisputeOutcome
): DisputeResolutionAction {
  const actions: DisputeResolutionAction = {};

  switch (outcome) {
    case "NO_ACTION":
      actions.internalNotes = "No action required. Payout proceeding normally.";
      break;

    case "PAYOUT_BLOCKED":
      actions.adjustPayoutRequestStatus = "BLOCKED";
      actions.internalNotes = "Payout blocked due to dispute resolution.";
      break;

    case "PAYOUT_RELEASED":
      actions.adjustPayoutRequestStatus = "RELEASED";
      actions.internalNotes = "Payout released and marked for processing.";
      break;

    case "PARTIAL_COMPENSATION":
      // For payout disputes, partial compensation might mean releasing part of the payout
      // or crediting tokens - depends on implementation context
      actions.internalNotes = "Partial compensation approved - manual review required for exact amount.";
      break;

    case "FULL_COMPENSATION":
      actions.adjustPayoutRequestStatus = "RELEASED";
      actions.internalNotes = "Full payout approved and released.";
      break;

    case "ENFORCEMENT_UPDATE":
      if (context.enforcementState) {
        actions.updateEnforcementState = {
          accountStatus: "FLAGGED",
          earningStatus: "REVIEW_REQUIRED"
        };
      }
      actions.internalNotes = "Enforcement state updated due to payout dispute.";
      break;

    default:
      actions.internalNotes = "Unknown outcome for payout dispute.";
  }

  return actions;
}

/**
 * Compute actions for EARNING disputes
 */
function computeEarningResolutionActions(
  context: DisputeDomainContext,
  outcome: DisputeOutcome
): DisputeResolutionAction {
  const actions: DisputeResolutionAction = {};

  switch (outcome) {
    case "NO_ACTION":
      actions.internalNotes = "No action required. Earning event is valid.";
      break;

    case "PARTIAL_COMPENSATION":
      if (context.earningTokens) {
        actions.tokensToRefund = Math.floor(context.earningTokens * 0.5);
        actions.internalNotes = `Partial refund: ${actions.tokensToRefund} tokens.`;
      }
      break;

    case "FULL_COMPENSATION":
      if (context.earningTokens) {
        actions.tokensToRefund = context.earningTokens;
        actions.internalNotes = `Full refund: ${actions.tokensToRefund} tokens.`;
      }
      break;

    case "EARNING_REVOKED":
      if (context.earningTokens) {
        actions.tokensToRevokeFromCreator = context.earningTokens;
        actions.tokensToRefund = context.earningTokens;
        actions.internalNotes = `Earning revoked and tokens refunded: ${context.earningTokens}.`;
      }
      break;

    case "ENFORCEMENT_UPDATE":
      if (context.enforcementState) {
        actions.updateEnforcementState = {
          accountStatus: "FLAGGED",
          earningStatus: "SUSPENDED"
        };
      }
      actions.internalNotes = "Enforcement action taken on creator account.";
      break;

    default:
      actions.internalNotes = "Unknown outcome for earning dispute.";
  }

  return actions;
}

/**
 * Compute actions for RESERVATION disputes (PACK 58+)
 */
function computeReservationResolutionActions(
  context: DisputeDomainContext,
  outcome: DisputeOutcome
): DisputeResolutionAction {
  const actions: DisputeResolutionAction = {};

  switch (outcome) {
    case "NO_ACTION":
      actions.internalNotes = "No action required. Reservation handled correctly.";
      break;

    case "PARTIAL_COMPENSATION":
      if (context.escrowTokens) {
        actions.tokensToRefund = Math.floor(context.escrowTokens * 0.5);
        actions.internalNotes = `Partial escrow refund: ${actions.tokensToRefund} tokens.`;
      }
      break;

    case "FULL_COMPENSATION":
      if (context.escrowTokens) {
        actions.tokensToRefund = context.escrowTokens;
        actions.internalNotes = `Full escrow refund: ${actions.tokensToRefund} tokens.`;
      }
      break;

    case "ENFORCEMENT_UPDATE":
      if (context.enforcementState) {
        actions.updateEnforcementState = {
          accountStatus: "WARNING",
          earningStatus: "REVIEW_REQUIRED"
        };
      }
      actions.internalNotes = "Warning issued for reservation dispute.";
      break;

    default:
      actions.internalNotes = "Unknown outcome for reservation dispute.";
  }

  return actions;
}

/**
 * Compute actions for CONTENT disputes
 */
function computeContentResolutionActions(
  context: DisputeDomainContext,
  outcome: DisputeOutcome
): DisputeResolutionAction {
  const actions: DisputeResolutionAction = {};

  switch (outcome) {
    case "NO_ACTION":
      actions.internalNotes = "Content reviewed - no policy violation found.";
      break;

    case "ENFORCEMENT_UPDATE":
      if (context.enforcementState) {
        actions.updateEnforcementState = {
          accountStatus: "SUSPENDED",
          earningStatus: "BLOCKED"
        };
      }
      actions.internalNotes = "Account suspended due to content policy violation.";
      break;

    case "PARTIAL_COMPENSATION":
      // Content disputes might include token compensation in some cases
      actions.internalNotes = "Partial compensation approved for content dispute.";
      break;

    case "EARNING_REVOKED":
      if (context.earningTokens) {
        actions.tokensToRevokeFromCreator = context.earningTokens;
        actions.tokensToRefund = context.earningTokens;
        actions.internalNotes = "Earnings revoked due to policy violation.";
      }
      break;

    default:
      actions.internalNotes = "Unknown outcome for content dispute.";
  }

  return actions;
}

/**
 * Compute actions for OTHER disputes
 */
function computeOtherResolutionActions(
  context: DisputeDomainContext,
  outcome: DisputeOutcome
): DisputeResolutionAction {
  const actions: DisputeResolutionAction = {};

  switch (outcome) {
    case "NO_ACTION":
      actions.internalNotes = "No action required.";
      break;

    case "PARTIAL_COMPENSATION":
      actions.internalNotes = "Partial compensation approved - manual processing required.";
      break;

    case "FULL_COMPENSATION":
      actions.internalNotes = "Full compensation approved - manual processing required.";
      break;

    case "ENFORCEMENT_UPDATE":
      if (context.enforcementState) {
        actions.updateEnforcementState = {
          accountStatus: "REVIEW_REQUIRED"
        };
      }
      actions.internalNotes = "Enforcement review initiated.";
      break;

    default:
      actions.internalNotes = "Unknown outcome for other dispute type.";
  }

  return actions;
}

/**
 * Validate dispute type
 */
export function isValidDisputeType(type: string): type is DisputeType {
  return ["PAYOUT", "EARNING", "RESERVATION", "CONTENT", "OTHER"].includes(type);
}

/**
 * Validate dispute status
 */
export function isValidDisputeStatus(status: string): status is DisputeStatus {
  return ["OPEN", "UNDER_REVIEW", "RESOLVED", "ESCALATED", "CLOSED"].includes(status);
}

/**
 * Validate dispute outcome
 */
export function isValidDisputeOutcome(outcome: string): outcome is DisputeOutcome {
  return [
    "NO_ACTION",
    "PARTIAL_COMPENSATION",
    "FULL_COMPENSATION",
    "PAYOUT_BLOCKED",
    "PAYOUT_RELEASED",
    "EARNING_REVOKED",
    "ENFORCEMENT_UPDATE",
    "OTHER"
  ].includes(outcome);
}