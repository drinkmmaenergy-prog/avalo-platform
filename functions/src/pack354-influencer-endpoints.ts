/**
 * ========================================================================
 * PACK 354 — INFLUENCER ENDPOINTS
 * ========================================================================
 * Cloud Functions for influencer acquisition and management
 *
 * @version 1.0.0
 * @section CREATOR_ECONOMY
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';

import {
  submitInfluencerApplication,
  getApplicationStatus,
  updateApplicationStatus,
  getCreatorProfile,
  updateCreatorTier,
  toggleCreatorCapability,
  getRegionalProgram,
  createRegionalProgram,
  updateRegionalProgramMetrics,
  recordCreatorKPISnapshot,
  getCreatorKPIs,
  calculateCreatorRiskScore,
  updateCreatorRiskFlags,
  checkCreatorSafetyThresholds,
  InfluencerApplicationStatus,
  CreatorTier,
  CreatorCapability,
  CreatorGender,
} from './pack354-influencer-service';

const db = getFirestore();

// ============================================================================
// USER-FACING ENDPOINTS
// ============================================================================

/**
 * Submit influencer application
 */
export const applyAsInfluencer = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const {
      legalName,
      country,
      city,
      age,
      photoUrls,
      socialLinks,
      expectedWeeklyActivity,
      agreedToRules,
      gender,
    } = request.data;

    // Validation
    if (!legalName || !country || !city || !age || !photoUrls || !expectedWeeklyActivity) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }

    try {
      // Get device info from headers/context
      const deviceInfo = {
        userAgent: request.rawRequest.headers['user-agent'],
        ipAddress: request.rawRequest.ip,
      };

      const applicationId = await submitInfluencerApplication(uid, {
        legalName,
        country,
        city,
        age,
        photoUrls,
        socialLinks,
        expectedWeeklyActivity,
        agreedToRules,
        deviceInfo,
      });

      // Update user profile with gender if provided
      if (gender) {
        await db.collection('users').doc(uid).update({
          'profile.gender': gender,
        });
      }

      logger.info(`Influencer application submitted by ${uid}: ${applicationId}`);

      return {
        success: true,
        applicationId,
        message: 'Application submitted successfully. We will review it within 48 hours.',
      };
    } catch (error: any) {
      logger.error('Error submitting influencer application', error);
      throw new HttpsError('internal', error.message || 'Failed to submit application');
    }
  }
);

/**
 * Get influencer application status
 */
export const getInfluencerApplicationStatus = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
      const application = await getApplicationStatus(uid);

      if (!application) {
        return {
          success: true,
          hasApplication: false,
        };
      }

      // Don't expose sensitive admin info to users
      const sanitized = {
        applicationId: application.applicationId,
        status: application.status,
        appliedAt: application.appliedAt,
        reviewedAt: application.reviewedAt,
        rejectionReason:
          application.status === InfluencerApplicationStatus.REJECTED
            ? application.rejectionReason
            : undefined,
      };

      return {
        success: true,
        hasApplication: true,
        application: sanitized,
      };
    } catch (error: any) {
      logger.error('Error getting application status', error);
      throw new HttpsError('internal', error.message || 'Failed to get application status');
    }
  }
);

/**
 * Get creator dashboard data
 */
export const getCreatorDashboard = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
      const profile = await getCreatorProfile(uid);

      if (!profile) {
        throw new HttpsError('not-found', 'Creator profile not found');
      }

      // Get recent KPIs (last 30 days)
      const today = new Date().toISOString().split('T')[0];
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      const kpis = await getCreatorKPIs(uid, thirtyDaysAgo, today);

      // Calculate aggregates
      const totalEarnings = kpis.reduce((sum, k) => sum + k.tokensEarned, 0);
      const avgConversionRate =
        kpis.length > 0 ? kpis.reduce((sum, k) => sum + k.conversionRate, 0) / kpis.length : 0;

      return {
        success: true,
        profile,
        metrics: {
          last30Days: {
            totalEarnings,
            avgConversionRate,
            kpisCount: kpis.length,
          },
        },
      };
    } catch (error: any) {
      logger.error('Error getting creator dashboard', error);
      throw new HttpsError('internal', error.message || 'Failed to get creator dashboard');
    }
  }
);

// ============================================================================
// ADMIN ENDPOINTS
// ============================================================================

/**
 * Get all influencer applications (admin only)
 */
