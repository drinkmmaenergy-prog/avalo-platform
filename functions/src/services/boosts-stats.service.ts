/**
 * PACK 252 - BOOSTS MARKETPLACE
 * Real-time stats tracking system for boost performance
 */

import { db, increment, serverTimestamp } from '../init';
import { BOOSTS_COLLECTION, ActiveBoost } from '../types/boosts.types';
import { getActiveBoosts } from './boosts.service';

/**
 * Track profile view for boosted users
 */
export async function trackBoostView(viewedUserId: string): Promise<void> {
  try {
    const activeBoosts = await getActiveBoosts(viewedUserId);
    
    if (activeBoosts.length === 0) {
      return; // No active boosts
    }

    const now = Date.now();
    const hour = new Date(now).toISOString().slice(0, 13); // YYYY-MM-DDTHH
    const day = new Date(now).toISOString().slice(0, 10); // YYYY-MM-DD

    // Update all active boosts
    const batch = db.batch();

    for (const boost of activeBoosts) {
      const boostRef = db.collection(BOOSTS_COLLECTION).doc(boost.boostId);
      
      batch.update(boostRef, {
        'stats.views': increment(1),
        'stats.impressions': increment(1),
        [`stats.hourlyViews.${hour}`]: increment(1),
        [`stats.dailyViews.${day}`]: increment(1)
      });
    }

    await batch.commit();
  } catch (error) {
    console.error('Error tracking boost view:', error);
  }
}

/**
 * Track like received for boosted user
 */
export async function trackBoostLike(likedUserId: string): Promise<void> {
  try {
    const activeBoosts = await getActiveBoosts(likedUserId);
    
    if (activeBoosts.length === 0) {
      return;
    }

    const batch = db.batch();

    for (const boost of activeBoosts) {
      const boostRef = db.collection(BOOSTS_COLLECTION).doc(boost.boostId);
      
      batch.update(boostRef, {
        'stats.likes': increment(1)
      });
    }

    await batch.commit();
  } catch (error) {
    console.error('Error tracking boost like:', error);
  }
}

/**
 * Track match for boosted user
 */
export async function trackBoostMatch(userId: string): Promise<void> {
  try {
    const activeBoosts = await getActiveBoosts(userId);
    
    if (activeBoosts.length === 0) {
      return;
    }

    const batch = db.batch();

    for (const boost of activeBoosts) {
      const boostRef = db.collection(BOOSTS_COLLECTION).doc(boost.boostId);
      
      batch.update(boostRef, {
        'stats.matches': increment(1)
      });
    }

    await batch.commit();
  } catch (error) {
    console.error('Error tracking boost match:', error);
  }
}

/**
 * Track message sent from boosted user
 */
export async function trackBoostMessageSent(senderId: string): Promise<void> {
  try {
    const activeBoosts = await getActiveBoosts(senderId);
    
    if (activeBoosts.length === 0) {
      return;
    }

    const batch = db.batch();

    for (const boost of activeBoosts) {
      const boostRef = db.collection(BOOSTS_COLLECTION).doc(boost.boostId);
      
      batch.update(boostRef, {
        'stats.messagesSent': increment(1)
      });
    }

    await batch.commit();
  } catch (error) {
    console.error('Error tracking boost message sent:', error);
  }
}

/**
 * Track message received by boosted user
 */
export async function trackBoostMessageReceived(recipientId: string): Promise<void> {
  try {
    const activeBoosts = await getActiveBoosts(recipientId);
    
    if (activeBoosts.length === 0) {
      return;
    }

    const batch = db.batch();

    for (const boost of activeBoosts) {
      const boostRef = db.collection(BOOSTS_COLLECTION).doc(boost.boostId);
      
      batch.update(boostRef, {
        'stats.messagesReceived': increment(1)
      });
    }

    await batch.commit();
  } catch (error) {
    console.error('Error tracking boost message received:', error);
  }
}

/**
 * Get comprehensive boost stats for display
 */
