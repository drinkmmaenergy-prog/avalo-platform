/**
 * PACK 422 — Global Trust, Reputation & Moderation Intelligence (Tier-2)
 * 
 * Reputation Policy Actions
 * Apply tier-2 consequences based on reputation (NON-BANNING)
 */

import * as functions from 'firebase-functions';
import admin from 'firebase-admin';
import {
  ReputationProfile,
  RiskLabel,
  ReputationPolicyAction,
} from '../../shared/types/pack422-reputation.types';
import { getReputationProfile } from './pack422-reputation.service';

const db = admin.firestore();

/**
 * Policy configuration for each risk level
 */
interface PolicyConfig {
  visibilityReduction: number; // 0-100 (percent to reduce)
  discoveryEnabled: boolean;
  passiveLikesEnabled: boolean;
  canStartChats: boolean;
  canHostEvents: boolean;
  canSendFirstMessage: boolean;
  requirePrepayment: boolean;
  requireIDReverification: boolean;
  queueManualModeration: boolean;
  aiDiscountEnabled: boolean;
  verifiedBadgeEligible: boolean;
  feedRankingBoost: number; // Multiplier: 1.0 = normal, <1 = penalty, >1 = bonus
}

const POLICY_CONFIGS: Record<RiskLabel, PolicyConfig> = {
  'CRITICAL': {
    visibilityReduction: 100,
    discoveryEnabled: false,
    passiveLikesEnabled: false,
    canStartChats: false, // Can only reply
    canHostEvents: false,
    canSendFirstMessage: false,
    requirePrepayment: true,
    requireIDReverification: true,
    queueManualModeration: true,
    aiDiscountEnabled: false,
    verifiedBadgeEligible: false,
    feedRankingBoost: 0.1,
  },
  'HIGH': {
    visibilityReduction: 40,
    discoveryEnabled: true,
    passiveLikesEnabled: true,
    canStartChats: true,
    canHostEvents: false,
    canSendFirstMessage: false,
    requirePrepayment: true,
    requireIDReverification: false,
    queueManualModeration: false,
    aiDiscountEnabled: false,
    verifiedBadgeEligible: false,
    feedRankingBoost: 0.7,
  },
  'MEDIUM': {
    visibilityReduction: 0,
    discoveryEnabled: true,
    passiveLikesEnabled: true,
    canStartChats: true,
    canHostEvents: true,
    canSendFirstMessage: false, // Mild restriction: only reply after match
    requirePrepayment: false,
    requireIDReverification: false,
    queueManualModeration: false,
    aiDiscountEnabled: true,
    verifiedBadgeEligible: false,
    feedRankingBoost: 1.0,
  },
  'LOW': {
    visibilityReduction: 0,
    discoveryEnabled: true,
    passiveLikesEnabled: true,
    canStartChats: true,
    canHostEvents: true,
    canSendFirstMessage: true,
    requirePrepayment: false,
    requireIDReverification: false,
    queueManualModeration: false,
    aiDiscountEnabled: true,
    verifiedBadgeEligible: true,
    feedRankingBoost: 1.2, // Positive boost
  },
};

/**
 * Get policy configuration for a user
 */
export async function getUserPolicyConfig(userId: string): Promise<PolicyConfig> {
  const profile = await getReputationProfile(userId);
  return POLICY_CONFIGS[profile.riskLabel || 'MEDIUM'];
}

/**
 * Apply policy restrictions based on reputation
 */
