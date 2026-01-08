/**
 * PACK 385 — Geo-Based Market Entry Engine
 * Controls per-country activation and compliance
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

/**
 * Market activation status
 */
export enum MarketStatus {
  INACTIVE = 'INACTIVE',
  PREPARING = 'PREPARING',
  SOFT_LAUNCH = 'SOFT_LAUNCH',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED'
}

/**
 * KYC requirement levels
 */
export enum KYCLevel {
  NONE = 'NONE',
  BASIC = 'BASIC',
  ENHANCED = 'ENHANCED',
  STRICT = 'STRICT'
}

/**
 * Market configuration per country
 */
interface MarketConfig {
  countryCode: string;
  countryName: string;
  status: MarketStatus;
  legalStatus: 'APPROVED' | 'PENDING' | 'RESTRICTED';
  features: {
    payoutsEnabled: boolean;
    tokenPurchaseEnabled: boolean;
    kycRequired: KYCLevel;
    calendarEnabled: boolean;
    aiFeatures: boolean;
    adultContent: boolean;
  };
  limits: {
    maxPayoutDaily: number;
    maxTokenPurchaseDaily: number;
    minAge: number;
  };
  compliance: {
    gdprRequired: boolean;
    dataResidency: boolean;
    localTaxWithholding: boolean;
  };
  activatedAt?: admin.firestore.Timestamp;
  activatedBy?: string;
}

/**
 * Activate a market for launch
 * Admin-only function
 */
export const pack385_activateMarket = functions.https.onCall(async (data, context) => {
  // Admin authentication required
  if (!context.auth || !context.auth.token?.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { countryCode, config } = data;

  if (!countryCode || !config) {
    throw new functions.https.HttpsError('invalid-argument', 'Country code and config required');
  }

  // Validate country code format (ISO 3166-1 alpha-2)
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid country code format');
  }

  // Check dependencies are ready
  const checksNeeded = [
    checkComplianceReady(countryCode),
    checkWalletReady(countryCode),
    checkKYCReady(countryCode, config.features.kycRequired)
  ];

  const results = await Promise.all(checksNeeded);
  const issues = results.filter(r => !r.ready);

  if (issues.length > 0) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Market not ready for activation',
      { issues }
    );
  }

  // Create market activation record
  const marketConfig: MarketConfig = {
    countryCode,
    countryName: config.countryName || countryCode,
    status: MarketStatus.ACTIVE,
    legalStatus: config.legalStatus || 'APPROVED',
    features: {
      payoutsEnabled: config.features?.payoutsEnabled ?? true,
      tokenPurchaseEnabled: config.features?.tokenPurchaseEnabled ?? true,
      kycRequired: config.features?.kycRequired || KYCLevel.BASIC,
      calendarEnabled: config.features?.calendarEnabled ?? true,
      aiFeatures: config.features?.aiFeatures ?? true,
      adultContent: config.features?.adultContent ?? false
    },
    limits: {
      maxPayoutDaily: config.limits?.maxPayoutDaily || 10000,
      maxTokenPurchaseDaily: config.limits?.maxTokenPurchaseDaily || 5000,
      minAge: config.limits?.minAge || 18
    },
    compliance: {
      gdprRequired: config.compliance?.gdprRequired ?? false,
      dataResidency: config.compliance?.dataResidency ?? false,
      localTaxWithholding: config.compliance?.localTaxWithholding ?? false
    },
    activatedAt: admin.firestore.FieldValue.serverTimestamp() as admin.firestore.Timestamp,
    activatedBy: context.auth.uid
  };

  await db.collection('marketActivation').doc(countryCode).set(marketConfig);

  // Log activation
  await db.collection('auditLogs').add({
    type: 'MARKET_ACTIVATED',
    severity: 'HIGH',
    userId: context.auth.uid,
    data: {
      countryCode,
      config: marketConfig
    },
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });

  return {
    success: true,
    countryCode,
    config: marketConfig
  };
});

/**
 * Check compliance readiness for a market
 */
async function checkComplianceReady(countryCode: string): Promise<{ ready: boolean; reason?: string }> {
  const complianceDoc = await db.collection('compliance').doc(countryCode).get();
  
  if (!complianceDoc.exists) {
    return { ready: false, reason: 'No compliance record found' };
  }

  const data = complianceDoc.data()!;
  
  if (data.status !== 'APPROVED') {
    return { ready: false, reason: `Compliance status: ${data.status}` };
  }

  return { ready: true };
}

/**
 * Check wallet/payout readiness for a market
 */
