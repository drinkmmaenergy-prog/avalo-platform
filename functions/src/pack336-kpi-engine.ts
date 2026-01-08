/**
 * PACK 336 — KPI AGGREGATION ENGINE
 * 
 * Core functions for calculating and aggregating investor-grade metrics.
 * This is a READ-ONLY analytics layer with NO impact on tokenomics logic.
 * 
 * Data Sources:
 * - PACK 277: Wallet transactions
 * - PACK 268: Chat billing
 * - PACK 322: Calls & video
 * - PACK 274/275: Calendar & Events
 * - PACK 279: AI companions
 */

import { db, serverTimestamp } from './init.js';
import type {
  NorthStarSnapshot,
  KpiDailyGlobal,
  KpiDailyByCountry,
  KpiCohort,
  KpiUserLifecycle,
  KpiVirality,
  KpiRevenueStreams,
  KpiAggregationOptions,
} from './pack336-types.js';

const TOKEN_TO_PLN = 0.20; // 1 token = 0.20 PLN

// ============================================================================
// NORTH STAR METRIC CALCULATOR
// ============================================================================

/**
 * Calculate North Star Metric: Paying Users with ≥2 Paid Interactions per 7 days
 * This is the primary KPI that measures true engagement + monetization
 */
export async function calculateNorthStarMetric(
  date: string
): Promise<NorthStarSnapshot> {
  const endDate = new Date(date);
  const weekly7DaysAgo = new Date(endDate);
  weekly7DaysAgo.setDate(weekly7DaysAgo.getDate() - 7);
  
  const monthly30DaysAgo = new Date(endDate);
  monthly30DaysAgo.setDate(monthly30DaysAgo.getDate() - 30);
  
  // Query wallet transactions for paid interactions
  const weeklyTransactions = await db.collection('walletTransactions')
    .where('type', 'in', ['SPEND_CHAT', 'SPEND_CALL', 'SPEND_VIDEO', 'SPEND_EVENT', 'SPEND_CALENDAR'])
    .where('createdAt', '>=', weekly7DaysAgo)
    .where('createdAt', '<=', endDate)
    .get();
  
  const monthlyTransactions = await db.collection('walletTransactions')
    .where('type', 'in', ['SPEND_CHAT', 'SPEND_CALL', 'SPEND_VIDEO', 'SPEND_EVENT', 'SPEND_CALENDAR'])
    .where('createdAt', '>=', monthly30DaysAgo)
    .where('createdAt', '<=', endDate)
    .get();
  
  // Count unique users with ≥2 paid interactions
  const weeklyUserInteractions = new Map<string, number>();
  weeklyTransactions.docs.forEach(doc => {
    const data = doc.data();
    const userId = data.userId;
    weeklyUserInteractions.set(userId, (weeklyUserInteractions.get(userId) || 0) + 1);
  });
  
  const monthlyUserInteractions = new Map<string, number>();
  let totalMonthlyRevenue = 0;
  monthlyTransactions.docs.forEach(doc => {
    const data = doc.data();
    const userId = data.userId;
    const amount = Math.abs(data.amount || 0);
    monthlyUserInteractions.set(userId, (monthlyUserInteractions.get(userId) || 0) + 1);
    totalMonthlyRevenue += amount;
  });
  
  const weeklyPayingUsers = Array.from(weeklyUserInteractions.values())
    .filter(count => count >= 2).length;
  
  const monthlyPayingUsers = Array.from(monthlyUserInteractions.values())
    .filter(count => count >= 2).length;
  
  const avgInteractionsPerUser = monthlyPayingUsers > 0
    ? Array.from(monthlyUserInteractions.values()).reduce((a, b) => a + b, 0) / monthlyPayingUsers
    : 0;
  
  const avgRevenuePerUser = monthlyPayingUsers > 0
    ? (totalMonthlyRevenue * TOKEN_TO_PLN) / monthlyPayingUsers
    : 0;
  
  return {
    date,
    weeklyPayingUsers,
    monthlyPayingUsers,
    avgInteractionsPerUser,
    avgRevenuePerUser,
    calculatedAt: serverTimestamp() as any,
  };
}

