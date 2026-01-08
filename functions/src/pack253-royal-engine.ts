/**
 * PACK 253 — ROYAL UPGRADE FUNNEL ENGINE
 * Core logic for Royal tier calculation, unlock, and maintenance
 */

import { db, admin } from './init';
import {
  RoyalMetrics,
  RoyalStatus,
  RoyalProgress,
  RoyalAnalytics,
  RoyalDecay,
  ROYAL_REQUIREMENTS,
  ROYAL_BENEFITS,
  ROYAL_NOTIFICATION_THRESHOLDS,
} from './pack253-royal-types';

/**
 * Calculate Royal metrics for a user over the last 90 days
 */
export async function calculateRoyalMetrics(userId: string): Promise<RoyalMetrics> {
  const now = Date.now();
  const periodStart = now - (ROYAL_REQUIREMENTS.PERIOD_DAYS * 24 * 60 * 60 * 1000);
  
  // Get paid chat partners in last 90 days
  const paidChatsSnapshot = await db.collection('chats')
    .where('creatorId', '==', userId)
    .where('lastPaidAt', '>=', periodStart)
    .where('isPaid', '==', true)
    .get();
  
  const uniquePaidPartners = new Set(
    paidChatsSnapshot.docs.map(doc => doc.data().payerId)
  ).size;
  
  // Get total earnings in last 90 days
  const earningsSnapshot = await db.collection('earnings')
    .where('userId', '==', userId)
    .where('createdAt', '>=', periodStart)
    .get();
  
  const totalEarnings = earningsSnapshot.docs.reduce(
    (sum, doc) => sum + (doc.data().amount || 0),
    0
  );
  
  // Get average rating from last 90 days
  const ratingsSnapshot = await db.collection('chat_ratings')
    .where('creatorId', '==', userId)
    .where('createdAt', '>=', periodStart)
    .get();
  
  const ratings = ratingsSnapshot.docs.map(doc => doc.data().rating);
  const averageRating = ratings.length > 0
    ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length
    : 0;
  
  // Check verification status
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  const isVerified = userData?.verificationStatus === 'verified' || false;
  
  // Optional boost metrics
  const eventsSnapshot = await db.collection('event_participants')
    .where('userId', '==', userId)
    .where('participatedAt', '>=', periodStart)
    .get();
  const eventParticipation = eventsSnapshot.size;
  
  const storyAlbumSnapshot = await db.collection('digital_products')
    .where('creatorId', '==', userId)
    .where('type', 'in', ['story', 'album'])
    .where('soldAt', '>=', periodStart)
    .get();
  const storyAlbumSales = storyAlbumSnapshot.size;
  
  const boostsSnapshot = await db.collection('boost_purchases')
    .where('userId', '==', userId)
    .where('purchasedAt', '>=', periodStart)
    .get();
  const boostPurchases = boostsSnapshot.size;
  
  const metrics: RoyalMetrics = {
    userId,
    periodStart,
    periodEnd: now,
    uniquePaidPartners,
    totalEarnings,
    averageRating,
    isVerified,
    eventParticipation,
    storyAlbumSales,
    boostPurchases,
    lastUpdated: now,
    calculatedAt: now,
  };
  
  // Store metrics
  await db.collection('royal_metrics').doc(userId).set(metrics);
  
  return metrics;
}

/**
 * Check if user meets Royal requirements
 */
export function isEligibleForRoyal(metrics: RoyalMetrics): boolean {
  return (
    metrics.uniquePaidPartners >= ROYAL_REQUIREMENTS.UNIQUE_PAID_PARTNERS &&
    metrics.totalEarnings >= ROYAL_REQUIREMENTS.TOTAL_EARNINGS &&
    metrics.averageRating >= ROYAL_REQUIREMENTS.AVERAGE_RATING &&
    metrics.isVerified === ROYAL_REQUIREMENTS.VERIFICATION_REQUIRED
  );
}

/**
 * Count how many Royal metrics are currently passing
 */
