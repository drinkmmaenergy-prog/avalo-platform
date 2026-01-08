/**
 * PACK 243: Creator Ego Metrics Dashboard
 * Cloud Functions for calculating and updating creator analytics
 * Runs every 24 hours to update dashboard metrics
 */

import * as functions from 'firebase-functions';
import { db, admin } from './init';
import {
  CreatorDashboard,
  DailyStats,
  WeeklyStats,
  MonthlyStats,
  MotivationalNudge,
  ActionSuggestion,
  DashboardRanking,
  TopCreatorBadge,
  AgeRangeMetrics,
  CountryMetrics,
  NudgeContext,
  SuggestionContext,
  NUDGE_TEMPLATES,
  SUGGESTION_TEMPLATES,
} from './types/pack243-creator-dashboard';

/**
 * Scheduled function: Calculate dashboard analytics for all creators
 * Runs daily at 2 AM UTC
 */
export const calculateCreatorDashboards = functions.pubsub
  .schedule('0 2 * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('Starting daily creator dashboard calculation...');

    try {
      // Get all creators
      const creatorsSnapshot = await db
        .collection('users')
        .where('role', '==', 'creator')
        .get();

      const batch = db.batch();
      let processedCount = 0;
      let failedCount = 0;

      for (const creatorDoc of creatorsSnapshot.docs) {
        try {
          const userId = creatorDoc.id;
          await calculateCreatorAnalytics(userId);
          processedCount++;
        } catch (error) {
          console.error(`Failed to calculate analytics for creator ${creatorDoc.id}:`, error);
          failedCount++;
        }
      }

      console.log(`Dashboard calculation complete. Processed: ${processedCount}, Failed: ${failedCount}`);
      return { success: true, processed: processedCount, failed: failedCount };
    } catch (error) {
      console.error('Error in calculateCreatorDashboards:', error);
      throw error;
    }
  });

/**
 * Calculate analytics for a single creator
 */
