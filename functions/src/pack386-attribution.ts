/**
 * PACK 386 - Attribution & Multi-Touch Tracking (Anti-Fraud Safe)
 * 
 * Tracks user acquisition sources with:
 * - Multi-channel attribution (paid ads, organic, influencer, referral, web-to-app)
 * - Fraud detection integration
 * - Real-time validation
 * - Source blocking for fraud
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface AcquisitionAttribution {
  attributionId: string;
  userId: string;
  source: 'PAID_ADS' | 'ORGANIC_STORE' | 'INFLUENCER' | 'REFERRAL' | 'WEB_TO_APP';
  platform?: string;
  campaignId?: string;
  influencerId?: string;
  referrerId?: string;
  installDate: admin.firestore.Timestamp;
  deviceInfo: {
    deviceId: string;
    platform: string;
    ipAddress: string;
    userAgent: string;
  };
  fraudChecks: {
    isVPN: boolean;
    isEmulator: boolean;
    isDuplicateDevice: boolean;
    isMassIPReuse: boolean;
  };
  fraudScore: number;
  blocked: boolean;
  blockReason?: string;
  hasVerified: boolean;
  hasTokenPurchase: boolean;
  totalSpent: number;
  hasChurned: boolean;
  revenue: number;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

interface AttributionValidateRequest {
  userId: string;
  source: 'PAID_ADS' | 'ORGANIC_STORE' | 'INFLUENCER' | 'REFERRAL' | 'WEB_TO_APP';
  campaignId?: string;
  influencerId?: string;
  referrerId?: string;
  deviceInfo: {
    deviceId: string;
    platform: string;
    ipAddress: string;
    userAgent: string;
  };
}

// ============================================================================
// VALIDATE ATTRIBUTION
// ============================================================================

export const pack386_validateAttribution = functions.https.onCall(
  async (data: AttributionValidateRequest, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const userId = context.auth.uid;

    // Validate userId matches
    if (userId !== data.userId) {
      throw new functions.https.HttpsError('permission-denied', 'User ID mismatch');
    }

    // Check if attribution already exists
    const existingAttribution = await db.collection('acquisitionAttribution')
      .where('userId', '==', userId)
      .limit(1)
      .get();

    if (!existingAttribution.empty) {
      return { 
        success: false, 
        reason: 'ATTRIBUTION_EXISTS',
        attributionId: existingAttribution.docs[0].id,
      };
    }

    // Fraud checks
    const fraudChecks = {
      isVPN: await checkVPN(data.deviceInfo.ipAddress),
      isEmulator: await checkEmulator(data.deviceInfo.userAgent),
      isDuplicateDevice: await checkDuplicateDevice(data.deviceInfo.deviceId),
      isMassIPReuse: await checkMassIPReuse(data.deviceInfo.ipAddress),
    };

    // Calculate fraud score
    let fraudScore = 0;
    if (fraudChecks.isVPN) fraudScore += 0.3;
    if (fraudChecks.isEmulator) fraudScore += 0.4;
    if (fraudChecks.isDuplicateDevice) fraudScore += 0.5;
    if (fraudChecks.isMassIPReuse) fraudScore += 0.4;

    // Check PACK 302 fraud detection
    const fraudDoc = await db.collection('fraudDetectionProfiles').doc(userId).get();
    if (fraudDoc.exists) {
      const fraudData = fraudDoc.data();
      fraudScore = Math.max(fraudScore, fraudData?.riskScore || 0);
    }

    // Block if high fraud score
    const blocked = fraudScore >= 0.8;
    const blockReason = blocked ? 'HIGH_FRAUD_SCORE' : undefined;

    // Create attribution record
    const attributionRef = db.collection('acquisitionAttribution').doc();
    const attribution: AcquisitionAttribution = {
      attributionId: attributionRef.id,
      userId,
      source: data.source,
      platform: data.deviceInfo.platform,
      campaignId: data.campaignId,
      influencerId: data.influencerId,
      referrerId: data.referrerId,
      installDate: admin.firestore.Timestamp.now(),
      deviceInfo: data.deviceInfo,
      fraudChecks,
      fraudScore,
      blocked,
      blockReason,
      hasVerified: false,
      hasTokenPurchase: false,
      totalSpent: 0,
      hasChurned: false,
      revenue: 0,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    };

    await attributionRef.set(attribution);

    // If blocked, notify fraud system
    if (blocked) {
      await db.collection('fraudAlerts').add({
        type: 'ATTRIBUTION_BLOCKED',
        userId,
        source: data.source,
        fraudScore,
        fraudChecks,
        timestamp: admin.firestore.Timestamp.now(),
      });

      // Block payout if applicable
      if (data.campaignId) {
        await db.collection('marketingCampaigns').doc(data.campaignId).update({
          'metrics.blockedInstalls': admin.firestore.FieldValue.increment(1),
        });
      }

      if (data.influencerId) {
        await db.collection('influencerProfiles').doc(data.influencerId).update({
          'metrics.fraudScore': admin.firestore.FieldValue.increment(fraudScore),
        });
      }
    }

    return {
      success: true,
      attributionId: attributionRef.id,
      blocked,
      fraudScore,
    };
  }
);

// ============================================================================
// FRAUD CHECK HELPERS
// ============================================================================

async function checkVPN(ipAddress: string): Promise<boolean> {
  // Check against known VPN IP ranges
  const vpnDoc = await db.collection('fraudDetectionRules')
    .doc('vpn-ips')
    .get();

  if (!vpnDoc.exists) return false;

  const vpnIPs = vpnDoc.data()?.blockedIPs || [];
  return vpnIPs.includes(ipAddress);
}

async function checkEmulator(userAgent: string): Promise<boolean> {
  // Check for common emulator signatures
  const emulatorSignatures = [
    'Android SDK',
    'Emulator',
    'Simulator',
    'GenericDevice',
    'unknown device',
  ];

  return emulatorSignatures.some(sig => 
    userAgent.toLowerCase().includes(sig.toLowerCase())
  );
}

async function checkDuplicateDevice(deviceId: string): Promise<boolean> {
  // Check if device already attributed
  const existingDevices = await db.collection('acquisitionAttribution')
    .where('deviceInfo.deviceId', '==', deviceId)
    .limit(2)
    .get();

  return existingDevices.size > 0;
}

async function checkMassIPReuse(ipAddress: string): Promise<boolean> {
  // Check if IP has too many attributions
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const recentAttributions = await db.collection('acquisitionAttribution')
    .where('deviceInfo.ipAddress', '==', ipAddress)
    .where('installDate', '>=', admin.firestore.Timestamp.fromDate(yesterday))
    .get();

  // Block if >10 installs from same IP in 24h
  return recentAttributions.size > 10;
}

// ============================================================================
// UPDATE ATTRIBUTION ON USER VERIFICATION (TRIGGERED)
// ============================================================================

export const pack386_updateAttributionOnVerification = functions.firestore
  .document('users/{userId}')
  .onUpdate(async (change) => {
    const before = change.before.data();
    const after = change.after.data();

    // Check if user just verified
    if (!before.verified && after.verified) {
      const userId = change.after.id;

      const attributionSnapshot = await db.collection('acquisitionAttribution')
        .where('userId', '==', userId)
        .limit(1)
        .get();

      if (attributionSnapshot.empty) return;

      const attributionDoc = attributionSnapshot.docs[0];
      await attributionDoc.ref.update({
        hasVerified: true,
        updatedAt: admin.firestore.Timestamp.now(),
      });

      // Update influencer metrics
      const attribution = attributionDoc.data();
      if (attribution.influencerId) {
        await db.collection('influencerProfiles').doc(attribution.influencerId).update({
          'metrics.verifiedAccounts': admin.firestore.FieldValue.increment(1),
        });
      }
    }
  });

// ============================================================================
// UPDATE ATTRIBUTION ON TOKEN PURCHASE (TRIGGERED)
// ============================================================================

export const pack386_updateAttributionOnPurchase = functions.firestore
  .document('tokenTransactions/{transactionId}')
  .onCreate(async (snap) => {
    const transaction = snap.data();
    const userId = transaction.userId;

    if (!userId) return;

    const attributionSnapshot = await db.collection('acquisitionAttribution')
      .where('userId', '==', userId)
      .limit(1)
      .get();

    if (attributionSnapshot.empty) return;

    const attributionDoc = attributionSnapshot.docs[0];
    const attribution = attributionDoc.data();

    // Update attribution
    await attributionDoc.ref.update({
      hasTokenPurchase: true,
      totalSpent: admin.firestore.FieldValue.increment(transaction.amount),
      revenue: admin.firestore.FieldValue.increment(transaction.amount),
      updatedAt: admin.firestore.Timestamp.now(),
    });

    // Update campaign metrics
    if (attribution.campaignId) {
      await db.collection('marketingCampaigns').doc(attribution.campaignId).update({
        'metrics.tokenPurchases': admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.Timestamp.now(),
      });
    }
  });

// ============================================================================
// DETECT CHURN (SCHEDULED)
// ============================================================================

export const pack386_detectChurn = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async () => {
    // Users inactive for 30 days = churned
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const attributionsSnapshot = await db.collection('acquisitionAttribution')
      .where('hasChurned', '==', false)
      .where('hasTokenPurchase', '==', true)
      .get();

    for (const doc of attributionsSnapshot.docs) {
      const attribution = doc.data();
      const userId = attribution.userId;

      // Check last activity
      const userDoc = await db.collection('users').doc(userId).get();
      if (!userDoc.exists) continue;

      const userData = userDoc.data();
      const lastActivity = userData?.lastActivityAt?.toDate();

      if (lastActivity && lastActivity < thirtyDaysAgo) {
        // Mark as churned
        await doc.ref.update({
          hasChurned: true,
          updatedAt: admin.firestore.Timestamp.now(),
        });

        // Log churn event
        await db.collection('churnEvents').add({
          userId,
          source: attribution.source,
          campaignId: attribution.campaignId,
          influencerId: attribution.influencerId,
          totalSpent: attribution.totalSpent,
          daysActive: Math.floor((now.getTime() - attribution.installDate.toDate().getTime()) / (24 * 60 * 60 * 1000)),
          timestamp: admin.firestore.Timestamp.now(),
        });
      }
    }

    return null;
  });

// ============================================================================
// BLOCK ATTRIBUTION SOURCE
// ============================================================================

export const pack386_blockAttributionSource = functions.https.onCall(
  async (data: {
    sourceType: 'campaign' | 'influencer' | 'ip' | 'device';
    sourceId: string;
    reason: string;
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const userId = context.auth.uid;

    // Verify admin permissions
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin only');
    }

    // Add to blocklist
    await db.collection('attributionBlocklist').add({
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      reason: data.reason,
      blockedBy: userId,
      timestamp: admin.firestore.Timestamp.now(),
    });

    // Update existing attributions
    let query;
    switch (data.sourceType) {
      case 'campaign':
        query = db.collection('acquisitionAttribution').where('campaignId', '==', data.sourceId);
        break;
      case 'influencer':
        query = db.collection('acquisitionAttribution').where('influencerId', '==', data.sourceId);
        break;
      case 'ip':
        query = db.collection('acquisitionAttribution').where('deviceInfo.ipAddress', '==', data.sourceId);
        break;
      case 'device':
        query = db.collection('acquisitionAttribution').where('deviceInfo.deviceId', '==', data.sourceId);
        break;
      default:
        throw new functions.https.HttpsError('invalid-argument', 'Invalid source type');
    }

    const attributions = await query.get();
    const batch = db.batch();

    attributions.forEach(doc => {
      batch.update(doc.ref, {
        blocked: true,
        blockReason: data.reason,
        updatedAt: admin.firestore.Timestamp.now(),
      });
    });

    await batch.commit();

    // Log to audit
    await db.collection('adminAuditLog').add({
      action: 'ATTRIBUTION_SOURCE_BLOCKED',
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      reason: data.reason,
      affectedAttributions: attributions.size,
      userId,
      timestamp: admin.firestore.Timestamp.now(),
    });

    return { success: true, blockedCount: attributions.size };
  }
);

// ============================================================================
// GET ATTRIBUTION ANALYTICS
// ============================================================================

export const pack386_getAttributionAnalytics = functions.https.onCall(
  async (data: { source?: string; period?: 'day' | 'week' | 'month' }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const userId = context.auth.uid;

    // Verify admin permissions
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin only');
    }

    // Calculate date range
    const now = new Date();
    let startDate: Date;
    switch (data.period) {
      case 'day':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
    }

    // Build query
    let query: FirebaseFirestore.Query = db.collection('acquisitionAttribution')
      .where('installDate', '>=', admin.firestore.Timestamp.fromDate(startDate));

    if (data.source) {
      query = query.where('source', '==', data.source);
    }

    const attributionsSnapshot = await query.get();

    // Aggregate metrics
    const bySource: Record<string, any> = {};
    let totalInstalls = 0;
    let totalConverted = 0;
    let totalRevenue = 0;
    let totalBlocked = 0;

    attributionsSnapshot.forEach(doc => {
      const attr = doc.data();
      const source = attr.source;

      if (!bySource[source]) {
        bySource[source] = {
          installs: 0,
          converted: 0,
          revenue: 0,
          blocked: 0,
          avgFraudScore: 0,
        };
      }

      bySource[source].installs++;
      totalInstalls++;

      if (attr.hasTokenPurchase) {
        bySource[source].converted++;
        totalConverted++;
      }

      bySource[source].revenue += attr.revenue || 0;
      totalRevenue += attr.revenue || 0;

      if (attr.blocked) {
        bySource[source].blocked++;
        totalBlocked++;
      }

      bySource[source].avgFraudScore += attr.fraudScore || 0;
    });

    // Calculate averages
    Object.keys(bySource).forEach(source => {
      bySource[source].avgFraudScore /= bySource[source].installs;
      bySource[source].conversionRate = bySource[source].installs > 0 
        ? bySource[source].converted / bySource[source].installs 
        : 0;
    });

    return {
      summary: {
        totalInstalls,
        totalConverted,
        totalRevenue,
        totalBlocked,
        conversionRate: totalInstalls > 0 ? totalConverted / totalInstalls : 0,
      },
      bySource,
    };
  }
);