export function countPassingMetrics(metrics: RoyalMetrics): number {
  let count = 0;
  if (metrics.uniquePaidPartners >= ROYAL_REQUIREMENTS.UNIQUE_PAID_PARTNERS) count++;
  if (metrics.totalEarnings >= ROYAL_REQUIREMENTS.TOTAL_EARNINGS) count++;
  if (metrics.averageRating >= ROYAL_REQUIREMENTS.AVERAGE_RATING) count++;
  if (metrics.isVerified) count++;
  return count;
}

/**
 * Update Royal status based on current metrics
 */
export async function updateRoyalStatus(userId: string): Promise<RoyalStatus> {
  const metrics = await calculateRoyalMetrics(userId);
  const statusDoc = await db.collection('royal_status').doc(userId).get();
  const existingStatus = statusDoc.exists ? statusDoc.data() as RoyalStatus : null;
  
  const now = Date.now();
  const isEligible = isEligibleForRoyal(metrics);
  const passingMetricsCount = countPassingMetrics(metrics);
  
  let status: RoyalStatus;
  
  if (existingStatus?.isRoyal) {
    // Already Royal - check if should maintain or decay
    const expiresAt = existingStatus.royalExpiresAt || 0;
    const daysAsRoyal = Math.floor((now - (existingStatus.royalSince || now)) / (24 * 60 * 60 * 1000));
    
    if (now >= expiresAt) {
      // 90 days passed - check if should continue
      if (passingMetricsCount >= ROYAL_BENEFITS.MIN_METRICS_TO_MAINTAIN) {
        // Keep Royal - extend for another 90 days
        status = {
          ...existingStatus,
          isRoyal: true,
          isDormant: false,
          royalExpiresAt: now + (ROYAL_BENEFITS.DURATION_DAYS * 24 * 60 * 60 * 1000),
          currentMetrics: {
            uniquePaidPartners: metrics.uniquePaidPartners,
            totalEarnings: metrics.totalEarnings,
            averageRating: metrics.averageRating,
            isVerified: metrics.isVerified,
          },
          metricsPassingCount: passingMetricsCount,
          decayWarning: false,
          lastChecked: now,
          totalTimeAsRoyal: daysAsRoyal,
        };
      } else {
        // Drop to dormant
        status = {
          ...existingStatus,
          isRoyal: false,
          isDormant: true,
          currentMetrics: {
            uniquePaidPartners: metrics.uniquePaidPartners,
            totalEarnings: metrics.totalEarnings,
            averageRating: metrics.averageRating,
            isVerified: metrics.isVerified,
          },
          metricsPassingCount: passingMetricsCount,
          decayWarning: false,
          hasCustomPricing: false,
          hasPriorityInbox: false,
          hasDiscoveryBoost: false,
          lastChecked: now,
          totalTimeAsRoyal: daysAsRoyal,
        };
        
        // Send dormant notification
        await sendRoyalNotification(userId, 'lost', { reason: 'metrics_below_threshold' });
      }
    } else {
      // Still within 90 days - check for decay warning
      const daysUntilExpiry = Math.floor((expiresAt - now) / (24 * 60 * 60 * 1000));
      const shouldWarn = daysUntilExpiry <= ROYAL_NOTIFICATION_THRESHOLDS.DECAY_WARNING_DAYS &&
                         passingMetricsCount < ROYAL_BENEFITS.MIN_METRICS_TO_MAINTAIN;
      
      status = {
        ...existingStatus,
        currentMetrics: {
          uniquePaidPartners: metrics.uniquePaidPartners,
          totalEarnings: metrics.totalEarnings,
          averageRating: metrics.averageRating,
          isVerified: metrics.isVerified,
        },
        metricsPassingCount: passingMetricsCount,
        decayWarning: shouldWarn,
        lastChecked: now,
        totalTimeAsRoyal: daysAsRoyal,
      };
      
      if (shouldWarn && !existingStatus.decayWarning) {
        await sendRoyalNotification(userId, 'decay_warning', {
          daysRemaining: daysUntilExpiry,
          metricsNeeded: ROYAL_BENEFITS.MIN_METRICS_TO_MAINTAIN - passingMetricsCount,
        });
      }
    }
  } else if (existingStatus?.isDormant && isEligible) {
    // Was dormant, now eligible again - restore Royal
    status = {
      ...existingStatus,
      isRoyal: true,
      isDormant: false,
      royalSince: existingStatus.royalSince, // Keep original start date
      royalExpiresAt: now + (ROYAL_BENEFITS.DURATION_DAYS * 24 * 60 * 60 * 1000),
      currentMetrics: {
        uniquePaidPartners: metrics.uniquePaidPartners,
        totalEarnings: metrics.totalEarnings,
        averageRating: metrics.averageRating,
        isVerified: metrics.isVerified,
      },
      metricsPassingCount: passingMetricsCount,
      decayWarning: false,
      hasCustomPricing: true,
      hasPriorityInbox: true,
      hasDiscoveryBoost: true,
      lastChecked: now,
      timesAchievedRoyal: existingStatus.timesAchievedRoyal + 1,
    };
    
    await sendRoyalNotification(userId, 'restored', {});
  } else if (!existingStatus && isEligible) {
    // First time becoming Royal
    status = {
      userId,
      isRoyal: true,
      isDormant: false,
      royalSince: now,
      royalExpiresAt: now + (ROYAL_BENEFITS.DURATION_DAYS * 24 * 60 * 60 * 1000),
      lastChecked: now,
      currentMetrics: {
        uniquePaidPartners: metrics.uniquePaidPartners,
        totalEarnings: metrics.totalEarnings,
        averageRating: metrics.averageRating,
        isVerified: metrics.isVerified,
      },
      metricsPassingCount: passingMetricsCount,
      decayWarning: false,
      hasCustomPricing: true,
      hasPriorityInbox: true,
      hasDiscoveryBoost: true,
      totalTimeAsRoyal: 0,
      timesAchievedRoyal: 1,
      visibleTo: ['public'],
    };
    
    await sendRoyalNotification(userId, 'unlock', {});
  } else {
    // Not eligible yet
    status = existingStatus || {
      userId,
      isRoyal: false,
      isDormant: false,
      royalSince: null,
      royalExpiresAt: null,
      lastChecked: now,
      currentMetrics: {
        uniquePaidPartners: metrics.uniquePaidPartners,
        totalEarnings: metrics.totalEarnings,
        averageRating: metrics.averageRating,
        isVerified: metrics.isVerified,
      },
      metricsPassingCount: passingMetricsCount,
      decayWarning: false,
      hasCustomPricing: false,
      hasPriorityInbox: false,
      hasDiscoveryBoost: false,
      totalTimeAsRoyal: 0,
      timesAchievedRoyal: 0,
      visibleTo: ['self'],
    };
  }
  
  // Save status
  await db.collection('royal_status').doc(userId).set(status);
  
  // Update progress tracking
  await updateRoyalProgress(userId, metrics);
  
  // Update decay tracking
  await updateRoyalDecay(userId, status, metrics);
  
  return status;
}

