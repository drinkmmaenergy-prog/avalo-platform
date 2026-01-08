/**
 * PACK 394 — Viral Growth Engine
 * Anti-Abuse Layer (Critical)
 * 
 * Auto-blocks rewards when fraud is detected
 * Integrates with PACK 302 (Fraud Detection)
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

export enum AbuseType {
  EMULATOR_INSTALL = 'emulator_install',
  SELF_INVITE_LOOP = 'self_invite_loop',
  FARMED_SIM_TRAFFIC = 'farmed_sim_traffic',
  VPN_COUNTRY_MISMATCH = 'vpn_country_mismatch',
  LOW_RETENTION = 'low_retention',
  DEVICE_HASH_COLLISION = 'device_hash_collision',
  RAPID_REGISTRATIONS = 'rapid_registrations',
  SUSPICIOUS_PATTERN = 'suspicious_pattern',
}

export enum AbuseRiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

interface AbuseFlag {
  flagId: string;
  userId: string;
  inviterId?: string;
  inviteeId?: string;
  type: AbuseType;
  riskLevel: AbuseRiskLevel;
  detectedAt: Date;
  evidence: Record<string, any>;
  autoBlocked: boolean;
  resolved: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
  notes?: string;
}

/**
 * Detect Abuse on User Registration
 * Runs fraud checks when new user registers via referral
 */
export const detectAbuseOnRegistration = functions.firestore
  .document('users/{userId}')
  .onCreate(async (snap, context) => {
    const userId = context.params.userId;
    const userData = snap.data();

    // Only check referred users
    if (!userData.referral?.inviterId) {
      return null;
    }

    try {
      const flags: AbuseFlag[] = [];

      // Check 1: Emulator Detection
      if (userData.deviceInfo?.isEmulator) {
        flags.push(createAbuseFlag(
          userId,
          userData.referral.inviterId,
          userId,
          AbuseType.EMULATOR_INSTALL,
          AbuseRiskLevel.CRITICAL,
          { deviceInfo: userData.deviceInfo }
        ));
      }

      // Check 2: Self-Invite Loop
      if (userData.referral.inviterId === userId) {
        flags.push(createAbuseFlag(
          userId,
          userData.referral.inviterId,
          userId,
          AbuseType.SELF_INVITE_LOOP,
          AbuseRiskLevel.CRITICAL,
          { inviterId: userData.referral.inviterId }
        ));
      }

      // Check 3: Device Hash Collision
      if (userData.deviceInfo?.deviceHash) {
        const existingUsersSnapshot = await db.collection('users')
          .where('deviceInfo.deviceHash', '==', userData.deviceInfo.deviceHash)
          .limit(5)
          .get();

        if (existingUsersSnapshot.size > 1) {
          flags.push(createAbuseFlag(
            userId,
            userData.referral.inviterId,
            userId,
            AbuseType.DEVICE_HASH_COLLISION,
            AbuseRiskLevel.HIGH,
            {
              deviceHash: userData.deviceInfo.deviceHash,
              collisionCount: existingUsersSnapshot.size,
            }
          ));
        }
      }

      // Check 4: VPN/Country Mismatch
      if (userData.geo && userData.deviceInfo?.locale) {
        const geoCountry = userData.geo.country;
        const localeCountry = userData.deviceInfo.locale.split('_')[1];
        
        if (geoCountry !== localeCountry) {
          flags.push(createAbuseFlag(
            userId,
            userData.referral.inviterId,
            userId,
            AbuseType.VPN_COUNTRY_MISMATCH,
            AbuseRiskLevel.MEDIUM,
            {
              geoCountry,
              localeCountry,
            }
          ));
        }
      }

      // Check 5: Rapid Registrations from Same Inviter
      const recentInvitesSnapshot = await db.collection('users')
        .where('referral.inviterId', '==', userData.referral.inviterId)
        .where('createdAt', '>', new Date(Date.now() - 60 * 60 * 1000)) // Last hour
        .get();

      if (recentInvitesSnapshot.size > 10) {
        flags.push(createAbuseFlag(
          userId,
          userData.referral.inviterId,
          userId,
          AbuseType.RAPID_REGISTRATIONS,
          AbuseRiskLevel.HIGH,
          {
            recentInvitesCount: recentInvitesSnapshot.size,
            timeWindow: '1h',
          }
        ));
      }

      // Save all flags
      if (flags.length > 0) {
        const batch = db.batch();
        flags.forEach(flag => {
          const ref = db.collection('referralAbuseFlags').doc();
          batch.set(ref, flag);
        });
        await batch.commit();

        // Auto-block if critical risk
        const hasCriticalRisk = flags.some(f => f.riskLevel === AbuseRiskLevel.CRITICAL);
        if (hasCriticalRisk) {
          await blockUserRewards(userId, userData.referral.inviterId);
        }

        functions.logger.warn(`Abuse detected for user ${userId}: ${flags.length} flags`);
      }

      return null;
    } catch (error) {
      functions.logger.error('Error detecting abuse:', error);
      return null;
    }
  });

