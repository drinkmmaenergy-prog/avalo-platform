/**
 * PACK 381 — Regional Expansion Engine
 * Regional Risk Engine
 * 
 * Extension of PACK 302 (Fraud Detection) with regional modifiers
 * Calculates risk scores based on regional patterns and behavior
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

export interface RegionalRiskProfile {
  regionId: string;
  countryCode: string;
  
  // Risk Assessment
  risk: {
    baseLevel: 'low' | 'medium' | 'high' | 'critical';
    fraudMultiplier: number; // multiplies fraud score from PACK 302
    scriptingRisk: number; // 0-1, likelihood of bot/script usage
    vpnUsageRate: number; // % of users using VPN
    chargebackRate: number; // historical chargeback percentage
    accountTakeoverRisk: number; // 0-1
  };
  
  // Fraud Vectors (regional patterns)
  fraudVectors: {
    fakeProfiles: { weight: number; threshold: number };
    paymentFraud: { weight: number; threshold: number };
    contentAbuse: { weight: number; threshold: number };
    accountFarming: { weight: number; threshold: number };
    catfishing: { weight: number; threshold: number };
    scamming: { weight: number; threshold: number };
    spamming: { weight: number; threshold: number };
  };
  
  // Detection Thresholds
  thresholds: {
    suspiciousActivityScore: number; // 0-100, triggers review
    autoBlockScore: number; // 0-100, automatic ban
    swipeLimit: number; // max swipes per day for suspicious accounts
    chatLimit: number; // max chats per day
    reportThreshold: number; // reports before review
    velocityThreshold: number; // actions per minute
  };
  
  // Trust & Verification
  trust: {
    defaultTrustScore: number; // starting trust for new users
    verificationBoost: number; // trust increase after verification
    kycRequired: boolean;
    phoneVerificationRequired: boolean;
    emailVerificationRequired: boolean;
    documentVerificationRequired: boolean;
    minAccountAge: number; // days before full access
  };
  
  // Creator Monetization Trust
  creatorTrust: {
    minTrustScore: number; // minimum to enable monetization
    minAccountAge: number; // days
    minFollowers: number;
    backgroundCheckRequired: boolean;
    taxIdRequired: boolean;
    bankVerificationRequired: boolean;
    initialPayoutDelay: number; // days
  };
  
  // Monitoring Settings
  monitoring: {
    aiModerationLevel: 'strict' | 'moderate' | 'lenient';
    humanReviewPercentage: number; // % of flagged content to human review
    realTimeMonitoring: boolean;
    retrospectiveScan: boolean;
    anomalyDetectionEnabled: boolean;
  };
  
  // Regional Patterns
  patterns: {
    peakFraudHours: number[]; // hours of day (0-23)
    commonFraudIPs: string[];
    suspiciousDeviceFingerprints: string[];
    blockedPaymentMethods: string[];
    highRiskAreas: string[]; // city/region names
  };
  
  metadata: {
    createdAt: string;
    updatedAt: string;
    updatedBy: string;
    lastIncidentDate?: string;
    totalIncidents?: number;
  };
}

/**
 * Admin: Update regional risk profile
 */
export const pack381_updateRegionalRisk = functions.https.onCall(
  async (data: Partial<RegionalRiskProfile>, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    const userData = userDoc.data();
    
    if (userData?.role !== 'admin' && userData?.role !== 'super_admin') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Admin access required'
      );
    }

    const { regionId } = data;
    if (!regionId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'regionId is required'
      );
    }

    const profileRef = db.collection('regionalRiskProfiles').doc(regionId);
    const existingProfile = await profileRef.get();

    const now = new Date().toISOString();
    const profileData = {
      ...data,
      metadata: {
        ...data.metadata,
        updatedAt: now,
        updatedBy: context.auth.uid,
        ...(existingProfile.exists ? {} : { createdAt: now }),
      },
    };

    await profileRef.set(profileData, { merge: true });

    await db.collection('auditLogs').add({
      type: 'regional_risk_update',
      userId: context.auth.uid,
      regionId,
      changes: data,
      timestamp: now,
    });

    return {
      success: true,
      regionId,
      message: 'Regional risk profile updated',
    };
  }
);

/**
 * Calculate regional risk score for a user
 */
