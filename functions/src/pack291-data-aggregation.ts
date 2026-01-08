/**
 * PACK 291 — AI Assist Data Aggregation
 * Collects and prepares data for AI analysis
 * 
 * This module aggregates data from:
 * - walletTransactions (PACK 290)
 * - chatSessions
 * - calls
 * - calendarBookings
 * - events
 * - profileStats
 * - contentUploads
 * 
 * @package avaloapp
 * @version 1.0.0
 */

import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import {
  AIInputData,
  AggregatedBehaviorData,
  AI_ASSIST_CONSTANTS,
} from './types/pack291-ai-assist.types';
import { CREATOR_ANALYTICS_CONSTANTS } from './types/pack290-creator-analytics.types';

const db = getFirestore();

// ============================================================================
// DATA COLLECTION
// ============================================================================

/**
 * Aggregate all data sources for AI analysis
 */
export async function aggregateCreatorData(
  userId: string,
  fromDate: Date,
  toDate: Date
): Promise<AIInputData> {
  logger.info(`Aggregating data for user ${userId} from ${fromDate.toISOString()} to ${toDate.toISOString()}`);

  const [
    earningsData,
    activityData,
    engagementData,
    timingData,
    profileData,
  ] = await Promise.all([
    getEarningsData(userId, fromDate, toDate),
    getActivityData(userId, fromDate, toDate),
    getEngagementData(userId, fromDate, toDate),
    getTimingData(userId, fromDate, toDate),
    getProfileData(userId),
  ]);

  return {
    userId,
    timeRange: {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
    },
    earnings: earningsData,
    activity: activityData,
    engagement: engagementData,
    timing: timingData,
    profile: profileData,
  };
}

/**
 * Get earnings data from wallet transactions
 */
async function getEarningsData(
  userId: string,
  fromDate: Date,
  toDate: Date
): Promise<AIInputData['earnings']> {
  const txQuery = db.collection('walletTransactions')
    .where('userId', '==', userId)
    .where('direction', '==', 'IN')
    .where('createdAt', '>=', Timestamp.fromDate(fromDate))
    .where('createdAt', '<=', Timestamp.fromDate(toDate))
    .orderBy('createdAt', 'desc');

  const txSnapshot = await txQuery.get();
  
  let total = 0;
  const byFeature: Record<string, number> = {
    CHAT: 0,
    MEDIA: 0,
    CALL: 0,
    CALENDAR: 0,
    EVENT: 0,
    OTHER: 0,
  };

  txSnapshot.forEach(doc => {
    const tx = doc.data();
    const tokens = tx.tokens || 0;
    total += tokens;
    
    const feature = tx.meta?.feature || 'OTHER';
    byFeature[feature] = (byFeature[feature] || 0) + tokens;
  });

  // Calculate trend (compare to previous period)
  const periodLength = toDate.getTime() - fromDate.getTime();
  const prevFromDate = new Date(fromDate.getTime() - periodLength);
  const prevToDate = fromDate;

  const prevTxQuery = db.collection('walletTransactions')
    .where('userId', '==', userId)
    .where('direction', '==', 'IN')
    .where('createdAt', '>=', Timestamp.fromDate(prevFromDate))
    .where('createdAt', '<', Timestamp.fromDate(prevToDate));

  const prevTxSnapshot = await prevTxQuery.get();
  let prevTotal = 0;
  prevTxSnapshot.forEach(doc => {
    prevTotal += doc.data().tokens || 0;
  });

  const trend = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : 0;

  return { total, byFeature, trend };
}

/**
 * Get activity counts
 */