/**
 * Monitor Retention for Abuse
 * Checks if invitees show suspiciously low retention
 */
export const monitorRetentionAbuse = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    functions.logger.info('Starting retention abuse monitoring');

    try {
      // Get users registered in last 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const usersSnapshot = await db.collection('users')
        .where('createdAt', '>=', sevenDaysAgo)
        .where('referral.inviterId', '!=', null)
        .get();

      const inviterRetention: Record<string, { total: number; inactive: number }> = {};

      // Check each user's activity
      for (const userDoc of usersSnapshot.docs) {
        const userData = userDoc.data();
        const inviterId = userData.referral?.inviterId;
        
        if (!inviterId) continue;

        if (!inviterRetention[inviterId]) {
          inviterRetention[inviterId] = { total: 0, inactive: 0 };
        }

        inviterRetention[inviterId].total++;

        // Check if user is inactive (no activity in last 3 days)
        const lastActiveAt = userData.lastActiveAt?.toDate();
        const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
        
        if (!lastActiveAt || lastActiveAt < threeDaysAgo) {
          inviterRetention[inviterId].inactive++;
        }
      }

      // Flag inviters with very low retention
      const batch = db.batch();
      let flagsCreated = 0;

      for (const [inviterId, stats] of Object.entries(inviterRetention)) {
        const retentionRate = ((stats.total - stats.inactive) / stats.total) * 100;

        if (retentionRate < 5 && stats.total >= 10) {
          const flag = createAbuseFlag(
            inviterId,
            inviterId,
            undefined,
            AbuseType.LOW_RETENTION,
            AbuseRiskLevel.HIGH,
            {
              total: stats.total,
              inactive: stats.inactive,
              retentionRate,
            }
          );

          const ref = db.collection('referralAbuseFlags').doc();
          batch.set(ref, flag);
          flagsCreated++;

          // Block future rewards
          await blockInviterRewards(inviterId);
        }
      }

      await batch.commit();

      functions.logger.info(`Created ${flagsCreated} retention abuse flags`);
      return null;
    } catch (error) {
      functions.logger.error('Error monitoring retention abuse:', error);
      return null;
    }
  });

/**
 * Check Farmed SIM Traffic
 * Detects patterns of SIM farm abuse
 */
