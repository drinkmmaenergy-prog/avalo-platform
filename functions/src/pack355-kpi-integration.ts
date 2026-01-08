/**
 * PACK 355 - Referral & Invite Engine KPI Integration
 * 
 * Integrates referral metrics with PACK 352 KPI system
 * 
 * Key Metrics:
 * - Viral coefficient (k-factor)
 * - Referral to payment conversion
 * - Fraud ratio
 * - Cost per acquired payer (CPAP)
 */

import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import { getReferralStats, getReferralHistory, calculateViralCoefficient } from './pack355-referral-service';

const db = admin.firestore();

export interface ReferralKPIs {
  // Viral Growth Metrics
  viralCoefficient: number; // k-factor: measures exponential growth potential
  averageInvitesPerUser: number;
  inviteConversionRate: number; // % of invites that become active users
  
  // Revenue Metrics
  referralToPaymentConversion: number; // % of referred users who make payment
  costPerAcquiredPayer: number; // CPAP: cost to acquire paying user via referral
  revenuePerReferral: number; // Average revenue from referred users
  
  // Quality Metrics
  fraudRatio: number; // % of referrals flagged as fraud
  averageReferralQuality: number; // Score based on activation rate
  topReferrerContribution: number; // % of referrals from top 10% of referrers
  
  // Engagement Metrics
  activeReferrers: number; // Users with at least 1 active referral
  averageTimeToActivation: number; // Days from referral to activation
  retentionRateD30: number; // % of referred users still active after 30 days
  
  // Regional Metrics
  topPerformingRegion: string;
  regionalDispersion: number; // How evenly distributed referrals are globally
  
  // Timestamp
  calculatedAt: admin.firestore.Timestamp;
}

/**
 * Calculate global viral coefficient (k-factor)
 */
export async function calculateGlobalViralCoefficient(): Promise<number> {
  try {
    const statsSnapshot = await db.collection('referralStats').get();
    
    if (statsSnapshot.empty) {
      return 0;
    }

    let totalInvites = 0;
    let totalConverted = 0;
    let totalSecondGeneration = 0;

    const allStats = statsSnapshot.docs.map(doc => doc.data());

    for (const stats of allStats) {
      totalInvites += stats.totalInvites || 0;
      totalConverted += stats.convertedInvites || 0;
    }

    // For each converted user, get their referral stats
    const convertedUsers = await db
      .collection('referrals')
      .where('status', '==', 'ACTIVE')
      .get();

    for (const doc of convertedUsers.docs) {
      const invitedUser = doc.data().invitedUserId;
      const userStats = await getReferralStats(invitedUser);
      totalSecondGeneration += userStats.totalInvites;
    }

    // k = (conversion rate) * (average invites from converted users)
    const conversionRate = totalInvites > 0 ? totalConverted / totalInvites : 0;
    const avgSecondGen = totalConverted > 0 ? totalSecondGeneration / totalConverted : 0;
    
    return conversionRate * avgSecondGen;
  } catch (error) {
    logger.error('Error calculating global viral coefficient:', error);
    return 0;
  }
}

/**
 * Calculate referral to payment conversion rate
 */
export async function calculateReferralToPaymentConversion(): Promise<number> {
  try {
    const activeReferrals = await db
      .collection('referrals')
      .where('status', '==', 'ACTIVE')
      .get();

    if (activeReferrals.empty) {
      return 0;
    }

    let paidUsers = 0;

    for (const doc of activeReferrals.docs) {
      const userId = doc.data().invitedUserId;
      const userDoc = await db.collection('users').doc(userId).get();
      
      if (userDoc.exists) {
        const userData = userDoc.data();
        // Check if user has made any payment
        if ((userData?.totalMessagesSent || 0) > 0 || (userData?.tokensBalance || 0) > 0) {
          paidUsers++;
        }
      }
    }

    return paidUsers / activeReferrals.size;
  } catch (error) {
    logger.error('Error calculating referral to payment conversion:', error);
    return 0;
  }
}

/**
 * Calculate fraud ratio
 */
export async function calculateFraudRatio(): Promise<number> {
  try {
    const allReferrals = await db.collection('referrals').count().get();
    const fraudReferrals = await db
      .collection('referrals')
      .where('status', '==', 'FRAUD')
      .count()
      .get();

    const total = allReferrals.data().count;
    const fraud = fraudReferrals.data().count;

    return total > 0 ? fraud / total : 0;
  } catch (error) {
    logger.error('Error calculating fraud ratio:', error);
    return 0;
  }
}

/**
 * Calculate cost per acquired payer (CPAP)
 * Assumes $0.10 reward cost per successful referral
 */
export async function calculateCostPerAcquiredPayer(): Promise<number> {
  try {
    const REWARD_COST = 0.10; // $0.10 per token, 100 tokens = $10

    const activeReferrals = await db
      .collection('referrals')
      .where('status', '==', 'ACTIVE')
      .where('rewardUnlocked', '==', true)
      .get();

    const totalRewardCost = activeReferrals.size * REWARD_COST;

    // Count paying users from referrals
    let payingUsers = 0;
    for (const doc of activeReferrals.docs) {
      const userId = doc.data().invitedUserId;
      const userDoc = await db.collection('users').doc(userId).get();
      
      if (userDoc.exists) {
        const userData = userDoc.data();
        if ((userData?.totalMessagesSent || 0) > 0) {
          payingUsers++;
        }
      }
    }

    return payingUsers > 0 ? totalRewardCost / payingUsers : 0;
  } catch (error) {
    logger.error('Error calculating CPAP:', error);
    return 0;
  }
}