async function checkWalletReady(countryCode: string): Promise<{ ready: boolean; reason?: string }> {
  const walletDoc = await db.collection('walletConfig').doc(countryCode).get();
  
  if (!walletDoc.exists) {
    return { ready: false, reason: 'No wallet configuration found' };
  }

  const data = walletDoc.data()!;
  
  if (!data.payoutMethodsConfigured || data.payoutMethodsConfigured.length === 0) {
    return { ready: false, reason: 'No payout methods configured' };
  }

  return { ready: true };
}

/**
 * Check KYC readiness based on required level
 */
async function checkKYCReady(countryCode: string, level: KYCLevel): Promise<{ ready: boolean; reason?: string }> {
  if (level === KYCLevel.NONE) {
    return { ready: true };
  }

  const kycDoc = await db.collection('kycConfig').doc(countryCode).get();
  
  if (!kycDoc.exists) {
    return { ready: false, reason: 'No KYC configuration found' };
  }

  const data = kycDoc.data()!;
  
  if (!data.providerConfigured) {
    return { ready: false, reason: 'KYC provider not configured' };
  }

  return { ready: true };
}

/**
 * Get market configuration for user's country
 */
export const pack385_getMarketConfig = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { countryCode } = data;

  if (!countryCode) {
    throw new functions.https.HttpsError('invalid-argument', 'Country code required');
  }

  const marketDoc = await db.collection('marketActivation').doc(countryCode).get();

  if (!marketDoc.exists) {
    return {
      available: false,
      countryCode,
      reason: 'Market not yet activated'
    };
  }

  const config = marketDoc.data() as MarketConfig;

  // Check if market is active
  if (config.status !== MarketStatus.ACTIVE) {
    return {
      available: false,
      countryCode,
      reason: `Market status: ${config.status}`
    };
  }

  return {
    available: true,
    countryCode,
    config
  };
});

/**
 * Check if a feature is available in user's market
 */
export const pack385_checkMarketFeature = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { countryCode, feature } = data;

  if (!countryCode || !feature) {
    throw new functions.https.HttpsError('invalid-argument', 'Country code and feature required');
  }

  const marketDoc = await db.collection('marketActivation').doc(countryCode).get();

  if (!marketDoc.exists) {
    return { available: false, reason: 'Market not activated' };
  }

  const config = marketDoc.data() as MarketConfig;

  if (config.status !== MarketStatus.ACTIVE) {
    return { available: false, reason: `Market status: ${config.status}` };
  }

  const featureEnabled = config.features[feature as keyof typeof config.features];

  return {
    available: featureEnabled,
    countryCode,
    feature
  };
});

/**
 * Suspend a market (emergency use)
 */
export const pack385_suspendMarket = functions.https.onCall(async (data, context) => {
  // Admin authentication required
  if (!context.auth || !context.auth.token?.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { countryCode, reason } = data;

  if (!countryCode) {
    throw new functions.https.HttpsError('invalid-argument', 'Country code required');
  }

  await db.collection('marketActivation').doc(countryCode).update({
    status: MarketStatus.SUSPENDED,
    suspendedAt: admin.firestore.FieldValue.serverTimestamp(),
    suspendedBy: context.auth.uid,
    suspensionReason: reason || 'No reason provided'
  });

  // Log suspension
  await db.collection('auditLogs').add({
    type: 'MARKET_SUSPENDED',
    severity: 'CRITICAL',
    userId: context.auth.uid,
    data: {
      countryCode,
      reason
    },
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });

  return {
    success: true,
    countryCode,
    status: MarketStatus.SUSPENDED
  };
});

/**
 * Get all active markets
 */
export const pack385_getActiveMarkets = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const marketsSnapshot = await db.collection('marketActivation')
    .where('status', '==', MarketStatus.ACTIVE)
    .get();

  const markets = marketsSnapshot.docs.map(doc => ({
    countryCode: doc.id,
    ...doc.data()
  }));

  return { markets };
});

/**
 * Background job: Monitor market health
 */
export const pack385_monitorMarketHealth = functions.pubsub
  .schedule('every 6 hours')
  .onRun(async (context) => {
    const marketsSnapshot = await db.collection('marketActivation')
      .where('status', '==', MarketStatus.ACTIVE)
      .get();

    for (const marketDoc of marketsSnapshot.docs) {
      const countryCode = marketDoc.id;
      const config = marketDoc.data() as MarketConfig;

      // Check for unusual activity
      const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const fraudSnapshot = await db.collection('fraudDetection')
        .where('countryCode', '==', countryCode)
        .where('timestamp', '>', last24h)
        .where('severity', '==', 'HIGH')
        .get();

      if (fraudSnapshot.size > 100) {
        // High fraud activity - log alert
        await db.collection('alerts').add({
          type: 'MARKET_HIGH_FRAUD',
          severity: 'HIGH',
          countryCode,
          data: {
            fraudCount: fraudSnapshot.size,
            config
          },
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    }

    console.log(`Market health check completed for ${marketsSnapshot.size} markets`);
  });
