/**
 * PHASE 3.3 — Web Service Layer
 *
 * Client-side service functions for creator earnings, analytics, admin ops, etc.
 * All data comes from Firestore or Cloud Functions — NO local calculations.
 *
 * INVARIANTS:
 *   - No pricing overrides.
 *   - Creator earnings are READ-ONLY on client.
 */

import { httpsCallable } from 'firebase/functions';
import { doc, getDoc, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { requireDb, requireFunctions } from '@/lib/firebase';
import {
  CANONICAL_TOKEN_PACKS,
  type CanonicalTokenPack,
  type CreatorEarningsSummary,
  type CreatorAnalyticsDashboard,
  type CreatorStripeConnectInfo,
  type PayoutHistoryEntry,
  type AdminOpsView,
  type FeatureFlagSummary,
  type TrustSignal,
  type SystemHealthMetric,
} from '@/types/phase33.types';

// ── Token Packs ──────────────────────────────────────────────────

export function getAvailableTokenPacks(): CanonicalTokenPack[] {
  return Object.values(CANONICAL_TOKEN_PACKS);
}

export function formatPackPrice(pack: CanonicalTokenPack, currency: string = 'USD'): string {
  const key = `price${currency}` as keyof CanonicalTokenPack;
  const cents = (pack[key] as number) ?? pack.priceUSD;
  return `${(cents / 100).toFixed(2)}`;
}

// ── Creator Earnings ─────────────────────────────────────────────

export async function getCreatorEarningsSummary(userId: string): Promise<CreatorEarningsSummary> {
  const ref = doc(requireDb(), 'creator_earnings', userId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
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

  const data = snap.data();
  return {
    userId: data.userId ?? userId,
    totalTokensEarnedAllTime: data.totalTokensEarnedAllTime ?? 0,
    totalTokensEarnedThisMonth: data.totalTokensEarnedThisMonth ?? 0,
    withdrawableTokens: data.withdrawableTokens ?? 0,
    pendingTokens: data.pendingTokens ?? 0,
    availableForPayout: data.availableForPayout ?? 0,
    lastUpdated: data.lastUpdated?.toDate?.() ?? new Date(),
  };
}

// ── Creator Analytics ────────────────────────────────────────────

export async function getCreatorAnalytics(
  userId: string,
  period: 'day' | 'week' | 'month' = 'week',
): Promise<CreatorAnalyticsDashboard> {
  const ref = doc(requireDb(), 'creator_analytics', `${userId}_${period}`);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
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

  const data = snap.data();
  return {
    userId: data.userId ?? userId,
    period: data.period ?? period,
    earningsBySource: data.earningsBySource ?? { chat: 0, calls: 0, contentUnlocks: 0, events: 0, subscriptions: 0, tips: 0 },
    totalViews: data.totalViews ?? 0,
    profileViews: data.profileViews ?? 0,
    totalInteractions: data.totalInteractions ?? 0,
    uniqueFans: data.uniqueFans ?? 0,
    freeToPaidRate: data.freeToPaidRate ?? 0,
    repeatFanRate: data.repeatFanRate ?? 0,
    avgSpendPerFan: data.avgSpendPerFan ?? 0,
    dailyEarnings: data.dailyEarnings ?? [],
    lastUpdated: data.lastUpdated?.toDate?.() ?? new Date(),
  };
}

// ── Stripe Connect ───────────────────────────────────────────────

export async function getStripeConnectStatus(userId: string): Promise<CreatorStripeConnectInfo> {
  const ref = doc(requireDb(), 'stripe_connect', userId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    return {
      status: 'NOT_CONNECTED',
      payoutsEnabled: false,
      chargesEnabled: false,
      detailsSubmitted: false,
      lastChecked: new Date(),
    };
  }

  const data = snap.data();
  return {
    status: data.status ?? 'NOT_CONNECTED',
    stripeAccountId: data.stripeAccountId,
    payoutsEnabled: data.payoutsEnabled ?? false,
    chargesEnabled: data.chargesEnabled ?? false,
    detailsSubmitted: data.detailsSubmitted ?? false,
    currentlyDue: data.currentlyDue,
    eventuallyDue: data.eventuallyDue,
    lastChecked: data.lastChecked?.toDate?.() ?? new Date(),
  };
}

export async function initiateStripeOnboarding(userId: string): Promise<{ url: string }> {
  const fn = httpsCallable<{ userId: string }, { url: string }>(
    requireFunctions(),
    'creator_initiateStripeOnboarding',
  );
  const result = await fn({ userId });
  return result.data;
}

// ── Creator Payouts ──────────────────────────────────────────────

export async function getPayoutHistory(userId: string): Promise<PayoutHistoryEntry[]> {
  const q = query(
    collection(requireDb(), 'payoutRequests'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(50),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      payoutId: d.id,
      userId: data.userId,
      requestedTokens: data.requestedTokens ?? 0,
      amountFiatNetToUser: data.amountFiatNetToUser ?? 0,
      currency: data.currency ?? 'USD',
      rail: data.rail ?? 'STRIPE',
      status: data.status ?? 'PENDING',
      createdAt: data.createdAt?.toDate?.() ?? new Date(),
      processedAt: data.processedAt?.toDate?.(),
      failureReason: data.failureReason,
    } as PayoutHistoryEntry;
  });
}

export async function requestCreatorPayout(
  userId: string,
  tokens: number,
  currency: string = 'USD',
): Promise<{ success: boolean; payoutId?: string; error?: string }> {
  const fn = httpsCallable<
    { userId: string; tokens: number; currency: string },
    { success: boolean; payoutId?: string; error?: string }
  >(requireFunctions(), 'creator_requestPayout');
  const result = await fn({ userId, tokens, currency });
  return result.data;
}

// ── Admin Ops ────────────────────────────────────────────────────

export async function getAdminOpsView(): Promise<AdminOpsView> {
  const fn = httpsCallable<void, AdminOpsView>(requireFunctions(), 'admin_getOpsView');
  const result = await fn();
  return result.data;
}

export async function getFeatureFlags(): Promise<FeatureFlagSummary[]> {
  const q = query(collection(requireDb(), 'featureFlags'), orderBy('flagName'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      flagName: data.flagName ?? d.id,
      enabled: data.enabled ?? false,
      rolloutPercentage: data.rolloutPercentage,
      allowedRoles: data.allowedRoles,
      expiresAt: data.expiresAt?.toDate?.(),
      lastUpdated: data.lastUpdated?.toDate?.() ?? new Date(),
    } as FeatureFlagSummary;
  });
}

