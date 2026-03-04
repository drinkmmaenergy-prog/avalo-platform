"use client";

/**
 * PHASE 3.3 — Creator Panel Service
 * 
 * Thin client consuming existing Firebase Functions.
 * NO business logic — all earnings/payouts calculated by backend.
 * 
 * Backend functions consumed:
 * - getPayoutState (from payouts.ts)
 * - requestPayout (from payouts.ts)
 * - getPayoutHistory (from payouts.ts)
 * - setupPayoutAccount (from payouts.ts)
 */

import { requireDb, requireFunctions } from '../../firebase';
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import type {
  CreatorEarningsSummary,
  PayoutHistoryEntry,
  CreatorStripeConnectInfo,
  CreatorAnalyticsDashboard,
} from '../../../types/phase33.types';

// ============================================================================
// EARNINGS (READ-ONLY)
// ============================================================================

/**
 * Get creator earnings summary.
 * Calls backend function — NO local calculation.
 */
export async function getCreatorEarningsSummary(userId: string): Promise<CreatorEarningsSummary | null> {
    
  try {
    const getPayoutState = httpsCallable<{ userId: string }, any>(requireFunctions(), 'getPayoutState');
    const result = await getPayoutState({ userId });
    
    if (!result.data || !result.data.earnings) {
      return null;
    }
    
    const { earnings } = result.data;
    
    return {
      userId,
      totalTokensEarnedAllTime: earnings.totalTokensEarnedAllTime || 0,
      totalTokensEarnedThisMonth: earnings.withdrawableTokens || 0, // Backend provides this
      withdrawableTokens: earnings.withdrawableTokens || 0,
      pendingTokens: earnings.pendingTokens || 0,
      availableForPayout: earnings.withdrawableTokens || 0, // Same as withdrawable
      lastUpdated: new Date(),
    };
  } catch (error) {
    console.error('[CreatorPanel] Error getting earnings summary:', error);
    throw error;
  }
}

// ============================================================================
// PAYOUT HISTORY (READ-ONLY)
// ============================================================================

/**
 * Get payout history for creator.
 * Calls backend function — NO local filtering.
 */
export async function getPayoutHistory(
  userId: string,
  limitCount: number = 20,
  cursor?: string
): Promise<PayoutHistoryEntry[]> {
    
  try {
    const getPayoutRequests = httpsCallable<
      { userId: string; limit: number; cursor?: string },
      { requests: any[] }
    >(requireFunctions(), 'getPayoutRequests');
    
    const result = await getPayoutRequests({ userId, limit: limitCount, cursor });
    
    if (!result.data || !result.data.requests) {
      return [];
    }
    
    return result.data.requests.map((req: any) => ({
      payoutId: req.requestId,
      userId: req.userId,
      requestedTokens: req.tokensRequested,
      amountFiatNetToUser: req.amountFiatNetToUser,
      currency: req.currency,
      rail: req.rail,
      status: req.status,
      createdAt: req.createdAt?.toDate?.() || new Date(req.createdAt),
      processedAt: req.processedAt ? (req.processedAt?.toDate?.() || new Date(req.processedAt)) : undefined,
      failureReason: req.failureReason,
    }));
  } catch (error) {
    console.error('[CreatorPanel] Error getting payout history:', error);
    throw error;
  }
}

// ============================================================================
// STRIPE CONNECT STATUS (READ-ONLY)
// ============================================================================

/**
 * Get Stripe Connect status for creator.
 * Calls backend function — NO local Stripe API calls.
 */
export async function getStripeConnectStatus(userId: string): Promise<CreatorStripeConnectInfo> {
    
  try {
    const getPayoutState = httpsCallable<{ userId: string }, any>(requireFunctions(), 'getPayoutState');
    const result = await getPayoutState({ userId });
    
    if (!result.data) {
      return {
        status: 'NOT_CONNECTED',
        payoutsEnabled: false,
        chargesEnabled: false,
        detailsSubmitted: false,
        lastChecked: new Date(),
      };
    }
    
    const account = result.data.account;
    
    if (!account) {
      return {
        status: 'NOT_CONNECTED',
        payoutsEnabled: false,
        chargesEnabled: false,
        detailsSubmitted: false,
        lastChecked: new Date(),
      };
    }
    
    // Map backend status to our types
    let status: CreatorStripeConnectInfo['status'] = 'NOT_CONNECTED';
    if (account.stripeAccountId) {
      if (account.stripeOnboardingComplete) {
        status = account.stripePayoutsEnabled ? 'ACTIVE' : 'RESTRICTED';
      } else {
        status = 'ONBOARDING_INCOMPLETE';
      }
    }
    
    return {
      status,
      stripeAccountId: account.stripeAccountId,
      payoutsEnabled: account.stripePayoutsEnabled || false,
      chargesEnabled: account.stripeChargesEnabled || false,
      detailsSubmitted: account.stripeOnboardingComplete || false,
      currentlyDue: account.stripeDue?.currently_due,
      eventuallyDue: account.stripeDue?.eventually_due,
      lastChecked: new Date(),
    };
  } catch (error) {
    console.error('[CreatorPanel] Error getting Stripe Connect status:', error);
    throw error;
  }
}