export async function getBoostPerformanceStats(boostId: string): Promise<{
  totalViews: number;
  totalLikes: number;
  totalMatches: number;
  totalImpressions: number;
  messagesSent: number;
  messagesReceived: number;
  conversionRate: number; // likes / views
  matchRate: number; // matches / views
  hourlyBreakdown: { hour: string; views: number }[];
  dailyBreakdown: { day: string; views: number }[];
  remainingTime: number; // milliseconds
  isActive: boolean;
} | null> {
  try {
    const boostDoc = await db.collection(BOOSTS_COLLECTION).doc(boostId).get();
    
    if (!boostDoc.exists) {
      return null;
    }

    const boost = boostDoc.data() as ActiveBoost;
    const stats = boost.stats;
    const now = Date.now();
    const remainingTime = Math.max(0, boost.endTime - now);

    // Convert hourly views object to array
    const hourlyBreakdown = Object.entries(stats.hourlyViews || {})
      .map(([hour, views]) => ({ hour, views: views as number }))
      .sort((a, b) => a.hour.localeCompare(b.hour));

    // Convert daily views object to array
    const dailyBreakdown = Object.entries(stats.dailyViews || {})
      .map(([day, views]) => ({ day, views: views as number }))
      .sort((a, b) => a.day.localeCompare(b.day));

    const conversionRate = stats.views > 0 ? (stats.likes / stats.views) * 100 : 0;
    const matchRate = stats.views > 0 ? (stats.matches / stats.views) * 100 : 0;

    return {
      totalViews: stats.views,
      totalLikes: stats.likes,
      totalMatches: stats.matches,
      totalImpressions: stats.impressions,
      messagesSent: stats.messagesSent,
      messagesReceived: stats.messagesReceived,
      conversionRate: Math.round(conversionRate * 100) / 100,
      matchRate: Math.round(matchRate * 100) / 100,
      hourlyBreakdown,
      dailyBreakdown,
      remainingTime,
      isActive: boost.isActive && remainingTime > 0
    };
  } catch (error) {
    console.error('Error getting boost performance stats:', error);
    return null;
  }
}

/**
 * Get aggregated stats for all user's boosts
 */
export async function getUserBoostHistory(userId: string): Promise<{
  totalBoostsPurchased: number;
  totalTokensSpent: number;
  totalViews: number;
  totalLikes: number;
  totalMatches: number;
  averageConversionRate: number;
  recentBoosts: {
    boostId: string;
    type: string;
    startTime: number;
    endTime: number;
    views: number;
    likes: number;
    matches: number;
  }[];
}> {
  try {
    const snapshot = await db
      .collection(BOOSTS_COLLECTION)
      .where('userId', '==', userId)
      .orderBy('startTime', 'desc')
      .limit(20)
      .get();

    let totalTokensSpent = 0;
    let totalViews = 0;
    let totalLikes = 0;
    let totalMatches = 0;

    const recentBoosts = snapshot.docs.map(doc => {
      const boost = doc.data() as ActiveBoost;
      totalTokensSpent += boost.tokensPaid;
      totalViews += boost.stats.views;
      totalLikes += boost.stats.likes;
      totalMatches += boost.stats.matches;

      return {
        boostId: boost.boostId,
        type: boost.type,
        startTime: boost.startTime,
        endTime: boost.endTime,
        views: boost.stats.views,
        likes: boost.stats.likes,
        matches: boost.stats.matches
      };
    });

    const averageConversionRate = totalViews > 0
      ? Math.round((totalLikes / totalViews) * 10000) / 100
      : 0;

    return {
      totalBoostsPurchased: snapshot.size,
      totalTokensSpent,
      totalViews,
      totalLikes,
      totalMatches,
      averageConversionRate,
      recentBoosts
    };
  } catch (error) {
    console.error('Error getting user boost history:', error);
    return {
      totalBoostsPurchased: 0,
      totalTokensSpent: 0,
      totalViews: 0,
      totalLikes: 0,
      totalMatches: 0,
      averageConversionRate: 0,
      recentBoosts: []
    };
  }
}

/**
 * Track impression (profile shown in feed/search, not necessarily viewed)
 */
export async function trackBoostImpression(userId: string): Promise<void> {
  try {
    const activeBoosts = await getActiveBoosts(userId);
    
    if (activeBoosts.length === 0) {
      return;
    }

    const batch = db.batch();

    for (const boost of activeBoosts) {
      const boostRef = db.collection(BOOSTS_COLLECTION).doc(boost.boostId);
      
      batch.update(boostRef, {
        'stats.impressions': increment(1)
      });
    }

    await batch.commit();
  } catch (error) {
    console.error('Error tracking boost impression:', error);
  }
}