/**
 * PACK 401 — Fraud Detection via Behavior & Support Correlation
 * Correlation Service
 *
 * Aggregates data from wallet, support, safety, and retention systems
 * to compute comprehensive fraud risk profiles.
 */

import { db, serverTimestamp } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import {
  FraudBehaviorSignals,
  FraudRiskLevel,
  FraudProfileInput,
  FraudProfileComputation,
} from './pack401-fraud-correlation-types';

/**
 * Clamp value between 0 and 1
 */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Normalize count to 0-1 based on max threshold
 */
function normalizeCount(count: number, maxThreshold: number): number {
  return clamp01(count / maxThreshold);
}

/**
 * Compute manyPaymentsFewMessagesScore
 * High if many token spends but very few actual messages/calls
 */
function computePaymentMessageRatio(input: FraudProfileInput): number {
  const totalInteractions = input.totalMessages + input.totalCalls;
  
  // If no payments, score is 0
  if (input.totalTokenSpends === 0) {
    return 0;
  }
  
  // If high payments but low interactions, suspicious
  if (input.totalTokenSpends >= 1000 && totalInteractions < 10) {
    return 1.0;
  }
  
  // Calculate ratio: higher payments with lower interactions = higher score
  const ratio = input.totalTokenSpends / Math.max(1, totalInteractions);
  
  // Normalize: ratio > 100 is very suspicious
  return clamp01(ratio / 100);
}

/**
 * Compute multiRegionLoginScore
 * High if last N logins come from radically different regions in short time
 */
function computeMultiRegionScore(input: FraudProfileInput): number {
  if (input.loginLocations.length < 2) {
    return 0;
  }
  
  const recentLogins = input.loginLocations
    .sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis())
    .slice(0, 10); // Last 10 logins
  
  if (recentLogins.length < 2) {
    return 0;
  }
  
  // Check for different countries
  const uniqueCountries = new Set(recentLogins.map(l => l.country));
  
  // If 3+ different countries in recent logins, suspicious
  if (uniqueCountries.size >= 3) {
    // Check time span
    const timeSpan = recentLogins[0].timestamp.toMillis() - 
                     recentLogins[recentLogins.length - 1].timestamp.toMillis();
    const hoursDiff = timeSpan / (1000 * 60 * 60);
    
    // Different countries in < 24 hours is very suspicious
    if (hoursDiff < 24) {
      return 1.0;
    }
    
    // Different countries in < 7 days is suspicious
    if (hoursDiff < 24 * 7) {
      return 0.7;
    }
    
    return 0.3;
  }
  
  // 2 different countries
  if (uniqueCountries.size === 2) {
    const timeSpan = recentLogins[0].timestamp.toMillis() - 
                     recentLogins[recentLogins.length - 1].timestamp.toMillis();
    const hoursDiff = timeSpan / (1000 * 60 * 60);
    
    // 2 countries in < 12 hours is suspicious
    if (hoursDiff < 12) {
      return 0.8;
    }
  }
  
  return 0;
}

/**
 * Compute deviceInconsistencyScore
 * High if many device IDs in short time
 */
function computeDeviceInconsistencyScore(input: FraudProfileInput): number {
  if (input.deviceIds.length <= 1) {
    return 0;
  }
  
  const uniqueDevices = new Set(input.deviceIds);
  
  // Check recent device switches
  if (input.deviceIdTimestamps.length >= 2) {
    const recentDevices = input.deviceIdTimestamps
      .map((ts, idx) => ({ ts, deviceId: input.deviceIds[idx] }))
      .sort((a, b) => b.ts.toMillis() - a.ts.toMillis())
      .slice(0, 10);
    
    const recentUniqueDevices = new Set(recentDevices.map(d => d.deviceId));
    
    // 5+ different devices in recent activity
    if (recentUniqueDevices.size >= 5) {
      return 1.0;
    }
    
    // 3-4 different devices
    if (recentUniqueDevices.size >= 3) {
      return 0.6;
    }
  }
  
  // Total unique devices > 5 is somewhat suspicious
  if (uniqueDevices.size > 5) {
    return 0.4;
  }
  
  return 0;
}

/**
 * Map aggregate score to risk level
 */
function scoreToRiskLevel(score: number): FraudRiskLevel {
  if (score < 0.3) return 'NORMAL';
  if (score < 0.5) return 'WATCHLIST';
  if (score < 0.75) return 'HIGH_RISK';
  return 'BANNED_RECOMMENDED';
}

/**
 * Compute fraud profile from input data
 */
