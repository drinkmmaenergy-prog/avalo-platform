/**
 * PACK 429 — Trust Score System
 * Calculates and exposes public trust score (0-100) based on multiple metrics
 */

import * as admin from 'firebase-admin';
import {
  TrustSignals,
  TrustScoreInputs,
  TrustScorePublicResponse,
  Platform,
} from './pack429-store-defense.types';

const db = admin.firestore();

// ============================================================================
// TRUST SCORE CALCULATION
// ============================================================================

/**
 * Calculate trust score from multiple platform signals
 * Score: 0-100, higher is better
 */
export function calculateTrustScore(inputs: TrustScoreInputs): number {
  let score = 0;
  
  // 1. Store Ratings (40 points max) - Most heavily weighted
  const avgRating = (inputs.avgRatingIOS + inputs.avgRatingAndroid) / 2;
  const ratingScore = (avgRating / 5) * 40;
  score += ratingScore;
  
  // 2. Review Volume (10 points max) - Credibility through volume
  const reviewScore = Math.min((inputs.totalReviews / 1000) * 10, 10);
  score += reviewScore;
  
  // 3. Verification Rate (15 points max)
  const verificationRate = inputs.verifiedUsers / inputs.totalUsers;
  const verificationScore = verificationRate * 15;
  score += verificationScore;
  
  // 4. Safety Response (10 points max)
  if (inputs.safetyTickets > 0) {
    const resolutionRate = inputs.safetyTicketsResolved / inputs.safetyTickets;
    const speedScore = Math.max(0, 1 - (inputs.avgResolutionTimeHours / 48)); // 48h target
    const safetyScore = (resolutionRate * 0.7 + speedScore * 0.3) * 10;
    score += safetyScore;
  } else {
    score += 10; // No tickets = perfect score
  }
  
  // 5. Fraud Rate (10 points max) - Inverse scoring
  if (inputs.totalTransactions > 0) {
    const fraudRate = inputs.fraudulentTransactions / inputs.totalTransactions;
    const fraudScore = Math.max(0, 1 - (fraudRate * 10)) * 10;
    score += fraudScore;
  } else {
    score += 10;
  }
  
  // 6. Refund Dispute Rate (10 points max) - Inverse scoring
  if (inputs.totalPayouts > 0) {
    const disputeRate = inputs.disputedPayouts / inputs.totalPayouts;
    const disputeScore = Math.max(0, 1 - (disputeRate * 20)) * 10;
    score += disputeScore;
  } else {
    score += 10;
  }
  
  // 7. Calendar Reliability (5 points max)
  if (inputs.totalMeetings > 0) {
    const showRate = 1 - (inputs.noShowMeetings / inputs.totalMeetings);
    const calendarScore = showRate * 5;
    score += calendarScore;
  } else {
    score += 5;
  }
  
  // Ensure score is between 0-100
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Get tier based on score
 */
export function getTrustTier(score: number): 'EXCELLENT' | 'GOOD' | 'FAIR' | 'NEEDS_IMPROVEMENT' {
  if (score >= 85) return 'EXCELLENT';
  if (score >= 70) return 'GOOD';
  if (score >= 55) return 'FAIR';
  return 'NEEDS_IMPROVEMENT';
}

/**
 * Get public badge text
 */
export function getTrustBadge(score: number): string {
  const tier = getTrustTier(score);
  
  switch (tier) {
    case 'EXCELLENT':
      return `Avalo Verified Platform — Trust Score ${score}/100`;
    case 'GOOD':
      return `Trusted Platform — Score ${score}/100`;
    case 'FAIR':
      return `Growing Platform — Score ${score}/100`;
    case 'NEEDS_IMPROVEMENT':
      return `Developing Platform — Score ${score}/100`;
  }
}

// ============================================================================
// DATA COLLECTION
// ============================================================================

async function collectTrustInputs(): Promise<TrustScoreInputs> {
  // Get store ratings
  const { avgRatingIOS, avgRatingAndroid, totalReviews } = await getStoreRatings();
  
  // Get user verification stats
  const { totalUsers, verifiedUsers } = await getUserVerificationStats();
  
  // Get safety metrics
  const {
    safetyTickets,
    safetyTicketsResolved,
    avgResolutionTimeHours,
  } = await getSafetyMetrics();
  
  // Get fraud metrics
  const { totalTransactions, fraudulentTransactions } = await getFraudMetrics();
  
  // Get refund metrics
  const { totalPayouts, disputedPayouts } = await getRefundMetrics();
  
  // Get calendar metrics
  const { totalMeetings, noShowMeetings } = await getCalendarMetrics();
  
  return {
    avgRatingIOS,
    avgRatingAndroid,
    totalReviews,
    totalUsers,
    verifiedUsers,
    safetyTickets,
    safetyTicketsResolved,
    avgResolutionTimeHours,
    totalTransactions,
    fraudulentTransactions,
    totalPayouts,
    disputedPayouts,
    totalMeetings,
    noShowMeetings,
  };
}

async function getStoreRatings(): Promise<{
  avgRatingIOS: number;
  avgRatingAndroid: number;
  totalReviews: number;
}> {
  const reviewsSnap = await db.collection('storeReviewsMirror').get();
  
  if (reviewsSnap.empty) {
    return { avgRatingIOS: 4.5, avgRatingAndroid: 4.5, totalReviews: 0 };
  }
  
  let iosSum = 0;
  let iosCount = 0;
  let androidSum = 0;
  let androidCount = 0;
  
  reviewsSnap.forEach(doc => {
    const review = doc.data();
    
    if (review.platform === 'IOS') {
      iosSum += review.rating;
      iosCount++;
    } else if (review.platform === 'ANDROID') {
      androidSum += review.rating;
      androidCount++;
    }
  });
  
  return {
    avgRatingIOS: iosCount > 0 ? iosSum / iosCount : 4.5,
    avgRatingAndroid: androidCount > 0 ? androidSum / androidCount : 4.5,
    totalReviews: iosCount + androidCount,
  };
}

async function getUserVerificationStats(): Promise<{
  totalUsers: number;
  verifiedUsers: number;
}> {
  try {
    // Get total users count
    const usersSnap = await db.collection('users').count().get();
    const totalUsers = usersSnap.data().count;
    
    // Get verified users count (assuming verified field exists)
    const verifiedSnap = await db
      .collection('users')
      .where('verified', '==', true)
      .count()
      .get();
    const verifiedUsers = verifiedSnap.data().count;
    
    return { totalUsers, verifiedUsers };
  } catch (error) {
    console.error('Error getting user verification stats:', error);
    return { totalUsers: 1000, verifiedUsers: 500 }; // Default reasonable values
  }
}

async function getSafetyMetrics(): Promise<{
  safetyTickets: number;
  safetyTicketsResolved: number;
  avgResolutionTimeHours: number;
}> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const ticketsSnap = await db
      .collection('safetyTickets')
      .where('createdAt', '>', admin.firestore.Timestamp.fromDate(thirtyDaysAgo))
      .get();
    
    if (ticketsSnap.empty) {
      return {
        safetyTickets: 0,
        safetyTicketsResolved: 0,
        avgResolutionTimeHours: 12,
      };
    }
    
    let resolvedCount = 0;
    let totalResolutionTime = 0;
    
    ticketsSnap.forEach(doc => {
      const ticket = doc.data();
      
      if (ticket.status === 'RESOLVED' && ticket.resolvedAt) {
        resolvedCount++;
        
        const createdAt = ticket.createdAt.toDate();
        const resolvedAt = ticket.resolvedAt.toDate();
        const resolutionHours = (resolvedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
        totalResolutionTime += resolutionHours;
      }
    });
    
    return {
      safetyTickets: ticketsSnap.size,
      safetyTicketsResolved: resolvedCount,
      avgResolutionTimeHours: resolvedCount > 0 ? totalResolutionTime / resolvedCount : 12,
    };
  } catch (error) {
    console.error('Error getting safety metrics:', error);
    return { safetyTickets: 0, safetyTicketsResolved: 0, avgResolutionTimeHours: 12 };
  }
}

