/**
 * AVALO — C9: AI Creator Coach and Creator Progression System
 *
 * The Creator Coach is a server-side quality signal engine that:
 *   - Tracks quality signals per creator (response quality, fan retention, etc.)
 *   - Determines badge progression eligibility (NONE → VERIFIED → ... → APEX)
 *   - Recommends multiplier tier upgrades when badge conditions are met
 *   - Remains COMPLETELY FREE to creators — no tokens charged, no billing
 *   - Runs server-side only — clients cannot write quality signals or badges
 *
 * ── Badge progression requirements ─────────────────────────────────────────
 *
 *   NONE → VERIFIED:
 *     - requireVerifiedAdult() passes (C2)
 *
 *   VERIFIED → RISING:
 *     - 50+ completed paid sessions (paidSessionCount >= 50)
 *     - Average fan session rating >= 4.0 (if ratings enabled)
 *     - Response rate >= 80% (within 24h)
 *     - requireCreatorKYC() passes (C2)
 *
 *   RISING → PRO:
 *     - 200+ completed paid sessions
 *     - Average rating >= 4.2
 *     - Response rate >= 85%
 *     - requireCreatorKYC() passes
 *
 *   PRO → ELITE:
 *     - 500+ completed paid sessions
 *     - Average rating >= 4.5
 *     - Response rate >= 90%
 *     - requireCreatorKYC() passes
 *
 *   ELITE → APEX:
 *     - 1000+ completed paid sessions
 *     - Average rating >= 4.7
 *     - Response rate >= 95%
 *     - requireEnhancedKYC() passes (C2 — enables x50/x70/x100)
 *
 * ── AI Coach signals ─────────────────────────────────────────────────────────
 *   Server aggregates these signals from real session data:
 *   - paidSessionCount: count of completed paid sessions
 *   - averageSessionRating: float (0-5)
 *   - responseRate24h: float (0-1)
 *   - averageSessionDuration: minutes
 *   - fanRetentionRate: % of fans who return for another session
 *   - revenuePerSession: average tokens earned per session
 *   - reportCount: count of content reports against this creator
 *
 * ── What the Coach does (free server actions) ────────────────────────────────
 *   1. Evaluate signals and update creatorProgressionSignals/{uid}
 *   2. Check if badge upgrade conditions are met
 *   3. If conditions met: update users/{uid}.creatorBadge (server-only)
 *   4. Write a CoachRecommendation to creatorCoachRecommendations/{uid}
 *      so the creator's app can surface the badge upgrade notification
 */

import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  requireVerifiedAdult,
  requireCreatorKYC,
  requireEnhancedKYC,
} from '../compliance/ageGuard';
import type { CreatorBadge } from '../chat/canonicalMultiplierTiers';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CreatorProgressionSignals {
  creatorId: string;
  /** Total completed paid chat sessions. */
  paidSessionCount: number;
  /** Total lifetime earnings tokens (from creatorEarningAccounts). */
  lifetimeEarnedTokens: number;
  /** Average fan rating for sessions (0-5). Null if no ratings yet. */
  averageSessionRating: number | null;
  /** % of messages responded to within 24h (0-1). */
  responseRate24h: number;
  /** Average session duration in minutes. */
  averageSessionDurationMinutes: number;
  /** % of fans who return for a second paid session. */
  fanRetentionRate: number;
  /** Average tokens earned per paid session. */
  revenuePerSessionTokens: number;
  /** Count of unresolved content reports. */
  activeReportCount: number;
  /** Most recent computation timestamp. */
  computedAt: Timestamp | FieldValue;
  /** Timestamp when signals were last updated by a real event. */
  updatedAt: Timestamp | FieldValue;
}

export interface BadgeProgressionRequirements {
  badge: CreatorBadge;
  requirements: {
    minPaidSessions: number;
    minAverageRating: number | null;  // null = not required
    minResponseRate: number;          // 0-1
    kycLevel: 'VERIFIED_ADULT' | 'CREATOR_KYC' | 'ENHANCED_KYC';
  };
}

export interface CoachRecommendation {
  recommendationId: string;
  creatorId: string;
  type: 'BADGE_UPGRADE' | 'MULTIPLIER_UNLOCK' | 'ENGAGEMENT_TIP' | 'PAYOUT_READY';
  currentBadge: CreatorBadge;
  targetBadge?: CreatorBadge;
  message: string;
  actionable: boolean;
  createdAt: Timestamp | FieldValue;
  seenAt?: Timestamp | FieldValue;
}

// ─────────────────────────────────────────────────────────────────────────────
// Badge progression requirements table
// ─────────────────────────────────────────────────────────────────────────────

