/**
 * PACK 110 — Feedback Service
 * 
 * Service for interacting with feedback backend functions.
 * 
 * CRITICAL CONSTRAINTS:
 * - No economic incentives or rewards for feedback
 * - Pure feedback collection for product improvement
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from "@/lib/firebase";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface SubmitNpsFeedbackRequest {
  score: number;
  text?: string;
  language: string;
  appVersion: string;
  region?: string;
  platform?: 'ios' | 'android' | 'web';
}

export interface SubmitFeatureFeedbackRequest {
  featureKey: string;
  score: number;
  text?: string;
  language: string;
  appVersion: string;
  region?: string;
  platform?: 'ios' | 'android' | 'web';
}

export interface SubmitFreeFormFeedbackRequest {
  text: string;
  language: string;
  appVersion: string;
  region?: string;
  platform?: 'ios' | 'android' | 'web';
}

export interface DeclineFeedbackRequest {
  type: 'nps' | 'feature';
  featureKey?: string;
}

export interface GetShouldAskForFeatureFeedbackRequest {
  featureKey: string;
}

// ============================================================================
// FEEDBACK SUBMISSION FUNCTIONS
// ============================================================================

/**
 * Submit NPS feedback
 */
export async function submitNpsFeedback(
  request: SubmitNpsFeedbackRequest
): Promise<{ success: boolean; eventId?: string; error?: string }> {
  const submitNps = httpsCallable<SubmitNpsFeedbackRequest, any>(
    functions,
    'submitNpsFeedback'
  );

  const result = await submitNps(request);
  return result.data;
}

/**
 * Submit feature-specific feedback
 */
export async function submitFeatureFeedback(
  request: SubmitFeatureFeedbackRequest
): Promise<{ success: boolean; eventId?: string; error?: string }> {
  const submitFeature = httpsCallable<SubmitFeatureFeedbackRequest, any>(
    functions,
    'submitFeatureFeedback'
  );

  const result = await submitFeature(request);
  return result.data;
}

/**
 * Submit free-form feedback
 */
export async function submitFreeFormFeedback(
  request: SubmitFreeFormFeedbackRequest
): Promise<{ success: boolean; eventId?: string; error?: string }> {
  const submitFreeForm = httpsCallable<SubmitFreeFormFeedbackRequest, any>(
    functions,
    'submitFreeFormFeedback'
  );

  const result = await submitFreeForm(request);
  return result.data;
}

/**
 * Decline feedback survey
 */
export async function declineFeedback(
  request: DeclineFeedbackRequest
): Promise<{ success: boolean }> {
  const decline = httpsCallable<DeclineFeedbackRequest, any>(
    functions,
    'declineFeedback'
  );

  const result = await decline(request);
  return result.data;
}

// ============================================================================
// FEEDBACK ELIGIBILITY FUNCTIONS
// ============================================================================

/**
 * Check if should ask for NPS
 */
export async function getShouldAskForNps(): Promise<{
  shouldAsk: boolean;
  reason?: string;
}> {
  const shouldAsk = httpsCallable<void, any>(
    functions,
    'getShouldAskForNps'
  );

  const result = await shouldAsk();
  return result.data;
}

/**
 * Check if should ask for feature feedback
 */
export async function getShouldAskForFeatureFeedback(
  request: GetShouldAskForFeatureFeedbackRequest
): Promise<{
  shouldAsk: boolean;
  reason?: string;
}> {
  const shouldAsk = httpsCallable<GetShouldAskForFeatureFeedbackRequest, any>(
    functions,
    'getShouldAskForFeatureFeedback'
  );

  const result = await shouldAsk(request);
  return result.data;
}

// ============================================================================
// FEATURE KEYS CONSTANTS
// ============================================================================

export const FEATURE_KEYS = {
  CHAT_MONETIZATION: 'chat_monetization',
  CALL_MONETIZATION: 'call_monetization',
  LIVE_STREAMING: 'live_streaming',
  DISCOVERY_FEED: 'discovery_feed',
  CREATOR_TOOLS: 'creator_tools',
  SAFETY_FEATURES: 'safety_features',
  SUCCESS_TOOLKIT: 'success_toolkit',
  HELP_CENTER: 'help_center',
  MEMBERSHIP_TIERS: 'membership_tiers',
  CAMPAIGNS: 'campaigns',
} as const;

export type FeatureKey = typeof FEATURE_KEYS[keyof typeof FEATURE_KEYS];