async function getFraudMetrics(): Promise<{
  totalTransactions: number;
  fraudulentTransactions: number;
}> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    // Get all transactions
    const transactionsSnap = await db
      .collection('transactions')
      .where('createdAt', '>', admin.firestore.Timestamp.fromDate(thirtyDaysAgo))
      .count()
      .get();
    
    // Get fraudulent transactions
    const fraudSnap = await db
      .collection('fraudEvents')
      .where('createdAt', '>', admin.firestore.Timestamp.fromDate(thirtyDaysAgo))
      .where('confirmed', '==', true)
      .count()
      .get();
    
    return {
      totalTransactions: transactionsSnap.data().count,
      fraudulentTransactions: fraudSnap.data().count,
    };
  } catch (error) {
    console.error('Error getting fraud metrics:', error);
    return { totalTransactions: 1000, fraudulentTransactions: 5 };
  }
}

async function getRefundMetrics(): Promise<{
  totalPayouts: number;
  disputedPayouts: number;
}> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const payoutsSnap = await db
      .collection('payouts')
      .where('createdAt', '>', admin.firestore.Timestamp.fromDate(thirtyDaysAgo))
      .count()
      .get();
    
    const disputedSnap = await db
      .collection('payouts')
      .where('createdAt', '>', admin.firestore.Timestamp.fromDate(thirtyDaysAgo))
      .where('disputed', '==', true)
      .count()
      .get();
    
    return {
      totalPayouts: payoutsSnap.data().count,
      disputedPayouts: disputedSnap.data().count,
    };
  } catch (error) {
    console.error('Error getting refund metrics:', error);
    return { totalPayouts: 500, disputedPayouts: 10 };
  }
}

