/**
 * PACK 368 — Viral Referral & Invite Engine
 * Admin panel integration
 */

import { db } from './init';
import { FieldValue } from 'firebase-admin/firestore';
import { ReferralConfig, ReferralAnalytics } from './pack368-referral-types';

/**
 * Update referral configuration
 */
export async function updateReferralConfig(
  config: Partial<ReferralConfig>,
  adminId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await db
      .collection('referralConfig')
      .doc('default')
      .set(
        {
          ...config,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: adminId,
        },
        { merge: true }
      );

    return { success: true };
  } catch (error: any) {
    console.error('Update referral config error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get referral analytics for admin dashboard
 */
export async function getReferralAnalytics(
  period: 'day' | 'week' | 'month'
): Promise<ReferralAnalytics | null> {
  try {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'day':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
    }

    // Get all referrals in period
    const referralsSnapshot = await db
      .collection('referrals')
      .where('createdAt', '>=', startDate)
      .get();

    const totalReferrals = referralsSnapshot.size;
    const successful = referralsSnapshot.docs.filter((doc) =>
      ['verified', 'rewarded'].includes(doc.data().status)
    ).length;
    const rejected = referralsSnapshot.docs.filter(
      (doc) => doc.data().status === 'rejected'
    ).length;

    const conversionRate = totalReferrals > 0 ? successful / totalReferrals : 0;
    const fraudRejectionRate = totalReferrals > 0 ? rejected / totalReferrals : 0;

    // Get attribution breakdown
    const attributionBreakdown: Record<string, number> = {};
    referralsSnapshot.docs.forEach((doc) => {
      const source = doc.data().attributionSource;
      attributionBreakdown[source] = (attributionBreakdown[source] || 0) + 1;
    });

    // Get country breakdown
    const countryBreakdown: Record<string, number> = {};
    referralsSnapshot.docs.forEach((doc) => {
      const country = doc.data().location?.country || 'Unknown';
      countryBreakdown[country] = (countryBreakdown[country] || 0) + 1;
    });

    // Get top inviters
    const inviterCounts: Record<string, { count: number; verified: number }> = {};
    referralsSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      const inviterId = data.inviterId;
      if (!inviterCounts[inviterId]) {
        inviterCounts[inviterId] = { count: 0, verified: 0 };
      }
      inviterCounts[inviterId].count++;
      if (['verified', 'rewarded'].includes(data.status)) {
        inviterCounts[inviterId].verified++;
      }
    });

    const topInviters = Object.entries(inviterCounts)
      .map(([userId, data]) => ({
        userId,
        referralCount: data.count,
        conversionRate: data.count > 0 ? data.verified / data.count : 0,
      }))
      .sort((a, b) => b.referralCount - a.referralCount)
      .slice(0, 10);

    // Calculate viral coefficient (simplified)
    const totalUsers = await db.collection('users').count().get();
    const viralCoefficient =
      totalUsers.data().count > 0 ? totalReferrals / totalUsers.data().count : 0;

    // Get LTV data (simplified - would integrate with actual revenue tracking)
    const ltv7d = 0; // TODO: Integrate with revenue tracking
    const ltv30d = 0; // TODO: Integrate with revenue tracking
    const revenuePerReferredUser = 0; // TODO: Integrate with revenue tracking

    return {
      period,
      totalReferrals,
      successfulReferrals: successful,
      conversionRate,
      fraudRejectionRate,
      topInviters,
      revenuePerReferredUser,
      viralCoefficient,
      ltv7d,
      ltv30d,
      attributionBreakdown,
      countryBreakdown,
    };
  } catch (error) {
    console.error('Get referral analytics error:', error);
    return null;
  }
}

/**
 * Get fraud heatmap data for admin visualization
 */
export async function getFraudHeatmap(
  days: number = 7
): Promise<{
  byRiskLevel: Record<string, number>;
  bySignalType: Record<string, number>;
  byCountry: Record<string, number>;
  timeline: Array<{ date: string; count: number }>;
} | null> {
  try {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const fraudSignalsSnapshot = await db
      .collection('referralFraudSignals')
      .where('detectedAt', '>=', startDate)
      .get();

    const byRiskLevel: Record<string, number> = {};
    const bySignalType: Record<string, number> = {};
    const byCountry: Record<string, number> = {};
    const dailyCounts: Record<string, number> = {};

    for (const doc of fraudSignalsSnapshot.docs) {
      const data = doc.data();

      // Risk level breakdown
      byRiskLevel[data.riskLevel] = (byRiskLevel[data.riskLevel] || 0) + 1;

      // Signal type breakdown
      bySignalType[data.signalType] = (bySignalType[data.signalType] || 0) + 1;

      // Country breakdown (if available)
      if (data.details?.country) {
        byCountry[data.details.country] = (byCountry[data.details.country] || 0) + 1;
      }

      // Timeline
      const dateKey = new Date(data.detectedAt).toISOString().split('T')[0];
      dailyCounts[dateKey] = (dailyCounts[dateKey] || 0) + 1;
    }

    const timeline = Object.entries(dailyCounts)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      byRiskLevel,
      bySignalType,
      byCountry,
      timeline,
    };
  } catch (error) {
    console.error('Get fraud heatmap error:', error);
    return null;
  }
}

/**
 * Emergency shutdown of referral system (Kill-Switch integration)
 */
export async function emergencyShutdownReferrals(
  reason: string,
  adminId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await db.collection('referralConfig').doc('default').update({
      enabled: false,
      rewardsEnabled: false,
      shutdownReason: reason,
      shutdownAt: FieldValue.serverTimestamp(),
      shutdownBy: adminId,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Log the shutdown event
    await db.collection('systemEvents').add({
      type: 'REFERRAL_EMERGENCY_SHUTDOWN',
      reason,
      adminId,
      timestamp: FieldValue.serverTimestamp(),
    });

    return { success: true };
  } catch (error: any) {
    console.error('Emergency shutdown error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Bulk update country multipliers
 */
export async function updateCountryMultipliers(
  multipliers: Record<string, number>,
  adminId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await db.collection('referralConfig').doc('default').update({
      countryMultipliers: multipliers,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: adminId,
    });

    return { success: true };
  } catch (error: any) {
    console.error('Update country multipliers error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get list of users with revoked referral privileges
 */
export async function getRevokedUsers(): Promise<
  Array<{
    userId: string;
    reason: string;
    revokedAt: Date;
  }>
> {
  try {
    const revokedProfiles = await db
      .collectionGroup('referralProfile')
      .where('referralPrivilegesRevoked', '==', true)
      .get();

    return revokedProfiles.docs.map((doc) => ({
      userId: doc.ref.parent.parent!.id,
      reason: doc.data().referralPrivilegesRevokedReason || 'Unknown',
      revokedAt: doc.data().updatedAt?.toDate() || new Date(),
    }));
  } catch (error) {
    console.error('Get revoked users error:', error);
    return [];
  }
}