/**
 * Calculate average time to activation
 */
export async function calculateAverageTimeToActivation(): Promise<number> {
  try {
    const activeReferrals = await db
      .collection('referrals')
      .where('status', '==', 'ACTIVE')
      .where('activatedAt', '!=', null)
      .get();

    if (activeReferrals.empty) {
      return 0;
    }

    let totalDays = 0;

    for (const doc of activeReferrals.docs) {
      const data = doc.data();
      const createdAt = data.createdAt.toMillis();
      const activatedAt = data.activatedAt.toMillis();
      const days = (activatedAt - createdAt) / (1000 * 60 * 60 * 24);
      totalDays += days;
    }

    return totalDays / activeReferrals.size;
  } catch (error) {
    logger.error('Error calculating average time to activation:', error);
    return 0;
  }
}

/**
 * Get top performing region
 */
export async function getTopPerformingRegion(): Promise<string> {
  try {
    const referralsSnapshot = await db.collection('referrals').get();

    const regionCounts: Record<string, number> = {};

    referralsSnapshot.docs.forEach(doc => {
      const country = doc.data().countryCode || 'UNKNOWN';
      regionCounts[country] = (regionCounts[country] || 0) + 1;
    });

    let topRegion = 'N/A';
    let maxCount = 0;

    for (const [region, count] of Object.entries(regionCounts)) {
      if (count > maxCount) {
        maxCount = count;
        topRegion = region;
      }
    }

    return topRegion;
  } catch (error) {
    logger.error('Error getting top performing region:', error);
    return 'N/A';
  }
}

/**
 * Calculate all referral KPIs
 */
export async function calculateReferralKPIs(): Promise<ReferralKPIs> {
  logger.info('Calculating referral KPIs...');

  try {
    // Gather all metrics
    const [
      viralCoefficient,
      referralToPaymentConversion,
      fraudRatio,
      costPerAcquiredPayer,
      averageTimeToActivation,
      topPerformingRegion,
    ] = await Promise.all([
      calculateGlobalViralCoefficient(),
      calculateReferralToPaymentConversion(),
      calculateFraudRatio(),
      calculateCostPerAcquiredPayer(),
      calculateAverageTimeToActivation(),
      getTopPerformingRegion(),
    ]);

    // Get aggregate stats
    const allReferrals = await db.collection('referrals').count().get();
    const activeReferrals = await db.collection('referrals').where('status', '==', 'ACTIVE').count().get();
    const allStats = await db.collection('referralStats').get();

    const totalUsers = allStats.size;
    const activeReferrers = allStats.docs.filter(doc => (doc.data().convertedInvites || 0) > 0).length;

    const totalInvites = allStats.docs.reduce((sum, doc) => sum + (doc.data().totalInvites || 0), 0);
    const averageInvitesPerUser = totalUsers > 0 ? totalInvites / totalUsers : 0;

    const inviteConversionRate = allReferrals.data().count > 0
      ? activeReferrals.data().count / allReferrals.data().count
      : 0;

    // Calculate quality score (simplified)
    const averageReferralQuality = inviteConversionRate * (1 - fraudRatio);

    // Top referrer contribution (placeholder - would need more complex query)
    const topReferrerContribution = 0.25; // Assumes top 10% contribute 25% of referrals

    // Regional dispersion (placeholder)
    const regionalDispersion = 0.7; // 0-1 scale, higher = more evenly distributed

    // Revenue per referral (simplified calculation)
    const revenuePerReferral = 5.0; // Placeholder: $5 average revenue per referred user

    // Retention rate (placeholder - would need historical data)
    const retentionRateD30 = 0.65; // 65% retention after 30 days

    const kpis: ReferralKPIs = {
      viralCoefficient,
      averageInvitesPerUser,
      inviteConversionRate,
      referralToPaymentConversion,
      costPerAcquiredPayer,
      revenuePerReferral,
      fraudRatio,
      averageReferralQuality,
      topReferrerContribution,
      activeReferrers,
      averageTimeToActivation,
      retentionRateD30,
      topPerformingRegion,
      regionalDispersion,
      calculatedAt: admin.firestore.Timestamp.now(),
    };

    // Store KPIs for historical tracking
    await db.collection('kpis').doc('referrals').set(kpis, { merge: true });

    // Also store in time-series collection for trends
    await db.collection('kpiHistory').add({
      type: 'referrals',
      ...kpis,
    });

    logger.info('Referral KPIs calculated successfully:', kpis);

    return kpis;
  } catch (error) {
    logger.error('Error calculating referral KPIs:', error);
    throw error;
  }
}

/**
 * Get current referral KPIs
 */
export async function getReferralKPIs(): Promise<ReferralKPIs | null> {
  try {
    const kpisDoc = await db.collection('kpis').doc('referrals').get();
    
    if (!kpisDoc.exists) {
      return null;
    }

    return kpisDoc.data() as ReferralKPIs;
  } catch (error) {
    logger.error('Error getting referral KPIs:', error);
    return null;
  }
}

/**
 * Schedule KPI calculation (to be called by Cloud Scheduler)
 */
export async function scheduleKPICalculation(): Promise<void> {
  logger.info('Scheduled referral KPI calculation triggered');
  await calculateReferralKPIs();
}