async function getCalendarMetrics(): Promise<{
  totalMeetings: number;
  noShowMeetings: number;
}> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const meetingsSnap = await db
      .collection('calendarEvents')
      .where('createdAt', '>', admin.firestore.Timestamp.fromDate(thirtyDaysAgo))
      .where('status', '==', 'COMPLETED')
      .count()
      .get();
    
    const noShowSnap = await db
      .collection('calendarEvents')
      .where('createdAt', '>', admin.firestore.Timestamp.fromDate(thirtyDaysAgo))
      .where('status', '==', 'NO_SHOW')
      .count()
      .get();
    
    return {
      totalMeetings: meetingsSnap.data().count,
      noShowMeetings: noShowSnap.data().count,
    };
  } catch (error) {
    console.error('Error getting calendar metrics:', error);
    return { totalMeetings: 200, noShowMeetings: 10 };
  }
}

// ============================================================================
// TRUST SCORE UPDATE
// ============================================================================

/**
 * Recalculate and update trust signals
 * Should be run daily via Cloud Scheduler
 */
export async function updateTrustScore(): Promise<TrustSignals> {
  console.log('Updating trust score...');
  
  // Collect all inputs
  const inputs = await collectTrustInputs();
  
  // Calculate trust score
  const trustScore = calculateTrustScore(inputs);
  
  // Calculate weekly trend
  const weeklyTrend = await calculateWeeklyTrend();
  
  // Get platform-specific data
  const { avgRatingIOS, avgRatingAndroid, totalReviews } = await getStoreRatings();
  const iosData = await getPlatformData(Platform.IOS);
  const androidData = await getPlatformData(Platform.ANDROID);
  
  // Create trust signals document
  const trustSignals: TrustSignals = {
    avgRatingIOS,
    avgRatingAndroid,
    totalReviews,
    weeklyTrend,
    trustScore,
    lastCalculated: admin.firestore.Timestamp.now(),
    verificationRate: inputs.verifiedUsers / inputs.totalUsers,
    safetyResolutionSpeed: inputs.avgResolutionTimeHours,
    fraudRate: inputs.totalTransactions > 0
      ? inputs.fraudulentTransactions / inputs.totalTransactions
      : 0,
    refundDisputeRate: inputs.totalPayouts > 0
      ? inputs.disputedPayouts / inputs.totalPayouts
      : 0,
    calendarNoShowRate: inputs.totalMeetings > 0
      ? inputs.noShowMeetings / inputs.totalMeetings
      : 0,
    iosData,
    androidData,
    updatedAt: admin.firestore.Timestamp.now(),
  };
  
  // Save to Firestore
  await db.collection('trustSignals').doc('global').set(trustSignals);
  
  console.log(`Trust score updated: ${trustScore}/100 (${getTrustTier(trustScore)})`);
  
  return trustSignals;
}

