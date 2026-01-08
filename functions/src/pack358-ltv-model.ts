/**
 * PACK 358 — LTV Model Per Segment
 * 
 * Calculates Lifetime Value for user segments from PACK 301
 * Used for ad spend caps and risk exposure
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type UserSegment = 
  | 'NEW'
  | 'ACTIVE'
  | 'DORMANT'
  | 'CHURN_RISK'
  | 'RETURNING'
  | 'ROYAL'
  | 'VIP';

export type LTVProfile = {
  segment: UserSegment;
  avgLTVPLN: number;
  avgDaysActive: number;
  payFrequencyPerMonth: number;
  avgTransactionSizePLN: number;
  churnProbability: number;
  userCount: number;
  totalValuePLN: number;
  calculatedAt: string;
};

export type LTVTrend = {
  segment: UserSegment;
  monthYear: string;
  ltvPLN: number;
  userCount: number;
};

export type CohortLTV = {
  cohortMonth: string; // YYYY-MM
  segment: UserSegment;
  month0LTV: number;
  month1LTV: number;
  month3LTV: number;
  month6LTV: number;
  month12LTV: number;
  projectedLifetimeLTV: number;
};

// ============================================================================
// LTV MODEL ENGINE
// ============================================================================

class LTVModelEngine {
  private db: FirebaseFirestore.Firestore;

  constructor() {
    this.db = admin.firestore();
  }

  /**
   * Calculate LTV profiles for all segments
   */
  async calculateAllSegmentLTVs(): Promise<LTVProfile[]> {
    const segments: UserSegment[] = [
      'NEW',
      'ACTIVE',
      'DORMANT',
      'CHURN_RISK',
      'RETURNING',
      'ROYAL',
      'VIP',
    ];

    const profiles: LTVProfile[] = [];

    for (const segment of segments) {
      try {
        const profile = await this.calculateSegmentLTV(segment);
        profiles.push(profile);
      } catch (error) {
        console.error(`[PACK 358] Error calculating LTV for ${segment}:`, error);
      }
    }

    // Save profiles
    await this.saveLTVProfiles(profiles);

    return profiles;
  }

  /**
   * Calculate LTV for a specific segment
   */
  async calculateSegmentLTV(segment: UserSegment): Promise<LTVProfile> {
    console.log(`[PACK 358] Calculating LTV for segment: ${segment}`);

    // Get users in this segment
    const users = await this.getUsersInSegment(segment);
    const userCount = users.length;

    if (userCount === 0) {
      return {
        segment,
        avgLTVPLN: 0,
        avgDaysActive: 0,
        payFrequencyPerMonth: 0,
        avgTransactionSizePLN: 0,
        churnProbability: this.getSegmentChurnProbability(segment),
        userCount: 0,
        totalValuePLN: 0,
        calculatedAt: new Date().toISOString(),
      };
    }

    // Calculate metrics for each user
    let totalLTV = 0;
    let totalDaysActive = 0;
    let totalPayments = 0;
    let totalTransactionValue = 0;
    let transactionCount = 0;

    for (const userId of users.slice(0, 1000)) { // Sample max 1000 users for performance
      const userMetrics = await this.calculateUserMetrics(userId);
      totalLTV += userMetrics.ltv;
      totalDaysActive += userMetrics.daysActive;
      totalPayments += userMetrics.paymentCount;
      totalTransactionValue += userMetrics.totalSpent;
      transactionCount += userMetrics.paymentCount;
    }

    const sampleSize = Math.min(userCount, 1000);
    const avgLTV = totalLTV / sampleSize;
    const avgDaysActive = totalDaysActive / sampleSize;
    const avgPaymentsPerUser = totalPayments / sampleSize;
    const avgTransactionSize = transactionCount > 0 ? totalTransactionValue / transactionCount : 0;

    // Extrapolate to full segment
    const totalValue = avgLTV * userCount;

    return {
      segment,
      avgLTVPLN: Math.round(avgLTV * 100) / 100,
      avgDaysActive: Math.round(avgDaysActive),
      payFrequencyPerMonth: Math.round((avgPaymentsPerUser / avgDaysActive) * 30 * 100) / 100,
      avgTransactionSizePLN: Math.round(avgTransactionSize * 100) / 100,
      churnProbability: this.getSegmentChurnProbability(segment),
      userCount,
      totalValuePLN: Math.round(totalValue * 100) / 100,
      calculatedAt: new Date().toISOString(),
    };
  }

  /**
   * Get list of users in a segment
   */
  private async getUsersInSegment(segment: UserSegment): Promise<string[]> {
    const snapshot = await this.db
      .collection('userSegments')
      .where('segment', '==', segment)
      .where('active', '==', true)
      .limit(10000)
      .get();

    return snapshot.docs.map(doc => doc.id);
  }

  /**
   * Calculate metrics for individual user
   */
  private async calculateUserMetrics(userId: string): Promise<{
    ltv: number;
    daysActive: number;
    paymentCount: number;
    totalSpent: number;
  }> {
    // Get user profile
    const userDoc = await this.db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return { ltv: 0, daysActive: 0, paymentCount: 0, totalSpent: 0 };
    }

    const userData = userDoc.data()!;
    const createdAt = userData.createdAt?.toDate() || new Date();
    const daysActive = Math.max(1, Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)));

    // Get user transactions from wallet (PACK 277)
    const transactionsSnapshot = await this.db
      .collection('transactions')
      .where('userId', '==', userId)
      .where('type', '==', 'purchase')
      .where('status', '==', 'completed')
      .get();

    let totalSpent = 0;
    for (const doc of transactionsSnapshot.docs) {
      const data = doc.data();
      totalSpent += data.amountPLN || 0;
    }

    const paymentCount = transactionsSnapshot.size;
    const ltv = totalSpent;

    return {
      ltv,
      daysActive,
      paymentCount,
      totalSpent,
    };
  }

  /**
   * Get expected churn probability by segment
   */
  private getSegmentChurnProbability(segment: UserSegment): number {
    const churnRates: Record<UserSegment, number> = {
      NEW: 0.45,        // 45% churn (high)
      ACTIVE: 0.15,     // 15% churn (low)
      DORMANT: 0.70,    // 70% churn (very high)
      CHURN_RISK: 0.60, // 60% churn (high)
      RETURNING: 0.25,  // 25% churn (medium)
      ROYAL: 0.05,      // 5% churn (very low)
      VIP: 0.03,        // 3% churn (extremely low)
    };

    return churnRates[segment] || 0.30;
  }

  /**
   * Calculate cohort-based LTV (month-over-month)
   */
  async calculateCohortLTV(cohortMonth: string, segment: UserSegment): Promise<CohortLTV> {
    // Parse cohort month
    const [year, month] = cohortMonth.split('-').map(Number);
    const cohortStart = new Date(year, month - 1, 1);

    // Get users who joined in this cohort
    const cohortEndTime = new Date(year, month, 1);
    const usersSnapshot = await this.db
      .collection('users')
      .where('createdAt', '>=', cohortStart)
      .where('createdAt', '<', cohortEndTime)
      .limit(5000)
      .get();

    const userIds = usersSnapshot.docs.map(doc => doc.id);

    if (userIds.length === 0) {
      return {
        cohortMonth,
        segment,
        month0LTV: 0,
        month1LTV: 0,
        month3LTV: 0,
        month6LTV: 0,
        month12LTV: 0,
        projectedLifetimeLTV: 0,
      };
    }

    // Calculate LTV at different time points
    const month0LTV = await this.calculateCohortLTVAtMonth(userIds, cohortStart, 0);
    const month1LTV = await this.calculateCohortLTVAtMonth(userIds, cohortStart, 1);
    const month3LTV = await this.calculateCohortLTVAtMonth(userIds, cohortStart, 3);
    const month6LTV = await this.calculateCohortLTVAtMonth(userIds, cohortStart, 6);
    const month12LTV = await this.calculateCohortLTVAtMonth(userIds, cohortStart, 12);

    // Project lifetime LTV based on trend
    const projectedLifetimeLTV = this.projectLifetimeLTV(
      month0LTV,
      month1LTV,
      month3LTV,
      month6LTV,
      month12LTV
    );

    const cohort: CohortLTV = {
      cohortMonth,
      segment,
      month0LTV: Math.round(month0LTV * 100) / 100,
      month1LTV: Math.round(month1LTV * 100) / 100,
      month3LTV: Math.round(month3LTV * 100) / 100,
      month6LTV: Math.round(month6LTV * 100) / 100,
      month12LTV: Math.round(month12LTV * 100) / 100,
      projectedLifetimeLTV: Math.round(projectedLifetimeLTV * 100) / 100,
    };

    // Save cohort data
    await this.saveCohortLTV(cohort);

    return cohort;
  }

  /**
   * Calculate average LTV for cohort at specific month
   */
  private async calculateCohortLTVAtMonth(
    userIds: string[],
    cohortStart: Date,
    monthsAfter: number
  ): Promise<number> {
    const endDate = new Date(cohortStart);
    endDate.setMonth(endDate.getMonth() + monthsAfter + 1);

    let totalLTV = 0;
    let count = 0;

    // Sample up to 500 users for performance
    const sampleSize = Math.min(userIds.length, 500);
    for (let i = 0; i < sampleSize; i++) {
      const userId = userIds[i];
      
      const transactionsSnapshot = await this.db
        .collection('transactions')
        .where('userId', '==', userId)
        .where('type', '==', 'purchase')
        .where('status', '==', 'completed')
        .where('createdAt', '>=', cohortStart)
        .where('createdAt', '<', endDate)
        .get();

      let userLTV = 0;
      for (const doc of transactionsSnapshot.docs) {
        const data = doc.data();
        userLTV += data.amountPLN || 0;
      }

      totalLTV += userLTV;
      count++;
    }

    return count > 0 ? totalLTV / count : 0;
  }

  /**
   * Project lifetime LTV based on cohort trends
   */
  private projectLifetimeLTV(
    month0: number,
    month1: number,
    month3: number,
    month6: number,
    month12: number
  ): number {
    // Use power curve fitting for projection
    // Typically LTV growth slows over time
    
    if (month12 > 0) {
      // If we have 12 months of data, extrapolate
      const growthRate = month12 / (month6 || 1);
      const projectedYear2 = month12 * Math.pow(growthRate, 0.5);
      const projectedYear3 = projectedYear2 * Math.pow(growthRate, 0.3);
      return month12 + (projectedYear2 - month12) + (projectedYear3 - projectedYear2);
    } else if (month6 > 0) {
      // Project based on 6 months
      return month6 * 2.5; // Rough estimate
    } else if (month3 > 0) {
      // Project based on 3 months
      return month3 * 4; // Rough estimate
    } else if (month1 > 0) {
      // Project based on 1 month
      return month1 * 8; // Rough estimate
    }

    return month0 * 10; // Very rough estimate for month 0
  }

  /**
   * Save LTV profiles to Firestore
   */
  private async saveLTVProfiles(profiles: LTVProfile[]): Promise<void> {
    const batch = this.db.batch();

    for (const profile of profiles) {
      const docRef = this.db
        .collection('finance')
        .doc('ltv')
        .collection('segments')
        .doc(profile.segment);

      batch.set(docRef, {
        ...profile,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // Save summary
    const summaryRef = this.db.collection('finance').doc('ltv');
    batch.set(summaryRef, {
      profiles,
      totalUsers: profiles.reduce((sum, p) => sum + p.userCount, 0),
      totalValuePLN: profiles.reduce((sum, p) => sum + p.totalValuePLN, 0),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    await batch.commit();

    // Save historical trend
    await this.saveLTVTrend(profiles);
  }

  /**
   * Save LTV trend for historical tracking
   */
  private async saveLTVTrend(profiles: LTVProfile[]): Promise<void> {
    const now = new Date();
    const monthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const batch = this.db.batch();

    for (const profile of profiles) {
      const docRef = this.db
        .collection('finance')
        .doc('ltv')
        .collection('trends')
        .doc(`${monthYear}_${profile.segment}`);

      const trend: LTVTrend = {
        segment: profile.segment,
        monthYear,
        ltvPLN: profile.avgLTVPLN,
        userCount: profile.userCount,
      };

      batch.set(docRef, trend);
    }

    await batch.commit();
  }

  /**
   * Save cohort LTV
   */
  private async saveCohortLTV(cohort: CohortLTV): Promise<void> {
    await this.db
      .collection('finance')
      .doc('ltv')
      .collection('cohorts')
      .doc(`${cohort.cohortMonth}_${cohort.segment}`)
      .set({
        ...cohort,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
  }

  /**
   * Check LTV alerts (CAC > LTV warnings)
   */
  async checkLTVAlerts(profiles: LTVProfile[]): Promise<void> {
    // Get CAC from PACK 356
    const cacDoc = await this.db
      .collection('marketing')
      .doc('metrics')
      .get();

    if (!cacDoc.exists) return;

    const cac = cacDoc.data()!.avgCACPLN || 0;

    for (const profile of profiles) {
      // Alert if CAC > LTV for any segment
      if (cac > profile.avgLTVPLN && profile.userCount > 100) {
        await this.createAlert({
          type: 'CAC_EXCEEDS_LTV',
          segment: profile.segment,
          severity: 'high',
          message: `CAC (${cac.toFixed(2)} PLN) exceeds LTV (${profile.avgLTVPLN.toFixed(2)} PLN) for ${profile.segment} segment`,
          data: {
            cac,
            ltv: profile.avgLTVPLN,
            segment: profile.segment,
            userCount: profile.userCount,
          },
        });
      }

      // Alert if Royal/VIP churn is above threshold
      if ((profile.segment === 'ROYAL' || profile.segment === 'VIP') && profile.churnProbability > 0.10) {
        await this.createAlert({
          type: 'HIGH_VALUE_CHURN',
          segment: profile.segment,
          severity: 'critical',
          message: `High churn probability (${(profile.churnProbability * 100).toFixed(1)}%) for ${profile.segment} segment`,
          data: {
            segment: profile.segment,
            churnProbability: profile.churnProbability,
            avgLTV: profile.avgLTVPLN,
            userCount: profile.userCount,
          },
        });
      }
    }
  }

  /**
   * Create financial alert
   */
  private async createAlert(alert: {
    type: string;
    segment?: UserSegment;
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    data: any;
  }): Promise<void> {
    await this.db
      .collection('finance')
      .doc('alerts')
      .collection('active')
      .add({
        ...alert,
        category: 'LTV',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        resolved: false,
      });
  }
}

// ============================================================================
// CLOUD FUNCTIONS
// ============================================================================

const engine = new LTVModelEngine();

/**
 * Scheduled function: Calculate segment LTVs weekly on Sundays at 3 AM
 */
export const calculateSegmentLTVs = functions
  .region('europe-west1')
  .pubsub.schedule('0 3 * * 0')
  .timeZone('Europe/Warsaw')
  .onRun(async (context) => {
    console.log('[PACK 358] Calculating LTV for all segments');
    
    try {
      const profiles = await engine.calculateAllSegmentLTVs();
      
      // Check for alerts
      await engine.checkLTVAlerts(profiles);
      
      console.log('[PACK 358] LTV calculation complete:', {
        segments: profiles.length,
        totalValue: profiles.reduce((sum, p) => sum + p.totalValuePLN, 0),
      });
      
      return { success: true };
    } catch (error) {
      console.error('[PACK 358] Error calculating LTVs:', error);
      throw error;
    }
  });

/**
 * HTTP function: Get LTV profiles (admin only)
 */
export const getLTVProfiles = functions
  .region('europe-west1')
  .https.onCall(async (data, context) => {
    // Verify admin authentication
    if (!context.auth || !context.auth.token.admin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only admins can view LTV profiles'
      );
    }

    try {
      const db = admin.firestore();
      const doc = await db.collection('finance').doc('ltv').get();

      if (!doc.exists) {
        throw new functions.https.HttpsError('not-found', 'No LTV data available');
      }

      return doc.data();
    } catch (error) {
      console.error('[PACK 358] Error fetching LTV profiles:', error);
      throw new functions.https.HttpsError('internal', 'Failed to fetch LTV profiles');
    }
  });

/**
 * HTTP function: Calculate LTV for specific segment (admin only)
 */
export const calculateSegmentLTVOnDemand = functions
  .region('europe-west1')
  .https.onCall(async (data, context) => {
    // Verify admin authentication
    if (!context.auth || !context.auth.token.admin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only admins can calculate LTV'
      );
    }

    const { segment } = data;

    const validSegments = ['NEW', 'ACTIVE', 'DORMANT', 'CHURN_RISK', 'RETURNING', 'ROYAL', 'VIP'];
    if (!segment || !validSegments.includes(segment)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        `Invalid segment. Must be one of: ${validSegments.join(', ')}`
      );
    }

    try {
      const profile = await engine.calculateSegmentLTV(segment as UserSegment);
      return profile;
    } catch (error) {
      console.error('[PACK 358] Error calculating segment LTV:', error);
      throw new functions.https.HttpsError('internal', 'Failed to calculate segment LTV');
    }
  });

/**
 * HTTP function: Get LTV trends (admin only)
 */
export const getLTVTrends = functions
  .region('europe-west1')
  .https.onCall(async (data, context) => {
    // Verify admin authentication
    if (!context.auth || !context.auth.token.admin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only admins can view LTV trends'
      );
    }

    const { segment, months = 12 } = data;

    try {
      const db = admin.firestore();
      let query = db
        .collection('finance')
        .doc('ltv')
        .collection('trends')
        .orderBy('monthYear', 'desc')
        .limit(months * 7); // 7 segments

      if (segment) {
        query = query.where('segment', '==', segment);
      }

      const snapshot = await query.get();
      const trends = snapshot.docs.map(doc => doc.data());

      return { trends };
    } catch (error) {
      console.error('[PACK 358] Error fetching LTV trends:', error);
      throw new functions.https.HttpsError('internal', 'Failed to fetch LTV trends');
    }
  });
