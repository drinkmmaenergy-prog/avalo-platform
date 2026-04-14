import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK 452 — Revenue Coach v1 (Rule-Based)
 *
 * Evaluates per earner daily and generates NON-BLOCKING suggestions.
 *
 * Metrics evaluated:
 * - paidChatConversionRate
 * - avgSessionLength
 * - premiumAcceptanceRate
 * - refundRate
 * - profileTraffic
 * - unansweredChatCount
 *
 * HUSDistics:
 * 1. High traffic + earn_on=false → "Enable earning to monetize your traffic."
 * 2. High conversion + high demand → "You may increase entry threshold."
 * 3. Low conversion + high entry → "Consider lowering entry to increase conversion."
 * 4. Multiplier >= 5 and low acceptance → "High multipliers reduce acceptance rate."
 * 5. Many chats but low revenue → Suggest trying premium offer.
 *
 * All suggestions are NON-BLOCKING.
 *
 * @module pack452-revenue-coach
 * @version 1.0.0
 */

import { db, serverTimestamp, generateId } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  RevenueCoachSuggestion,
  RevenueCoachSuggestionType,
  RevenueCoachMetrics,
  ENTRY_THRESHOLD_LIMITS,
} from './types/pack452-monetization-vnext.types';

// ============================================================================
// HUSDISTIC THRESHOLDS
// ============================================================================

const THRESHOLDS = {
  /** Profile traffic considered "high" (views per day) */
  HIGH_TRAFFIC: 50,
  /** Conversion rate considered "high" */
  HIGH_CONVERSION: 0.4,
  /** Conversion rate considered "low" */
  LOW_CONVERSION: 0.15,
  /** Entry threshold considered "high" relative to default */
  HIGH_ENTRY_MULTIPLIER: 3, // 3x the default (300 tokens)
  /** Premium acceptance rate considered "low" */
  LOW_PREMIUM_ACCEPTANCE: 0.2,
  /** Multiplier threshold for warning */
  HIGH_MULTIPLIER_WARNING: 5,
  /** Minimum chats to consider "many chats" */
  MANY_CHATS: 10,
  /** Revenue per chat considered "low" */
  LOW_REVENUE_PER_CHAT: 5,
  /** Minimum data points before generating suggestions */
  MIN_DATA_DAYS: 3,
} as const;

// ============================================================================
// METRICS COLLECTION
// ============================================================================

/**
 * Collect revenue coach metrics for an earner.
 * Aggregates data from the last 30 days.
 *
 * @param userId - The earner's user ID
 * @returns Collected metrics
 */
export async function collectRevenueCoachMetrics(
  userId: string
): Promise<RevenueCoachMetrics> {
  const thirtyDaysAgo = Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Get user profile
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data() || {};
  const earnOnEnabled = userData.earnOnChat === true;
  const currentEntryThreshold = userData.chatEntryTokens || ENTRY_THRESHOLD_LIMITS.DEFAULT;

  // Get chat stats (last 30 days)
  const chatsAsEarnerSnap = await db.collection('chats')
    .where('roles.earnerId', '==', userId)
    .where('createdAt', '>=', thirtyDaysAgo)
    .get();

  const totalChats = chatsAsEarnerSnap.size;
  let paidChats = 0;
  let totalSessionLength = 0;
  let totalRevenue = 0;

  for (const doc of chatsAsEarnerSnap.docs) {
    const chat = doc.data();
    if (chat.mode === 'PAID' || chat.state === 'PAID_ACTIVE') {
      paidChats++;
    }
    const consumed = chat.billing?.totalConsumed || 0;
    totalRevenue += consumed;

    // Estimate session length from message count
    const messageCount = chat.billing?.messageCount || 0;
    totalSessionLength += messageCount;
  }

  const paidChatConversionRate = totalChats > 0 ? paidChats / totalChats : 0;
  const avgSessionLength = totalChats > 0 ? totalSessionLength / totalChats : 0;

  // Get premium offer stats
  const premiumOffersSnap = await db.collection('premiumOffers')
    .where('earnerId', '==', userId)
    .where('createdAt', '>=', thirtyDaysAgo)
    .get();

  let premiumOffersTotal = 0;
  let premiumOffersAccepted = 0;
  let totalMultiplier = 0;

  for (const doc of premiumOffersSnap.docs) {
    const offer = doc.data();
    premiumOffersTotal++;
    totalMultiplier += offer.multiplier || 1;
    if (offer.status === 'ACCEPTED') {
      premiumOffersAccepted++;
    }
  }

  const premiumAcceptanceRate = premiumOffersTotal > 0
    ? premiumOffersAccepted / premiumOffersTotal
    : 0;
  const avgMultiplier = premiumOffersTotal > 0
    ? totalMultiplier / premiumOffersTotal
    : 0;

  // Get refund stats
  const refundsSnap = await db.collection('walletTransactions')
    .where('metadata.earnerId', '==', userId)
    .where('type', '==', 'REFUND')
    .where('timestamp', '>=', thirtyDaysAgo)
    .get();

  const refundRate = totalChats > 0 ? refundsSnap.size / totalChats : 0;

  // Get profile traffic (views)
  const profileViewsSnap = await db.collection('profileViews')
    .where('viewedUserId', '==', userId)
    .where('viewedAt', '>=', thirtyDaysAgo)
    .get();

  const profileTraffic = profileViewsSnap.size;

  // Get unanswered chats
  const unansweredSnap = await db.collection('chats')
    .where('roles.earnerId', '==', userId)
    .where('state', '==', 'AWAITING_DEPOSIT')
    .get();

  const unansweredChatCount = unansweredSnap.size;

  return {
    paidChatConversionRate,
    avgSessionLength,
    premiumAcceptanceRate,
    refundRate,
    profileTraffic,
    unansweredChatCount,
    currentEntryThreshold,
    earnOnEnabled,
    avgMultiplier,
    totalRevenueLast30d: totalRevenue,
    totalChatsLast30d: totalChats,
  };
}