// ============================================================================
// DAILY GLOBAL KPI CALCULATOR
// ============================================================================

/**
 * Calculate daily global KPI metrics
 */
export async function calculateDailyGlobalKpi(
  date: string
): Promise<KpiDailyGlobal> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  const sevenDaysAgo = new Date(startOfDay);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const thirtyDaysAgo = new Date(startOfDay);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  // Get total registered and verified users
  const usersSnapshot = await db.collection('users').count().get();
  const registeredUsersTotal = usersSnapshot.data().count;
  
  const verifiedUsersSnapshot = await db.collection('users')
    .where('verified', '==', true)
    .count()
    .get();
  const verifiedUsersTotal = verifiedUsersSnapshot.data().count;
  
  // Get active users (DAU, WAU, MAU)
  const dauSnapshot = await db.collection('userActivity')
    .where('lastActiveAt', '>=', startOfDay)
    .where('lastActiveAt', '<=', endOfDay)
    .count()
    .get();
  const activeUsersDAU = dauSnapshot.data().count;
  
  const wauSnapshot = await db.collection('userActivity')
    .where('lastActiveAt', '>=', sevenDaysAgo)
    .where('lastActiveAt', '<=', endOfDay)
    .count()
    .get();
  const activeUsersWAU = wauSnapshot.data().count;
  
  const mauSnapshot = await db.collection('userActivity')
    .where('lastActiveAt', '>=', thirtyDaysAgo)
    .where('lastActiveAt', '<=', endOfDay)
    .count()
    .get();
  const activeUsersMAU = mauSnapshot.data().count;
  
  // Get paying users (DAU, WAU, MAU)
  const transactions = await db.collection('walletTransactions')
    .where('createdAt', '>=', startOfDay)
    .where('createdAt', '<=', endOfDay)
    .where('type', 'in', ['SPEND_CHAT', 'SPEND_CALL', 'SPEND_VIDEO', 'SPEND_EVENT', 'SPEND_CALENDAR'])
    .get();
  
  const payingUsersDAU = new Set(transactions.docs.map(doc => doc.data().userId)).size;
  
  const wauTransactions = await db.collection('walletTransactions')
    .where('createdAt', '>=', sevenDaysAgo)
    .where('createdAt', '<=', endOfDay)
    .where('type', 'in', ['SPEND_CHAT', 'SPEND_CALL', 'SPEND_VIDEO', 'SPEND_EVENT', 'SPEND_CALENDAR'])
    .get();
  const payingUsersWAU = new Set(wauTransactions.docs.map(doc => doc.data().userId)).size;
  
  const mauTransactions = await db.collection('walletTransactions')
    .where('createdAt', '>=', thirtyDaysAgo)
    .where('createdAt', '<=', endOfDay)
    .where('type', 'in', ['SPEND_CHAT', 'SPEND_CALL', 'SPEND_VIDEO', 'SPEND_EVENT', 'SPEND_CALENDAR'])
    .get();
  const payingUsersMAU = new Set(mauTransactions.docs.map(doc => doc.data().userId)).size;
  
  // Calculate total token spent and revenue
  let totalTokenSpent = 0;
  transactions.docs.forEach(doc => {
    const amount = Math.abs(doc.data().amount || 0);
    totalTokenSpent += amount;
  });
  const totalRevenuePLN = totalTokenSpent * TOKEN_TO_PLN;
  
  // Get refund metrics
  const refunds = await db.collection('walletTransactions')
    .where('createdAt', '>=', startOfDay)
    .where('createdAt', '<=', endOfDay)
    .where('type', '==', 'REFUND')
    .get();
  
  const refundsCount = refunds.size;
  let refundVolumePLN = 0;
  refunds.docs.forEach(doc => {
    const amount = Math.abs(doc.data().amount || 0);
    refundVolumePLN += amount * TOKEN_TO_PLN;
  });
  
  const refundRate = totalRevenuePLN > 0 ? refundVolumePLN / totalRevenuePLN : 0;
  
  return {
    date,
    registeredUsersTotal,
    verifiedUsersTotal,
    activeUsersDAU,
    activeUsersWAU,
    activeUsersMAU,
    payingUsersDAU,
    payingUsersWAU,
    payingUsersMAU,
    totalTokenSpent,
    totalRevenuePLN,
    refundsCount,
    refundVolumePLN,
    refundRate,
    calculatedAt: serverTimestamp() as any,
  };
}

