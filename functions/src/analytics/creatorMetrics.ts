import { MONETIZATION_SPLITS, SPLITS } from "../config/monetizationSplits";

import * as functions from 'firebase-functions';
import { db, FieldValue, timestamp as Timestamp } from '../init';
import { arrayUnion, increment, logger, onSchedule, onDocumentCreated } from '../runtime';

interface CreatorMetrics {
  earnerId: string;
  date: string;
  exposureScore: number; // 0-100
  engagementScore: number; // 0-100
  chatEarnings: number;
  calendarEarnings: number;
  totalEarnings: number;
  growthTrends: {
    profileViews: { current: number; previous: number; change: number };
    matches: { current: number; previous: number; change: number };
    chatSessions: { current: number; previous: number; change: number };
    earnings: { current: number; previous: number; change: number };
  };
  ranking: {
    overall: number;
    category: string;
    previousRank: number;
    movement: number;
  };
  chatPriceEligibility: {
    eligible: boolean;
    currentPrice: number;
    suggestedPrice: number;
    reason: string;
  };
  metrics: {
    profileViews: number;
    uniqueViewers: number;
    swipesReceived: number;
    matchesCreated: number;
    chatSessionsStarted: number;
    avgChatDuration: number;
    calendarBookings: number;
    repeatCustomers: number;
    rating: number;
    responseRate: number;
    responseTime: number;
  };
}

// Track earner exposure (profile views, discovery appearances)
export const trackCreatorExposure = onDocumentCreated('profile_views/{viewId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
    const view = snap.data();
    const timestamp = Timestamp.now();
    const today = new Date().toISOString().split('T')[0];

    try {
      // Update earner daily metrics
      await db.collection('earner_metrics').doc(view.profile_user_id).collection('daily').doc(today).set({
        date: today,
        profile_views: FieldValue.increment(1),
        unique_viewers: FieldValue.arrayUnion(view.viewer_id),
        last_view: timestamp
      }, { merge: true });

      // Track exposure event
      await db.collection('earner_metrics').doc(view.profile_user_id).collection('events').add({
        event_type: 'profile_view',
        viewer_id: view.viewer_id,
        source: view.source || 'discovery',
        timestamp: timestamp
      });

    } catch (error) {
      console.error('Error tracking earner exposure:', error);
    }
  });

// Track earner engagement (swipes, matches, interactions)
export const trackCreatorEngagement = onDocumentCreated('matches/{matchId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
    const match = snap.data();
    const timestamp = Timestamp.now();
    const today = new Date().toISOString().split('T')[0];

    try {
      // Track for both users if they're earners
      for (const userId of match.user_ids) {
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists && userDoc.data()?.is_earner) {
          await db.collection('earner_metrics').doc(userId).collection('daily').doc(today).set({
            date: today,
            matches_created: FieldValue.increment(1),
            timestamp: timestamp
          }, { merge: true });

          await db.collection('earner_metrics').doc(userId).collection('events').add({
            event_type: 'match_created',
            match_id: event.params.matchId,
            timestamp: timestamp
          });
        }
      }

    } catch (error) {
      console.error('Error tracking earner engagement:', error);
    }
  });

// Track chat earnings
export const trackCreatorChatEarnings = onDocumentCreated('chats/{chatId}/payments/{paymentId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
    const payment = snap.data();
    const timestamp = Timestamp.now();
    const today = new Date().toISOString().split('T')[0];

    try {
      // Get chat details
      const chatDoc = await db.collection('chats').doc(event.params.chatId).get();
      if (!chatDoc.exists) return;

      const chat = chatDoc.data()!;
      const earnerId = chat.earner_id;

      // Calculate earner's share (assuming 70/30 split)
      const earnerEarnings = (payment.tokens || 0) * MONETIZATION_SPLITS.CHAT.earner;

      // Update earner daily metrics
      await db.collection('earner_metrics').doc(earnerId).collection('daily').doc(today).set({
        date: today,
        chat_earnings: FieldValue.increment(earnerEarnings),
        chat_sessions: FieldValue.increment(payment.is_first_payment ? 1 : 0),
        timestamp: timestamp
      }, { merge: true });

      // Track earning event
      await db.collection('earner_metrics').doc(earnerId).collection('events').add({
        event_type: 'chat_earnings',
        chat_id: event.params.chatId,
        tokens: earnerEarnings,
        timestamp: timestamp
      });

    } catch (error) {
      console.error('Error tracking earner chat earnings:', error);
    }
  });