async function calculateCreatorAnalytics(userId: string): Promise<void> {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const lastWeekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  // Collect all metrics
  const [
    profileViews,
    swipeInterest,
    chatRequests,
    missedEarnings,
    ageMetrics,
    countryMetrics,
    tokenEarnings,
    meetingStats,
    eventStats,
    previousDashboard,
  ] = await Promise.all([
    getProfileViews(userId, yesterday, now),
    getSwipeInterest(userId, yesterday, now),
    getChatRequests(userId, yesterday, now),
    getMissedEarnings(userId, yesterday, now),
    getAgeRangeMetrics(userId, lastWeekStart, now),
    getCountryMetrics(userId, lastWeekStart, now),
    getTokenEarnings(userId, yesterday, lastWeekStart, lastMonthStart, now),
    getMeetingConversionStats(userId, lastWeekStart, now),
    getEventPopularityStats(userId),
    getPreviousDashboard(userId),
  ]);

  // Calculate percentile ranking
  const retentionPercentile = await calculateRetentionPercentile(userId, tokenEarnings.monthly);

  // Check for Top Creator badge
  const topCreatorBadge = retentionPercentile <= 1;

  // Build dashboard data
  const dashboard: CreatorDashboard = {
    profileViews: profileViews.current,
    profileViewsChange: calculatePercentageChange(profileViews.current, profileViews.previous),
    swipeInterest: swipeInterest.current,
    swipeInterestChange: calculatePercentageChange(swipeInterest.current, swipeInterest.previous),
    chatRequests: chatRequests.current,
    chatRequestsChange: calculatePercentageChange(chatRequests.current, chatRequests.previous),
    missedEarnings: missedEarnings.count,
    topPayingAgeRange: getTopAgeRange(ageMetrics),
    topCountries: getTopCountries(countryMetrics, 5),
    tokenEarnings: {
      daily: tokenEarnings.daily,
      weekly: tokenEarnings.weekly,
      monthly: tokenEarnings.monthly,
    },
    meetingConversion: meetingStats.conversionRate,
    eventPopularity: eventStats.expectedAttendance,
    retentionPercentile,
    topCreatorBadge,
    lastUpdated: admin.firestore.Timestamp.now(),
  };

  // Save dashboard
  await db.collection('creatorDashboard').doc(userId).set(dashboard);

  // Generate daily stats
  const dailyStats: DailyStats = {
    date: formatDate(yesterday),
    profileViews: profileViews.current,
    swipeInterest: swipeInterest.current,
    chatRequests: chatRequests.current,
    tokenEarnings: tokenEarnings.daily,
    meetingsBooked: meetingStats.bookings,
    averageResponseTime: await getAverageResponseTime(userId, yesterday, now),
    onlineTime: await getOnlineTime(userId, yesterday, now),
    contentUploads: await getContentUploads(userId, yesterday, now),
    calculatedAt: admin.firestore.Timestamp.now(),
  };

  await db
    .collection('creatorDashboard')
    .doc(userId)
    .collection('dailyStats')
    .doc(formatDate(yesterday))
    .set(dailyStats);

  // Generate motivational nudges
  const nudgeContext: NudgeContext = {
    recentUpload: await getRecentUploadContext(userId),
    responseSpeedImprovement: await getResponseSpeedContext(userId),
    rankingAchievement: { percentile: retentionPercentile, country: await getUserCountry(userId), trend: 'up' },
    missedOpportunities: missedEarnings.count > 0 ? {
      chatRequests: missedEarnings.count,
      estimatedRevenue: missedEarnings.estimatedRevenue,
      reason: missedEarnings.reason,
    } : undefined,
  };

  const nudges = generateMotivationalNudges(userId, nudgeContext);
  await saveNudges(userId, nudges);

  // Generate action suggestions
  const suggestionContext: SuggestionContext = {
    highProfileInterest: profileViews.current > 100 ? {
      views: profileViews.current,
      swipes: swipeInterest.current,
      currentChatPrice: await getCurrentChatPrice(userId),
    } : undefined,
    highChatConversion: meetingStats.conversionRate > 20 ? {
      chatsToMeetings: meetingStats.bookings,
      conversionRate: meetingStats.conversionRate,
    } : undefined,
    missedEarningsOpportunity: missedEarnings.count > 10 ? {
      affordabilityIssues: missedEarnings.count,
      currentPrice: await getCurrentChatPrice(userId),
      suggestedPrice: await getCurrentChatPrice(userId) * 0.8, // 20% reduction suggestion
    } : undefined,
  };

  const suggestions = generateActionSuggestions(userId, suggestionContext);
  await saveSuggestions(userId, suggestions);

  // Update Top Creator badge if applicable
  if (topCreatorBadge) {
    await updateTopCreatorBadge(userId, retentionPercentile);
  }
}

/**
 * Get profile views for a time period
 */
async function getProfileViews(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<{ current: number; previous: number }> {
  const currentSnapshot = await db
    .collection('profileViews')
    .where('creatorId', '==', userId)
    .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(startDate))
    .where('timestamp', '<=', admin.firestore.Timestamp.fromDate(endDate))
    .get();

  const previousStart = new Date(startDate.getTime() - 24 * 60 * 60 * 1000);
  const previousEnd = startDate;

  const previousSnapshot = await db
    .collection('profileViews')
    .where('creatorId', '==', userId)
    .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(previousStart))
    .where('timestamp', '<=', admin.firestore.Timestamp.fromDate(previousEnd))
    .get();

  return {
    current: currentSnapshot.size,
    previous: previousSnapshot.size,
  };
}

/**
 * Get swipe interest (right swipes)
 */
async function getSwipeInterest(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<{ current: number; previous: number }> {
  const currentSnapshot = await db
    .collection('swipes')
    .where('targetUserId', '==', userId)
    .where('direction', '==', 'right')
    .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(startDate))
    .where('timestamp', '<=', admin.firestore.Timestamp.fromDate(endDate))
    .get();

  const previousStart = new Date(startDate.getTime() - 24 * 60 * 60 * 1000);
  const previousEnd = startDate;

  const previousSnapshot = await db
    .collection('swipes')
    .where('targetUserId', '==', userId)
    .where('direction', '==', 'right')
    .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(previousStart))
    .where('timestamp', '<=', admin.firestore.Timestamp.fromDate(previousEnd))
    .get();

  return {
    current: currentSnapshot.size,
    previous: previousSnapshot.size,
  };
}