export const pack381_calculateRegionalRiskScore = functions.https.onCall(
  async (data: { userId?: string; regionId?: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    const targetUserId = data.userId || context.auth.uid;
    
    // Verify permission to check other users
    if (targetUserId !== context.auth.uid) {
      const callerDoc = await db.collection('users').doc(context.auth.uid).get();
      const callerData = callerDoc.data();
      
      if (callerData?.role !== 'admin' && callerData?.role !== 'moderator') {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Cannot check risk score for other users'
        );
      }
    }

    // Get user data
    const userDoc = await db.collection('users').doc(targetUserId).get();
    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'User not found');
    }

    const userData = userDoc.data();
    const userRegionId = data.regionId || userData?.detectedRegion || 'GLOBAL';

    // Get regional risk profile
    const riskProfileDoc = await db.collection('regionalRiskProfiles').doc(userRegionId).get();
    
    if (!riskProfileDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Regional risk profile not found'
      );
    }

    const riskProfile = riskProfileDoc.data() as RegionalRiskProfile;

    // Get base fraud score from PACK 302
    let baseFraudScore = 0;
    const fraudDoc = await db.collection('fraudDetection').doc(targetUserId).get();
    if (fraudDoc.exists) {
      baseFraudScore = fraudDoc.data()?.riskScore || 0;
    }

    // Apply regional multiplier
    const regionalScore = baseFraudScore * riskProfile.risk.fraudMultiplier;

    // Get user behavior signals from PACK 296 (Audit Logs)
    const recentLogsSnapshot = await db
      .collection('auditLogs')
      .where('userId', '==', targetUserId)
      .orderBy('timestamp', 'desc')
      .limit(100)
      .get();

    const behaviorSignals = {
      suspiciousLogins: 0,
      multipleDevices: 0,
      rapidActions: 0,
      reportedByOthers: 0,
      chargebacks: 0,
    };

    recentLogsSnapshot.docs.forEach(doc => {
      const log = doc.data();
      if (log.type === 'suspicious_login') behaviorSignals.suspiciousLogins++;
      if (log.type === 'device_change') behaviorSignals.multipleDevices++;
      if (log.type === 'reported') behaviorSignals.reportedByOthers++;
      if (log.type === 'chargeback') behaviorSignals.chargebacks++;
    });

    // Calculate behavior risk
    let behaviorRisk = 0;
    behaviorRisk += behaviorSignals.suspiciousLogins * 5;
    behaviorRisk += behaviorSignals.multipleDevices * 3;
    behaviorRisk += behaviorSignals.reportedByOthers * 10;
    behaviorRisk += behaviorSignals.chargebacks * 20;

    // Get churn signals from PACK 301
    const churnDoc = await db.collection('userRetention').doc(targetUserId).get();
    const churnSignals = churnDoc.exists ? churnDoc.data()?.churnRisk || 0 : 0;

    // Calculate final risk score (0-100)
    const finalScore = Math.min(100, regionalScore + behaviorRisk + (churnSignals * 10));

    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high' | 'critical';
    if (finalScore < 25) riskLevel = 'low';
    else if (finalScore < 50) riskLevel = 'medium';
    else if (finalScore < 75) riskLevel = 'high';
    else riskLevel = 'critical';

    // Calculate recommended limits
    const recommendedLimits = {
      swipesPerDay: riskLevel === 'low' ? 1000 :
                     riskLevel === 'medium' ? riskProfile.thresholds.swipeLimit :
                     riskLevel === 'high' ? Math.floor(riskProfile.thresholds.swipeLimit * 0.5) : 0,
      chatsPerDay: riskLevel === 'low' ? 100 :
                   riskLevel === 'medium' ? riskProfile.thresholds.chatLimit :
                   riskLevel === 'high' ? Math.floor(riskProfile.thresholds.chatLimit * 0.5) : 0,
      requiresReview: finalScore >= riskProfile.thresholds.suspiciousActivityScore,
      autoBlock: finalScore >= riskProfile.thresholds.autoBlockScore,
    };

    // Calculate creator monetization trust score
    const accountAgeDays = userData?.createdAt
      ? Math.floor((Date.now() - new Date(userData.createdAt).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    const creatorTrustScore = Math.max(0, 100 - finalScore);
    const monetizationEligible =
      creatorTrustScore >= riskProfile.creatorTrust.minTrustScore &&
      accountAgeDays >= riskProfile.creatorTrust.minAccountAge &&
      !recommendedLimits.autoBlock;

    // Store the calculated risk score
    await db.collection('userRiskScores').doc(targetUserId).set({
      userId: targetUserId,
      regionId: userRegionId,
      riskScore: finalScore,
      riskLevel,
      baseFraudScore,
      behaviorRisk,
      regionalMultiplier: riskProfile.risk.fraudMultiplier,
      recommendedLimits,
      calculatedAt: new Date().toISOString(),
    });

    return {
      userId: targetUserId,
      regionId: userRegionId,
      riskScore: finalScore,
      riskLevel,
      recommendedLimits,
      creatorTrustScore,
      monetizationEligible,
      breakdown: {
        baseFraudScore,
        regionalScore,
        behaviorRisk,
        churnSignals,
      },
    };
  }
);

/**
 * Check if user action is allowed based on regional risk
 */
