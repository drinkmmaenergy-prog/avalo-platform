/**
 * PACK 402 — KPI Aggregation Service
 * 
 * Time-bounded queries on existing collections to build KPI snapshots.
 * Never scans entire collections without date range.
 */

import * as admin from 'firebase-admin';
import {
  KpiKey,
  KpiInterval,
  GrowthKpi,
  EngagementKpi,
  RevenueKpi,
  SafetyKpi,
  SupportKpi,
  buildKpiDocId,
  KPI_COLLECTIONS,
  KpiType,
} from './pack402-kpi-types';

const db = admin.firestore();

/**
 * Build daily KPIs for a specific date
 */
export async function buildDailyKpis(date: string): Promise<void> {
  console.log(`[PACK 402] Building daily KPIs for ${date}`);

  const startOfDay = new Date(`${date}T00:00:00.000Z`);
  const endOfDay = new Date(`${date}T23:59:59.999Z`);

  await Promise.all([
    buildGrowthKpi(date, 'day', startOfDay, endOfDay),
    buildEngagementKpi(date, 'day', startOfDay, endOfDay),
    buildRevenueKpi(date, 'day', startOfDay, endOfDay),
    buildSafetyKpi(date, 'day', startOfDay, endOfDay),
    buildSupportKpi(date, 'day', startOfDay, endOfDay),
  ]);

  console.log(`[PACK 402] Daily KPIs built for ${date}`);
}

/**
 * Build hourly KPIs for a specific date and hour
 */
export async function buildHourlyKpis(date: string, hour: number): Promise<void> {
  console.log(`[PACK 402] Building hourly KPIs for ${date} hour ${hour}`);

  const hourStr = hour.toString().padStart(2, '0');
  const startOfHour = new Date(`${date}T${hourStr}:00:00.000Z`);
  const endOfHour = new Date(`${date}T${hourStr}:59:59.999Z`);

  await Promise.all([
    buildGrowthKpi(date, 'hour', startOfHour, endOfHour, hour),
    buildEngagementKpi(date, 'hour', startOfHour, endOfHour, hour),
    buildRevenueKpi(date, 'hour', startOfHour, endOfHour, hour),
    buildSafetyKpi(date, 'hour', startOfHour, endOfHour, hour),
    buildSupportKpi(date, 'hour', startOfHour, endOfHour, hour),
  ]);

  console.log(`[PACK 402] Hourly KPIs built for ${date} hour ${hour}`);
}

/**
 * Build Growth KPI snapshot
 */
async function buildGrowthKpi(
  date: string,
  interval: KpiInterval,
  startTime: Date,
  endTime: Date,
  hour?: number
): Promise<void> {
  const key: KpiKey = { date, hour };
  const docId = buildKpiDocId(key, interval);

  // New users: users.createdAt in range
  const newUsersSnap = await db.collection('users')
    .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(startTime))
    .where('createdAt', '<=', admin.firestore.Timestamp.fromDate(endTime))
    .count()
    .get();

  // Verified users: users verified in range
  const verifiedUsersSnap = await db.collection('users')
    .where('verifiedAt', '>=', admin.firestore.Timestamp.fromDate(startTime))
    .where('verifiedAt', '<=', admin.firestore.Timestamp.fromDate(endTime))
    .count()
    .get();

  // Onboarding stage counts (from retention profiles or user metadata)
  const onboardingStageCounts: Record<string, number> = {};
  const retentionSegmentCounts: Record<string, number> = {};

  // Query retention profiles for stage/segment distribution
  const retentionSnap = await db.collection('retentionProfiles')
    .where('updatedAt', '>=', admin.firestore.Timestamp.fromDate(startTime))
    .where('updatedAt', '<=', admin.firestore.Timestamp.fromDate(endTime))
    .get();

  retentionSnap.forEach((doc) => {
    const data = doc.data();
    const stage = data.onboardingStage || 'unknown';
    const segment = data.retentionSegment || 'unknown';

    onboardingStageCounts[stage] = (onboardingStageCounts[stage] || 0) + 1;
    retentionSegmentCounts[segment] = (retentionSegmentCounts[segment] || 0) + 1;
  });

  const kpi: GrowthKpi = {
    key,
    interval,
    newUsers: newUsersSnap.data().count,
    verifiedUsers: verifiedUsersSnap.data().count,
    onboardingStageCounts,
    retentionSegmentCounts,
  };

  await db.collection(KPI_COLLECTIONS.growth).doc(docId).set(kpi);
  console.log(`[PACK 402] Growth KPI saved: ${docId}`);
}

/**
 * Build Engagement KPI snapshot
 */