export async function applyPolicyRestrictions(userId: string): Promise<void> {
  const profile = await getReputationProfile(userId);
  const policy = POLICY_CONFIGS[profile.riskLabel || 'MEDIUM'];
  
  // Update user's policy restrictions document
  const policyDoc = db.collection('userPolicyRestrictions').doc(userId);
  
  await policyDoc.set({
    userId,
    updatedAt: Date.now(),
    riskLabel: profile.riskLabel,
    reputationScore: profile.reputationScore,
    
    // Discovery & Visibility
    visibilityReduction: policy.visibilityReduction,
    discoveryEnabled: policy.discoveryEnabled,
    passiveLikesEnabled: policy.passiveLikesEnabled,
    feedRankingBoost: policy.feedRankingBoost,
    
    // Chat & Communication
    canStartChats: policy.canStartChats,
    canSendFirstMessage: policy.canSendFirstMessage,
    
    // Events & Meetings
    canHostEvents: policy.canHostEvents,
    requirePrepayment: policy.requirePrepayment,
    
    // Identity & Security
    requireIDReverification: policy.requireIDReverification,
    queueManualModeration: policy.queueManualModeration,
    
    // Perks & Benefits
    aiDiscountEnabled: policy.aiDiscountEnabled,
    verifiedBadgeEligible: policy.verifiedBadgeEligible,
    
  }, { merge: true });
  
  // Log policy action
  const action: ReputationPolicyAction = {
    riskLabel: profile.riskLabel || 'MEDIUM',
    action: policy.queueManualModeration ? 'MANUAL_REVIEW' : 
            policy.requireIDReverification ? 'MANDATORY_VERIFICATION' :
            policy.visibilityReduction > 0 ? 'VISIBILITY_REDUCTION' :
            policy.canStartChats === false ? 'FEATURE_RESTRICTION' : 'NONE',
    description: `Applied ${profile.riskLabel} risk policies`,
    appliedAt: Date.now(),
  };
  
  await db.collection('reputationProfiles').doc(userId)
    .collection('policyActions').add(action);
  
  console.log(`[PACK422] Applied policy restrictions for ${userId}: ${profile.riskLabel}`);
}

/**
 * Check if user can perform a specific action based on reputation
 */
export async function canUserPerformAction(
  userId: string,
  action: keyof PolicyConfig
): Promise<boolean> {
  const policy = await getUserPolicyConfig(userId);
  return policy[action] as boolean;
}

/**
 * Get visibility multiplier for user (for discovery/feed algorithms)
 */
export async function getUserVisibilityMultiplier(userId: string): Promise<number> {
  const policy = await getUserPolicyConfig(userId);
  return 1.0 - (policy.visibilityReduction / 100);
}

/**
 * Get feed ranking boost for user
 */
export async function getUserFeedRankingBoost(userId: string): Promise<number> {
  const policy = await getUserPolicyConfig(userId);
  return policy.feedRankingBoost;
}

/**
 * Trigger policy application when reputation changes
 */
export const onReputationChange = functions.firestore
  .document('reputationProfiles/{userId}')
  .onWrite(async (change, context) => {
    const userId = context.params.userId;
    
    if (!change.after.exists) {
      // Profile deleted (GDPR)
      return;
    }
    
    const before = change.before.exists ? change.before.data() as ReputationProfile : null;
    const after = change.after.data() as ReputationProfile;
    
    // Check if risk label changed
    const riskLabelChanged = !before || before.riskLabel !== after.riskLabel;
    
    if (riskLabelChanged) {
      console.log(`[PACK422] Risk label changed for ${userId}: ${before?.riskLabel} → ${after.riskLabel}`);
      
      // Apply new policy restrictions
      await applyPolicyRestrictions(userId);
      
      // Queue manual moderation for CRITICAL users
      if (after.riskLabel === 'CRITICAL') {
        await db.collection('moderationQueue').add({
          userId,
          reason: 'CRITICAL_REPUTATION',
          reputationScore: after.reputationScore,
          createdAt: Date.now(),
          status: 'PENDING',
        });
      }
      
      // Send notification (see pack422-notification-templates.ts)
      if (after.riskLabel === 'CRITICAL' || after.riskLabel === 'HIGH') {
        await db.collection('notifications').add({
          userId,
          type: 'REPUTATION_ALERT',
          title: 'Account Limitations',
          message: 'Your account has limited access due to our Community Guidelines. Contact support for assistance.',
          createdAt: Date.now(),
          read: false,
        });
      }
      
      // Notify support team for CRITICAL users
      if (after.riskLabel === 'CRITICAL') {
        await db.collection('internalAlerts').add({
          type: 'CRITICAL_REPUTATION',
          userId,
          reputationScore: after.reputationScore,
          message: `User ${userId} flagged as CRITICAL reputation risk`,
          createdAt: Date.now(),
          resolved: false,
        });
      }
    }
  });

/**
 * Callable function to check user policy
 */
export const checkUserPolicy = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const userId = context.auth.uid;
  const { action } = data;
  
  if (action) {
    const canPerform = await canUserPerformAction(userId, action as keyof PolicyConfig);
    return { canPerform };
  }
  
  const policy = await getUserPolicyConfig(userId);
  return { policy };
});

/**
 * Export for use in other modules
 */
export { POLICY_CONFIGS, PolicyConfig };