export const pack381_validateAction = functions.https.onCall(
  async (data: {
    action: string;
    metadata?: any;
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    const userId = context.auth.uid;
    const { action, metadata } = data;

    // Get user's current risk score
    const riskDoc = await db.collection('userRiskScores').doc(userId).get();
    
    if (!riskDoc.exists) {
      // First time user, calculate risk score
      const riskResult = await pack381_calculateRegionalRiskScore.run({
        data: { userId },
        auth: context.auth,
        rawRequest: context.rawRequest,
      });
      
      return {
        allowed: riskResult.riskLevel !== 'critical',
        reason: riskResult.riskLevel === 'critical' ? 'Account under review' : null,
      };
    }

    const riskData = riskDoc.data();
    const { riskLevel, recommendedLimits } = riskData;

    // Check if auto-blocked
    if (recommendedLimits.autoBlock) {
      return {
        allowed: false,
        reason: 'Account suspended due to security concerns',
      };
    }

    // Check action-specific limits
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (action) {
      case 'swipe':
        // Check swipe limit
        const swipesSnapshot = await db
          .collection('auditLogs')
          .where('userId', '==', userId)
          .where('type', '==', 'swipe')
          .where('timestamp', '>=', todayStart.toISOString())
          .get();
        
        const swipeCount = swipesSnapshot.size;
        
        if (swipeCount >= recommendedLimits.swipesPerDay) {
          return {
            allowed: false,
            reason: 'Daily swipe limit reached',
            limit: recommendedLimits.swipesPerDay,
            current: swipeCount,
          };
        }
        break;

      case 'chat':
        // Check chat limit
        const chatsSnapshot = await db
          .collection('auditLogs')
          .where('userId', '==', userId)
          .where('type', '==', 'chat_initiated')
          .where('timestamp', '>=', todayStart.toISOString())
          .get();
        
        const chatCount = chatsSnapshot.size;
        
        if (chatCount >= recommendedLimits.chatsPerDay) {
          return {
            allowed: false,
            reason: 'Daily chat limit reached',
            limit: recommendedLimits.chatsPerDay,
            current: chatCount,
          };
        }
        break;

      case 'monetization':
        if (recommendedLimits.requiresReview) {
          return {
            allowed: false,
            reason: 'Account requires verification before monetization',
          };
        }
        break;
    }

    return {
      allowed: true,
      riskLevel,
    };
  }
);

/**
 * Report and track regional fraud incidents
 */
export const pack381_reportIncident = functions.https.onCall(
  async (data: {
    regionId: string;
    incidentType: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    affectedUserIds?: string[];
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    const userData = userDoc.data();
    
    if (userData?.role !== 'admin' && userData?.role !== 'moderator') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Admin or moderator access required'
      );
    }

    const { regionId, incidentType, severity, description, affectedUserIds } = data;
    const now = new Date().toISOString();

    // Create incident record
    const incidentRef = await db.collection('regionalIncidents').add({
      regionId,
      incidentType,
      severity,
      description,
      affectedUserIds: affectedUserIds || [],
      reportedBy: context.auth.uid,
      reportedAt: now,
      status: 'open',
    });

    // Update regional risk profile
    const riskProfileRef = db.collection('regionalRiskProfiles').doc(regionId);
    await riskProfileRef.update({
      'metadata.lastIncidentDate': now,
      'metadata.totalIncidents': admin.firestore.FieldValue.increment(1),
    });

    // If critical, adjust risk multiplier
    if (severity === 'critical') {
      await riskProfileRef.update({
        'risk.fraudMultiplier': admin.firestore.FieldValue.increment(0.1),
      });
    }

    return {
      success: true,
      incidentId: incidentRef.id,
      regionId,
      severity,
    };
  }
);

/**
 * Get regional risk statistics
 */
export const pack381_getRegionalRiskStats = functions.https.onCall(
  async (data: { regionId: string; days?: number }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    const userData = userDoc.data();
    
    if (userData?.role !== 'admin') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Admin access required'
      );
    }

    const { regionId, days = 30 } = data;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Get incidents
    const incidentsSnapshot = await db
      .collection('regionalIncidents')
      .where('regionId', '==', regionId)
      .where('reportedAt', '>=', cutoffDate.toISOString())
      .get();

    const incidents = {
      total: incidentsSnapshot.size,
      bySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
      byType: {} as Record<string, number>,
    };

    incidentsSnapshot.docs.forEach(doc => {
      const incident = doc.data();
      incidents.bySeverity[incident.severity as keyof typeof incidents.bySeverity]++;
      incidents.byType[incident.incidentType] = (incidents.byType[incident.incidentType] || 0) + 1;
    });

    // Get risk scores for region
    const riskScoresSnapshot = await db
      .collection('userRiskScores')
      .where('regionId', '==', regionId)
      .get();

    const riskDistribution = { low: 0, medium: 0, high: 0, critical: 0 };
    let totalScore = 0;

    riskScoresSnapshot.docs.forEach(doc => {
      const score = doc.data();
      riskDistribution[score.riskLevel as keyof typeof riskDistribution]++;
      totalScore += score.riskScore;
    });

    const avgRiskScore = riskScoresSnapshot.size > 0
      ? totalScore / riskScoresSnapshot.size
      : 0;

    return {
      regionId,
      period: `${days} days`,
      incidents,
      riskDistribution,
      totalUsers: riskScoresSnapshot.size,
      avgRiskScore: Math.round(avgRiskScore * 100) / 100,
    };
  }
);