export const adminGetInfluencerApplications = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Check admin role
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.data();

    if (!userData?.roles?.admin) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const { status, country, limit = 50, startAfter } = request.data;

    try {
      let query: any = db
        .collection('influencerApplications')
        .orderBy('appliedAt', 'desc');

      if (status) {
        query = query.where('status', '==', status);
      }

      if (country) {
        query = query.where('country', '==', country.toUpperCase());
      }

      if (startAfter) {
        const startDoc = await db
          .collection('influencerApplications')
          .doc(startAfter)
          .get();
        query = query.startAfter(startDoc);
      }

      query = query.limit(limit);

      const snapshot = await query.get();
      const applications = snapshot.docs.map((doc) => ({
        ...doc.data(),
        id: doc.id,
      }));

      logger.info(`Admin ${uid} fetched ${applications.length} applications`);

      return {
        success: true,
        applications,
        hasMore: snapshot.size === limit,
      };
    } catch (error: any) {
      logger.error('Error fetching applications for admin', error);
      throw new HttpsError('internal', error.message || 'Failed to fetch applications');
    }
  }
);

/**
 * Review influencer application (admin only)
 */
export const adminReviewInfluencerApplication = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Check admin role
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.data();

    if (!userData?.roles?.admin) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const { applicationId, action, notes, tier } = request.data;

    if (!applicationId || !action) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }

    try {
      let newStatus: InfluencerApplicationStatus;

      switch (action) {
        case 'approve':
          newStatus = InfluencerApplicationStatus.APPROVED;
          break;
        case 'reject':
          newStatus = InfluencerApplicationStatus.REJECTED;
          break;
        case 'ban':
          newStatus = InfluencerApplicationStatus.BANNED;
          break;
        default:
          throw new HttpsError('invalid-argument', 'Invalid action');
      }

      await updateApplicationStatus(applicationId, uid, newStatus, notes, tier);

      logger.info(
        `Admin ${uid} ${action}ed application ${applicationId}${tier ? ` with tier ${tier}` : ''}`
      );

      return {
        success: true,
        message: `Application ${action}ed successfully`,
      };
    } catch (error: any) {
      logger.error('Error reviewing application', error);
      throw new HttpsError('internal', error.message || 'Failed to review application');
    }
  }
);

/**
 * Update creator tier (admin only)
 */
export const adminUpdateCreatorTier = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Check admin role
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.data();

    if (!userData?.roles?.admin) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const { creatorId, tier } = request.data;

    if (!creatorId || !tier) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }

    if (!Object.values(CreatorTier).includes(tier)) {
      throw new HttpsError('invalid-argument', 'Invalid tier');
    }

    try {
      await updateCreatorTier(creatorId, tier);

      logger.info(`Admin ${uid} updated creator ${creatorId} to tier ${tier}`);

      return {
        success: true,
        message: 'Creator tier updated successfully',
      };
    } catch (error: any) {
      logger.error('Error updating creator tier', error);
      throw new HttpsError('internal', error.message || 'Failed to update tier');
    }
  }
);

/**
 * Toggle creator capability (admin only)
 */
export const adminToggleCreatorCapability = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Check admin role
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.data();

    if (!userData?.roles?.admin) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const { creatorId, capability, enabled } = request.data;

    if (!creatorId || !capability || enabled === undefined) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }

    if (!Object.values(CreatorCapability).includes(capability)) {
      throw new HttpsError('invalid-argument', 'Invalid capability');
    }

    try {
      await toggleCreatorCapability(creatorId, capability, enabled);

      logger.info(
        `Admin ${uid} set ${capability} to ${enabled} for creator ${creatorId}`
      );

      return {
        success: true,
        message: 'Creator capability updated successfully',
      };
    } catch (error: any) {
      logger.error('Error toggling creator capability', error);
      throw new HttpsError('internal', error.message || 'Failed to toggle capability');
    }
  }
);

/**
 * Force KYC for creator (admin only)
 */
export const adminForceCreatorKYC = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Check admin role
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.data();

    if (!userData?.roles?.admin) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const { creatorId } = request.data;

    if (!creatorId) {
      throw new HttpsError('invalid-argument', 'Missing creatorId');
    }

    try {
      await db.collection('creatorProfiles').doc(creatorId).update({
        kycRequired: true,
        updatedAt: Timestamp.now(),
      });

      logger.info(`Admin ${uid} forced KYC for creator ${creatorId}`);

      return {
        success: true,
        message: 'KYC requirement set for creator',
      };
    } catch (error: any) {
      logger.error('Error forcing KYC', error);
      throw new HttpsError('internal', error.message || 'Failed to force KYC');
    }
  }
);