export type TrustSignalCounts = Record<string, number>;

export async function getTrustSignals(): Promise<TrustSignal[]> {
  const q = query(
    collection(requireDb(), 'trustSignals'),
    orderBy('createdAt', 'desc'),
    limit(100),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      signalType: data.signalType,
      severity: data.severity,
      userId: data.userId,
      description: data.description,
      createdAt: data.createdAt?.toDate?.() ?? new Date(),
      resolvedAt: data.resolvedAt?.toDate?.(),
    } as TrustSignal;
  });
}

export async function getTrustSignalCounts(): Promise<TrustSignalCounts> {
  const signals = await getTrustSignals();
  const counts: TrustSignalCounts = {};
  for (const s of signals) {
    counts[s.signalType] = (counts[s.signalType] ?? 0) + 1;
  }
  return counts;
}

export async function getSystemHealth(): Promise<SystemHealthMetric[]> {
  const q = query(collection(requireDb(), 'systemHealth'), orderBy('service'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      service: data.service ?? d.id,
      status: data.status ?? 'HEALTHY',
      latencyMs: data.latencyMs ?? 0,
      errorRate: data.errorRate ?? 0,
      lastChecked: data.lastChecked?.toDate?.() ?? new Date(),
    } as SystemHealthMetric;
  });
}
