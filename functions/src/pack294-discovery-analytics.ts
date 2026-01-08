/**
 * PACK 294 - Search & Discovery Filters
 * Analytics Events for Discovery System
 * 
 * Tracks user behavior for AI learning and optimization
 */

import { onCall } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const db = getFirestore();

/**
 * Log discovery profile view event
 */
export const logDiscoveryProfileView = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const { profileId } = request.data;
    const userId = request.auth?.uid;

    if (!userId || !profileId) {
      throw new Error('Invalid parameters');
    }

    try {
      await db.collection('discoveryAnalytics').add({
        userId,
        eventType: 'profile_viewed',
        profileId,
        timestamp: FieldValue.serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      console.error('Error logging profile view:', error);
      throw new Error('Failed to log analytics event');
    }
  }
);

/**
 * Log discovery profile like event
 */
export const logDiscoveryProfileLike = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const { profileId } = request.data;
    const userId = request.auth?.uid;

    if (!userId || !profileId) {
      throw new Error('Invalid parameters');
    }

    try {
      await db.collection('discoveryAnalytics').add({
        userId,
        eventType: 'profile_like',
        profileId,
        timestamp: FieldValue.serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      console.error('Error logging profile like:', error);
      throw new Error('Failed to log analytics event');
    }
  }
);

/**
 * Log opening chat from discovery
 */
export const logDiscoveryOpenChat = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const { profileId } = request.data;
    const userId = request.auth?.uid;

    if (!userId || !profileId) {
      throw new Error('Invalid parameters');
    }

    try {
      await db.collection('discoveryAnalytics').add({
        userId,
        eventType: 'open_chat',
        profileId,
        timestamp: FieldValue.serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      console.error('Error logging open chat:', error);
      throw new Error('Failed to log analytics event');
    }
  }
);

/**
 * Log opening calendar from discovery
 */
export const logDiscoveryOpenCalendar = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const { profileId } = request.data;
    const userId = request.auth?.uid;

    if (!userId || !profileId) {
      throw new Error('Invalid parameters');
    }

    try {
      await db.collection('discoveryAnalytics').add({
        userId,
        eventType: 'open_calendar',
        profileId,
        timestamp: FieldValue.serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      console.error('Error logging open calendar:', error);
      throw new Error('Failed to log analytics event');
    }
  }
);

/**
 * Scheduled function to aggregate discovery analytics
 * Runs daily to create insights for creators
 */
export const aggregateDiscoveryAnalytics = onCall(
  { region: 'europe-west3' },
  async (request) => {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Query analytics from yesterday
      const analyticsSnapshot = await db.collection('discoveryAnalytics')
        .where('timestamp', '>=', yesterday)
        .where('timestamp', '<', today)
        .get();

      // Aggregate by profileId
      const aggregation: Record<string, {
        views: number;
        likes: number;
        chatOpens: number;
        calendarOpens: number;
      }> = {};

      analyticsSnapshot.forEach((doc) => {
        const data = doc.data();
        const profileId = data.profileId;

        if (!profileId) return;

        if (!aggregation[profileId]) {
          aggregation[profileId] = {
            views: 0,
            likes: 0,
            chatOpens: 0,
            calendarOpens: 0,
          };
        }

        switch (data.eventType) {
          case 'profile_viewed':
            aggregation[profileId].views++;
            break;
          case 'profile_like':
            aggregation[profileId].likes++;
            break;
          case 'open_chat':
            aggregation[profileId].chatOpens++;
            break;
          case 'open_calendar':
            aggregation[profileId].calendarOpens++;
            break;
        }
      });

      // Write aggregations to creator analytics
      const batch = db.batch();
      
      Object.entries(aggregation).forEach(([profileId, stats]) => {
        const analyticsRef = db.collection('creator_analytics_daily')
          .doc(`${profileId}_${yesterday.toISOString().split('T')[0]}`);
        
        batch.set(analyticsRef, {
          creatorId: profileId,
          date: yesterday,
          discoveryViews: stats.views,
          discoveryLikes: stats.likes,
          discoveryChatOpens: stats.chatOpens,
          discoveryCalendarOpens: stats.calendarOpens,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      });

      await batch.commit();

      return { 
        success: true, 
        profilesProcessed: Object.keys(aggregation).length 
      };
    } catch (error) {
      console.error('Error aggregating discovery analytics:', error);
      throw new Error('Failed to aggregate analytics');
    }
  }
);