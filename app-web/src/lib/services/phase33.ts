/**
 * Phase 3.3 — Service Layer
 *
 * Client-side service functions for Creator Panel, Admin Ops, and Token Commerce.
 * All functions use Cloud Functions (httpsCallable) or direct Firestore reads.
 *
 * NO direct Firestore writes for financial data — always goes through Cloud Functions.
 */

import { httpsCallable } from 'firebase/functions';
import { doc, getDoc, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db, functions } from '@/lib/firebase';
import { auth } from '@/lib/firebase';
import type {
  CanonicalTokenPack,
  CANONICAL_TOKEN_PACKS,
  CreatorEarningsSummary,
  CreatorAnalyticsDashboard,
  CreatorStripeConnectInfo,
  PayoutHistoryEntry,
  FeatureFlagSummary,
  TrustSignal,
  SystemHealthMetric,
  AdminOpsView,
} from '@/types/phase33.types';

// Re-import the actual constant for runtime use
import { CANONICAL_TOKEN_PACKS as TOKEN_PACKS } from '@/types/phase33.types';

// ============================================================================
// TOKEN COMMERCE
// ============================================================================

/**
 * Get available token packs for purchase.
 */
export function getAvailableTokenPacks(): CanonicalTokenPack[] {
  return Object.values(TOKEN_PACKS);
}

/**
 * Format token pack price for display.
 */
export function formatPackPrice(pack: CanonicalTokenPack, currency: string): string {
  const currencyMap: Record<string, { price: number; symbol: string; locale: string }> = {
    USD: { price: pack.priceUSD, symbol: '$', locale: 'en-US' },
    EUR: { price: pack.priceEUR, symbol: '€', locale: 'de-DE' },
    PLN: { price: pack.pricePLN, symbol: 'zł', locale: 'pl-PL' },
    GBP: { price: pack.priceGBP, symbol: '£', locale: 'en-GB' },
  };

  const info = currencyMap[currency] ?? currencyMap.USD;
  const amount = info.price / 100; // Convert from cents to units

  return new Intl.NumberFormat(info.locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

// ============================================================================
// CREATOR PANEL
// ============================================================================

/**
 * Load creator earnings summary from Firestore.
 */
export async function getCreatorEarningsSummary(userId: string): Promise<CreatorEarningsSummary | null> {
  const ref = doc(db, 'creator_earnings', userId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const d = snap.data();
  return {
    userId,
    totalTokensEarnedAllTime: d.totalTokensEarnedAllTime ?? 0,
    totalTokensEarnedThisMonth: d.totalTokensEarnedThisMonth ?? 0,
    withdrawableTokens: d.withdrawableTokens ?? 0,
    pendingTokens: d.pendingTokens ?? 0,
    availableForPayout: d.availableForPayout ?? 0,
    lastUpdated: d.lastUpdated?.toDate() ?? new Date(),
  };
}

/**
 * Load creator analytics dashboard data.
 */
export async function getCreatorAnalytics(
  userId: string,
  period: 'day' | 'week' | 'month' = 'month'
): Promise<CreatorAnalyticsDashboard | null> {
  const ref = doc(db, 'creator_analytics', userId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const d = snap.data();
  return {
    userId,
    period,
    earningsBySource: d.earningsBySource ?? {
      chat: 0,
      calls: 0,
      contentUnlocks: 0,
      events: 0,
      subscriptions: 0,
      tips: 0,
    },
    totalViews: d.totalViews ?? 0,
    profileViews: d.profileViews ?? 0,
    totalInteractions: d.totalInteractions ?? 0,
    uniqueFans: d.uniqueFans ?? 0,
    freeToPaidRate: d.freeToPaidRate ?? 0,
    repeatFanRate: d.repeatFanRate ?? 0,
    avgSpendPerFan: d.avgSpendPerFan ?? 0,
    dailyEarnings: d.dailyEarnings ?? [],
    lastUpdated: d.lastUpdated?.toDate() ?? new Date(),
  };
}

/**
 * Get Stripe Connect status for a creator.
 */
export async function getStripeConnectStatus(userId: string): Promise<CreatorStripeConnectInfo> {
  const ref = doc(db, 'creator_stripe_connect', userId);
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

  const d = snap.data();
  return {
    status: d.status ?? 'NOT_CONNECTED',
    stripeAccountId: d.stripeAccountId,
    payoutsEnabled: d.payoutsEnabled ?? false,
    chargesEnabled: d.chargesEnabled ?? false,
    detailsSubmitted: d.detailsSubmitted ?? false,
    currentlyDue: d.currentlyDue,
    eventuallyDue: d.eventuallyDue,
    lastChecked: d.lastChecked?.toDate() ?? new Date(),
  };
}

/**
 * Initiate Stripe Connect onboarding for a creator.
 */
export async function initiateStripeOnboarding(userId: string): Promise<string> {
  const fn = httpsCallable<{ userId: string }, { url: string }>(functions, 'createStripeConnectOnboardingLink');
  const result = await fn({ userId });
  return result.data.url;
}

/**
 * Get payout history for a creator.
 */
export async function getPayoutHistory(userId: string): Promise<PayoutHistoryEntry[]> {
  const q = query(
    collection(db, 'payout_requests'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(50)
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
      createdAt: data.createdAt?.toDate() ?? new Date(),
      processedAt: data.processedAt?.toDate(),
      failureReason: data.failureReason,
    };
  });
}

/**
 * Request a creator payout via Cloud Function.
 */
export async function requestCreatorPayout(
  userId: string,
  tokens: number,
  payoutMethod?: string,
): Promise<{ success: boolean; payoutRequestId?: string; error?: string }> {
  const fn = httpsCallable<
    { userId: string; tokens: number; payoutMethod?: string },
    { success: boolean; payoutRequestId?: string; error?: string }
  >(functions, 'requestCreatorPayout');
  const result = await fn({ userId, tokens, payoutMethod });
  return result.data;
}

// ============================================================================
// ADMIN / OPS
// ============================================================================

/**
 * Get full admin ops view.
 */
export async function getAdminOpsView(): Promise<AdminOpsView> {
  const [featureFlags, trustSignals, systemHealth] = await Promise.all([
    getFeatureFlags(),
    getTrustSignals(),
    getSystemHealth(),
  ]);

  return {
    featureFlags,
    trustSignals,
    systemHealth,
    snapshotTime: new Date(),
  };
}

/**
 * Get feature flags.
 */
export async function getFeatureFlags(): Promise<FeatureFlagSummary[]> {
  const q = query(collection(db, 'feature_flags'), orderBy('lastUpdated', 'desc'), limit(100));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      flagName: d.id,
      enabled: data.enabled ?? false,
      rolloutPercentage: data.rolloutPercentage,
      allowedRoles: data.allowedRoles,
      expiresAt: data.expiresAt?.toDate(),
      lastUpdated: data.lastUpdated?.toDate() ?? new Date(),
    };
  });
}