async function getActivityData(
  userId: string,
  fromDate: Date,
  toDate: Date
): Promise<AIInputData['activity']> {
  const timestampRange = {
    from: Timestamp.fromDate(fromDate),
    to: Timestamp.fromDate(toDate),
  };

  // Get paid chats
  const chatsQuery = db.collection('chats')
    .where('participants', 'array-contains', userId)
    .where('mode', '==', 'PAID')
    .where('createdAt', '>=', timestampRange.from)
    .where('createdAt', '<=', timestampRange.to);

  const chatsSnapshot = await chatsQuery.get();
  const paidChats = chatsSnapshot.size;

  // Get paid calls
  const callsQuery = db.collection('calls')
    .where('earnerId', '==', userId)
    .where('state', '==', 'ENDED')
    .where('startedAt', '>=', timestampRange.from)
    .where('startedAt', '<=', timestampRange.to);

  const callsSnapshot = await callsQuery.get();
  const paidCalls = callsSnapshot.size;

  // Get calendar bookings
  const bookingsQuery = db.collection('calendarBookings')
    .where('hostId', '==', userId)
    .where('status', '==', 'COMPLETED')
    .where('createdAt', '>=', timestampRange.from)
    .where('createdAt', '<=', timestampRange.to);

  const bookingsSnapshot = await bookingsQuery.get();
  const calendarBookings = bookingsSnapshot.size;

  // Get event tickets
  const eventsQuery = db.collection('eventTickets')
    .where('creatorId', '==', userId)
    .where('status', '==', 'VALIDATED')
    .where('createdAt', '>=', timestampRange.from)
    .where('createdAt', '<=', timestampRange.to);

  const eventsSnapshot = await eventsQuery.get();
  const eventTickets = eventsSnapshot.size;

  // Get profile views
  const statsDoc = await db.collection('profileStats').doc(userId).get();
  const profileViews = statsDoc.exists ? (statsDoc.data()?.views || 0) : 0;

  // Get content posts
  const contentQuery = db.collection('contentUploads')
    .where('userId', '==', userId)
    .where('createdAt', '>=', timestampRange.from)
    .where('createdAt', '<=', timestampRange.to);

  const contentSnapshot = await contentQuery.get();
  const contentPosts = contentSnapshot.size;

  return {
    paidChats,
    paidCalls,
    calendarBookings,
    eventTickets,
    profileViews,
    contentPosts,
  };
}

/**
 * Get engagement metrics
 */
async function getEngagementData(
  userId: string,
  fromDate: Date,
  toDate: Date
): Promise<AIInputData['engagement']> {
  const timestampRange = {
    from: Timestamp.fromDate(fromDate),
    to: Timestamp.fromDate(toDate),
  };

  // Get chat sessions for response time calculation
  const chatSessionsQuery = db.collection('chatSessions')
    .where('earnerId', '==', userId)
    .where('createdAt', '>=', timestampRange.from)
    .where('createdAt', '<=', timestampRange.to)
    .limit(100);

  const chatSessionsSnapshot = await chatSessionsQuery.get();
  let totalResponseTime = 0;
  let responseCount = 0;

  chatSessionsSnapshot.forEach(doc => {
    const session = doc.data();
    if (session.averageResponseTime) {
      totalResponseTime += session.averageResponseTime;
      responseCount++;
    }
  });

  const averageResponseTime = responseCount > 0 
    ? totalResponseTime / responseCount 
    : 0;

  // Get unique payers from transactions
  const txQuery = db.collection('walletTransactions')
    .where('userId', '==', userId)
    .where('direction', '==', 'IN')
    .where('createdAt', '>=', timestampRange.from)
    .where('createdAt', '<=', timestampRange.to);

  const txSnapshot = await txQuery.get();
  const uniquePayerIds = new Set<string>();
  const prevPeriodPayers = new Set<string>();

  txSnapshot.forEach(doc => {
    const tx = doc.data();
    if (tx.meta?.counterpartyId) {
      uniquePayerIds.add(tx.meta.counterpartyId);
    }
  });

  // Check for returning payers (paid before this period)
  const prevTxQuery = db.collection('walletTransactions')
    .where('userId', '==', userId)
    .where('direction', '==', 'IN')
    .where('createdAt', '<', timestampRange.from);

  const prevTxSnapshot = await prevTxQuery.get();
  prevTxSnapshot.forEach(doc => {
    const tx = doc.data();
    if (tx.meta?.counterpartyId) {
      prevPeriodPayers.add(tx.meta.counterpartyId);
    }
  });

  const uniquePayers = uniquePayerIds.size;
  let newPayers = 0;
  let returningPayers = 0;

  uniquePayerIds.forEach(payerId => {
    if (prevPeriodPayers.has(payerId)) {
      returningPayers++;
    } else {
      newPayers++;
    }
  });

  // Calculate conversion rate
  const profileViews = (await db.collection('profileStats').doc(userId).get()).data()?.views || 0;
  const conversionRate = profileViews > 0 
    ? (uniquePayers / profileViews) * 100 
    : 0;

  return {
    averageResponseTime,
    uniquePayers,
    newPayers,
    returningPayers,
    conversionRate,
  };
}

