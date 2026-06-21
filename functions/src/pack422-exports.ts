import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK 422 — Global Trust, Reputation & Moderation Intelligence (Tier-2)
 * 
 * Export all PACK 422 functions for Firebase deployment
 */

// Reputation Service
import { functions } from './runtime';

export {
  recalculateReputation,
  getReputationProfile,
  createDefaultReputationProfile,
} from './pack422-reputation.service';

// Reputation Triggers
export {
  onBillingEvent,
  onAbuseReport,
  onMeetingStatusChange,
  onQRVerification,
  onTransactionComplete,
  onDisputeCreated,
  onFraudAlert,
  onSafetyIncident,
  onPanicEvent,
  onUserRestrictionChange,
  onSupportTicketCreated,
  onSupportTicketUpdated,
  onAIViolation,
  onAIUserBlocked,
  onUserChurn,
  forceReputationRecalc,
} from './pack422-reputation.triggers';

// Reputation Policy
export {
  applyPolicyRestrictions,
  getUserPolicyConfig,
  canUserPerformAction,
  getUserVisibilityMultiplier,
  getUserFeedRankingBoost,
  onReputationChange,
  checkUserPolicy,
  POLICY_CONFIGS,
} from './pack422-reputation.policy';

