/**
 * Get chat requests sent to creator
 */
async function getChatRequests(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<{ current: number; previous: number }> {
  const currentSnapshot = await db
    .collection('chatRequests')
    .where('recipientId', '==', userId)
    .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(startDate))
    .where('createdAt', '<=', admin.firestore.Timestamp.fromDate(endDate))
    .get();

  const previousStart = new Date(startDate.getTime() - 24 * 60 * 60 * 1000);
  const previousEnd = startDate;

  const previousSnapshot = await db
    .collection('chatRequests')
    .where('recipientId', '==', userId)
    .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(previousStart))
    .where('createdAt', '<=', admin.firestore.Timestamp.fromDate(previousEnd))
    .get();

  return {
    current: currentSnapshot.size,
    previous: previousSnapshot.size,
  };
}

/**
 * Calculate missed earnings (users who couldn't afford)
 */
async function getMissedEarnings(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<{ count: number; estimatedRevenue: number; reason: 'unavailable' | 'slow_response' | 'price_too_high' }> {
  const failedPaymentsSnapshot = await db
    .collection('failedPayments')
    .where('creatorId', '==', userId)
    .where('reason', '==', 'insufficient_balance')
    .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(startDate))
    .where('timestamp', '<=', admin.firestore.Timestamp.fromDate(endDate))
    .get();

  const currentPrice = await getCurrentChatPrice(userId);
  const estimatedRevenue = failedPaymentsSnapshot.size * currentPrice;

  return {
    count: failedPaymentsSnapshot.size,
    estimatedRevenue,
    reason: 'price_too_high',
  };
}

/**
 * Get age range metrics
 */
async function getAgeRangeMetrics(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<AgeRangeMetrics[]> {
  const interactionsSnapshot = await db
    .collection('interactions')
    .where('creatorId', '==', userId)
    .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(startDate))
    .where('timestamp', '<=', admin.firestore.Timestamp.fromDate(endDate))
    .get();

  const ageRanges = new Map<string, { interactions: number; earnings: number }>();
  
  for (const doc of interactionsSnapshot.docs) {
    const data = doc.data();
    const ageRange = getAgeRangeFromAge(data.userAge || 25);
    
    const current = ageRanges.get(ageRange) || { interactions: 0, earnings: 0 };
    current.interactions++;
    current.earnings += data.tokensSpent || 0;
    ageRanges.set(ageRange, current);
  }

  return Array.from(ageRanges.entries()).map(([ageRange, data]) => ({
    ageRange,
    interactions: data.interactions,
    earnings: data.earnings,
    conversionRate: (data.earnings / data.interactions) * 100,
  }));
}

/**
 * Get country metrics
 */
async function getCountryMetrics(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<CountryMetrics[]> {
  const interactionsSnapshot = await db
    .collection('interactions')
    .where('creatorId', '==', userId)
    .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(startDate))
    .where('timestamp', '<=', admin.firestore.Timestamp.fromDate(endDate))
    .get();

  const countries = new Map<string, { interactions: number; earnings: number }>();
  
  for (const doc of interactionsSnapshot.docs) {
    const data = doc.data();
    const country = data.userCountry || 'Unknown';
    
    const current = countries.get(country) || { interactions: 0, earnings: 0 };
    current.interactions++;
    current.earnings += data.tokensSpent || 0;
    countries.set(country, current);
  }

  return Array.from(countries.entries())
    .map(([country, data]) => ({
      country,
      interactions: data.interactions,
      earnings: data.earnings,
      popularity: calculatePopularityScore(data.interactions, data.earnings),
    }))
    .sort((a, b) => b.earnings - a.earnings);
}

/**
 * Get token earnings for different time periods
 */