/**
 * Update Royal progress tracking
 */
async function updateRoyalProgress(userId: string, metrics: RoyalMetrics): Promise<void> {
  const partnersProgress = Math.min(
    100,
    (metrics.uniquePaidPartners / ROYAL_REQUIREMENTS.UNIQUE_PAID_PARTNERS) * 100
  );
  const earningsProgress = Math.min(
    100,
    (metrics.totalEarnings / ROYAL_REQUIREMENTS.TOTAL_EARNINGS) * 100
  );
  const ratingProgress = Math.min(
    100,
    (metrics.averageRating / ROYAL_REQUIREMENTS.AVERAGE_RATING) * 100
  );
  
  const progressPercentage = Math.floor(
    (partnersProgress + earningsProgress + ratingProgress + (metrics.isVerified ? 100 : 0)) / 4
  );
  
  const isEligible = isEligibleForRoyal(metrics);
  
  let nextMilestone = '';
  if (!metrics.isVerified) {
    nextMilestone = 'Complete identity verification';
  } else if (metrics.uniquePaidPartners < ROYAL_REQUIREMENTS.UNIQUE_PAID_PARTNERS) {
    const needed = ROYAL_REQUIREMENTS.UNIQUE_PAID_PARTNERS - metrics.uniquePaidPartners;
    nextMilestone = `${needed} more paid chat partner${needed > 1 ? 's' : ''} needed`;
  } else if (metrics.totalEarnings < ROYAL_REQUIREMENTS.TOTAL_EARNINGS) {
    const needed = ROYAL_REQUIREMENTS.TOTAL_EARNINGS - metrics.totalEarnings;
    nextMilestone = `${needed.toLocaleString()} more tokens to earn`;
  } else if (metrics.averageRating < ROYAL_REQUIREMENTS.AVERAGE_RATING) {
    const needed = (ROYAL_REQUIREMENTS.AVERAGE_RATING - metrics.averageRating).toFixed(1);
    nextMilestone = `Improve rating by ${needed} points`;
  } else {
    nextMilestone = 'All requirements met!';
  }
  
  const progress: RoyalProgress = {
    userId,
    progressPercentage,
    partnersProgress: metrics.uniquePaidPartners,
    earningsProgress: metrics.totalEarnings,
    ratingProgress: metrics.averageRating,
    verificationProgress: metrics.isVerified,
    isEligible,
    nextMilestone,
    lastUpdated: Date.now(),
  };
  
  await db.collection('royal_progress').doc(userId).set(progress);
  
  // Send progress notifications
  if (progressPercentage >= ROYAL_NOTIFICATION_THRESHOLDS.PROGRESS_95 && !isEligible) {
    await sendRoyalNotification(userId, 'progress', { percentage: 95, message: 'Only a few more paid chats and you\'re there.' });
  } else if (progressPercentage >= ROYAL_NOTIFICATION_THRESHOLDS.PROGRESS_80 && progressPercentage < ROYAL_NOTIFICATION_THRESHOLDS.PROGRESS_95) {
    await sendRoyalNotification(userId, 'progress', { percentage: 80, message: 'You\'re getting attention — Royal is coming soon.' });
  }
}