async function buildEngagementKpi(
  date: string,
  interval: KpiInterval,
  startTime: Date,
  endTime: Date,
  hour?: number
): Promise<void> {
  const key: KpiKey = { date, hour };
  const docId = buildKpiDocId(key, interval);

  // Swipes
  const swipesSnap = await db.collection('swipes')
    .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(startTime))
    .where('timestamp', '<=', admin.firestore.Timestamp.fromDate(endTime))
    .get();

  const uniqueSwipers = new Set();
  swipesSnap.forEach((doc) => {
    uniqueSwipers.add(doc.data().userId);
  });

  // Matches
  const matchesSnap = await db.collection('matches')
    .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(startTime))
    .where('createdAt', '<=', admin.firestore.Timestamp.fromDate(endTime))
    .count()
    .get();

  // Paid chats (from wallet transactions or chat metadata)
  const paidChatsSnap = await db.collection('chatTransactions')
    .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(startTime))
    .where('timestamp', '<=', admin.firestore.Timestamp.fromDate(endTime))
    .get();

  let paidChatsStarted = 0;
  let paidChatWordsBilled = 0;

  paidChatsSnap.forEach((doc) => {
    const data = doc.data();
    if (data.type === 'chat_start') paidChatsStarted++;
    paidChatWordsBilled += data.wordCount || 0;
  });

  // Voice & Video minutes (from call logs)
  const callsSnap = await db.collection('calls')
    .where('startedAt', '>=', admin.firestore.Timestamp.fromDate(startTime))
    .where('startedAt', '<=', admin.firestore.Timestamp.fromDate(endTime))
    .get();

  let voiceMinutes = 0;
  let videoMinutes = 0;

  callsSnap.forEach((doc) => {
    const data = doc.data();
    const minutes = Math.floor((data.durationSeconds || 0) / 60);
    if (data.type === 'voice') voiceMinutes += minutes;
    if (data.type === 'video') videoMinutes += minutes;
  });

  // Calendar & Events
  const bookingsSnap = await db.collection('calendarBookings')
    .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(startTime))
    .where('createdAt', '<=', admin.firestore.Timestamp.fromDate(endTime))
    .count()
    .get();

  const eventsSnap = await db.collection('events')
    .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(startTime))
    .where('createdAt', '<=', admin.firestore.Timestamp.fromDate(endTime))
    .count()
    .get();

  const ticketsSnap = await db.collection('eventTickets')
    .where('purchasedAt', '>=', admin.firestore.Timestamp.fromDate(startTime))
    .where('purchasedAt', '<=', admin.firestore.Timestamp.fromDate(endTime))
    .count()
    .get();

  // AI interactions
  const aiChatsSnap = await db.collection('aiChats')
    .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(startTime))
    .where('createdAt', '<=', admin.firestore.Timestamp.fromDate(endTime))
    .count()
    .get();

  const aiCallsSnap = await db.collection('aiCalls')
    .where('startedAt', '>=', admin.firestore.Timestamp.fromDate(startTime))
    .where('startedAt', '<=', admin.firestore.Timestamp.fromDate(endTime))
    .get();

  let aiVoiceMinutes = 0;
  aiCallsSnap.forEach((doc) => {
    const data = doc.data();
    aiVoiceMinutes += Math.floor((data.durationSeconds || 0) / 60);
  });

  const kpi: EngagementKpi = {
    key,
    interval,
    totalSwipes: swipesSnap.size,
    uniqueSwipers: uniqueSwipers.size,
    totalMatches: matchesSnap.data().count,
    paidChatsStarted,
    paidChatWordsBilled,
    voiceMinutes,
    videoMinutes,
    calendarBookings: bookingsSnap.data().count,
    eventsCreated: eventsSnap.data().count,
    eventTickets: ticketsSnap.data().count,
    aiChats: aiChatsSnap.data().count,
    aiVoiceMinutes,
  };

  await db.collection(KPI_COLLECTIONS.engagement).doc(docId).set(kpi);
  console.log(`[PACK 402] Engagement KPI saved: ${docId}`);
}

/**
 * Build Revenue KPI snapshot
 */