/**
 * Freeze/unfreeze creator wallet (admin only)
 */
export const adminToggleWalletFreeze = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Check admin role
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.data();

    if (!userData?.roles?.admin) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const { creatorId, frozen } = request.data;

    if (!creatorId || frozen === undefined) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }

    try {
      await db.collection('creatorProfiles').doc(creatorId).update({
        walletFrozen: frozen,
        updatedAt: Timestamp.now(),
      });

      logger.info(
        `Admin ${uid} ${frozen ? 'froze' : 'unfroze'} wallet for creator ${creatorId}`
      );

      return {
        success: true,
        message: `Wallet ${frozen ? 'frozen' : 'unfrozen'} successfully`,
      };
    } catch (error: any) {
      logger.error('Error toggling wallet freeze', error);
      throw new HttpsError('internal', error.message || 'Failed to toggle wallet freeze');
    }
  }
);

/**
 * Ban device & IP (admin only)
 */
export const adminBanDeviceAndIP = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Check admin role
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.data();

    if (!userData?.roles?.admin) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const { creatorId, reason } = request.data;

    if (!creatorId) {
      throw new HttpsError('invalid-argument', 'Missing creatorId');
    }

    try {
      // Get application to extract device info
      const application = await getApplicationStatus(creatorId);

      if (application?.deviceInfo) {
        // Add to ban list
        const banId = `ban_${Date.now()}_${creatorId.substring(0, 8)}`;

        await db.collection('deviceBans').doc(banId).set({
          banId,
          creatorId,
          deviceId: application.deviceInfo.deviceId,
          ipAddress: application.deviceInfo.ipAddress,
          reason: reason || 'Admin ban',
          bannedAt: Timestamp.now(),
          bannedBy: uid,
        });
      }

      // Update application status to BANNED
      const appSnapshot = await db
        .collection('influencerApplications')
        .where('userId', '==', creatorId)
        .limit(1)
        .get();

      if (!appSnapshot.empty) {
        await appSnapshot.docs[0].ref.update({
          status: InfluencerApplicationStatus.BANNED,
          banReason: reason || 'Admin ban',
          reviewedAt: Timestamp.now(),
          reviewedBy: uid,
        });
      }

      logger.warn(`Admin ${uid} banned device/IP for creator ${creatorId}`);

      return {
        success: true,
        message: 'Device and IP banned successfully',
      };
    } catch (error: any) {
      logger.error('Error banning device/IP', error);
      throw new HttpsError('internal', error.message || 'Failed to ban device/IP');
    }
  }
);

/**
 * Get creator analytics (admin only)
 */
export const adminGetCreatorAnalytics = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Check admin role
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.data();

    if (!userData?.roles?.admin) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    try {
      // Get top earning creators (last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
      const today = new Date().toISOString().split('T')[0];

      const kpisSnapshot = await db
        .collection('influencerKPISnapshots')
        .where('date', '>=', thirtyDaysAgo)
        .where('date', '<=', today)
        .get();

      // Aggregate by creator
      const creatorEarnings: Record<string, number> = {};
      const creatorMetrics: Record<string, any> = {};

      kpisSnapshot.forEach((doc) => {
        const kpi = doc.data();
        if (!creatorEarnings[kpi.creatorId]) {
          creatorEarnings[kpi.creatorId] = 0;
          creatorMetrics[kpi.creatorId] = {
            totalEarnings: 0,
            avgConversion: 0,
            avgRefund: 0,
            days: 0,
          };
        }
        creatorEarnings[kpi.creatorId] += kpi.tokensEarned;
        creatorMetrics[kpi.creatorId].totalEarnings += kpi.tokensEarned;
        creatorMetrics[kpi.creatorId].avgConversion += kpi.conversionRate;
        creatorMetrics[kpi.creatorId].avgRefund += kpi.refundRatio;
        creatorMetrics[kpi.creatorId].days += 1;
      });

      // Calculate averages
      Object.keys(creatorMetrics).forEach((creatorId) => {
        const metrics = creatorMetrics[creatorId];
        metrics.avgConversion = metrics.avgConversion / metrics.days;
        metrics.avgRefund = metrics.avgRefund / metrics.days;
      });

      // Sort by earnings
      const topEarners = Object.entries(creatorEarnings)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 20)
        .map(([creatorId, earnings]) => ({
          creatorId,
          earnings,
          ...creatorMetrics[creatorId],
        }));

      // Get at-risk creators (high refund ratio)
      const atRiskCreators = Object.entries(creatorMetrics)
        .filter(([, metrics]) => metrics.avgRefund > 0.15)
        .map(([creatorId, metrics]) => ({
          creatorId,
          ...metrics,
        }));

      logger.info(`Admin ${uid} fetched creator analytics`);

      return {
        success: true,
        topEarners,
        atRiskCreators,
        totalCreators: Object.keys(creatorEarnings).length,
      };
    } catch (error: any) {
      logger.error('Error fetching creator analytics', error);
      throw new HttpsError('internal', error.message || 'Failed to fetch analytics');
    }
  }
);