async function getTokenEarnings(
  userId: string,
  dailyStart: Date,
  weeklyStart: Date,
  monthlyStart: Date,
  endDate: Date
): Promise<{ daily: number; weekly: number; monthly: number }> {
  const [dailyTransactions, weeklyTransactions, monthlyTransactions] = await Promise.all([
    db
      .collection('transactions')
      .where('recipientId', '==', userId)
      .where('status', '==', 'completed')
      .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(dailyStart))
      .where('createdAt', '<=', admin.firestore.Timestamp.fromDate(endDate))
      .get(),
    db
      .collection('transactions')
      .where('recipientId', '==', userId)
      .where('status', '==', 'completed')
      .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(weeklyStart))
      .where('createdAt', '<=', admin.firestore.Timestamp.fromDate(endDate))
      .get(),
    db
      .collection('transactions')
      .where('recipientId', '==', userId)
      .where('status', '==', 'completed')
      .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(monthlyStart))
      .where('createdAt', '<=', admin.firestore.Timestamp.fromDate(endDate))
      .get(),
  ]);

  const calculateEarnings = (snapshot: FirebaseFirestore.QuerySnapshot) => {
    let total = 0;
    snapshot.forEach((doc) => {
      const data = doc.data();
      // 65% revenue split for creator
      total += (data.amount || 0) * 0.65;
    });
    return total;
  };

  return {
    daily: calculateEarnings(dailyTransactions),
    weekly: calculateEarnings(weeklyTransactions),
    monthly: calculateEarnings(monthlyTransactions),
  };
}

/**
 * Get meeting conversion statistics
 */
async function getMeetingConversionStats(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<{ conversionRate: number; bookings: number }> {
  const [chatsSnapshot, meetingsSnapshot] = await Promise.all([
    db
      .collection('chats')
      .where('creatorId', '==', userId)
      .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(startDate))
      .where('createdAt', '<=', admin.firestore.Timestamp.fromDate(endDate))
      .get(),
    db
      .collection('meetings')
      .where('creatorId', '==', userId)
      .where('status', '==', 'booked')
      .where('bookedAt', '>=', admin.firestore.Timestamp.fromDate(startDate))
      .where('bookedAt', '<=', admin.firestore.Timestamp.fromDate(endDate))
      .get(),
  ]);

  const totalChats = chatsSnapshot.size;
  const bookings = meetingsSnapshot.size;
  const conversionRate = totalChats > 0 ? (bookings / totalChats) * 100 : 0;

  return { conversionRate, bookings };
}

/**
 * Get event popularity statistics
 */
async function getEventPopularityStats(userId: string): Promise<{ expectedAttendance: number }> {
  const upcomingEventsSnapshot = await db
    .collection('events')
    .where('creatorId', '==', userId)
    .where('status', '==', 'upcoming')
    .orderBy('startTime', 'asc')
    .limit(5)
    .get();

  let totalExpectedAttendance = 0;
  upcomingEventsSnapshot.forEach((doc) => {
    const data = doc.data();
    totalExpectedAttendance += data.interestedCount || 0;
  });

  return { expectedAttendance: totalExpectedAttendance };
}

/**
 * Calculate retention percentile ranking
 */
async function calculateRetentionPercentile(userId: string, monthlyEarnings: number): Promise<number> {
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  const country = userData?.country || 'Unknown';

  // Get all creators in the same country
  const regionalCreatorsSnapshot = await db
    .collection('creatorDashboard')
    .where('country', '==', country)
    .get();

  const earningsArray: number[] = [];
  regionalCreatorsSnapshot.forEach((doc) => {
    const data = doc.data() as CreatorDashboard;
    earningsArray.push(data.tokenEarnings.monthly);
  });

  // Sort and calculate percentile
  earningsArray.sort((a, b) => b - a);
  const rank = earningsArray.indexOf(monthlyEarnings) + 1;
  const percentile = (rank / earningsArray.length) * 100;

  return Math.round(percentile * 10) / 10; // Round to 1 decimal place
}

/**
 * Generate motivational nudges based on context
 */