async function buildRevenueKpi(
  date: string,
  interval: KpiInterval,
  startTime: Date,
  endTime: Date,
  hour?: number
): Promise<void> {
  const key: KpiKey = { date, hour };
  const docId = buildKpiDocId(key, interval);

  // Token purchases (PACK 255/277)
  const purchasesSnap = await db.collection('walletTransactions')
    .where('type', '==', 'token_purchase')
    .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(startTime))
    .where('timestamp', '<=', admin.firestore.Timestamp.fromDate(endTime))
    .get();

  let tokenPurchasesCount = 0;
  let tokenPurchasedTotal = 0;
  const payingUsers = new Set();

  purchasesSnap.forEach((doc) => {
    const data = doc.data();
    tokenPurchasesCount++;
    tokenPurchasedTotal += data.amount || 0;
    payingUsers.add(data.userId);
  });

  // Token spending
  const spendSnap = await db.collection('walletTransactions')
    .where('type', 'in', ['spend', 'chat_payment', 'call_payment', 'event_payment'])
    .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(startTime))
    .where('timestamp', '<=', admin.firestore.Timestamp.fromDate(endTime))
    .get();

  let tokensSpentTotal = 0;
  let creatorEarningsTokens = 0;
  let avaloRevenueTokens = 0;

  spendSnap.forEach((doc) => {
    const data = doc.data();
    const amount = Math.abs(data.amount || 0);
    tokensSpentTotal += amount;

    // Split based on platform fee (typically 70/30)
    const creatorShare = Math.floor(amount * 0.7);
    const avaloShare = amount - creatorShare;

    creatorEarningsTokens += creatorShare;
    avaloRevenueTokens += avaloShare;
  });

  // Payouts
  const payoutsRequestedSnap = await db.collection('payouts')
    .where('status', '==', 'requested')
    .where('requestedAt', '>=', admin.firestore.Timestamp.fromDate(startTime))
    .where('requestedAt', '<=', admin.firestore.Timestamp.fromDate(endTime))
    .get();

  const payoutsApprovedSnap = await db.collection('payouts')
    .where('status', '==', 'approved')
    .where('approvedAt', '>=', admin.firestore.Timestamp.fromDate(startTime))
    .where('approvedAt', '<=', admin.firestore.Timestamp.fromDate(endTime))
    .get();

  let payoutsRequestedTokens = 0;
  let payoutsApprovedTokens = 0;

  payoutsRequestedSnap.forEach((doc) => {
    payoutsRequestedTokens += doc.data().amountTokens || 0;
  });

  payoutsApprovedSnap.forEach((doc) => {
    payoutsApprovedTokens += doc.data().amountTokens || 0;
  });

  const kpi: RevenueKpi = {
    key,
    interval,
    tokenPurchasesCount,
    tokenPurchasedTotal,
    tokensSpentTotal,
    creatorEarningsTokens,
    avaloRevenueTokens,
    payoutsRequestedTokens,
    payoutsApprovedTokens,
    payingUsersCount: payingUsers.size,
  };

  await db.collection(KPI_COLLECTIONS.revenue).doc(docId).set(kpi);
  console.log(`[PACK 402] Revenue KPI saved: ${docId}`);
}

/**
 * Build Safety KPI snapshot
 */
async function buildSafetyKpi(
  date: string,
  interval: KpiInterval,
  startTime: Date,
  endTime: Date,
  hour?: number
): Promise<void> {
  const key: KpiKey = { date, hour };
  const docId = buildKpiDocId(key, interval);

  // Abuse reports (PACK 173)
  const abuseReportsSnap = await db.collection('abuseReports')
    .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(startTime))
    .where('createdAt', '<=', admin.firestore.Timestamp.fromDate(endTime))
    .count()
    .get();

  // Safety tickets (PACK 159)
  const safetyTicketsSnap = await db.collection('safetyTickets')
    .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(startTime))
    .where('createdAt', '<=', admin.firestore.Timestamp.fromDate(endTime))
    .get();

  let criticalSafetyTickets = 0;
  safetyTicketsSnap.forEach((doc) => {
    if (doc.data().priority === 'critical') criticalSafetyTickets++;
  });

  // Account actions
  const frozenSnap = await db.collection('users')
    .where('accountStatus', '==', 'frozen')
    .where('statusUpdatedAt', '>=', admin.firestore.Timestamp.fromDate(startTime))
    .where('statusUpdatedAt', '<=', admin.firestore.Timestamp.fromDate(endTime))
    .count()
    .get();

  const bannedSnap = await db.collection('users')
    .where('accountStatus', '==', 'banned')
    .where('statusUpdatedAt', '>=', admin.firestore.Timestamp.fromDate(startTime))
    .where('statusUpdatedAt', '<=', admin.firestore.Timestamp.fromDate(endTime))
    .count()
    .get();

  // Fraud risk distribution (PACK 174, 401)
  const fraudRiskDistribution: Record<string, number> = {};
  const fraudProfilesSnap = await db.collection('fraudProfiles')
    .where('lastUpdated', '>=', admin.firestore.Timestamp.fromDate(startTime))
    .where('lastUpdated', '<=', admin.firestore.Timestamp.fromDate(endTime))
    .get();

  fraudProfilesSnap.forEach((doc) => {
    const level = doc.data().riskLevel || 'NORMAL';
    fraudRiskDistribution[level] = (fraudRiskDistribution[level] || 0) + 1;
  });

  const kpi: SafetyKpi = {
    key,
    interval,
    abuseReports: abuseReportsSnap.data().count,
    safetyTickets: safetyTicketsSnap.size,
    criticalSafetyTickets,
    accountsFrozen: frozenSnap.data().count,
    accountsBanned: bannedSnap.data().count,
    fraudRiskDistribution,
  };

  await db.collection(KPI_COLLECTIONS.safety).doc(docId).set(kpi);
  console.log(`[PACK 402] Safety KPI saved: ${docId}`);
}