// ============================================================================
// HUSDISTIC ENGINE
// ============================================================================

/**
 * Evaluate metrics and generate suggestions.
 * All suggestions are NON-BLOCKING.
 *
 * @param userId - The earner's user ID
 * @param metrics - Collected metrics
 * @returns Array of suggestions to create
 */
export function evaluateHUSDistics(
  userId: string,
  metrics: RevenueCoachMetrics
): Array<{
  type: RevenueCoachSuggestionType;
  message: string;
  priority: 'low' | 'medium' | 'high';
}> {
  const suggestions: Array<{
    type: RevenueCoachSuggestionType;
    message: string;
    priority: 'low' | 'medium' | 'high';
  }> = [];

  // ---- HUSDistic 1: High traffic + earn_on=false ----
  if (metrics.profileTraffic >= THRESHOLDS.HIGH_TRAFFIC && !metrics.earnOnEnabled) {
    suggestions.push({
      type: 'ENABLE_EARNING',
      message: 'Enable earning to monetize your traffic. You have high profile visibility — turning on earning could generate significant income.',
      priority: 'high',
    });
  }

  // ---- HUSDistic 2: High conversion + high demand ----
  if (
    metrics.paidChatConversionRate >= THRESHOLDS.HIGH_CONVERSION &&
    metrics.totalChatsLast30d >= THRESHOLDS.MANY_CHATS &&
    metrics.earnOnEnabled
  ) {
    suggestions.push({
      type: 'INCREASE_ENTRY_THRESHOLD',
      message: `Your conversion rate is ${Math.round(metrics.paidChatConversionRate * 100)}% with strong demand. You may increase your entry threshold to earn more per chat.`,
      priority: 'medium',
    });
  }

  // ---- HUSDistic 3: Low conversion + high entry ----
  if (
    metrics.paidChatConversionRate < THRESHOLDS.LOW_CONVERSION &&
    metrics.currentEntryThreshold > ENTRY_THRESHOLD_LIMITS.DEFAULT * THRESHOLDS.HIGH_ENTRY_MULTIPLIER &&
    metrics.totalChatsLast30d >= THRESHOLDS.MIN_DATA_DAYS &&
    metrics.earnOnEnabled
  ) {
    suggestions.push({
      type: 'DECREASE_ENTRY_THRESHOLD',
      message: `Your conversion rate is ${Math.round(metrics.paidChatConversionRate * 100)}% with an entry threshold of ${metrics.currentEntryThreshold} tokens. Consider lowering your entry to increase conversion.`,
      priority: 'high',
    });
  }

  // ---- HUSDistic 4: High multiplier + low acceptance ----
  if (
    metrics.avgMultiplier >= THRESHOLDS.HIGH_MULTIPLIER_WARNING &&
    metrics.premiumAcceptanceRate < THRESHOLDS.LOW_PREMIUM_ACCEPTANCE &&
    metrics.earnOnEnabled
  ) {
    suggestions.push({
      type: 'HIGH_MULTIPLIER_WARNING',
      message: `Your average premium multiplier is ${metrics.avgMultiplier.toFixed(1)}x but acceptance rate is only ${Math.round(metrics.premiumAcceptanceRate * 100)}%. High multipliers tend to reduce acceptance rates.`,
      priority: 'medium',
    });
  }

  // ---- HUSDistic 5: Many chats but low revenue ----
  if (
    metrics.totalChatsLast30d >= THRESHOLDS.MANY_CHATS &&
    metrics.totalRevenueLast30d / Math.max(metrics.totalChatsLast30d, 1) < THRESHOLDS.LOW_REVENUE_PER_CHAT &&
    metrics.earnOnEnabled
  ) {
    suggestions.push({
      type: 'TRY_PREMIUM_OFFER',
      message: 'You have many active chats but low average revenue per chat. Try creating premium offers to increase your earnings from engaged supporters.',
      priority: 'medium',
    });
  }

  return suggestions;
}