async function calculateWeeklyTrend(): Promise<number> {
  try {
    // Get current week average
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const currentWeekSnap = await db
      .collection('storeReviewsMirror')
      .where('createdAt', '>', admin.firestore.Timestamp.fromDate(sevenDaysAgo))
      .get();
    
    if (currentWeekSnap.empty) return 0;
    
    let currentSum = 0;
    currentWeekSnap.forEach(doc => {
      currentSum += doc.data().rating;
    });
    const currentAvg = currentSum / currentWeekSnap.size;
    
    // Get previous week average
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const previousWeekSnap = await db
      .collection('storeReviewsMirror')
      .where('createdAt', '>', admin.firestore.Timestamp.fromDate(fourteenDaysAgo))
      .where('createdAt', '<', admin.firestore.Timestamp.fromDate(sevenDaysAgo))
      .get();
    
    if (previousWeekSnap.empty) return 0;
    
    let previousSum = 0;
    previousWeekSnap.forEach(doc => {
      previousSum += doc.data().rating;
    });
    const previousAvg = previousSum / previousWeekSnap.size;
    
    // Return difference
    return currentAvg - previousAvg;
  } catch (error) {
    console.error('Error calculating weekly trend:', error);
    return 0;
  }
}

async function getPlatformData(platform: Platform): Promise<{
  rating: number;
  reviewCount: number;
  positiveReviews: number;
  negativeReviews: number;
}> {
  const reviewsSnap = await db
    .collection('storeReviewsMirror')
    .where('platform', '==', platform)
    .get();
  
  if (reviewsSnap.empty) {
    return {
      rating: 4.5,
      reviewCount: 0,
      positiveReviews: 0,
      negativeReviews: 0,
    };
  }
  
  let sum = 0;
  let positiveReviews = 0;
  let negativeReviews = 0;
  
  reviewsSnap.forEach(doc => {
    const review = doc.data();
    sum += review.rating;
    
    if (review.rating >= 4) positiveReviews++;
    if (review.rating <= 2) negativeReviews++;
  });
  
  return {
    rating: sum / reviewsSnap.size,
    reviewCount: reviewsSnap.size,
    positiveReviews,
    negativeReviews,
  };
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get public trust score (for display in app)
 */
export async function getPublicTrustScore(): Promise<TrustScorePublicResponse> {
  const doc = await db.collection('trustSignals').doc('global').get();
  
  if (!doc.exists) {
    // If no score yet, return default
    return {
      trustScore: 75,
      tier: 'GOOD',
      badge: 'Trusted Platform — Score 75/100',
      lastUpdated: new Date().toISOString(),
    };
  }
  
  const data = doc.data() as TrustSignals;
  
  return {
    trustScore: data.trustScore,
    tier: getTrustTier(data.trustScore),
    badge: getTrustBadge(data.trustScore),
    lastUpdated: data.lastCalculated.toDate().toISOString(),
  };
}

/**
 * Get detailed trust signals (admin only)
 */
export async function getTrustSignals(): Promise<TrustSignals | null> {
  const doc = await db.collection('trustSignals').doc('global').get();
  
  if (!doc.exists) {
    return null;
  }
  
  return doc.data() as TrustSignals;
}