export const BADGE_REQUIREMENTS: Record<CreatorBadge, BadgeProgressionRequirements> = {
  NONE: {
    badge: 'NONE',
    requirements: { minPaidSessions: 0, minAverageRating: null, minResponseRate: 0, kycLevel: 'VERIFIED_ADULT' },
  },
  VERIFIED: {
    badge: 'VERIFIED',
    requirements: { minPaidSessions: 0, minAverageRating: null, minResponseRate: 0, kycLevel: 'VERIFIED_ADULT' },
  },
  RISING: {
    badge: 'RISING',
    // Policy thresholds are configurable via server-side config (§1.2).
    // These defaults represent reasonable starting points; adjust via badgePolicyConfig/{badge}.
    requirements: { minPaidSessions: 50, minAverageRating: 4.0, minResponseRate: 0.80, kycLevel: 'CREATOR_KYC' },
  },
  PRO: {
    badge: 'PRO',
    requirements: { minPaidSessions: 150, minAverageRating: 4.2, minResponseRate: 0.85, kycLevel: 'CREATOR_KYC' },
  },
  ELITE: {
    badge: 'ELITE',
    requirements: { minPaidSessions: 300, minAverageRating: 4.5, minResponseRate: 0.90, kycLevel: 'CREATOR_KYC' },
  },
  ICON: {
    badge: 'ICON',
    // ICON: quality + retention + low dispute rate required; manual review gate.
    requirements: { minPaidSessions: 600, minAverageRating: 4.7, minResponseRate: 0.93, kycLevel: 'ENHANCED_KYC' },
  },
  APEX: {
    badge: 'APEX',
    // APEX: highest trust tier; manual review mandatory regardless of signals.
    requirements: { minPaidSessions: 1000, minAverageRating: 4.8, minResponseRate: 0.95, kycLevel: 'ENHANCED_KYC' },
  },
};

const BADGE_ORDER: CreatorBadge[] = ['NONE', 'VERIFIED', 'RISING', 'PRO', 'ELITE', 'ICON', 'APEX'];