function generateMotivationalNudges(userId: string, context: NudgeContext): MotivationalNudge[] {
  const nudges: MotivationalNudge[] = [];
  const now = admin.firestore.Timestamp.now();
  const expiresAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + 7 * 24 * 60 * 60 * 1000); // 7 days

  if (context.recentUpload && context.recentUpload.viewIncrease > 10) {
    nudges.push({
      id: `${userId}_visibility_${Date.now()}`,
      userId,
      type: 'visibility',
      message: NUDGE_TEMPLATES.visibility_increase(context.recentUpload.viewIncrease),
      priority: 8,
      actionable: true,
      suggestedAction: 'Upload new content',
      createdAt: now,
      expiresAt,
      dismissed: false,
    });
  }

  if (context.responseSpeedImprovement && context.responseSpeedImprovement.revenueImpact > 5) {
    nudges.push({
      id: `${userId}_response_${Date.now()}`,
      userId,
      type: 'response_speed',
      message: NUDGE_TEMPLATES.response_speed_impact(context.responseSpeedImprovement.revenueImpact),
      priority: 9,
      actionable: false,
      createdAt: now,
      expiresAt,
      dismissed: false,
    });
  }

  if (context.rankingAchievement && context.rankingAchievement.percentile <= 10) {
    nudges.push({
      id: `${userId}_ranking_${Date.now()}`,
      userId,
      type: 'ranking',
      message: NUDGE_TEMPLATES.ranking_achievement(
        context.rankingAchievement.percentile,
        context.rankingAchievement.country
      ),
      priority: 10,
      actionable: false,
      createdAt: now,
      expiresAt,
      dismissed: false,
    });
  }

  if (context.missedOpportunities && context.missedOpportunities.chatRequests > 3) {
    nudges.push({
      id: `${userId}_missed_${Date.now()}`,
      userId,
      type: 'demand',
      message: NUDGE_TEMPLATES.missed_bookings(context.missedOpportunities.chatRequests),
      priority: 7,
      actionable: true,
      suggestedAction: 'Add calendar slots',
      createdAt: now,
      expiresAt,
      dismissed: false,
    });
  }

  return nudges;
}

/**
 * Generate action suggestions based on context
 */
function generateActionSuggestions(userId: string, context: SuggestionContext): ActionSuggestion[] {
  const suggestions: ActionSuggestion[] = [];
  const now = admin.firestore.Timestamp.now();

  if (context.highProfileInterest) {
    const template = SUGGESTION_TEMPLATES.enable_premium_chat(context.highProfileInterest.views);
    suggestions.push({
      id: `${userId}_premium_chat_${Date.now()}`,
      userId,
      type: 'pricing',
      title: template.title,
      description: template.description,
      metric: 'profileViews',
      expectedImpact: template.expectedImpact,
      actionType: 'enable_premium_chat',
      priority: 8,
      active: true,
      createdAt: now,
    });
  }

  if (context.highChatConversion) {
    const template = SUGGESTION_TEMPLATES.promote_video_calls(context.highChatConversion.conversionRate);
    suggestions.push({
      id: `${userId}_video_calls_${Date.now()}`,
      userId,
      type: 'promotion',
      title: template.title,
      description: template.description,
      metric: 'meetingConversion',
      expectedImpact: template.expectedImpact,
      actionType: 'promote_video_calls',
      priority: 9,
      active: true,
      createdAt: now,
    });
  }

  if (context.missedEarningsOpportunity && context.missedEarningsOpportunity.affordabilityIssues > 10) {
    const template = SUGGESTION_TEMPLATES.adjust_pricing(
      context.missedEarningsOpportunity.affordabilityIssues,
      context.missedEarningsOpportunity.currentPrice
    );
    suggestions.push({
      id: `${userId}_adjust_price_${Date.now()}`,
      userId,
      type: 'pricing',
      title: template.title,
      description: template.description,
      metric: 'missedEarnings',
      expectedImpact: template.expectedImpact,
      actionType: 'adjust_price',
      priority: 6,
      active: true,
      createdAt: now,
    });
  }

  return suggestions;
}

/**
 * Save nudges to Firestore
 */
async function saveNudges(userId: string, nudges: MotivationalNudge[]): Promise<void> {
  const batch = db.batch();
  
  for (const nudge of nudges) {
    const nudgeRef = db
      .collection('creatorDashboard')
      .doc(userId)
      .collection('motivationalNudges')
      .doc(nudge.id);
    batch.set(nudgeRef, nudge);
  }

  await batch.commit();
}