/**
 * Get trust signals.
 */
export async function getTrustSignals(): Promise<TrustSignal[]> {
  const q = query(
    collection(db, 'trust_signals'),
    orderBy('createdAt', 'desc'),
    limit(100)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      signalType: data.signalType ?? 'FRAUD_RISK',
      severity: data.severity ?? 'LOW',
      userId: data.userId ?? '',
      description: data.description ?? '',
      createdAt: data.createdAt?.toDate() ?? new Date(),
      resolvedAt: data.resolvedAt?.toDate(),
    };
  });
}

export interface TrustSignalCounts {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

/**
 * Get trust signal counts by severity.
 */
export async function getTrustSignalCounts(): Promise<TrustSignalCounts> {
  const signals = await getTrustSignals();
  return {
    total: signals.length,
    critical: signals.filter((s) => s.severity === 'CRITICAL').length,
    high: signals.filter((s) => s.severity === 'HIGH').length,
    medium: signals.filter((s) => s.severity === 'MEDIUM').length,
    low: signals.filter((s) => s.severity === 'LOW').length,
  };
}

/**
 * Get system health metrics.
 */
export async function getSystemHealth(): Promise<SystemHealthMetric[]> {
  const q = query(collection(db, 'system_health'), orderBy('lastChecked', 'desc'), limit(20));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      service: d.id,
      status: data.status ?? 'HEALTHY',
      latencyMs: data.latencyMs ?? 0,
      errorRate: data.errorRate ?? 0,
      lastChecked: data.lastChecked?.toDate() ?? new Date(),
    };
  });
}