function computeFraudProfile(input: FraudProfileInput): FraudProfileComputation {
  // Normalize basic metrics
  const chargebacksNormalized = normalizeCount(input.chargebackCount, 3);
  const fraudTicketsNormalized = normalizeCount(input.supportFraudTicketsLast30d, 5);
  
  // Compute behavior scores
  const manyPaymentsFewMessagesScore = computePaymentMessageRatio(input);
  const multiRegionLoginScore = computeMultiRegionScore(input);
  const deviceInconsistencyScore = computeDeviceInconsistencyScore(input);
  
  // Weighted aggregate score
  const aggregateScore = clamp01(
    0.3 * chargebacksNormalized +
    0.2 * fraudTicketsNormalized +
    0.2 * manyPaymentsFewMessagesScore +
    0.15 * multiRegionLoginScore +
    0.15 * deviceInconsistencyScore
  );
  
  const riskLevel = scoreToRiskLevel(aggregateScore);
  
  // Build notes
  const notes: string[] = [];
  if (chargebacksNormalized > 0) {
    notes.push(`${input.chargebackCount} chargeback(s)`);
  }
  if (fraudTicketsNormalized > 0) {
    notes.push(`${input.supportFraudTicketsLast30d} fraud ticket(s) in 30d`);
  }
  if (manyPaymentsFewMessagesScore > 0.5) {
    notes.push('High payment-to-interaction ratio');
  }
  if (multiRegionLoginScore > 0.5) {
    notes.push('Multi-region login pattern detected');
  }
  if (deviceInconsistencyScore > 0.5) {
    notes.push('Multiple device usage detected');
  }
  
  const signals: FraudBehaviorSignals = {
    userId: input.userId,
    lastUpdatedAt: Timestamp.now(),
    chargebackCount: input.chargebackCount,
    refundRequestCount: input.refundRequestCount,
    cancelledBookingsLast30d: input.cancelledBookingsLast30d,
    supportFraudTicketsLast30d: input.supportFraudTicketsLast30d,
    safetyFlagsLast30d: input.safetyFlagsLast30d,
    manyPaymentsFewMessagesScore,
    multiRegionLoginScore,
    deviceInconsistencyScore,
    aggregateScore,
    riskLevel,
    notes: notes.length > 0 ? notes.join('; ') : undefined,
  };
  
  return {
    signals,
    computationDetails: {
      chargebacksNormalized,
      fraudTicketsNormalized,
      manyPaymentsFewMessagesScore,
      multiRegionLoginScore,
      deviceInconsistencyScore,
    },
  };
}

/**
 * Gather input data for a user from various collections
 */
async function gatherUserData(userId: string): Promise<FraudProfileInput> {
  const now = Timestamp.now();
  const thirtyDaysAgo = Timestamp.fromMillis(now.toMillis() - 30 * 24 * 60 * 60 * 1000);
  
  // Initialize default values
  const input: FraudProfileInput = {
    userId,
    chargebackCount: 0,
    refundRequestCount: 0,
    cancelledBookingsLast30d: 0,
    supportFraudTicketsLast30d: 0,
    safetyFlagsLast30d: 0,
    totalTokenSpends: 0,
    totalMessages: 0,
    totalCalls: 0,
    loginLocations: [],
    deviceIds: [],
    deviceIdTimestamps: [],
  };
  
  try {
    // Gather wallet data - chargebacks
    const walletSnapshot = await db.collection('wallets').doc(userId).get();
    if (walletSnapshot.exists) {
      const walletData = walletSnapshot.data();
      input.chargebackCount = walletData?.chargebackCount || 0;
    }
    
    // Gather refund requests from last 30 days
    const refundsSnapshot = await db.collection('refundRequests')
      .where('userId', '==', userId)
      .where('createdAt', '>=', thirtyDaysAgo)
      .get();
    input.refundRequestCount = refundsSnapshot.size;
    
    // Gather cancelled bookings (if applicable - from PACK 218)
    const cancelledBookingsSnapshot = await db.collection('calendarEvents')
      .where('userId', '==', userId)
      .where('status', '==', 'CANCELLED')
      .where('updatedAt', '>=', thirtyDaysAgo)
      .get();
    input.cancelledBookingsLast30d = cancelledBookingsSnapshot.size;
    
    // Gather support fraud tickets from last 30 days (PACK 302)
    const fraudTicketsSnapshot = await db.collection('supportTickets')
      .where('userId', '==', userId)
      .where('createdAt', '>=', thirtyDaysAgo)
      .get();
    
    let fraudTicketCount = 0;
    fraudTicketsSnapshot.forEach(doc => {
      const ticket = doc.data();
      const category = ticket.category?.toLowerCase() || '';
      const type = ticket.type?.toLowerCase() || '';
      
      if (category.includes('fraud') || 
          category.includes('chargeback') || 
          category.includes('scam') ||
          type.includes('fraud') ||
          type.includes('payment_dispute')) {
        fraudTicketCount++;
      }
    });
    input.supportFraudTicketsLast30d = fraudTicketCount;
    
    // Gather safety flags from last 30 days (PACK 267-268, 190)
    const safetyFlagsSnapshot = await db.collection('safetyReports')
      .where('reportedUserId', '==', userId)
      .where('createdAt', '>=', thirtyDaysAgo)
      .where('severity', 'in', ['HIGH', 'CRITICAL'])
      .get();
    input.safetyFlagsLast30d = safetyFlagsSnapshot.size;
    
    // Gather token spends (from wallet transactions)
    const tokensSnapshot = await db.collection('wallets')
      .doc(userId)
      .collection('transactions')
      .where('type', '==', 'SPEND')
      .get();
    
    let totalSpends = 0;
    tokensSnapshot.forEach(doc => {
      const tx = doc.data();
      totalSpends += Math.abs(tx.amount || 0);
    });
    input.totalTokenSpends = totalSpends;
    
    // Gather message/call counts (from retention engine or analytics)
    const analyticsSnapshot = await db.collection('userAnalytics').doc(userId).get();
    if (analyticsSnapshot.exists) {
      const analytics = analyticsSnapshot.data();
      input.totalMessages = analytics?.totalMessagesSent || 0;
      input.totalCalls = analytics?.totalCallsMade || 0;
    }
    
    // Gather login locations (from user sessions or login history)
    const loginHistorySnapshot = await db.collection('userSessions')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();
    
    loginHistorySnapshot.forEach(doc => {
      const session = doc.data();
      if (session.location?.country) {
        input.loginLocations.push({
          timestamp: session.createdAt,
          country: session.location.country,
          region: session.location.region,
        });
      }
    });
    
    // Gather device IDs (from user sessions or device registry)
    const deviceSnapshot = await db.collection('userDevices')
      .where('userId', '==', userId)
      .orderBy('lastUsedAt', 'desc')
      .get();
    
    deviceSnapshot.forEach(doc => {
      const device = doc.data();
      input.deviceIds.push(device.deviceId);
      input.deviceIdTimestamps.push(device.lastUsedAt);
    });
    
  } catch (error) {
    logger.error(`[PACK401] Error gathering data for user ${userId}:`, error);
    // Continue with partial data
  }
  
  return input;
}

