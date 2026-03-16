/**
 * PHASE 3.3 — Web Service Layer (Canonical Public Surface)
 *
 * This file is the stable consumer-facing phase33 contract used by app-web pages.
 * Provider details live under ./phase33/* and are delegated from here.
 */

import type {
  CanonicalTokenPack,
  CreatorEarningsSummary,
  CreatorAnalyticsDashboard,
  CreatorStripeConnectInfo,
  PayoutHistoryEntry,
  AdminOpsView,
  FeatureFlagSummary,
  TrustSignal,
  SystemHealthMetric,
} from '@/types/phase33.types';

import {
  getAvailableTokenPacks as providerGetAvailableTokenPacks,
  formatPackPrice as providerFormatPackPrice,
} from './phase33/tokenPurchase';

import {
  getCreatorEarningsSummary as providerGetCreatorEarningsSummary,
  getCreatorAnalytics as providerGetCreatorAnalytics,
  getStripeConnectStatus as providerGetStripeConnectStatus,
  initiateStripeOnboarding as providerInitiateStripeOnboarding,
  getPayoutHistory as providerGetPayoutHistory,
  requestCreatorPayout as providerRequestCreatorPayout,
} from './phase33/creatorPanel';

import {
  getAdminOpsView as providerGetAdminOpsView,
  getFeatureFlags as providerGetFeatureFlags,
  getTrustSignals as providerGetTrustSignals,
  getTrustSignalCounts as providerGetTrustSignalCounts,
  getSystemHealth as providerGetSystemHealth,
} from './phase33/adminOps';

// ── Token Packs ──────────────────────────────────────────────────

export function getAvailableTokenPacks(): CanonicalTokenPack[] {
  return providerGetAvailableTokenPacks();
}

export function formatPackPrice(pack: CanonicalTokenPack, currency: string = 'USD'): string {
  return providerFormatPackPrice(pack, currency as 'USD' | 'EUR' | 'PLN' | 'GBP');
}

// ── Creator Earnings ─────────────────────────────────────────────

export async function getCreatorEarningsSummary(userId: string): Promise<CreatorEarningsSummary> {
  const data = await providerGetCreatorEarningsSummary(userId);

  if (data) return data;

  return {
    userId,
    totalTokensEarnedAllTime: 0,
    totalTokensEarnedThisMonth: 0,
    withdrawableTokens: 0,
    pendingTokens: 0,
    availableForPayout: 0,
    lastUpdated: new Date(),
  };
}

// ── Creator Analytics ────────────────────────────────────────────

export async function getCreatorAnalytics(
  userId: string,
  period: 'day' | 'week' | 'month' = 'week',
): Promise<CreatorAnalyticsDashboard> {
  const data = await providerGetCreatorAnalytics(userId, period);

  if (data) return data;

  return {
    userId,
    period,
    earningsBySource: { chat: 0, calls: 0, contentUnlocks: 0, events: 0, subscriptions: 0, tips: 0 },
    totalViews: 0,
    profileViews: 0,
    totalInteractions: 0,
    uniqueFans: 0,
    freeToPaidRate: 0,
    repeatFanRate: 0,
    avgSpendPerFan: 0,
    dailyEarnings: [],
    lastUpdated: new Date(),
  };
}

// ── Stripe Connect ───────────────────────────────────────────────

export async function getStripeConnectStatus(userId: string): Promise<CreatorStripeConnectInfo> {
  return providerGetStripeConnectStatus(userId);
}

export async function initiateStripeOnboarding(userId: string): Promise<{ url: string }> {
  const result = await providerInitiateStripeOnboarding(userId);

  if (!result?.url) {
    throw new Error('Failed to start Stripe onboarding.');
  }

  return result;
}

// ── Creator Payouts ──────────────────────────────────────────────

export async function getPayoutHistory(userId: string): Promise<PayoutHistoryEntry[]> {
  return providerGetPayoutHistory(userId);
}

export async function requestCreatorPayout(
  userId: string,
  tokens: number,
  _currency: string = 'USD',
): Promise<{ success: boolean; payoutId?: string; payoutRequestId?: string; error?: string }> {
  const result = await providerRequestCreatorPayout(userId, tokens);

  return {
    success: result.success,
    payoutId: result.payoutRequestId,
    payoutRequestId: result.payoutRequestId,
    error: result.error,
  };
}

// ── Admin Ops ────────────────────────────────────────────────────

export async function getAdminOpsView(): Promise<AdminOpsView> {
  return providerGetAdminOpsView();
}

export async function getFeatureFlags(): Promise<FeatureFlagSummary[]> {
  return providerGetFeatureFlags();
}

export type TrustSignalCounts = Awaited<ReturnType<typeof providerGetTrustSignalCounts>>;

export async function getTrustSignals(): Promise<TrustSignal[]> {
  return providerGetTrustSignals();
}

export async function getTrustSignalCounts(): Promise<TrustSignalCounts> {
  return providerGetTrustSignalCounts();
}

export async function getSystemHealth(): Promise<SystemHealthMetric[]> {
  return providerGetSystemHealth();
}