/**
 * Build Support KPI snapshot
 */
async function buildSupportKpi(
  date: string,
  interval: KpiInterval,
  startTime: Date,
  endTime: Date,
  hour?: number
): Promise<void> {
  const key: KpiKey = { date, hour };
  const docId = buildKpiDocId(key, interval);

  // Support tickets (PACK 300/300A/300B)
  const createdSnap = await db.collection('supportTickets')
    .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(startTime))
    .where('createdAt', '<=', admin.firestore.Timestamp.fromDate(endTime))
    .count()
    .get();

  const resolvedSnap = await db.collection('supportTickets')
    .where('status', '==', 'resolved')
    .where('resolvedAt', '>=', admin.firestore.Timestamp.fromDate(startTime))
    .where('resolvedAt', '<=', admin.firestore.Timestamp.fromDate(endTime))
    .get();

  let totalFirstResponseMinutes = 0;
  let totalResolveMinutes = 0;
  let firstResponseCount = 0;
  let resolveCount = 0;

  resolvedSnap.forEach((doc) => {
    const data = doc.data();
    const createdAt = data.createdAt?.toDate();
    const firstResponseAt = data.firstResponseAt?.toDate();
    const resolvedAt = data.resolvedAt?.toDate();

    if (createdAt && firstResponseAt) {
      const firstResponseMinutes = (firstResponseAt.getTime() - createdAt.getTime()) / 60000;
      totalFirstResponseMinutes += firstResponseMinutes;
      firstResponseCount++;
    }

    if (createdAt && resolvedAt) {
      const resolveMinutes = (resolvedAt.getTime() - createdAt.getTime()) / 60000;
      totalResolveMinutes += resolveMinutes;
      resolveCount++;
    }
  });

  const avgFirstResponseMinutes = firstResponseCount > 0
    ? totalFirstResponseMinutes / firstResponseCount
    : null;

  const avgResolveMinutes = resolveCount > 0
    ? totalResolveMinutes / resolveCount
    : null;

  const kpi: SupportKpi = {
    key,
    interval,
    ticketsCreated: createdSnap.data().count,
    ticketsResolved: resolvedSnap.size,
    avgFirstResponseMinutes,
    avgResolveMinutes,
  };

  await db.collection(KPI_COLLECTIONS.support).doc(docId).set(kpi);
  console.log(`[PACK 402] Support KPI saved: ${docId}`);
}

/**
 * Fetch KPIs for a date range
 */
export async function fetchKpis(
  type: KpiType,
  fromDate: string,
  toDate: string,
  interval: KpiInterval
): Promise<any[]> {
  const collection = KPI_COLLECTIONS[type];

  const prefix = interval === 'hour' ? 'hour_' : 'day_';
  const startDocId = `${prefix}${fromDate}`;
  const endDocId = `${prefix}${toDate}${interval === 'hour' ? '_23' : ''}`;

  const snapshot = await db.collection(collection)
    .where(admin.firestore.FieldPath.documentId(), '>=', startDocId)
    .where(admin.firestore.FieldPath.documentId(), '<=', endDocId)
    .orderBy(admin.firestore.FieldPath.documentId())
    .get();

  return snapshot.docs.map((doc) => doc.data());
}

/**
 * Backfill daily KPIs for a date range (admin only)
 */
export async function backfillDailyKpis(fromDate: string, toDate: string): Promise<void> {
  console.log(`[PACK 402] Backfilling daily KPIs from ${fromDate} to ${toDate}`);

  const start = new Date(fromDate);
  const end = new Date(toDate);

  const dates: string[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split('T')[0]);
  }

  for (const date of dates) {
    await buildDailyKpis(date);
  }

  console.log(`[PACK 402] Backfill complete: ${dates.length} days processed`);
}