/**
 * Initiate Stripe Connect onboarding.
 * Calls backend function to get onboarding URL.
 */
export async function initiateStripeOnboarding(
  userId: string,
  returnUrl: string,
  refreshUrl: string
): Promise<{ url: string } | null> {
    
  try {
    const setupPayoutAccount = httpsCallable<
      { userId: string; rail: string; returnUrl: string; refreshUrl: string },
      { onboardingUrl?: string }
    >(requireFunctions(), 'setupPayoutAccount');
    
    const result = await setupPayoutAccount({
      userId,
      rail: 'STRIPE',
      returnUrl,
      refreshUrl,
    });
    
    if (result.data.onboardingUrl) {
      return { url: result.data.onboardingUrl };
    }
    
    return null;
  } catch (error) {
    console.error('[CreatorPanel] Error initiating Stripe onboarding:', error);
    throw error;
  }
}

// ============================================================================
// ANALYTICS DASHBOARD (READ-ONLY)
// ============================================================================

/**
 * Get creator analytics dashboard.
 * Reads from Firestore — computed by backend scheduled functions.
 */
export async function getCreatorAnalytics(
  userId: string,
  period: 'day' | 'week' | 'month' = 'week'
): Promise<CreatorAnalyticsDashboard | null> {
  if (false /* requireDb handles null */) throw new Error('Firestore not initialized');
  
  try {
    // Read pre-computed analytics from Firestore (backend PACK 290)
    const analyticsRef = doc(requireDb(), 'creator_analytics', `${userId}_${period}`);
    const analyticsSnap = await getDoc(analyticsRef);
    
    if (!analyticsSnap.exists()) {
      return null;
    }
    
    const data = analyticsSnap.data();
    
    return {
      userId,
      period,
      earningsBySource: {
        chat: data.earningsBySource?.chat || 0,
        calls: data.earningsBySource?.calls || 0,
        contentUnlocks: data.earningsBySource?.contentUnlocks || 0,
        events: data.earningsBySource?.events || 0,
        subscriptions: data.earningsBySource?.subscriptions || 0,
        tips: data.earningsBySource?.tips || 0,
      },
      totalViews: data.totalViews || 0,
      profileViews: data.profileViews || 0,
      totalInteractions: data.totalInteractions || 0,
      uniqueFans: data.uniqueFans || 0,
      freeToPaidRate: data.freeToPaidRate || 0,
      repeatFanRate: data.repeatFanRate || 0,
      avgSpendPerFan: data.avgSpendPerFan || 0,
      dailyEarnings: data.dailyEarnings || [],
      lastUpdated: data.updatedAt?.toDate() || new Date(),
    };
  } catch (error) {
    console.error('[CreatorPanel] Error getting creator analytics:', error);
    throw error;
  }
}

// ============================================================================
// PAYOUT REQUESTS (ACTION — calls backend)
// ============================================================================

/**
 * Request a payout. NO balance modification — backend handles it.
 */
export async function requestCreatorPayout(
  userId: string,
  tokensRequested: number,
  methodId: string = 'default'
): Promise<{ success: boolean; payoutRequestId?: string; error?: string }> {
    
  try {
    const requestPayout = httpsCallable<
      { userId: string; tokensRequested: number; methodId: string },
      { success: boolean; requestId?: string; message?: string }
    >(requireFunctions(), 'requestPayout');
    
    const result = await requestPayout({ userId, tokensRequested, methodId });
    
    return {
      success: result.data.success,
      payoutRequestId: result.data.requestId,
      error: result.data.success ? undefined : result.data.message,
    };
  } catch (error: any) {
    console.error('[CreatorPanel] Error requesting payout:', error);
    return {
      success: false,
      error: error.message || 'Failed to request payout',
    };
  }
}

