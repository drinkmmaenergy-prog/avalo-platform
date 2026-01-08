/**
 * PACK 50 — Royal Club Engine
 * High-Spender Retention & VIP Layer
 * 
 * This is a STATUS + UI/EXPERIENCE layer ONLY.
 * DOES NOT change token prices, message costs, or grant free tokens.
 * All changes are additive and backward-compatible.
 */

import { db, serverTimestamp, increment, admin } from './init';
import type { Timestamp as FirestoreTimestamp, FieldValue } from 'firebase-admin/firestore';

// ============================================================================
// TYPES
// ============================================================================

export type RoyalTier = 'NONE' | 'ROYAL_SILVER' | 'ROYAL_GOLD' | 'ROYAL_PLATINUM';
export type RoyalSource = 'SPEND_BASED' | 'SUBSCRIPTION' | 'MANUAL' | 'NONE';

export interface RoyalMembership {
  userId: string;
  tier: RoyalTier;
  source: RoyalSource;
  spendLast30DaysTokens: number;
  spendLast90DaysTokens: number;
  activatedAt: FirestoreTimestamp | FieldValue | null;
  expiresAt: FirestoreTimestamp | FieldValue | null;
  lastRecomputedAt: FirestoreTimestamp | FieldValue;
  notes?: string;
}

export interface RoyalSpendStats {
  userId: string;
  rollingTokenSpendByDay: Record<string, number>; // "YYYY-MM-DD" -> tokens
  totalTokensLast30Days: number;
  totalTokensLast90Days: number;
  lastUpdatedAt: FirestoreTimestamp | FieldValue;
}

export interface RoyalSubscription {
  userId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  currentTier: 'ROYAL_GOLD' | 'ROYAL_PLATINUM';
  status: 'active' | 'canceled' | 'incomplete' | 'past_due';
  currentPeriodStart: FirestoreTimestamp;
  currentPeriodEnd: FirestoreTimestamp;
  createdAt: FirestoreTimestamp | FieldValue;
  updatedAt: FirestoreTimestamp | FieldValue;
}

export interface RoyalInput {
  spendLast30DaysTokens: number;
  spendLast90DaysTokens: number;
  hasActiveRoyalSubscription: boolean;
}