// ============================================================================
// SUGGESTION MANAGEMENT
// ============================================================================

/**
 * Generate and store revenue coach suggestions for an earner.
 * Called by the daily scheduled job.
 *
 * @param userId - The earner's user ID
 * @returns Number of new suggestions created
 */
export async function generateSuggestionsForUser(userId: string): Promise<number> {
  // Collect metrics
  const metrics = await collectRevenueCoachMetrics(userId);

  // Evaluate hUSDistics
  const newSuggestions = evaluateHUSDistics(userId, metrics);

  if (newSuggestions.length === 0) {
    return 0;
  }

  // Check for existing undismissed suggestions of the same type
  const existingSuggestionsSnap = await db
    .collection('users')
    .doc(userId)
    .collection('revenueCoachSuggestions')
    .where('dismissed', '==', false)
    .get();

  const existingTypes = new Set(
    existingSuggestionsSnap.docs.map(doc => doc.data().type)
  );

  // Only create suggestions that don't already exist (undismissed)
  let created = 0;

  for (const suggestion of newSuggestions) {
    if (existingTypes.has(suggestion.type)) {
      continue; // Skip duplicate suggestion type
    }

    const suggestionId = generateId();
    const doc: RevenueCoachSuggestion = {
      suggestionId,
      userId,
      type: suggestion.type,
      message: suggestion.message,
      priority: suggestion.priority,
      dismissed: false,
      createdAt: serverTimestamp() as any,
      metricsSnapshot: metrics,
    };

    await db
      .collection('users')
      .doc(userId)
      .collection('revenueCoachSuggestions')
      .doc(suggestionId)
      .set(doc);

    created++;
  }

  return created;
}

/**
 * Get active (undismissed) revenue coach suggestions for a user.
 *
 * @param userId - The user's ID
 * @returns Array of active suggestions
 */
export async function getActiveSuggestions(
  userId: string
): Promise<RevenueCoachSuggestion[]> {
  const snap = await db
    .collection('users')
    .doc(userId)
    .collection('revenueCoachSuggestions')
    .where('dismissed', '==', false)
    .orderBy('createdAt', 'desc')
    .limit(10)
    .get();

  return snap.docs.map(doc => doc.data() as RevenueCoachSuggestion);
}

/**
 * Dismiss a revenue coach suggestion.
 *
 * @param userId - The user's ID
 * @param suggestionId - The suggestion to dismiss
 */
export async function dismissSuggestion(
  userId: string,
  suggestionId: string
): Promise<void> {
  await db
    .collection('users')
    .doc(userId)
    .collection('revenueCoachSuggestions')
    .doc(suggestionId)
    .update({
      dismissed: true,
      dismissedAt: serverTimestamp(),
    });
}

// ============================================================================
// BATCH PROCESSING (for scheduled job)
// ============================================================================

/**
 * Run revenue coach evaluation for all earn_on users.
 * Called by the daily scheduled job.
 *
 * @returns Summary of processing
 */
export async function runRevenueCoachBatch(): Promise<{
  usersProcessed: number;
  suggestionsCreated: number;
  errors: number;
}> {
  // Get all users with earn_on enabled
  const earnOnUsersSnap = await db.collection('users')
    .where('earnOnChat', '==', true)
    .get();

  let usersProcessed = 0;
  let suggestionsCreated = 0;
  let errors = 0;

  for (const userDoc of earnOnUsersSnap.docs) {
    try {
      const created = await generateSuggestionsForUser(userDoc.id);
      suggestionsCreated += created;
      usersProcessed++;
    } catch (error) {
      console.error(`Revenue coach error for user ${userDoc.id}:`, error);
      errors++;
    }
  }

  // Also check users with high traffic who don't have earn_on
  // (for the "enable earning" suggestion)
  const thirtyDaysAgo = Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const highTrafficUsersSnap = await db.collection('users')
    .where('earnOnChat', '==', false)
    .get();

  for (const userDoc of highTrafficUsersSnap.docs) {
    try {
      // Quick check: does this user have high profile traffic?
      const viewsSnap = await db.collection('profileViews')
        .where('viewedUserId', '==', userDoc.id)
        .where('viewedAt', '>=', thirtyDaysAgo)
        .limit(THRESHOLDS.HIGH_TRAFFIC)
        .get();

      if (viewsSnap.size >= THRESHOLDS.HIGH_TRAFFIC) {
        const created = await generateSuggestionsForUser(userDoc.id);
        suggestionsCreated += created;
        usersProcessed++;
      }
    } catch (error) {
      console.error(`Revenue coach error for non-earner ${userDoc.id}:`, error);
      errors++;
    }
  }

  return { usersProcessed, suggestionsCreated, errors };
}

