/**
 * Save suggestions to Firestore
 */
async function saveSuggestions(userId: string, suggestions: ActionSuggestion[]): Promise<void> {
  const batch = db.batch();
  
  for (const suggestion of suggestions) {
    const suggestionRef = db
      .collection('creatorDashboard')
      .doc(userId)
      .collection('actionSuggestions')
      .doc(suggestion.id);
    batch.set(suggestionRef, suggestion);
  }

  await batch.commit();
}

/**
 * Update Top Creator badge
 */
async function updateTopCreatorBadge(userId: string, percentile: number): Promise<void> {
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  const country = userData?.country || 'Unknown';

  let badgeType: 'top_1_percent' | 'top_5_percent' | 'top_10_percent';
  if (percentile <= 1) badgeType = 'top_1_percent';
  else if (percentile <= 5) badgeType = 'top_5_percent';
  else badgeType = 'top_10_percent';

  const badge: TopCreatorBadge = {
    userId,
    country,
    percentile,
    badgeType,
    earnedAt: admin.firestore.Timestamp.now(),
    lastUpdated: admin.firestore.Timestamp.now(),
    visible: true,
  };

  await db.collection('topCreatorBadges').doc(userId).set(badge);
}

// Helper functions

function calculatePercentageChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function getTopAgeRange(metrics: AgeRangeMetrics[]): string {
  if (metrics.length === 0) return 'Unknown';
  return metrics.sort((a, b) => b.earnings - a.earnings)[0].ageRange;
}

function getTopCountries(metrics: CountryMetrics[], count: number): string[] {
  return metrics.slice(0, count).map((m) => m.country);
}

function getAgeRangeFromAge(age: number): string {
  if (age < 18) return '0-17';
  if (age < 25) return '18-24';
  if (age < 35) return '25-34';
  if (age < 45) return '35-44';
  if (age < 55) return '45-54';
  return '55+';
}

function calculatePopularityScore(interactions: number, earnings: number): number {
  return Math.min(100, (interactions * 0.3 + earnings * 0.7) / 10);
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

async function getCurrentChatPrice(userId: string): Promise<number> {
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  return userData?.chatPrice || 100; // Default 100 tokens
}

async function getUserCountry(userId: string): Promise<string> {
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  return userData?.country || 'Unknown';
}

async function getPreviousDashboard(userId: string): Promise<CreatorDashboard | null> {
  const doc = await db.collection('creatorDashboard').doc(userId).get();
  return doc.exists ? (doc.data() as CreatorDashboard) : null;
}

async function getAverageResponseTime(userId: string, startDate: Date, endDate: Date): Promise<number> {
  const messagesSnapshot = await db
    .collection('messages')
    .where('senderId', '==', userId)
    .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(startDate))
    .where('timestamp', '<=', admin.firestore.Timestamp.fromDate(endDate))
    .get();

  if (messagesSnapshot.empty) return 0;

  let totalResponseTime = 0;
  let responseCount = 0;

  messagesSnapshot.forEach((doc) => {
    const data = doc.data();
    if (data.responseTime) {
      totalResponseTime += data.responseTime;
      responseCount++;
    }
  });

  return responseCount > 0 ? totalResponseTime / responseCount : 0;
}

async function getOnlineTime(userId: string, startDate: Date, endDate: Date): Promise<number> {
  const presenceSnapshot = await db
    .collection('presence')
    .doc(userId)
    .collection('sessions')
    .where('start', '>=', admin.firestore.Timestamp.fromDate(startDate))
    .where('start', '<=', admin.firestore.Timestamp.fromDate(endDate))
    .get();

  let totalMinutes = 0;
  presenceSnapshot.forEach((doc) => {
    const data = doc.data();
    const duration = data.end ? data.end.toMillis() - data.start.toMillis() : 0;
    totalMinutes += duration / (1000 * 60);
  });

  return Math.round(totalMinutes);
}