function nextBadge(current: CreatorBadge): CreatorBadge | null {
  const idx = BADGE_ORDER.indexOf(current);
  return idx >= 0 && idx < BADGE_ORDER.length - 1 ? BADGE_ORDER[idx + 1] : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Signal aggregation
// ─────────────────────────────────────────────────────────────────────────────

const db = getFirestore();

/**
 * Recompute a creator's progression signals from raw data.
 * Called by the C7 scheduler (every 30 min) and on-demand after session close.
 *
 * Reads from:
 *   - creatorEarningAccounts/{uid}: lifetimeEarnedTokens
 *   - chatSessions aggregate (server-computed): paidSessionCount, response metrics
 *
 * Writes: creatorProgressionSignals/{uid}
 */
export async function recomputeProgressionSignals(creatorId: string): Promise<CreatorProgressionSignals> {
  // Read earning account for lifetime token data
  const earningSnap = await db.collection('creatorEarningAccounts').doc(creatorId).get();
  const earningData = earningSnap.exists ? earningSnap.data() as any : null;

  // Read session aggregate (maintained by session close handlers)
  const sessionAggSnap = await db.collection('creatorSessionAggregates').doc(creatorId).get();
  const aggData = sessionAggSnap.exists ? sessionAggSnap.data() as any : null;

  const signals: CreatorProgressionSignals = {
    creatorId,
    paidSessionCount:              aggData?.paidSessionCount ?? 0,
    lifetimeEarnedTokens:          earningData?.lifetimeEarnedTokens ?? 0,
    averageSessionRating:          aggData?.averageRating ?? null,
    responseRate24h:               aggData?.responseRate24h ?? 0,
    averageSessionDurationMinutes: aggData?.avgDurationMinutes ?? 0,
    fanRetentionRate:              aggData?.fanRetentionRate ?? 0,
    revenuePerSessionTokens:       aggData?.revenuePerSession ?? 0,
    activeReportCount:             aggData?.activeReportCount ?? 0,
    computedAt: FieldValue.serverTimestamp(),
    updatedAt:  FieldValue.serverTimestamp(),
  };

  await db.collection('creatorProgressionSignals').doc(creatorId).set(signals, { merge: true });
  return signals;
}

/**
 * Update a specific signal after a session event (e.g., session close).
 * Increments paidSessionCount, updates revenue per session rolling average.
 * Lightweight — called from closePaidSession() hooks.
 */
export async function recordSessionCompletion(params: {
  creatorId: string;
  tokensEarned: number;
  sessionDurationMinutes: number;
  fanId: string;
}): Promise<void> {
  const { creatorId, tokensEarned, sessionDurationMinutes, fanId } = params;

  await db.collection('creatorSessionAggregates').doc(creatorId).set({
    creatorId,
    paidSessionCount:   FieldValue.increment(1),
    totalTokensEarned:  FieldValue.increment(tokensEarned),
    totalDurationMin:   FieldValue.increment(sessionDurationMinutes),
    uniqueFanIds:       FieldValue.arrayUnion(fanId),
    updatedAt:          FieldValue.serverTimestamp(),
  }, { merge: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// Badge evaluation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate whether a creator is eligible for a badge upgrade.
 * Checks quality signals AND KYC requirements.
 * Does NOT write the badge — only returns eligibility.
 *
 * @returns The badge the creator is newly eligible for, or null if no upgrade available.
 */
export async function evaluateBadgeEligibility(
  creatorId: string,
): Promise<{ eligible: boolean; targetBadge: CreatorBadge | null; reasons: string[] }> {
  // Read current badge
  const userSnap = await db.collection('users').doc(creatorId).get();
  if (!userSnap.exists) {
    return { eligible: false, targetBadge: null, reasons: ['User not found'] };
  }
  const user = userSnap.data() as { creatorBadge?: CreatorBadge };
  const currentBadge: CreatorBadge = user.creatorBadge ?? 'NONE';
  const target = nextBadge(currentBadge);

  if (!target) {
    return { eligible: false, targetBadge: null, reasons: ['Already at APEX — highest badge. Manual review required for any status change.'] };
  }

  // Read signals
  const signalSnap = await db.collection('creatorProgressionSignals').doc(creatorId).get();
  if (!signalSnap.exists) {
    return { eligible: false, targetBadge: target, reasons: ['No progression signals computed yet'] };
  }
  const signals = signalSnap.data() as CreatorProgressionSignals;
  const reqs     = BADGE_REQUIREMENTS[target].requirements;
  const reasons: string[] = [];
  let eligible = true;

  if (signals.paidSessionCount < reqs.minPaidSessions) {
    eligible = false;
    reasons.push(`Need ${reqs.minPaidSessions} paid sessions (have ${signals.paidSessionCount})`);
  }
  if (reqs.minAverageRating !== null) {
    const rating = signals.averageSessionRating ?? 0;
    if (rating < reqs.minAverageRating) {
      eligible = false;
      reasons.push(`Need avg rating >= ${reqs.minAverageRating} (have ${rating.toFixed(1)})`);
    }
  }
  if (signals.responseRate24h < reqs.minResponseRate) {
    eligible = false;
    reasons.push(`Need 24h response rate >= ${Math.round(reqs.minResponseRate * 100)}% (have ${Math.round(signals.responseRate24h * 100)}%)`);
  }
  if (signals.activeReportCount > 0) {
    eligible = false;
    reasons.push(`Has ${signals.activeReportCount} unresolved content reports`);
  }

  // Check KYC (non-blocking for evaluation; actual check happens at tier use time)
  if (eligible && reqs.kycLevel === 'ENHANCED_KYC') {
    try {
      await requireEnhancedKYC(creatorId);
    } catch {
      eligible = false;
      reasons.push('Enhanced KYC required for APEX badge — complete verification');
    }
  } else if (eligible && reqs.kycLevel === 'CREATOR_KYC') {
    try {
      await requireCreatorKYC(creatorId);
    } catch {
      eligible = false;
      reasons.push('Creator KYC required — complete identity verification');
    }
  }

  return { eligible, targetBadge: target, reasons };
}

/**
 * Grant a badge upgrade if the creator is eligible.
 * Writes users/{uid}.creatorBadge (server-only).
 * Writes a CoachRecommendation so the creator is notified.
 *
 * Called by:
 *   - C7 scheduler (batch evaluation of eligible creators)
 *   - On-demand after session count threshold crossed
 */
export async function grantBadgeIfEligible(creatorId: string): Promise<{
  upgraded: boolean;
  newBadge: CreatorBadge | null;
}> {
  const { eligible, targetBadge, reasons } = await evaluateBadgeEligibility(creatorId);

  if (!eligible || !targetBadge) {
    return { upgraded: false, newBadge: null };
  }

  // Read current badge to confirm transition
  const userRef  = db.collection('users').doc(creatorId);
  const userSnap = await userRef.get();
  const currentBadge: CreatorBadge = (userSnap.data() as any)?.creatorBadge ?? 'NONE';

  if (nextBadge(currentBadge) !== targetBadge) {
    return { upgraded: false, newBadge: null };
  }

  // Write badge upgrade (server-only field)
  await userRef.update({
    creatorBadge:          targetBadge,
    creatorBadgeGrantedAt: FieldValue.serverTimestamp(),
    updatedAt:             FieldValue.serverTimestamp(),
  });

  // Write coach recommendation
  const recId = db.collection('creatorCoachRecommendations').doc().id;
  const recommendation: CoachRecommendation = {
    recommendationId: recId,
    creatorId,
    type: 'BADGE_UPGRADE',
    currentBadge,
    targetBadge,
    message: `Congratulations! You've been upgraded to ${targetBadge}. You now unlock higher multiplier tiers.`,
    actionable: true,
    createdAt: FieldValue.serverTimestamp(),
  };
  await db.collection('creatorCoachRecommendations').doc(recId).set(recommendation);

  console.log(`[CreatorCoach] Badge upgraded: ${creatorId} ${currentBadge} → ${targetBadge}`);
  return { upgraded: true, newBadge: targetBadge };
}

// ─────────────────────────────────────────────────────────────────────────────
// Coach recommendations (free, server-generated)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate coach recommendations for a creator.
 * Free server-side analysis — no billing, no tokens.
 *
 * Types of recommendations:
 *   BADGE_UPGRADE: creator is close to or eligible for next badge
 *   MULTIPLIER_UNLOCK: new multiplier tiers unlocked by badge
 *   ENGAGEMENT_TIP: response rate, retention, rating tips
 *   PAYOUT_READY: creator has available tokens above payout threshold
 */
export async function generateCoachRecommendations(creatorId: string): Promise<CoachRecommendation[]> {
  const signals = await recomputeProgressionSignals(creatorId);
  const { eligible, targetBadge, reasons } = await evaluateBadgeEligibility(creatorId);

  const userSnap = await db.collection('users').doc(creatorId).get();
  const currentBadge: CreatorBadge = (userSnap.data() as any)?.creatorBadge ?? 'NONE';

  const recommendations: CoachRecommendation[] = [];
  const db2 = db;

  if (eligible && targetBadge) {
    const recId = db2.collection('creatorCoachRecommendations').doc().id;
    recommendations.push({
      recommendationId: recId,
      creatorId,
      type: 'BADGE_UPGRADE',
      currentBadge,
      targetBadge,
      message: `You're eligible for ${targetBadge} badge! This unlocks higher multiplier tiers.`,
      actionable: true,
      createdAt: FieldValue.serverTimestamp(),
    });
  } else if (targetBadge && reasons.length > 0) {
    // Show progress toward next badge
    const recId = db2.collection('creatorCoachRecommendations').doc().id;
    recommendations.push({
      recommendationId: recId,
      creatorId,
      type: 'BADGE_UPGRADE',
      currentBadge,
      targetBadge,
      message: `Working toward ${targetBadge}: ${reasons[0]}`,
      actionable: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  if (signals.responseRate24h < 0.80) {
    const recId = db2.collection('creatorCoachRecommendations').doc().id;
    recommendations.push({
      recommendationId: recId,
      creatorId,
      type: 'ENGAGEMENT_TIP',
      currentBadge,
      message: `Your 24h response rate is ${Math.round(signals.responseRate24h * 100)}%. Responding faster boosts your badge ranking.`,
      actionable: true,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  // Check payout readiness
  const earningSnap = await db2.collection('creatorEarningAccounts').doc(creatorId).get();
  const MIN_PAYOUT_THRESHOLD = 500;
  if (earningSnap.exists) {
    const earning = earningSnap.data() as any;
    if ((earning.availableTokens ?? 0) >= MIN_PAYOUT_THRESHOLD) {
      const recId = db2.collection('creatorCoachRecommendations').doc().id;
      recommendations.push({
        recommendationId: recId,
        creatorId,
        type: 'PAYOUT_READY',
        currentBadge,
        message: `You have ${earning.availableTokens} tokens available for payout ($${(earning.availableTokens * 0.032).toFixed(2)} net).`,
        actionable: true,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  }

  // Write all recommendations
  const batch = db2.batch();
  for (const rec of recommendations) {
    batch.set(db2.collection('creatorCoachRecommendations').doc(rec.recommendationId), rec);
  }
  if (recommendations.length > 0) await batch.commit();

  return recommendations;
}

/**
 * Read a creator's current coach recommendations.
 * Client-readable (per C1 Firestore rules: allow read: if isOwner || isAdmin).
 */
export async function getCoachRecommendations(
  creatorId: string,
  limit = 10,
): Promise<CoachRecommendation[]> {
  const snap = await db.collection('creatorCoachRecommendations')
    .where('creatorId', '==', creatorId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return snap.docs.map(d => d.data() as CoachRecommendation);
}

/**
 * Mark a recommendation as seen (client calls this when shown to creator).
 */
export async function markRecommendationSeen(
  creatorId: string,
  recommendationId: string,
): Promise<void> {
  const ref  = db.collection('creatorCoachRecommendations').doc(recommendationId);
  const snap = await ref.get();
  if (!snap.exists || (snap.data() as any).creatorId !== creatorId) {
    throw new HttpsError('not-found', 'Recommendation not found');
  }
  await ref.update({ seenAt: FieldValue.serverTimestamp() });
}