// Track calendar earnings
export const trackCreatorCalendarEarnings = onDocumentCreated('calendar_events/{eventId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
    const eventData = snap.data();
    const timestamp = Timestamp.now();
    const today = new Date().toISOString().split('T')[0];

    try {
      const earnerId = eventData.earner_id;
      // Calculate earner's share
      const earnerEarnings = (eventData.tokens || 0) * 0.8; // 80% to earner for calendar

      // Update earner daily metrics
      await db.collection('earner_metrics').doc(earnerId).collection('daily').doc(today).set({
        date: today,
        calendar_earnings: FieldValue.increment(earnerEarnings),
        calendar_bookings: FieldValue.increment(1),
        timestamp: timestamp
      }, { merge: true });

      // Track earning event
      await db.collection('earner_metrics').doc(earnerId).collection('events').add({
        event_type: 'calendar_earnings',
        event_id: event.params.eventId,
        tokens: earnerEarnings,
        timestamp: timestamp
      });

      // Track repeat customers
      const previousBookings = await db.collection('calendar_events')
        .where('earner_id', '==', earnerId)
        .where('user_id', '==', eventData.user_id)
        .where('status', '==', 'completed')
        .count()
        .get();

      if (previousBookings.data().count > 0) {
        await db.collection('earner_metrics').doc(earnerId).collection('daily').doc(today).set({
          repeat_customers: FieldValue.increment(1)
        }, { merge: true });
      }

    } catch (error) {
      console.error('Error tracking earner calendar earnings:', error);
    }
  });

// Calculate exposure score
function calculateExposureScore(metrics: any): number {
  const weights = {
    profileViews: 0.3,
    uniqueViewers: 0.25,
    swipesReceived: 0.2,
    matchRate: 0.15,
    discoveryAppearances: 0.1
  };

  const profileViewsScore = Math.min((metrics.profile_views / 1000) * 100, 100);
  const uniqueViewersScore = Math.min((metrics.unique_viewers / 500) * 100, 100);
  const swipesScore = Math.min((metrics.swipes_received / 500) * 100, 100);
  const matchRate = metrics.swipes_received > 0 
    ? (metrics.matches_created / metrics.swipes_received) * 100 
    : 0;
  const discoveryScore = Math.min((metrics.discovery_appearances / 100) * 100, 100);

  return (
    profileViewsScore * weights.profileViews +
    uniqueViewersScore * weights.uniqueViewers +
    swipesScore * weights.swipesReceived +
    matchRate * weights.matchRate +
    discoveryScore * weights.discoveryAppearances
  );
}

// Calculate engagement score
function calculateEngagementScore(metrics: any): number {
  const weights = {
    responseRate: 0.25,
    responseTime: 0.2,
    chatSessions: 0.2,
    avgChatDuration: 0.15,
    rating: 0.2
  };

  const responseRateScore = (metrics.response_rate || 0) * 100;
  const responseTimeScore = metrics.response_time < 300 ? 100 : Math.max(0, 100 - (metrics.response_time / 60));
  const chatSessionsScore = Math.min((metrics.chat_sessions / 100) * 100, 100);
  const chatDurationScore = Math.min((metrics.avg_chat_duration / 3600) * 100, 100);
  const ratingScore = ((metrics.rating || 0) / 5) * 100;

  return (
    responseRateScore * weights.responseRate +
    responseTimeScore * weights.responseTime +
    chatSessionsScore * weights.chatSessions +
    chatDurationScore * weights.avgChatDuration +
    ratingScore * weights.rating
  );
}