// ============================================================================
// REGIONAL PROGRAM ENDPOINTS
// ============================================================================

/**
 * Create regional program (admin only)
 */
export const adminCreateRegionalProgram = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Check admin role
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.data();

    if (!userData?.roles?.admin) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const { countryCode, minimumCreatorsTarget, bonusBudgetTokens, launchDate } = request.data;

    if (!countryCode || !minimumCreatorsTarget || !bonusBudgetTokens || !launchDate) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }

    try {
      const programId = await createRegionalProgram(
        countryCode,
        minimumCreatorsTarget,
        bonusBudgetTokens,
        new Date(launchDate)
      );

      logger.info(`Admin ${uid} created regional program ${programId} for ${countryCode}`);

      return {
        success: true,
        programId,
        message: 'Regional program created successfully',
      };
    } catch (error: any) {
      logger.error('Error creating regional program', error);
      throw new HttpsError('internal', error.message || 'Failed to create program');
    }
  }
);

// ============================================================================
// SCHEDULED JOBS
// ============================================================================

/**
 * Daily risk assessment for all creators
 */
export const dailyCreatorRiskAssessment = onSchedule(
  {
    schedule: '0 3 * * *', // Daily at 3 AM UTC
    timeZone: 'UTC',
    memory: '512MiB' as const,
  },
  async (event) => {
    try {
      logger.info('Starting daily creator risk assessment');

      const creatorsSnapshot = await db.collection('creatorProfiles').get();

      let processedCount = 0;
      let flaggedCount = 0;

      for (const creatorDoc of creatorsSnapshot.docs) {
        const creatorId = creatorDoc.id;

        // Update risk flags
        await updateCreatorRiskFlags(creatorId);

        // Check safety thresholds
        await checkCreatorSafetyThresholds(creatorId);

        processedCount++;

        const riskDoc = await db.collection('creatorRiskFlags').doc(creatorId).get();
        const riskData = riskDoc.data();

        if (riskData && riskData.riskScore > 50) {
          flaggedCount++;
          logger.warn(`High risk creator detected: ${creatorId} (score: ${riskData.riskScore})`);
        }

        // Throttle to avoid rate limits
        if (processedCount % 100 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      logger.info(
        `Completed daily risk assessment: ${processedCount} creators, ${flaggedCount} flagged`
      );

      return null;
    } catch (error: any) {
      logger.error('Error in daily risk assessment', error);
      throw error;
    }
  }
);

/**
 * Update regional program metrics (daily)
 */
export const dailyRegionalProgramUpdate = onSchedule(
  {
    schedule: '0 4 * * *', // Daily at 4 AM UTC
    timeZone: 'UTC',
    memory: '256MiB' as const,
  },
  async (event) => {
    try {
      logger.info('Starting daily regional program update');

      const programsSnapshot = await db
        .collection('regionalInfluencerPrograms')
        .where('status', '==', 'active')
        .get();

      let processedCount = 0;

      for (const programDoc of programsSnapshot.docs) {
        const program = programDoc.data();
        await updateRegionalProgramMetrics(program.countryCode);
        processedCount++;
      }

      logger.info(`Updated ${processedCount} regional programs`);

      return null;
    } catch (error: any) {
      logger.error('Error in daily regional program update', error);
      throw error;
    }
  }
);

logger.info('✅ PACK 354 Influencer Endpoints loaded successfully');
