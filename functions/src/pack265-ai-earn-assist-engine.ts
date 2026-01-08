/**
 * PACK 265: AI EARN ASSIST ENGINE
 * Core logic for behavior prediction and suggestion generation
 */

import { db, serverTimestamp } from './init';
import { logger } from 'firebase-functions/v2';
import { Timestamp } from 'firebase-admin/firestore';
import {
  SupporterBehaviorSignal,
  ConversionTarget,
  AIEarningSuggestion,
  SuggestionType,
  SuggestionPriority,
  LiveScheduleRecommendation,
  DMPriorityLabel,
  DMPriority,
  ContentOptimizationTip,
  FeatureAwarenessPrompt,
  PROHIBITED_KEYWORDS,
  ALLOWED_SUGGESTION_TEMPLATES,
} from './pack265-ai-earn-assist-types';

// ============================================================================
// BEHAVIOR PREDICTION MODEL
// ============================================================================

/**
 * Analyze supporter behavior and calculate conversion probability
 */
export async function analyzeSupporterBehavior(
  creatorId: string,
  supporterId: string
): Promise<SupporterBehaviorSignal> {
  // Get supporter's interaction history
  const chatQuery = await db
    .collection('chats')
    .where('participants', 'array-contains', supporterId)
    .where('participants', 'array-contains', creatorId)
    .limit(1)
    .get();

  const chatDoc = chatQuery.docs[0];
  const chatData = chatDoc?.data();

  // Recent chat activity
  const recentMessages = await db
    .collection('messages')
    .where('chatId', '==', chatDoc?.id)
    .where('senderId', '==', supporterId)
    .where('createdAt', '>', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
    .get();

  const recentChatActivity = {
    messageCount: recentMessages.size,
    lastMessageAt: recentMessages.docs[0]?.data().createdAt?.toDate() || new Date(0),
    weight: recentMessages.size > 10 ? 'very_high' as const :
            recentMessages.size > 5 ? 'high' as const :
            recentMessages.size > 0 ? 'medium' as const : 'low' as const,
  };

  // Previous gifting behavior
  const giftTransactions = await db
    .collection('transactions')
    .where('fromUserId', '==', supporterId)
    .where('toUserId', '==', creatorId)
    .where('type', '==', 'gift')
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();

  const totalGiftValue = giftTransactions.docs.reduce((sum, doc) => sum + (doc.data().amount || 0), 0);
  const avgGiftValue = giftTransactions.size > 0 ? totalGiftValue / giftTransactions.size : 0;

  const previousGiftingBehavior = {
    totalGiftsSent: giftTransactions.size,
    averageGiftValue: avgGiftValue,
    lastGiftAt: giftTransactions.docs[0]?.data().createdAt?.toDate(),
    weight: giftTransactions.size > 10 ? 'very_high' as const :
            giftTransactions.size > 5 ? 'high' as const :
            giftTransactions.size > 0 ? 'medium' as const : 'low' as const,
  };

  // Profile view activity
  const profileViews = await db
    .collection('profileViews')
    .where('viewerId', '==', supporterId)
    .where('profileId', '==', creatorId)
    .where('viewedAt', '>', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
    .get();

  const profileViewActivity = {
    viewCount: profileViews.size,
    lastViewAt: profileViews.docs[0]?.data().viewedAt?.toDate() || new Date(0),
    weight: profileViews.size > 5 ? 'high' as const :
            profileViews.size > 2 ? 'medium' as const : 'low' as const,
  };

  // Live engagement
  const liveViews = await db
    .collection('liveViewers')
    .where('userId', '==', supporterId)
    .where('creatorId', '==', creatorId)
    .orderBy('joinedAt', 'desc')
    .limit(10)
    .get();

  const totalMinutes = liveViews.docs.reduce((sum, doc) => {
    const data = doc.data();
    const duration = data.leftAt && data.joinedAt 
      ? (data.leftAt.toDate().getTime() - data.joinedAt.toDate().getTime()) / 60000 
      : 0;
    return sum + duration;
  }, 0);

  const watchedFullLive = liveViews.docs.some(doc => {
    const data = doc.data();
    return data.watchDuration && data.watchDuration > 10; // 10+ minutes
  });

  const liveEngagement = {
    watchedFullLive,
    totalMinutesWatched: Math.round(totalMinutes),
    weight: watchedFullLive ? 'high' as const :
            totalMinutes > 5 ? 'medium' as const : 'low' as const,
  };

  // Recent swipe match
  const matches = await db
    .collection('matches')
    .where('participants', 'array-contains', supporterId)
    .where('participants', 'array-contains', creatorId)
    .where('matchedAt', '>', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
    .limit(1)
    .get();

  const recentSwipeMatch = {
    matched: matches.size > 0,
    matchedAt: matches.docs[0]?.data().matchedAt?.toDate(),
    weight: matches.size > 0 ? 'medium' as const : 'low' as const,
  };

  // Likes without chat
  const likes = await db
    .collection('likes')
    .where('likerId', '==', supporterId)
    .where('likedUserId', '==', creatorId)
    .get();

  const likesWithoutChat = {
    likeCount: likes.size,
    weight: 'low' as const,
  };

  // Calculate conversion probability
  const probability = calculateConversionProbability({
    recentChatActivity,
    previousGiftingBehavior,
    profileViewActivity,
    liveEngagement,
    recentSwipeMatch,
    likesWithoutChat,
  });

  // Predict expected value
  const predictedValue = calculatePredictedValue(avgGiftValue, probability, recentChatActivity.messageCount);

  const signal: SupporterBehaviorSignal = {
    supporterId,
    creatorId,
    recentChatActivity,
    previousGiftingBehavior,
    profileViewActivity,
    liveEngagement,
    recentSwipeMatch,
    likesWithoutChat,
    conversionProbability: probability,
    predictedValue: Math.round(predictedValue),
    lastAnalyzedAt: new Date(),
  };

  // Save to Firestore
  await db
    .collection('supporterBehavior')
    .doc(creatorId)
    .collection('signals')
    .doc(supporterId)
    .set(signal);

  return signal;
}

/**
 * Calculate conversion probability based on weighted signals
 */
function calculateConversionProbability(signals: {
  recentChatActivity: any;
  previousGiftingBehavior: any;
  profileViewActivity: any;
  liveEngagement: any;
  recentSwipeMatch: any;
  likesWithoutChat: any;
}): number {
  let score = 0;
  let maxScore = 0;

  // Recent chat activity (weight: 30)
  const chatWeight = 30;
  if (signals.recentChatActivity.weight === 'very_high') score += chatWeight;
  else if (signals.recentChatActivity.weight === 'high') score += chatWeight * 0.75;
  else if (signals.recentChatActivity.weight === 'medium') score += chatWeight * 0.4;
  maxScore += chatWeight;

  // Previous gifting (weight: 30)
  const giftWeight = 30;
  if (signals.previousGiftingBehavior.weight === 'very_high') score += giftWeight;
  else if (signals.previousGiftingBehavior.weight === 'high') score += giftWeight * 0.75;
  else if (signals.previousGiftingBehavior.weight === 'medium') score += giftWeight * 0.4;
  maxScore += giftWeight;

  // Profile views (weight: 15)
  const viewWeight = 15;
  if (signals.profileViewActivity.weight === 'high') score += viewWeight;
  else if (signals.profileViewActivity.weight === 'medium') score += viewWeight * 0.6;
  maxScore += viewWeight;

  // Live engagement (weight: 15)
  const liveWeight = 15;
  if (signals.liveEngagement.weight === 'high') score += liveWeight;
  else if (signals.liveEngagement.weight === 'medium') score += liveWeight * 0.6;
  maxScore += liveWeight;

  // Recent match (weight: 7)
  const matchWeight = 7;
  if (signals.recentSwipeMatch.weight === 'medium') score += matchWeight * 0.6;
  maxScore += matchWeight;

  // Likes (weight: 3)
  const likeWeight = 3;
  if (signals.likesWithoutChat.likeCount > 0) score += likeWeight * 0.5;
  maxScore += likeWeight;

  return Math.round((score / maxScore) * 100);
}

/**
 * Calculate predicted token value
 */
function calculatePredictedValue(
  avgGiftValue: number,
  probability: number,
  recentMessages: number
): number {
  // Base prediction on historical average
  let predicted = avgGiftValue > 0 ? avgGiftValue : 50; // Default 50 tokens

  // Adjust for probability
  predicted = predicted * (probability / 100);

  // Boost for high activity
  if (recentMessages > 10) predicted *= 1.5;
  else if (recentMessages > 5) predicted *= 1.2;

  return predicted;
}

/**
 * Get top conversion targets for a creator
 */
export async function getConversionTargets(
  creatorId: string,
  limit: number = 10
): Promise<ConversionTarget[]> {
  const signalsSnapshot = await db
    .collection('supporterBehavior')
    .doc(creatorId)
    .collection('signals')
    .where('conversionProbability', '>', 50)
    .orderBy('conversionProbability', 'desc')
    .limit(limit)
    .get();

  const targets: ConversionTarget[] = [];

  for (const doc of signalsSnapshot.docs) {
    const signal = doc.data() as SupporterBehaviorSignal;
    
    // Check if supporter has had paid interactions (to show name)
    const hasPaidInteraction = signal.previousGiftingBehavior.totalGiftsSent > 0;
    let displayName: string | undefined;

    if (hasPaidInteraction) {
      const userDoc = await db.collection('users').doc(signal.supporterId).get();
      displayName = userDoc.data()?.displayName;
    }

    // Identify top signals
    const topSignals: string[] = [];
    if (signal.recentChatActivity.weight === 'very_high' || signal.recentChatActivity.weight === 'high') {
      topSignals.push('Active chatter');
    }
    if (signal.previousGiftingBehavior.totalGiftsSent > 0) {
      topSignals.push('Previous supporter');
    }
    if (signal.profileViewActivity.viewCount > 3) {
      topSignals.push('Frequent viewer');
    }
    if (signal.liveEngagement.watchedFullLive) {
      topSignals.push('Live watcher');
    }

    // Determine urgency
    const urgency = signal.conversionProbability > 80 ? 'immediate' :
                    signal.conversionProbability > 65 ? 'soon' : 'normal';

    // Recommended action
    let recommendedAction = 'Send a friendly message';
    if (signal.recentChatActivity.messageCount > 5) {
      recommendedAction = 'Continue conversation';
    } else if (signal.liveEngagement.watchedFullLive) {
      recommendedAction = 'Thank them for watching your Live';
    }

    targets.push({
      supporterId: signal.supporterId,
      displayName,
      conversionProbability: signal.conversionProbability,
      predictedValue: signal.predictedValue,
      topSignals,
      recommendedAction,
      urgency,
    });
  }

  // Save targets
  const batch = db.batch();
  for (const target of targets) {
    const ref = db
      .collection('aiEarnAssist')
      .doc(creatorId)   .collection('conversionTargets')
      .doc(target.supporterId);
    batch.set(ref, target);
  }
  await batch.commit();

  return targets;
}

// ============================================================================
// SMART LIVE SCHEDULING
// ============================================================================

/**
 * Generate Live schedule recommendation for creator
 */
export async function generateLiveScheduleRecommendation(
  creatorId: string
): Promise<LiveScheduleRecommendation> {
  // Analyze historical Live performance
  const liveSessionsSnapshot = await db
    .collection('liveSessions')
    .where('creatorId', '==', creatorId)
    .where('status', '==', 'ended')
    .where('endedAt', '>', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)) // Last 90 days
    .orderBy('endedAt', 'desc')
    .limit(50)
    .get();

  if (liveSessionsSnapshot.empty) {
    // No historical data, return general best practices
    return getDefaultLiveRecommendation(creatorId);
  }

  // Analyze by day and time
  const dayStats: Record<string, { count: number; totalGifts: number; totalViewers: number }> = {};
  const hourStats: Record<number, { count: number; totalGifts: number; totalViewers: number }> = {};

  for (const doc of liveSessionsSnapshot.docs) {
    const data = doc.data();
    const startTime = data.startedAt?.toDate();
    if (!startTime) continue;

    const day = startTime.toLocaleDateString('en-US', { weekday: 'long' });
    const hour = startTime.getHours();

    // Day stats
    if (!dayStats[day]) dayStats[day] = { count: 0, totalGifts: 0, totalViewers: 0 };
    dayStats[day].count++;
    dayStats[day].totalGifts += data.totalGifts || 0;
    dayStats[day].totalViewers += data.peakViewers || 0;

    // Hour stats
    if (!hourStats[hour]) hourStats[hour] = { count: 0, totalGifts: 0, totalViewers: 0 };
    hourStats[hour].count++;
    hourStats[hour].totalGifts += data.totalGifts || 0;
    hourStats[hour].totalViewers += data.peakViewers || 0;
  }

  // Find best day
  let bestDay = '';
  let bestDayGifts = 0;
  for (const [day, stats] of Object.entries(dayStats)) {
    const avgGifts = stats.totalGifts / stats.count;
    if (avgGifts > bestDayGifts) {
      bestDayGifts = avgGifts;
      bestDay = day;
    }
  }

  // Find best time slots
  const bestHours = Object.entries(hourStats)
    .map(([hour, stats]) => ({
      hour: parseInt(hour),
      avgGifts: stats.totalGifts / stats.count,
      count: stats.count,
    }))
    .sort((a, b) => b.avgGifts - a.avgGifts)
    .slice(0, 3);

  const bestHour = bestHours[0].hour;

  // Calculate optimal duration
  const durations = liveSessionsSnapshot.docs.map(doc => {
    const data = doc.data();
    if (data.startedAt && data.endedAt) {
      return (data.endedAt.toDate().getTime() - data.startedAt.toDate().getTime()) / 60000;
    }
    return 0;
  }).filter(d => d > 0);

  const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
  const recommendedDuration = Math.round(avgDuration / 15) * 15; // Round to nearest 15 min

  // Get creator's audience interests for topic suggestions
  const topicSuggestions = await generateTopicSuggestions(creatorId);

  // Calculate average performance
  const totalGifts = liveSessionsSnapshot.docs.reduce((sum, doc) => sum + (doc.data().totalGifts || 0), 0);
  const avgGifts = totalGifts / liveSessionsSnapshot.size;

  // Calculate improvement
  const percentageAboveAverage = Math.round(((bestDayGifts - avgGifts) / avgGifts) * 100);

  const recommendation: LiveScheduleRecommendation = {
    creatorId,
    recommendedDay: bestDay,
    recommendedTime: `${bestHour}:00`,
    recommendedDuration: Math.max(30, Math.min(120, recommendedDuration)),
    topicSuggestions,
    predictions: {
      estimatedViewers: Math.round(dayStats[bestDay].totalViewers / dayStats[bestDay].count),
      estimatedGifts: Math.round(bestDayGifts),
      percentageAboveAverage,
    },
    reasoning: {
      dayReason: `Based on ${dayStats[bestDay].count} previous streams, ${bestDay} averages ${Math.round(bestDayGifts)} gifts`,
      timeReason: `${bestHour}:00-${bestHour + 1}:00 is your peak earning hour`,
      durationReason: `Your successful streams average ${recommendedDuration} minutes`,
    },
    basedOnHistoricalData: {
      totalLivesSampled: liveSessionsSnapshot.size,
      bestPerformingTimeSlots: bestHours.map(h => ({
        day: bestDay,
        hour: h.hour,
        avgGifts: Math.round(h.avgGifts),
      })),
    },
    generatedAt: new Date(),
    validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Valid for 1 week
  };

  // Save recommendation
  const dateKey = new Date().toISOString().slice(0, 10);
  await db
    .collection('aiEarnAssist_schedule')
    .doc(creatorId)
    .collection('liveRecommendations')
    .doc(dateKey)
    .set(recommendation);

  return recommendation;
}

/**
 * Get default Live recommendation when no historical data exists
 */
function getDefaultLiveRecommendation(creatorId: string): LiveScheduleRecommendation {
  return {
    creatorId,
    recommendedDay: 'Saturday',
    recommendedTime: '20:30',
    recommendedDuration: 60,
    topicSuggestions: ['Q&A with fans', 'Behind the scenes', 'Special performance'],
    predictions: {
      estimatedViewers: 0,
      estimatedGifts: 0,
      percentageAboveAverage: 0,
    },
    reasoning: {
      dayReason: 'Weekends typically have highest engagement across the platform',
      timeReason: 'Evening hours (8-10 PM) have peak user activity',
      durationReason: '60 minutes is the optimal balance for viewer retention',
    },
    basedOnHistoricalData: {
      totalLivesSampled: 0,
      bestPerformingTimeSlots: [],
    },
    generatedAt: new Date(),
    validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  };
}

/**
 * Generate topic suggestions based on audience interests
 */
async function generateTopicSuggestions(creatorId: string): Promise<string[]> {
  // Get creator's most successful content
  const contentSnapshot = await db
    .collection('stories')
    .where('creatorId', '==', creatorId)
    .where('stats.views', '>', 50)
    .orderBy('stats.views', 'desc')
    .limit(10)
    .get();

  const topics: string[] = [];

  // Analyze successful content themes
  for (const doc of contentSnapshot.docs) {
    const data = doc.data();
    if (data.caption) {
      // Simple keyword extraction
      if (data.caption.toLowerCase().includes('Q&A') || data.caption.toLowerCase().includes('questions')) {
        topics.push('Q&A Session');
      }
      if (data.caption.toLowerCase().includes('workout') || data.caption.toLowerCase().includes('fitness')) {
        topics.push('Fitness Session');
      }
      if (data.caption.toLowerCase().includes('cooking') || data.caption.toLowerCase().includes('recipe')) {
        topics.push('Cooking Show');
      }
    }
  }

  // Add generic popular topics if needed
  if (topics.length < 3) {
    topics.push('Get to know me', 'Behind the scenes', 'Fan requests');
  }

  return Array.from(new Set(topics)).slice(0, 5);
}

// ============================================================================
// SAFETY & COMPLIANCE
// ============================================================================

/**
 * Check if suggestion is compliant with safety rules
 */
export function checkSuggestionCompliance(suggestion: string): boolean {
  const lowerSuggestion = suggestion.toLowerCase();
  
  // Check for prohibited keywords
  for (const keyword of PROHIBITED_KEYWORDS) {
    if (lowerSuggestion.includes(keyword)) {
      logger.warn(`Suggestion blocked: contains prohibited keyword "${keyword}"`);
      return false;
    }
  }

  return true;
}

/**
 * Sanitize suggestion text to ensure compliance
 */
export function sanitizeSuggestion(suggestion: string): string {
  // Remove any potentially problematic content
  let sanitized = suggestion;
  
  for (const keyword of PROHIBITED_KEYWORDS) {
    const regex = new RegExp(keyword, 'gi');
    sanitized = sanitized.replace(regex, '[removed]');
  }

  return sanitized;
}