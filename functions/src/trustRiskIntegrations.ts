/**
 * PACK 85 — Trust & Risk Engine Integration Helpers
 * 
 * Helper functions for other modules to integrate with Trust & Risk Engine.
 * These provide enforcement hooks that modules can use before allowing actions.
 */

import {
  logTrustEvent,
  canSendMessage,
  canSendMonetizedContent,
  canRequestPayout,
  getTrustProfile,
} from "./trustRiskEngine";
import { TrustEventType } from "./types/trustRisk.types";

// ============================================================================
// REPORT & BLOCK INTEGRATIONS
// ============================================================================

/**
 * Handle user report - log trust event for reported user
 * Call from profileSafety.reportUser or moderation system
 */
export async function onUserReported(
  reportedUserId: string,
  reporterId: string,
  reason: string
): Promise<void> {
  await logTrustEvent({
    userId: reportedUserId,
    type: "REPORT_RECEIVED",
    meta: {
      reporterId,
      reason,
      sourceModule: "reports",
    },
  });
}

/**
 * Handle user block - log trust event for blocked user
 * Call from profileSafety.blockUser
 */
export async function onUserBlocked(
  blockedUserId: string,
  blockerId: string
): Promise<void> {
  await logTrustEvent({
    userId: blockedUserId,
    type: "BLOCK_RECEIVED",
    meta: {
      blockerId,
      sourceModule: "blocks",
    },
  });
}

// ============================================================================
// CHAT & MESSAGING INTEGRATIONS
// ============================================================================

/**
 * Check if user can send a message
 * Call before processing message send
 * 
 * @returns { allowed: boolean, reason?: string, errorCode?: string }
 */
export async function checkMessageSendPermission(userId: string) {
  return await canSendMessage(userId);
}

/**
 * Detect and log mass messaging pattern
 * Call when detecting suspicious messaging behavior
 */
export async function onMassMessagingDetected(
  userId: string,
  messageCount: number,
  recipientCount: number
): Promise<void> {
  await logTrustEvent({
    userId,
    type: "MASS_MESSAGING",
    meta: {
      messageCount,
      recipientCount,
      sourceModule: "chat",
    },
  });
}

// ============================================================================
// MONETIZED ACTIONS INTEGRATIONS
// ============================================================================

/**
 * Check if user can send paid media or gifts
 * Call before processing monetized content send
 */
export async function checkMonetizedContentPermission(userId: string) {
  return await canSendMonetizedContent(userId);
}

/**
 * Detect and log mass gifting pattern
 * Call when detecting suspicious gifting behavior
 */
export async function onMassGiftingDetected(
  userId: string,
  giftCount: number,
  recipientCount: number,
  totalTokens: number
): Promise<void> {
  await logTrustEvent({
    userId,
    type: "MASS_GIFTING",
    meta: {
      giftCount,
      recipientCount,
      totalTokens,
      sourceModule: "gifts",
    },
  });
}

// ============================================================================
// KYC INTEGRATIONS
// ============================================================================

/**
 * Handle KYC rejection
 * Call from kyc.ts when KYC is rejected
 */
export async function onKycRejected(
  userId: string,
  documentId: string,
  reason: string
): Promise<void> {
  await logTrustEvent({
    userId,
    type: "KYC_REJECTED",
    meta: {
      documentId,
      reason,
      sourceModule: "kyc",
    },
  });
}

/**
 * Handle KYC blocking (fraud suspected)
 * Call from kyc.ts when user is blocked from KYC
 */
export async function onKycBlocked(
  userId: string,
  reason: string
): Promise<void> {
  await logTrustEvent({
    userId,
    type: "KYC_BLOCKED",
    meta: {
      reason,
      sourceModule: "kyc",
    },
  });
}

// ============================================================================
// PAYOUT INTEGRATIONS
// ============================================================================

/**
 * Check if user can request payout
 * Call before processing payout request
 * Works in addition to KYC checks
 */
export async function checkPayoutPermission(userId: string) {
  return await canRequestPayout(userId);
}

/**
 * Handle suspected payout fraud attempt
 * Call when detecting fraudulent payout patterns
 */
export async function onPayoutFraudAttempt(
  userId: string,
  reason: string,
  payoutRequestId?: string
): Promise<void> {
  await logTrustEvent({
    userId,
    type: "PAYOUT_FRAUD_ATTEMPT",
    meta: {
      reason,
      payoutRequestId,
      sourceModule: "payouts",
    },
  });
}

// ============================================================================
// PAYMENT INTEGRATIONS
// ============================================================================

/**
 * Handle chargeback filed
 * Call when Stripe webhook receives chargeback
 */
export async function onChargebackFiled(
  userId: string,
  transactionId: string,
  amount: number
): Promise<void> {
  await logTrustEvent({
    userId,
    type: "CHARGEBACK_FILED",
    meta: {
      transactionId,
      amount,
      sourceModule: "payments",
    },
  });
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get user's current risk summary
 * Useful for dashboard/admin displays
 */
export async function getUserRiskSummary(userId: string) {
  const profile = await getTrustProfile(userId);
  
  return {
    userId: profile.userId,
    riskScore: profile.riskScore,
    riskLevel: profile.riskScore >= 50 ? "HIGH" : profile.riskScore >= 25 ? "MEDIUM" : "LOW",
    enforcementLevel: profile.enforcementLevel,
    flags: profile.flags,
    hasRestrictions: profile.enforcementLevel !== "NONE",
    lastUpdated: profile.lastUpdatedAt,
  };
}

/**
 * Quick check if user has any enforcement restrictions
 * Useful for fast checks in hot paths
 */
export async function hasEnforcementRestrictions(userId: string): Promise<boolean> {
  const profile = await getTrustProfile(userId);
  return profile.enforcementLevel !== "NONE";
}

/**
 * Check if user has specific risk flag
 */
export async function hasRiskFlag(userId: string, flag: string): Promise<boolean> {
  const profile = await getTrustProfile(userId);
  return profile.flags.includes(flag as any);
}