/**
 * Recompute fraud profile for a single user
 * Main export function
 */
export async function recomputeFraudProfileForUser(userId: string): Promise<void> {
  try {
    logger.info(`[PACK401] Recomputing fraud profile for user: ${userId}`);
    
    // Gather data
    const input = await gatherUserData(userId);
    
    // Compute profile
    const computation = computeFraudProfile(input);
    
    // Upsert to Firestore
    await db.collection('fraudBehaviorProfiles').doc(userId).set(
      computation.signals,
      { merge: true }
    );
    
    logger.info(`[PACK401] Updated fraud profile for ${userId}: ${computation.signals.riskLevel} (score: ${computation.signals.aggregateScore.toFixed(3)})`);
    
    // Log high-risk cases
    if (computation.signals.riskLevel === 'HIGH_RISK' || 
        computation.signals.riskLevel === 'BANNED_RECOMMENDED') {
      logger.warn(`[PACK401] HIGH RISK USER DETECTED: ${userId}`, {
        riskLevel: computation.signals.riskLevel,
        aggregateScore: computation.signals.aggregateScore,
        notes: computation.signals.notes,
      });
    }
    
  } catch (error) {
    logger.error(`[PACK401] Error recomputing fraud profile for ${userId}:`, error);
    throw error;
  }
}

/**
 * Recompute fraud profiles for users with activity since a given timestamp
 * Used by scheduled function
 */
export async function recomputeFraudProfilesForWindow(
  since: Timestamp
): Promise<void> {
  try {
    logger.info(`[PACK401] Recomputing fraud profiles for window since ${since.toDate()}`);
    
    // Find users with recent activity
    const userIds = new Set<string>();
    
    // Users with recent wallet activity
    const walletTxSnapshot = await db.collectionGroup('transactions')
      .where('createdAt', '>=', since)
      .limit(500) // Limit to prevent timeout
      .get();
    
    walletTxSnapshot.forEach(doc => {
      const tx = doc.data();
      if (tx.userId) userIds.add(tx.userId);
    });
    
    // Users with recent support tickets
    const ticketsSnapshot = await db.collection('supportTickets')
      .where('createdAt', '>=', since)
      .limit(500)
      .get();
    
    ticketsSnapshot.forEach(doc => {
      const ticket = doc.data();
      if (ticket.userId) userIds.add(ticket.userId);
    });
    
    // Users with recent safety reports
    const reportsSnapshot = await db.collection('safetyReports')
      .where('createdAt', '>=', since)
      .limit(500)
      .get();
    
    reportsSnapshot.forEach(doc => {
      const report = doc.data();
      if (report.reportedUserId) userIds.add(report.reportedUserId);
    });
    
    logger.info(`[PACK401] Found ${userIds.size} users with recent activity`);
    
    // Recompute profiles
    let processed = 0;
    let errors = 0;
    
    for (const userId of Array.from(userIds)) {
      try {
        await recomputeFraudProfileForUser(userId);
        processed++;
      } catch (error) {
        logger.error(`[PACK401] Error processing user ${userId}:`, error);
        errors++;
      }
    }
    
    logger.info(`[PACK401] Completed batch recomputation: ${processed} processed, ${errors} errors`);
    
  } catch (error) {
    logger.error('[PACK401] Error in batch fraud profile recomputation:', error);
    throw error;
  }
}