export const checkFarmedSimTraffic = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { userId } = data;

  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'User not found');
    }

    const userData = userDoc.data();
    let simFarmRisk = 0;

    // Check 1: Phone number carrier (if available)
    if (userData?.phoneCarrier === 'virtual' || userData?.phoneCarrier === 'voip') {
      simFarmRisk += 30;
    }

    // Check 2: Rapid account creation from same network
    if (userData?.networkInfo?.ipAddress) {
      const sameNetworkSnapshot = await db.collection('users')
        .where('networkInfo.ipAddress', '==', userData.networkInfo.ipAddress)
        .where('createdAt', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
        .get();

      if (sameNetworkSnapshot.size > 5) {
        simFarmRisk += 40;
      }
    }

    // Check 3: Suspicious device patterns
    if (userData?.deviceInfo?.model && userData?.deviceInfo?.osVersion) {
      const sameDeviceSnapshot = await db.collection('users')
        .where('deviceInfo.model', '==', userData.deviceInfo.model)
        .where('deviceInfo.osVersion', '==', userData.deviceInfo.osVersion)
        .where('createdAt', '>', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
        .get();

      if (sameDeviceSnapshot.size > 20) {
        simFarmRisk += 30;
      }
    }

    // Flag if high risk
    if (simFarmRisk >= 50) {
      const flag = createAbuseFlag(
        userId,
        userData.referral?.inviterId,
        userId,
        AbuseType.FARMED_SIM_TRAFFIC,
        simFarmRisk >= 70 ? AbuseRiskLevel.CRITICAL : AbuseRiskLevel.HIGH,
        { riskScore: simFarmRisk }
      );

      await db.collection('referralAbuseFlags').add(flag);

      if (simFarmRisk >= 70) {
        await blockUserRewards(userId, userData.referral?.inviterId);
      }
    }

    return {
      success: true,
      simFarmRisk,
      flagged: simFarmRisk >= 50,
    };
  } catch (error: any) {
    functions.logger.error('Error checking SIM farm traffic:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Get Abuse Flags for Admin Review
 */
export const getAbuseFlags = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  // Check admin permission (integrate with PACK 300)
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  if (!userDoc.data()?.isAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { status = 'unresolved', limit = 100 } = data;

  try {
    let query = db.collection('referralAbuseFlags')
      .orderBy('detectedAt', 'desc')
      .limit(limit);

    if (status === 'unresolved') {
      query = query.where('resolved', '==', false) as any;
    }

    const flagsSnapshot = await query.get();
    const flags = flagsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    return {
      success: true,
      flags,
    };
  } catch (error: any) {
    functions.logger.error('Error getting abuse flags:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Resolve Abuse Flag (Admin Action)
 */
export const resolveAbuseFlag = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const adminId = context.auth.uid;

  // Check admin permission
  const userDoc = await db.collection('users').doc(adminId).get();
  if (!userDoc.data()?.isAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { flagId, action, notes } = data;

  try {
    await db.collection('referralAbuseFlags').doc(flagId).update({
      resolved: true,
      resolvedAt: new Date(),
      resolvedBy: adminId,
      notes,
    });

    // Take action based on decision
    if (action === 'block') {
      const flagDoc = await db.collection('referralAbuseFlags').doc(flagId).get();
      const flag = flagDoc.data() as AbuseFlag;
      
      if (flag.inviterId) {
        await blockInviterRewards(flag.inviterId);
      }
    }

    return {
      success: true,
    };
  } catch (error: any) {
    functions.logger.error('Error resolving abuse flag:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Helper: Create Abuse Flag
 */
function createAbuseFlag(
  userId: string,
  inviterId: string | undefined,
  inviteeId: string | undefined,
  type: AbuseType,
  riskLevel: AbuseRiskLevel,
  evidence: Record<string, any>
): AbuseFlag {
  return {
    flagId: db.collection('referralAbuseFlags').doc().id,
    userId,
    inviterId,
    inviteeId,
    type,
    riskLevel,
    detectedAt: new Date(),
    evidence,
    autoBlocked: riskLevel === AbuseRiskLevel.CRITICAL,
    resolved: false,
  };
}

/**
 * Helper: Block User Rewards
 */
async function blockUserRewards(userId: string, inviterId?: string): Promise<void> {
  // Block all pending rewards for this invitee
  const rewardsSnapshot = await db.collection('referralRewards')
    .where('inviteeId', '==', userId)
    .where('status', 'in', ['locked', 'pending', 'earned'])
    .get();

  const batch = db.batch();
  rewardsSnapshot.docs.forEach(doc => {
    batch.update(doc.ref, { status: 'fraud_blocked' });
  });

  // Flag user as fraud risk
  batch.update(db.collection('users').doc(userId), {
    'security.fraudRisk': 'high',
    'security.referralBlocked': true,
  });

  await batch.commit();
  
  functions.logger.warn(`Blocked rewards for user ${userId}`);
}

/**
 * Helper: Block Inviter Rewards
 */
async function blockInviterRewards(inviterId: string): Promise<void> {
  // Block future rewards for this inviter
  await db.collection('users').doc(inviterId).update({
    'referral.rewardsEnabled': false,
    'referral.blockedReason': 'abuse_detected',
    'referral.blockedAt': new Date(),
  });

  functions.logger.warn(`Blocked rewards for inviter ${inviterId}`);
}

/**
 * Get Abuse Analytics for Dashboard
 */
export const getAbuseAnalytics = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  // Check admin permission
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  if (!userDoc.data()?.isAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  try {
    const flagsSnapshot = await db.collection('referralAbuseFlags')
      .where('detectedAt', '>=', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      .get();

    const flags = flagsSnapshot.docs.map(doc => doc.data() as AbuseFlag);

    const analytics = {
      totalFlags: flags.length,
      byType: {} as Record<string, number>,
      byRiskLevel: {} as Record<string, number>,
      autoBlocked: flags.filter(f => f.autoBlocked).length,
      resolved: flags.filter(f => f.resolved).length,
      pending: flags.filter(f => !f.resolved).length,
    };

    // Count by type
    flags.forEach(flag => {
      analytics.byType[flag.type] = (analytics.byType[flag.type] || 0) + 1;
      analytics.byRiskLevel[flag.riskLevel] = (analytics.byRiskLevel[flag.riskLevel] || 0) + 1;
    });

    return {
      success: true,
      analytics,
    };
  } catch (error: any) {
    functions.logger.error('Error getting abuse analytics:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