export interface RoyalDecision {
  tier: RoyalTier;
  source: RoyalSource;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Spend-based tier thresholds (tokens spent in last 30 days)
const TIER_THRESHOLDS = {
  SILVER: 1_000,
  GOLD: 5_000,
  PLATINUM: 15_000,
} as const;

// ============================================================================
// CORE FUNCTION: computeRoyalTier
// ============================================================================

/**
 * Determines Royal tier based on spend and subscription status.
 * This is pure deterministic logic with no side effects.
 * 
 * Priority:
 * 1. Active Royal subscription → at least GOLD, possibly PLATINUM if high spend
 * 2. Spend-based tiers using 30-day spend thresholds
 */
export function computeRoyalTier(input: RoyalInput): RoyalDecision {
  const { spendLast30DaysTokens, spendLast90DaysTokens, hasActiveRoyalSubscription } = input;

  // SUBSCRIPTION OVERRIDE
  if (hasActiveRoyalSubscription) {
    // Subscribers get at least GOLD
    // If they also have platinum-level spend, upgrade to PLATINUM
    if (spendLast30DaysTokens >= TIER_THRESHOLDS.PLATINUM) {
      return {
        tier: 'ROYAL_PLATINUM',
        source: 'SUBSCRIPTION',
      };
    }
    
    return {
      tier: 'ROYAL_GOLD',
      source: 'SUBSCRIPTION',
    };
  }

  // SPEND-BASED TIERS
  if (spendLast30DaysTokens >= TIER_THRESHOLDS.PLATINUM) {
    return {
      tier: 'ROYAL_PLATINUM',
      source: 'SPEND_BASED',
    };
  }

  if (spendLast30DaysTokens >= TIER_THRESHOLDS.GOLD) {
    return {
      tier: 'ROYAL_GOLD',
      source: 'SPEND_BASED',
    };
  }

  if (spendLast30DaysTokens >= TIER_THRESHOLDS.SILVER) {
    return {
      tier: 'ROYAL_SILVER',
      source: 'SPEND_BASED',
    };
  }

  // No tier qualification
  return {
    tier: 'NONE',
    source: 'NONE',
  };
}

// ============================================================================
// SPEND AGGREGATION
// ============================================================================

/**
 * Updates spend stats for a user after token spend event.
 * Should be called whenever tokens are spent (from PACK 39/41/42/48/49).
 */
export async function recordTokenSpend(
  userId: string,
  tokensSpent: number,
  eventDate?: Date
): Promise<void> {
  if (tokensSpent <= 0) return;

  const now = eventDate || new Date();
  const dateKey = formatDateKey(now);

  const statsRef = db.collection('royal_spend_stats').doc(userId);

  try {
    const statsDoc = await statsRef.get();

    if (!statsDoc.exists) {
      // Initialize new stats document
      await statsRef.set({
        userId,
        rollingTokenSpendByDay: {
          [dateKey]: tokensSpent,
        },
        totalTokensLast30Days: tokensSpent,
        totalTokensLast90Days: tokensSpent,
        lastUpdatedAt: serverTimestamp(),
      });
    } else {
      // Update existing document
      const stats = statsDoc.data() as RoyalSpendStats;
      const updatedRolling = { ...stats.rollingTokenSpendByDay };
      
      // Add to today's spend
      updatedRolling[dateKey] = (updatedRolling[dateKey] || 0) + tokensSpent;

      // Recalculate 30-day and 90-day totals
      const { total30, total90 } = calculateRollingTotals(updatedRolling, now);

      await statsRef.update({
        rollingTokenSpendByDay: updatedRolling,
        totalTokensLast30Days: total30,
        totalTokensLast90Days: total90,
        lastUpdatedAt: serverTimestamp(),
      });
    }

    // Trigger membership recomputation (async, non-blocking)
    recomputeRoyalMembership(userId).catch(err => {
      console.error(`Failed to recompute Royal membership for ${userId}:`, err);
    });

  } catch (error) {
    console.error(`Error recording token spend for ${userId}:`, error);
    throw error;
  }
}

/**
 * Calculates rolling 30-day and 90-day totals from daily spend records.
 */
function calculateRollingTotals(
  rollingSpendByDay: Record<string, number>,
  referenceDate: Date
): { total30: number; total90: number } {
  const cutoff30 = new Date(referenceDate);
  cutoff30.setDate(cutoff30.getDate() - 30);

  const cutoff90 = new Date(referenceDate);
  cutoff90.setDate(cutoff90.getDate() - 90);

  let total30 = 0;
  let total90 = 0;

  for (const [dateKey, tokens] of Object.entries(rollingSpendByDay)) {
    const date = parseDateKey(dateKey);
    
    if (date >= cutoff30) {
      total30 += tokens;
    }
    
    if (date >= cutoff90) {
      total90 += tokens;
    }
  }

  return { total30, total90 };
}

/**
 * Cleanup old spend records (older than 90 days) to prevent unbounded growth.
 */
export async function cleanupOldSpendRecords(userId: string): Promise<void> {
  const statsRef = db.collection('royal_spend_stats').doc(userId);
  const statsDoc = await statsRef.get();

  if (!statsDoc.exists) return;

  const stats = statsDoc.data() as RoyalSpendStats;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  const cleanedRolling: Record<string, number> = {};
  
  for (const [dateKey, tokens] of Object.entries(stats.rollingTokenSpendByDay)) {
    const date = parseDateKey(dateKey);
    if (date >= cutoff) {
      cleanedRolling[dateKey] = tokens;
    }
  }

  // Only update if we actually removed something
  if (Object.keys(cleanedRolling).length < Object.keys(stats.rollingTokenSpendByDay).length) {
    await statsRef.update({
      rollingTokenSpendByDay: cleanedRolling,
    });
  }
}

// ============================================================================
// MEMBERSHIP RECOMPUTATION
// ============================================================================

/**
 * Recomputes and updates Royal membership based on current spend and subscription.
 */
export async function recomputeRoyalMembership(userId: string): Promise<RoyalMembership> {
  // Get spend stats
  const statsRef = db.collection('royal_spend_stats').doc(userId);
  const statsDoc = await statsRef.get();

  let spendLast30DaysTokens = 0;
  let spendLast90DaysTokens = 0;

  if (statsDoc.exists) {
    const stats = statsDoc.data() as RoyalSpendStats;
    spendLast30DaysTokens = stats.totalTokensLast30Days || 0;
    spendLast90DaysTokens = stats.totalTokensLast90Days || 0;
  }

  // Check if user has active Royal subscription
  const hasActiveRoyalSubscription = await checkActiveRoyalSubscription(userId);

  // Compute tier
  const decision = computeRoyalTier({
    spendLast30DaysTokens,
    spendLast90DaysTokens,
    hasActiveRoyalSubscription,
  });

  // Update membership document
  const membershipRef = db.collection('royal_memberships').doc(userId);
  const now = serverTimestamp();

  const membership: RoyalMembership = {
    userId,
    tier: decision.tier,
    source: decision.source,
    spendLast30DaysTokens,
    spendLast90DaysTokens,
    activatedAt: decision.tier !== 'NONE' ? now : null,
    expiresAt: null, // For subscription-based tiers, set from subscription data
    lastRecomputedAt: now,
  };

  await membershipRef.set(membership, { merge: true });

  return membership;
}

// ============================================================================
// SUBSCRIPTION MANAGEMENT
// ============================================================================

/**
 * Checks if user has an active Royal subscription.
 */
async function checkActiveRoyalSubscription(userId: string): Promise<boolean> {
  const subRef = db.collection('royal_subscriptions').doc(userId);
  const subDoc = await subRef.get();

  if (!subDoc.exists) return false;

  const sub = subDoc.data() as RoyalSubscription;
  
  // Only 'active' subscriptions count
  return sub.status === 'active';
}

/**
 * Create or update Royal subscription from Stripe webhook.
 */
export async function upsertRoyalSubscription(
  userId: string,
  stripeData: {
    customerId: string;
    subscriptionId: string;
    tier: 'ROYAL_GOLD' | 'ROYAL_PLATINUM';
    status: 'active' | 'canceled' | 'incomplete' | 'past_due';
    currentPeriodStart: number; // Unix timestamp
    currentPeriodEnd: number;
  }
): Promise<void> {
  const subRef = db.collection('royal_subscriptions').doc(userId);
  
  const subscription: RoyalSubscription = {
    userId,
    stripeCustomerId: stripeData.customerId,
    stripeSubscriptionId: stripeData.subscriptionId,
    currentTier: stripeData.tier,
    status: stripeData.status,
    currentPeriodStart: admin.firestore.Timestamp.fromMillis(stripeData.currentPeriodStart * 1000),
    currentPeriodEnd: admin.firestore.Timestamp.fromMillis(stripeData.currentPeriodEnd * 1000),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await subRef.set(subscription, { merge: true });

  // Trigger membership recomputation
  await recomputeRoyalMembership(userId);
}

/**
 * Cancel Royal subscription (from Stripe webhook).
 */
export async function cancelRoyalSubscription(userId: string): Promise<void> {
  const subRef = db.collection('royal_subscriptions').doc(userId);
  
  await subRef.update({
    status: 'canceled',
    updatedAt: serverTimestamp(),
  });

  // Trigger membership recomputation
  await recomputeRoyalMembership(userId);
}

// ============================================================================
// READ APIs
// ============================================================================

/**
 * Get user's Royal membership state.
 */
export async function getRoyalState(userId: string): Promise<RoyalMembership | null> {
  const membershipRef = db.collection('royal_memberships').doc(userId);
  const membershipDoc = await membershipRef.get();

  if (!membershipDoc.exists) {
    // Return default NONE state
    return {
      userId,
      tier: 'NONE',
      source: 'NONE',
      spendLast30DaysTokens: 0,
      spendLast90DaysTokens: 0,
      activatedAt: null,
      expiresAt: null,
      lastRecomputedAt: admin.firestore.Timestamp.now(),
    };
  }

  return membershipDoc.data() as RoyalMembership;
}

/**
 * Get Royal tier preview (how much more spend needed for next tier).
 */
export async function getRoyalPreview(userId: string): Promise<{
  currentTier: RoyalTier;
  nextTier: RoyalTier | null;
  tokensNeededForNextTier: number | null;
}> {
  const membership = await getRoyalState(userId);
  const currentTier = membership?.tier || 'NONE';
  const currentSpend = membership?.spendLast30DaysTokens || 0;

  // Determine next tier and tokens needed
  let nextTier: RoyalTier | null = null;
  let tokensNeeded: number | null = null;

  if (currentTier === 'NONE') {
    nextTier = 'ROYAL_SILVER';
    tokensNeeded = TIER_THRESHOLDS.SILVER - currentSpend;
  } else if (currentTier === 'ROYAL_SILVER') {
    nextTier = 'ROYAL_GOLD';
    tokensNeeded = TIER_THRESHOLDS.GOLD - currentSpend;
  } else if (currentTier === 'ROYAL_GOLD') {
    nextTier = 'ROYAL_PLATINUM';
    tokensNeeded = TIER_THRESHOLDS.PLATINUM - currentSpend;
  }
  // ROYAL_PLATINUM has no next tier

  return {
    currentTier,
    nextTier,
    tokensNeededForNextTier: tokensNeeded && tokensNeeded > 0 ? tokensNeeded : null,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format date as "YYYY-MM-DD" for consistent keys.
 */
function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse "YYYY-MM-DD" back to Date.
 */
function parseDateKey(dateKey: string): Date {
  return new Date(dateKey);
}

/**
 * Scheduled job to recompute all memberships (run daily).
 */
export async function recomputeAllMemberships(batchSize: number = 100): Promise<number> {
  const statsQuery = db.collection('royal_spend_stats').limit(batchSize);
  const snapshot = await statsQuery.get();

  let recomputedCount = 0;

  for (const doc of snapshot.docs) {
    const userId = doc.id;
    try {
      await recomputeRoyalMembership(userId);
      recomputedCount++;
    } catch (error) {
      console.error(`Failed to recompute membership for ${userId}:`, error);
    }
  }

  return recomputedCount;
}

console.log('✅ Royal Engine initialized - PACK 50');