async function getContentUploads(userId: string, startDate: Date, endDate: Date): Promise<number> {
  const uploadsSnapshot = await db
    .collection('media')
    .where('userId', '==', userId)
    .where('uploadedAt', '>=', admin.firestore.Timestamp.fromDate(startDate))
    .where('uploadedAt', '<=', admin.firestore.Timestamp.fromDate(endDate))
    .get();

  return uploadsSnapshot.size;
}

async function getRecentUploadContext(userId: string): Promise<{ timestamp: FirebaseFirestore.Timestamp; viewIncrease: number } | undefined> {
  const recentUpload = await db
    .collection('media')
    .where('userId', '==', userId)
    .orderBy('uploadedAt', 'desc')
    .limit(1)
    .get();

  if (recentUpload.empty) return undefined;

  const uploadData = recentUpload.docs[0].data();
  const uploadTime = uploadData.uploadedAt as FirebaseFirestore.Timestamp;
  
  // Check view increase after upload
  const viewsAfter = await db
    .collection('profileViews')
    .where('creatorId', '==', userId)
    .where('timestamp', '>', uploadTime)
    .get();

  const viewsBefore = await db
    .collection('profileViews')
    .where('creatorId', '==', userId)
    .where('timestamp', '<', uploadTime)
    .where('timestamp', '>', admin.firestore.Timestamp.fromMillis(uploadTime.toMillis() - 24 * 60 * 60 * 1000))
    .get();

  const viewIncrease = calculatePercentageChange(viewsAfter.size, viewsBefore.size);

  return {
    timestamp: uploadTime,
    viewIncrease,
  };
}

async function getResponseSpeedContext(userId: string): Promise<{ previousAverage: number; currentAverage: number; revenueImpact: number } | undefined> {
  const now = new Date();
  const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const [currentAvg, previousAvg] = await Promise.all([
    getAverageResponseTime(userId, lastWeek, now),
    getAverageResponseTime(userId, twoWeeksAgo, lastWeek),
  ]);

  if (currentAvg >= previousAvg) return undefined; // No improvement

  // Estimate revenue impact (simplified)
  const improvement = ((previousAvg - currentAvg) / previousAvg) * 100;
  const revenueImpact = improvement * 0.5; // Rough estimate

  return {
    previousAverage: previousAvg,
    currentAverage: currentAvg,
    revenueImpact: Math.round(revenueImpact),
  };
}

/**
 * HTTP callable function to manually trigger dashboard calculation for a specific creator
 */
export const triggerDashboardCalculation = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const userId = data.userId || context.auth.uid;

  // Verify the user is a creator
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists || userDoc.data()?.role !== 'creator') {
    throw new functions.https.HttpsError('permission-denied', 'Must be a creator');
  }

  try {
    await calculateCreatorAnalytics(userId);
    return { success: true, message: 'Dashboard calculated successfully' };
  } catch (error) {
    console.error('Error calculating dashboard:', error);
    throw new functions.https.HttpsError('internal', 'Failed to calculate dashboard');
  }
});

/**
 * HTTP callable function to dismiss a motivational nudge
 */
export const dismissNudge = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { nudgeId } = data;
  const userId = context.auth.uid;

  await db
    .collection('creatorDashboard')
    .doc(userId)
    .collection('motivationalNudges')
    .doc(nudgeId)
    .update({
      dismissed: true,
      dismissedAt: admin.firestore.Timestamp.now(),
    });

  return { success: true };
});

/**
 * HTTP callable function to mark an action suggestion as completed
 */
export const completeActionSuggestion = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { suggestionId } = data;
  const userId = context.auth.uid;

  await db
    .collection('creatorDashboard')
    .doc(userId)
    .collection('actionSuggestions')
    .doc(suggestionId)
    .update({
      active: false,
      completedAt: admin.firestore.Timestamp.now(),
    });

  // Log the event
  await db
    .collection('dashboardEvents')
    .doc(userId)
    .collection('events')
    .add({
      userId,
      type: 'suggestion_completed',
      suggestionId,
      metadata: {},
      timestamp: admin.firestore.Timestamp.now(),
    });

  return { success: true };
});