// Calculate chat price eligibility
function calculateChatPriceEligibility(
  currentPrice: number,
  exposureScore: number,
  engagementScore: number,
  earnings: number,
  demand: number
): { eligible: boolean; currentPrice: number; suggestedPrice: number; reason: string } {
  const overallScore = (exposureScore + engagementScore) / 2;
  
  // Base price based on scores
  let suggestedPrice = 10; // Minimum

  if (overallScore > 80) {
    suggestedPrice = 50;
  } else if (overallScore > 60) {
    suggestedPrice = 30;
  } else if (overallScore > 40) {
    suggestedPrice = 20;
  } else {
    suggestedPrice = 10;
  }

  // Adjust for demand
  if (demand > 100) {
    suggestedPrice *= 1.5;
  } else if (demand > 50) {
    suggestedPrice *= 1.2;
  }

  // Adjust for earnings history
  if (earnings > 10000) {
    suggestedPrice *= 1.3;
  } else if (earnings > 5000) {
    suggestedPrice *= 1.1;
  }

  suggestedPrice = Math.round(suggestedPrice);

  // Determine eligibility for price increase
  const eligible = suggestedPrice > currentPrice && overallScore > 50;
  
  let reason = '';
  if (eligible) {
    reason = `High performance (${overallScore.toFixed(0)}/100) qualifies for price increase`;
  } else if (overallScore < 50) {
    reason = 'Improve engagement and exposure to increase price';
  } else {
    reason = 'Current price is optimal';
  }

  return { eligible, currentPrice, suggestedPrice, reason };
}

// Daily earner metrics aggregation
export const aggregateCreatorMetrics = onSchedule({ schedule: "0 4 * * *", timeZone: "UTC" }, async (event) => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];

    try {
      console.log(`Aggregating earner metrics for ${dateStr}`);

      // Get all earners
      const earnersSnapshot = await db.collection('users')
        .where('is_earner', '==', true)
        .get();

      const batch = db.batch();
      let count = 0;
      const rankings: { earnerId: string; score: number; earnings: number }[] = [];

      for (const earnerDoc of earnersSnapshot.docs) {
        const earnerId = earnerDoc.id;
        const earnerData = earnerDoc.data();

        // Get daily metrics
        const dailyDoc = await db.collection('earner_metrics')
          .doc(earnerId)
          .collection('daily')
          .doc(dateStr)
          .get();

        const daily = dailyDoc.exists ? dailyDoc.data() : {};

        // Get previous day for comparison
        const prevDate = new Date(yesterday);
        prevDate.setDate(prevDate.getDate() - 1);
        const prevDateStr = prevDate.toISOString().split('T')[0];
        
        const prevDailyDoc = await db.collection('earner_metrics')
          .doc(earnerId)
          .collection('daily')
          .doc(prevDateStr)
          .get();

        const prevDaily = prevDailyDoc.exists ? prevDailyDoc.data() : {};

        // Calculate metrics
        const profileViews = daily.profile_views || 0;
        const uniqueViewers = (daily.unique_viewers || []).length;
        const matchesCreated = daily.matches_created || 0;
        const chatSessions = daily.chat_sessions || 0;
        const chatEarnings = daily.chat_earnings || 0;
        const calendarEarnings = daily.calendar_earnings || 0;
        const totalEarnings = chatEarnings + calendarEarnings;
        const calendarBookings = daily.calendar_bookings || 0;
        const repeatCustomers = daily.repeat_customers || 0;

        // Get additional metrics from earner profile
        const responseRate = earnerData.response_rate || 0;
        const responseTime = earnerData.avg_response_time || 0;
        const rating = earnerData.rating || 0;
        const swipesReceived = daily.swipes_received || 0;
        const avgChatDuration = daily.avg_chat_duration || 0;

        // Calculate scores
        const exposureScore = calculateExposureScore({
          profile_views: profileViews,
          unique_viewers: uniqueViewers,
          swipes_received: swipesReceived,
          matches_created: matchesCreated,
          discovery_appearances: daily.discovery_appearances || 0
        });

        const engagementScore = calculateEngagementScore({
          response_rate: responseRate,
          response_time: responseTime,
          chat_sessions: chatSessions,
          avg_chat_duration: avgChatDuration,
          rating: rating
        });

        // Calculate growth trends
        const growthTrends = {
          profileViews: {
            current: profileViews,
            previous: prevDaily.profile_views || 0,
            change: profileViews - (prevDaily.profile_views || 0)
          },
          matches: {
            current: matchesCreated,
            previous: prevDaily.matches_created || 0,
            change: matchesCreated - (prevDaily.matches_created || 0)
          },
          chatSessions: {
            current: chatSessions,
            previous: prevDaily.chat_sessions || 0,
            change: chatSessions - (prevDaily.chat_sessions || 0)
          },
          earnings: {
            current: totalEarnings,
            previous: (prevDaily.chat_earnings || 0) + (prevDaily.calendar_earnings || 0),
            change: totalEarnings - ((prevDaily.chat_earnings || 0) + (prevDaily.calendar_earnings || 0))
          }
        };

        // Chat price eligibility
        const currentChatPrice = earnerData.chat_price || 10;
        const demand = chatSessions + calendarBookings;
        const chatPriceEligibility = calculateChatPriceEligibility(
          currentChatPrice,
          exposureScore,
          engagementScore,
          totalEarnings,
          demand
        );

        // Store for ranking calculation
        const overallScore = (exposureScore + engagementScore) / 2;
        rankings.push({ earnerId, score: overallScore, earnings: totalEarnings });

        // Create metrics object
        const metrics: Partial<CreatorMetrics> = {
          earnerId,
          date: dateStr,
          exposureScore,
          engagementScore,
          chatEarnings,
          calendarEarnings,
          totalEarnings,
          growthTrends,
          chatPriceEligibility,
          metrics: {
            profileViews,
            uniqueViewers,
            swipesReceived,
            matchesCreated,
            chatSessionsStarted: chatSessions,
            avgChatDuration,
            calendarBookings,
            repeatCustomers,
            rating,
            responseRate,
            responseTime
          }
        };

        // Save metrics
        const metricsRef = db.collection('earner_metrics')
          .doc(earnerId)
          .collection('daily')
          .doc(dateStr);
        
        batch.set(metricsRef, metrics, { merge: true });

        count++;
        if (count % 500 === 0) {
          await batch.commit();
          console.log(`Processed ${count} earner metrics`);
        }
      }

      // Calculate rankings
      rankings.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.earnings - a.earnings;
      });

      // Update rankings
      const rankBatch = db.batch();
      rankings.forEach((ranking, index) => {
        const rank = index + 1;
        const metricsRef = db.collection('earner_metrics')
          .doc(ranking.earnerId)
          .collection('daily')
          .doc(dateStr);
        
        rankBatch.update(metricsRef, {
          'ranking.overall': rank,
          'ranking.category': 'all', // Could be refined by category
          'ranking.previousRank': 0, // Would need to fetch previous day
          'ranking.movement': 0
        });
      });

      await rankBatch.commit();

      if (count % 500 !== 0) {
        await batch.commit();
      }

      console.log(`Creator metrics aggregation complete: ${count} earners`);

    } catch (error) {
      console.error('Error aggregating earner metrics:', error);
      throw error;
    }
  });