/**
 * Get timing patterns
 */
async function getTimingData(
  userId: string,
  fromDate: Date,
  toDate: Date
): Promise<AIInputData['timing']> {
  const timestampRange = {
    from: Timestamp.fromDate(fromDate),
    to: Timestamp.fromDate(toDate),
  };

  // Initialize hour counters
  const hourActivity: Record<number, number> = {};
  const hourEarnings: Record<number, number> = {};
  const dayActivity: Record<string, number> = {};

  for (let i = 0; i < 24; i++) {
    hourActivity[i] = 0;
    hourEarnings[i] = 0;
  }

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  days.forEach(day => dayActivity[day] = 0);

  // Analyze transaction timing
  const txQuery = db.collection('walletTransactions')
    .where('userId', '==', userId)
    .where('direction', '==', 'IN')
    .where('createdAt', '>=', timestampRange.from)
    .where('createdAt', '<=', timestampRange.to);

  const txSnapshot = await txQuery.get();

  txSnapshot.forEach(doc => {
    const tx = doc.data();
    const date = tx.createdAt.toDate();
    const hour = date.getHours();
    const dayName = days[date.getDay()];

    hourActivity[hour]++;
    hourEarnings[hour] += tx.tokens || 0;
    dayActivity[dayName]++;
  });

  // Find peak activity hours (top 3)
  const peakActivityHours = Object.entries(hourActivity)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([hour]) => parseInt(hour));

  // Find best posting hours (highest earnings per activity)
  const bestPostingHours = Object.entries(hourEarnings)
    .filter(([hour]) => hourActivity[parseInt(hour)] > 0)
    .map(([hour, earnings]) => ({
      hour: parseInt(hour),
      efficiency: earnings / hourActivity[parseInt(hour)],
    }))
    .sort((a, b) => b.efficiency - a.efficiency)
    .slice(0, 3)
    .map(item => item.hour);

  // Find most successful days (top 3)
  const mostSuccessfulDays = Object.entries(dayActivity)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([day]) => day);

  return {
    peakActivityHours,
    bestPostingHours,
    mostSuccessfulDays,
  };
}

/**
 * Get profile data
 */
async function getProfileData(userId: string): Promise<AIInputData['profile']> {
  const profileDoc = await db.collection('profiles').doc(userId).get();
  
  if (!profileDoc.exists) {
    return {
      hasVerifiedPhotos: false,
      photoCount: 0,
      completionScore: 0,
      accountAgeDays: 0,
    };
  }

  const profile = profileDoc.data()!;
  const createdAt = profile.createdAt?.toDate() || new Date();
  const accountAgeDays = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

  const hasVerifiedPhotos = profile.verificationStatus === 'VERIFIED' || false;
  const photoCount = profile.photos?.length || 0;

  // Calculate completion score
  let completionScore = 0;
  if (profile.bio) completionScore += 20;
  if (photoCount > 0) completionScore += 20;
  if (photoCount >= 3) completionScore += 10;
  if (hasVerifiedPhotos) completionScore += 20;
  if (profile.interests?.length > 0) completionScore += 15;
  if (profile.location) completionScore += 15;

  return {
    hasVerifiedPhotos,
    photoCount,
    completionScore,
    accountAgeDays,
  };
}

// ============================================================================
// BEHAVIOR PATTERN AGGREGATION
// ============================================================================

/**
 * Create aggregated behavior data for period
 * This runs periodically to pre-compute patterns
 */