/**
 * Update Royal decay tracking
 */
async function updateRoyalDecay(userId: string, status: RoyalStatus, metrics: RoyalMetrics): Promise<void> {
  if (!status.isRoyal) {
    // Not Royal, no decay tracking needed
    await db.collection('royal_decay').doc(userId).delete();
    return;
  }
  
  const now = Date.now();
  const expiresAt = status.royalExpiresAt || 0;
  const daysUntilExpiry = Math.floor((expiresAt - now) / (24 * 60 * 60 * 1000));
  
  let warningLevel: 'none' | 'info' | 'warning' | 'critical' = 'none';
  
  if (daysUntilExpiry <= 7 && status.metricsPassingCount < ROYAL_BENEFITS.MIN_METRICS_TO_MAINTAIN) {
    warningLevel = 'critical';
  } else if (daysUntilExpiry <= 14 && status.metricsPassingCount < ROYAL_BENEFITS.MIN_METRICS_TO_MAINTAIN) {
    warningLevel = 'warning';
  } else if (daysUntilExpiry <= 30 && status.metricsPassingCount < ROYAL_BENEFITS.MIN_METRICS_TO_MAINTAIN) {
    warningLevel = 'info';
  }
  
  const decay: RoyalDecay = {
    userId,
    warningLevel,
    expiresAt,
    metricsStatus: {
      uniquePaidPartners: metrics.uniquePaidPartners >= ROYAL_REQUIREMENTS.UNIQUE_PAID_PARTNERS,
      totalEarnings: metrics.totalEarnings >= ROYAL_REQUIREMENTS.TOTAL_EARNINGS,
      averageRating: metrics.averageRating >= ROYAL_REQUIREMENTS.AVERAGE_RATING,
      isVerified: metrics.isVerified,
    },
    lastWarningAt: now,
    nextCheckAt: now + (24 * 60 * 60 * 1000), // Check daily
  };
  
  await db.collection('royal_decay').doc(userId).set(decay);
}

