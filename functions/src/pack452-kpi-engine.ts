import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK 452 — Premium KPI Engine
 *
 * Tracks premium-specific KPIs:
 * - premiumOfferCount
 * - premiumAcceptanceRate
 * - exclusiveSessionCount
 * - avgMultiplier
 * - avgEntryThreshold
 * - premiumRevenueShare
 * - exclusiveRevenueShare
 *
 * @module pack452-kpi-engine
 * @version 1.0.0
 */

import { db, serverTimestamp } from './init';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { PremiumKPIMetrics } from './types/pack452-monetization-vnext.types';

// ============================================================================
// KPI COLLECTION
// ============================================================================

/**
 * Compute premium KPI metrics for a given time period.
 *
 * @param periodStart - Start of the period
 * @param periodEnd - End of the period
 * @returns Computed KPI metrics
 */
export async function computePremiumKPIs(
  periodStart: Timestamp,
  periodEnd: Timestamp
): Promise<PremiumKPIMetrics> {
  // Get all premium offers in the period
  const offersSnap = await db.collection('premiumOffers')
    .where('createdAt', '>=', periodStart)
    .where('createdAt', '<=', periodEnd)
    .get();

  let premiumOfferCount = 0;
  let acceptedCount = 0;
  let exclusiveCount = 0;
  let totalMultiplier = 0;

  for (const doc of offersSnap.docs) {
    const offer = doc.data();
    premiumOfferCount++;
    totalMultiplier += offer.multiplier || 1;

    if (offer.status === 'ACCEPTED') {
      acceptedCount++;
      if (offer.exclusive) {
        exclusiveCount++;
      }
    }
  }

  const premiumAcceptanceRate = premiumOfferCount > 0
    ? acceptedCount / premiumOfferCount
    : 0;

  const avgMultiplier = premiumOfferCount > 0
    ? totalMultiplier / premiumOfferCount
    : 0;

  // Get exclusive session logs
  const exclusiveLogsSnap = await db.collection('exclusiveSessionLogs')
    .where('activatedAt', '>=', periodStart)
    .where('activatedAt', '<=', periodEnd)
    .get();

  const exclusiveSessionCount = exclusiveLogsSnap.size;

  // Get average entry threshold from earners
  const earnersSnap = await db.collection('users')
    .where('earnOnChat', '==', true)
    .get();

  let totalEntryThreshold = 0;
  let earnerCount = 0;

  for (const doc of earnersSnap.docs) {
    const data = doc.data();
    totalEntryThreshold += data.chatEntryTokens || 100;
    earnerCount++;
  }

  const avgEntryThreshold = earnerCount > 0
    ? totalEntryThreshold / earnerCount
    : 100;

  // Get revenue breakdown from ledger
  const ledgerSnap = await db.collection('earningsLedger')
    .where('createdAt', '>=', periodStart)
    .where('createdAt', '<=', periodEnd)
    .get();

  let totalRevenue = 0;
  let premiumRevenue = 0;
  let exclusiveRevenue = 0;

  for (const doc of ledgerSnap.docs) {
    const entry = doc.data();
    const burned = entry.tokensBurned || 0;
    totalRevenue += burned;

    if (entry.pricingMode === 'premium') {
      premiumRevenue += burned;
      if (entry.exclusiveFlag) {
        exclusiveRevenue += burned;
      }
    }
  }

  const premiumRevenueShare = totalRevenue > 0
    ? premiumRevenue / totalRevenue
    : 0;

  const exclusiveRevenueShare = totalRevenue > 0
    ? exclusiveRevenue / totalRevenue
    : 0;

  return {
    premiumOfferCount,
    premiumAcceptanceRate,
    exclusiveSessionCount,
    avgMultiplier,
    avgEntryThreshold,
    premiumRevenueShare,
    exclusiveRevenueShare,
  };
}

/**
 * Store a KPI snapshot for a given period.
 *
 * @param periodId - Identifier for the period (e.g., "2026-02-07")
 * @param metrics - Computed KPI metrics
 */
export async function storePremiumKPISnapshot(
  periodId: string,
  metrics: PremiumKPIMetrics
): Promise<void> {
  await db.collection('premiumKPISnapshots').doc(periodId).set({
    periodId,
    ...metrics,
    computedAt: serverTimestamp(),
  });
}

/**
 * Run daily KPI computation and storage.
 * Called by the scheduled job.
 *
 * @returns The computed metrics
 */
export async function runDailyPremiumKPIs(): Promise<PremiumKPIMetrics> {
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const periodStart = Timestamp.fromDate(dayStart);
  const periodEnd = Timestamp.fromDate(dayEnd);

  const metrics = await computePremiumKPIs(periodStart, periodEnd);

  const periodId = dayStart.toISOString().split('T')[0]; // "2026-02-07"
  await storePremiumKPISnapshot(periodId, metrics);

  // Also update the rolling aggregate
  await db.collection('premiumKPISnapshots').doc('latest').set({
    periodId: 'latest',
    ...metrics,
    computedAt: serverTimestamp(),
  });

  return metrics;
}

// ============================================================================
// KPI TRACKING HELPERS (called inline during operations)
// ============================================================================

/**
 * Increment premium offer count in real-time KPI counter.
 * Called when a new premium offer is created.
 */
export async function trackPremiumOfferCreated(): Promise<void> {
  const counterRef = db.collection('premiumKPICounters').doc('realtime');
  await counterRef.set({
    premiumOfferCount: FieldValue.increment(1),
    lastUpdated: serverTimestamp(),
  }, { merge: true });
}

/**
 * Track premium offer acceptance in real-time KPI counter.
 * Called when a premium offer is accepted.
 *
 * @param exclusive - Whether the offer includes exclusive mode
 * @param multiplier - The offer multiplier
 */
export async function trackPremiumOfferAccepted(
  exclusive: boolean,
  multiplier: number
): Promise<void> {
  const counterRef = db.collection('premiumKPICounters').doc('realtime');
  const updates: Record<string, any> = {
    premiumAcceptedCount: FieldValue.increment(1),
    totalMultiplierSum: FieldValue.increment(multiplier),
    lastUpdated: serverTimestamp(),
  };

  if (exclusive) {
    updates.exclusiveSessionCount = FieldValue.increment(1);
  }

  await counterRef.set(updates, { merge: true });
}

/**
 * Track premium revenue in real-time KPI counter.
 * Called during premium burn execution.
 *
 * @param tokensBurned - Total tokens burned
 * @param exclusive - Whether exclusive mode was active
 */
export async function trackPremiumRevenue(
  tokensBurned: number,
  exclusive: boolean
): Promise<void> {
  const counterRef = db.collection('premiumKPICounters').doc('realtime');
  const updates: Record<string, any> = {
    premiumRevenue: FieldValue.increment(tokensBurned),
    lastUpdated: serverTimestamp(),
  };

  if (exclusive) {
    updates.exclusiveRevenue = FieldValue.increment(tokensBurned);
  }

  await counterRef.set(updates, { merge: true });
}

