export async function aggregateBehaviorData(
  userId: string,
  fromDate: Date,
  toDate: Date
): Promise<AggregatedBehaviorData> {
  logger.info(`Aggregating behavior data for user ${userId}`);

  const inputData = await aggregateCreatorData(userId, fromDate, toDate);

  // Aggregate hourly activity patterns
  const hourlyActivity: Record<number, number> = {};
  for (let i = 0; i < 24; i++) {
    hourlyActivity[i] = 0;
  }

  // Aggregate daily activity patterns
  const dailyActivity: Record<string, number> = {
    'Monday': 0,
    'Tuesday': 0,
    'Wednesday': 0,
    'Thursday': 0,
    'Friday': 0,
    'Saturday': 0,
    'Sunday': 0,
  };

  // Response time distribution
  const responseTimeDistribution: Record<string, number> = {
    'Fast': 0,    // < 2 minutes
    'Medium': 0,  // 2-5 minutes
    'Slow': 0,    // > 5 minutes
  };

  const avgResponseTime = inputData.engagement.averageResponseTime;
  if (avgResponseTime < 2) {
    responseTimeDistribution['Fast'] = 1;
  } else if (avgResponseTime <= 5) {
    responseTimeDistribution['Medium'] = 1;
  } else {
    responseTimeDistribution['Slow'] = 1;
  }

  // Conversion rates by feature
  const conversionRates: Record<string, number> = {
    overall: inputData.engagement.conversionRate,
    chat: 0,
    call: 0,
    calendar: 0,
  };

  // Calculate rates if data exists
  if (inputData.activity.profileViews > 0) {
    conversionRates.chat = (inputData.activity.paidChats / inputData.activity.profileViews) * 100;
    conversionRates.call = (inputData.activity.paidCalls / inputData.activity.profileViews) * 100;
    conversionRates.calendar = (inputData.activity.calendarBookings / inputData.activity.profileViews) * 100;
  }

  // Payer demographics
  const payerDemographics = {
    ageRanges: {},
    returningRate: inputData.engagement.uniquePayers > 0
      ? (inputData.engagement.returningPayers / inputData.engagement.uniquePayers) * 100
      : 0,
    averageSpend: inputData.engagement.uniquePayers > 0
      ? inputData.earnings.total / inputData.engagement.uniquePayers
      : 0,
  };

  // Content posting patterns
  const postingTimes: Record<number, number> = {};
  for (let i = 0; i < 24; i++) {
    postingTimes[i] = 0;
  }

  const contentTypes: Record<string, number> = {
    photo: 0,
    video: 0,
  };

  const period = `${fromDate.toISOString().split('T')[0]}_to_${toDate.toISOString().split('T')[0]}`;

  return {
    userId,
    period,
    totalEarnings: inputData.earnings.total,
    earningsByFeature: inputData.earnings.byFeature,
    hourlyActivity,
    dailyActivity,
    responseTimeDistribution,
    conversionRates,
    payerDemographics,
    postingTimes,
    contentTypes,
    createdAt: Timestamp.now(),
  };
}

/**
 * Store aggregated behavior data for faster AI queries
 */
export async function storeAggregatedBehaviorData(
  data: AggregatedBehaviorData
): Promise<void> {
  const docId = `${data.userId}_${data.period}`;
  
  await db.collection('aiAssistBehaviorData').doc(docId).set(data);
  
  logger.info(`Stored aggregated behavior data: ${docId}`);
}

/**
 * Get cached aggregated behavior data if available
 */
export async function getCachedBehaviorData(
  userId: string,
  period: string
): Promise<AggregatedBehaviorData | null> {
  const docId = `${userId}_${period}`;
  const doc = await db.collection('aiAssistBehaviorData').doc(docId).get();
  
  if (!doc.exists) {
    return null;
  }

  return doc.data() as AggregatedBehaviorData;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if user has sufficient data for insights
 */
export async function hasSufficientDataForInsights(
  userId: string
): Promise<boolean> {
  const days = AI_ASSIST_CONSTANTS.MIN_DATA_DAYS;
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);
  const toDate = new Date();

  const data = await aggregateCreatorData(userId, fromDate, toDate);

  return (
    data.earnings.total > 0 &&
    data.activity.paidChats + data.activity.paidCalls + data.activity.calendarBookings > 0 &&
    data.engagement.uniquePayers > 0
  );
}

/**
 * Get date range for analysis
 */
export function getAnalysisDateRange(days: number = 30): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - days);

  return { from, to };
}