// ============================================================================
// DAILY BY COUNTRY KPI CALCULATOR
// ============================================================================

/**
 * Calculate daily KPI metrics by country
 */
export async function calculateDailyByCountryKpi(
  date: string
): Promise<KpiDailyByCountry[]> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  // Get all countries from users
  const countriesSnapshot = await db.collection('users')
    .select('country')
    .get();
  
  const countriesSet = new Set<string>();
  countriesSnapshot.docs.forEach(doc => {
    const country = doc.data().country;
    if (country) countriesSet.add(country);
  });
  
  const results: KpiDailyByCountry[] = [];
  
  for (const country of Array.from(countriesSet)) {
    // Get active users for this country
    const activeUsers = await db.collection('userActivity')
      .where('lastActiveAt', '>=', startOfDay)
      .where('lastActiveAt', '<=', endOfDay)
      .get();
    
    const countryActiveUsers = new Set<string>();
    for (const doc of activeUsers.docs) {
      const userId = doc.id;
      const userDoc = await db.collection('users').doc(userId).get();
      if (userDoc.exists && userDoc.data()?.country === country) {
        countryActiveUsers.add(userId);
      }
    }
    
    // Get new registrations for this country
    const newRegistrations = await db.collection('users')
      .where('country', '==', country)
      .where('createdAt', '>=', startOfDay)
      .where('createdAt', '<=', endOfDay)
      .count()
      .get();
    
    // Get paying users and revenue for this country
    const transactions = await db.collection('walletTransactions')
      .where('createdAt', '>=', startOfDay)
      .where('createdAt', '<=', endOfDay)
      .where('type', 'in', ['SPEND_CHAT', 'SPEND_CALL', 'SPEND_VIDEO', 'SPEND_EVENT', 'SPEND_CALENDAR'])
      .get();
    
    const countryPayingUsers = new Set<string>();
    let countryRevenue = 0;
    
    for (const doc of transactions.docs) {
      const userId = doc.data().userId;
      const userDoc = await db.collection('users').doc(userId).get();
      if (userDoc.exists && userDoc.data()?.country === country) {
        countryPayingUsers.add(userId);
        countryRevenue += Math.abs(doc.data().amount || 0);
      }
    }
    
    const revenuePLN = countryRevenue * TOKEN_TO_PLN;
    const avgSpendPerUserPLN = countryPayingUsers.size > 0
      ? revenuePLN / countryPayingUsers.size
      : 0;
    
    results.push({
      date,
      country,
      usersActive: countryActiveUsers.size,
      newRegistrations: newRegistrations.data().count,
      payingUsers: countryPayingUsers.size,
      revenuePLN,
      avgSpendPerUserPLN,
      calculatedAt: serverTimestamp() as any,
    });
  }
  
  return results;
}

// ============================================================================
// REVENUE STREAMS CALCULATOR
// ============================================================================

/**
 * Calculate daily revenue breakdown by source
 */