// Calculate weekly/monthly trends
export const calculateCreatorTrends = onSchedule({ schedule: "0 5 * * 1", timeZone: "UTC" }, async (event) => {
    console.log('Calculating earner trends...');

    try {
      const earnersSnapshot = await db.collection('users')
        .where('is_earner', '==', true)
        .get();

      for (const earnerDoc of earnersSnapshot.docs) {
        const earnerId = earnerDoc.id;

        // Get last 7 days of metrics
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const metricsSnapshot = await db.collection('earner_metrics')
          .doc(earnerId)
          .collection('daily')
          .where('date', '>=', sevenDaysAgo.toISOString().split('T')[0])
          .get();

        let totalExposure = 0;
        let totalEngagement = 0;
        let totalEarnings = 0;
        let count = 0;

        metricsSnapshot.forEach(doc => {
          const data = doc.data();
          totalExposure += data.exposureScore || 0;
          totalEngagement += data.engagementScore || 0;
          totalEarnings += data.totalEarnings || 0;
          count++;
        });

        if (count > 0) {
          const avgExposure = totalExposure / count;
          const avgEngagement = totalEngagement / count;

          await db.collection('earner_metrics').doc(earnerId).set({
            trends_7d: {
              avg_exposure_score: avgExposure,
              avg_engagement_score: avgEngagement,
              total_earnings: totalEarnings,
              calculated_at: Timestamp.now()
            }
          }, { merge: true });
        }
      }

      console.log('Creator trends calculation complete');

    } catch (error) {
      console.error('Error calculating earner trends:', error);
      throw error;
    }
  });





