/**
 * Send Royal notification
 */
async function sendRoyalNotification(
  userId: string,
  type: 'progress' | 'unlock' | 'decay_warning' | 'lost' | 'restored',
  data: Record<string, any>
): Promise<void> {
  // This integrates with the existing notification system
  await db.collection('notifications').add({
    userId,
    type: 'royal',
    subtype: type,
    data,
    read: false,
    createdAt: Date.now(),
  });
}

/**
 * Get Royal analytics for a user
 */
export async function generateRoyalAnalytics(userId: string): Promise<RoyalAnalytics> {
  const now = Date.now();
  const periodStart = now - (30 * 24 * 60 * 60 * 1000); // Last 30 days
  
  // Get all earnings by type
  const earningsSnapshot = await db.collection('earnings')
    .where('userId', '==', userId)
    .where('createdAt', '>=', periodStart)
    .get();
  
  let chatRevenue = 0;
  let callRevenue = 0;
  let storyRevenue = 0;
  let albumRevenue = 0;
  let digitalProductRevenue = 0;
  
  const payerSet = new Set<string>();
  const payerTransactions = new Map<string, number>();
  const hourlyRevenue = new Array(24).fill(0);
  const dailyRevenue = new Array(7).fill(0);
  
  earningsSnapshot.docs.forEach(doc => {
    const data = doc.data();
    const amount = data.amount || 0;
    const type = data.type || '';
    const payerId = data.payerId;
    const timestamp = data.createdAt;
    
    if (type === 'chat') chatRevenue += amount;
    else if (type === 'call') callRevenue += amount;
    else if (type === 'story') storyRevenue += amount;
    else if (type === 'album') albumRevenue += amount;
    else digitalProductRevenue += amount;
    
    if (payerId) {
      payerSet.add(payerId);
      payerTransactions.set(payerId, (payerTransactions.get(payerId) || 0) + 1);
    }
    
    const hour = new Date(timestamp).getHours();
    const day = new Date(timestamp).getDay();
    hourlyRevenue[hour] += amount;
    dailyRevenue[day] += amount;
  });
  
  const totalRevenue = chatRevenue + callRevenue + storyRevenue + albumRevenue + digitalProductRevenue;
  const uniquePayers = payerSet.size;
  const repeatPayers = Array.from(payerTransactions.values()).filter(count => count > 1).length;
  const averageTransactionSize = uniquePayers > 0 ? totalRevenue / uniquePayers : 0;
  
  const peakEarningHour = hourlyRevenue.indexOf(Math.max(...hourlyRevenue));
  const peakEarningDay = dailyRevenue.indexOf(Math.max(...dailyRevenue));
  
  // Calculate Royal-specific bonuses
  const status = await db.collection('royal_status').doc(userId).get();
  const isRoyal = status.exists && status.data()?.isRoyal;
  const royalEarningsBonus = isRoyal ? (chatRevenue * 0.57) : 0; // ~57% boost from 7-word vs 11-word
  
  const pricingDoc = await db.collection('royal_pricing').doc(userId).get();
  const customPricingRevenue = pricingDoc.exists ? chatRevenue * 0.3 : 0; // Estimate 30% from custom pricing
  
  const analytics: RoyalAnalytics = {
    userId,
    periodStart,
    periodEnd: now,
    chatRevenue,
    callRevenue,
    storyRevenue,
    albumRevenue,
    digitalProductRevenue,
    totalRevenue,
    uniquePayers,
    repeatPayers,
    averageTransactionSize,
    peakEarningHour,
    peakEarningDay,
    royalEarningsBonus,
    customPricingRevenue,
    priorityInboxConversions: 0, // Would need inbox tracking
    returningPayerRate: uniquePayers > 0 ? (repeatPayers / uniquePayers) * 100 : 0,
    averagePayerLifetimeValue: averageTransactionSize,
    generatedAt: now,
  };
  
  await db.collection('royal_analytics').doc(`${userId}_${periodStart}`).set(analytics);
  
  return analytics;
}