export async function calculateRevenueStreams(
  date: string
): Promise<KpiRevenueStreams> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  // Get all transactions for the day
  const transactions = await db.collection('walletTransactions')
    .where('createdAt', '>=', startOfDay)
    .where('createdAt', '<=', endOfDay)
    .get();
  
  let chatRevenue = 0;
  let voiceRevenue = 0;
  let videoRevenue = 0;
  let calendarRevenue = 0;
  let eventsRevenue = 0;
  let aiRevenue = 0;
  let subscriptionsRevenue = 0;
  let tipsRevenue = 0;
  
  transactions.docs.forEach(doc => {
    const data = doc.data();
    const amount = Math.abs(data.amount || 0);
    
    switch (data.type) {
      case 'SPEND_CHAT':
        chatRevenue += amount;
        break;
      case 'SPEND_CALL':
        voiceRevenue += amount;
        break;
      case 'SPEND_VIDEO':
        videoRevenue += amount;
        break;
      case 'SPEND_CALENDAR':
        calendarRevenue += amount;
        break;
      case 'SPEND_EVENT':
        eventsRevenue += amount;
        break;
      case 'SPEND_AI':
        aiRevenue += amount;
        break;
      case 'PURCHASE_SUBSCRIPTION':
        subscriptionsRevenue += amount;
        break;
      case 'SPEND_TIP':
        tipsRevenue += amount;
        break;
    }
  });
  
  const totalRevenuePLN = (
    chatRevenue + voiceRevenue + videoRevenue + calendarRevenue +
    eventsRevenue + aiRevenue + subscriptionsRevenue + tipsRevenue
  ) * TOKEN_TO_PLN;
  
  return {
    date,
    chatRevenuePLN: chatRevenue * TOKEN_TO_PLN,
    voiceRevenuePLN: voiceRevenue * TOKEN_TO_PLN,
    videoRevenuePLN: videoRevenue * TOKEN_TO_PLN,
    calendarRevenuePLN: calendarRevenue * TOKEN_TO_PLN,
    eventsRevenuePLN: eventsRevenue * TOKEN_TO_PLN,
    aiRevenuePLN: aiRevenue * TOKEN_TO_PLN,
    subscriptionsPLN: subscriptionsRevenue * TOKEN_TO_PLN,
    tipsRevenuePLN: tipsRevenue * TOKEN_TO_PLN,
    totalRevenuePLN,
    calculatedAt: serverTimestamp() as any,
  };
}

// ============================================================================
// VIRALITY METRICS CALCULATOR
// ============================================================================

/**
 * Calculate daily virality metrics
 */
export async function calculateViralityMetrics(
  date: string
): Promise<KpiVirality> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  // Get invited users
  const invitedUsers = await db.collection('referrals')
    .where('createdAt', '>=', startOfDay)
    .where('createdAt', '<=', endOfDay)
    .count()
    .get();
  
  // Get activated users (those who completed onboarding)
  const activatedUsers = await db.collection('referrals')
    .where('createdAt', '>=', startOfDay)
    .where('createdAt', '<=', endOfDay)
    .where('activated', '==', true)
    .count()
    .get();
  
  // Calculate k-factor (average invites per inviter)
  const invitersSnapshot = await db.collection('referrals')
    .where('createdAt', '>=', startOfDay)
    .where('createdAt', '<=', endOfDay)
    .get();
  
  const invitersSet = new Set(invitersSnapshot.docs.map(doc => doc.data().referrerId));
  const kFactor = invitersSet.size > 0
    ? invitedUsers.data().count / invitersSet.size
    : 0;
  
  // Calculate viral revenue (revenue from referred users)
  const referredUserIds = invitersSnapshot.docs.map(doc => doc.data().referredUserId);
  let viralRevenue = 0;
  
  if (referredUserIds.length > 0) {
    // Query in batches of 10 (Firestore limit for 'in' queries)
    for (let i = 0; i < referredUserIds.length; i += 10) {
      const batch = referredUserIds.slice(i, i + 10);
      const transactions = await db.collection('walletTransactions')
        .where('userId', 'in', batch)
        .where('createdAt', '>=', startOfDay)
        .where('createdAt', '<=', endOfDay)
        .where('type', 'in', ['SPEND_CHAT', 'SPEND_CALL', 'SPEND_VIDEO', 'SPEND_EVENT', 'SPEND_CALENDAR'])
        .get();
      
      transactions.docs.forEach(doc => {
        viralRevenue += Math.abs(doc.data().amount || 0);
      });
    }
  }
  
  return {
    date,
    invitedUsers: invitedUsers.data().count,
    activatedFromInvite: activatedUsers.data().count,
    kFactor,
    viralRevenuePLN: viralRevenue * TOKEN_TO_PLN,
    calculatedAt: serverTimestamp() as any,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get yesterday's date in YYYY-MM-DD format
 */
export function getYesterdayDate(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split('T')[0];
}

/**
 * Get date range for queries
 */
export function getDateRange(date: string): { start: Date; end: Date } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  
  return { start, end };
}