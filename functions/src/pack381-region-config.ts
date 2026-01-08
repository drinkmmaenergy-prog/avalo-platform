/**
 * PACK 381 — Regional Expansion Engine
 * Region Configuration System
 * 
 * Manages region-specific settings, legal requirements, and feature availability
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// Region configuration interface
export interface RegionConfig {
  regionId: string;
  countryCode: string; // ISO 3166-1 alpha-2
  countryName: string;
  enabled: boolean;
  
  // Legal & Compliance
  legal: {
    minAge: number;
    requiresKYC: boolean;
    requiresTaxId: boolean;
    gdprApplies: boolean;
    dataResidencyRequired: boolean;
    contentRestrictions: string[];
    requiredDisclamers: string[];
    acceptedDocuments: string[];
    regulatoryAuthority?: string;
  };
  
  // Localization
  localization: {
    languages: string[]; // ISO 639-1 codes
    primaryLanguage: string;
    currency: string; // ISO 4217
    timezone: string; // IANA timezone
    dateFormat: string;
    numberFormat: string;
    rtl: boolean; // right-to-left text
  };
  
  // Payment & Commerce
  payment: {
    supportedProviders: string[];
    walletEnabled: boolean;
    payoutsEnabled: boolean;
    minPayoutAmount: number;
    taxRate: number; // VAT/GST/Sales tax
    taxLabel: string; // "VAT", "GST", "Sales Tax"
    processingFeePercent: number;
    currencyConversionFee: number;
  };
  
  // Creator Economy
  creator: {
    monetizationEnabled: boolean;
    verificationRequired: boolean;
    minFollowersForMonetization: number;
    earningsRestrictions: string[];
    payoutSchedule: string; // "weekly", "bi-weekly", "monthly"
    minAge: number;
    backgroundCheckRequired: boolean;
  };
  
  // Content & Moderation
  moderation: {
    aiModerationLevel: 'strict' | 'moderate' | 'lenient';
    humanReviewRequired: boolean;
    autoplayRestricted: boolean;
    profilePhotoReview: boolean;
    chatMonitoring: 'always' | 'flagged' | 'minimal';
    prohibitedContent: string[];
    culturalSensitivities: string[];
  };
  
  // Features
  features: {
    swipes: boolean;
    events: boolean;
    aiCompanions: boolean;
    paidCalls: boolean;
    liveArena: boolean;
    marketplace: boolean;
    adultMode: boolean;
    incognito: boolean;
    passport: boolean;
  };
  
  // Risk & Security
  risk: {
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    fraudScoreMultiplier: number;
    vpnRestricted: boolean;
    deviceVerificationRequired: boolean;
    smsVerificationRequired: boolean;
    maxAccountsPerDevice: number;
    geoFencingEnabled: boolean;
  };
  
  // Market Data
  market: {
    launchDate?: string;
    stage: 'planned' | 'beta' | 'soft-launch' | 'public' | 'mature';
    targetAudience: string[];
    competitivePosition: string;
    marketSize: number;
    penetrationRate: number;
    holidays: Array<{ date: string; name: string }>;
    peakUsageHours: number[];
  };
  
  // Metadata
  metadata: {
    createdAt: string;
    updatedAt: string;
    updatedBy: string;
    notes?: string;
    contacts?: Array<{ role: string; email: string }>;
  };
}

/**
 * Admin-only: Update or create region configuration
 */
export const pack381_updateRegionConfig = functions.https.onCall(
  async (data: Partial<RegionConfig>, context) => {
    // Verify admin authentication
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated to update region config'
      );
    }

    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    const userData = userDoc.data();
    
    if (userData?.role !== 'admin' && userData?.role !== 'super_admin') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only admins can update region configuration'
      );
    }

    const { regionId } = data;
    if (!regionId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'regionId is required'
      );
    }

    const configRef = db.collection('regionConfigs').doc(regionId);
    const existingConfig = await configRef.get();

    const now = new Date().toISOString();
    const configData = {
      ...data,
      metadata: {
        ...data.metadata,
        updatedAt: now,
        updatedBy: context.auth.uid,
        ...(existingConfig.exists ? {} : { createdAt: now }),
      },
    };

    await configRef.set(configData, { merge: true });

    // Log the configuration change
    await db.collection('auditLogs').add({
      type: 'region_config_update',
      userId: context.auth.uid,
      regionId,
      changes: data,
      timestamp: now,
      ipAddress: context.rawRequest.ip,
    });

    return {
      success: true,
      regionId,
      message: existingConfig.exists
        ? 'Region configuration updated'
        : 'Region configuration created',
    };
  }
);

/**
 * Get region configuration for client use
 */
export const pack381_getRegionConfig = functions.https.onCall(
  async (data: { regionId?: string; countryCode?: string }, context) => {
    const { regionId, countryCode } = data;

    if (!regionId && !countryCode) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Either regionId or countryCode is required'
      );
    }

    let configDoc;
    
    if (regionId) {
      configDoc = await db.collection('regionConfigs').doc(regionId).get();
    } else if (countryCode) {
      const querySnapshot = await db
        .collection('regionConfigs')
        .where('countryCode', '==', countryCode)
        .where('enabled', '==', true)
        .limit(1)
        .get();
      
      if (!querySnapshot.empty) {
        configDoc = querySnapshot.docs[0];
      }
    }

    if (!configDoc || !configDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Region configuration not found'
      );
    }

    const config = configDoc.data() as RegionConfig;

    // Return only client-safe data
    return {
      regionId: config.regionId,
      countryCode: config.countryCode,
      countryName: config.countryName,
      enabled: config.enabled,
      localization: config.localization,
      features: config.features,
      legal: {
        minAge: config.legal.minAge,
        contentRestrictions: config.legal.contentRestrictions,
        requiredDisclamers: config.legal.requiredDisclamers,
      },
      payment: {
        walletEnabled: config.payment.walletEnabled,
        payoutsEnabled: config.payment.payoutsEnabled,
        currency: config.localization.currency,
        taxLabel: config.payment.taxLabel,
      },
      creator: {
        monetizationEnabled: config.creator.monetizationEnabled,
        minFollowersForMonetization: config.creator.minFollowersForMonetization,
        minAge: config.creator.minAge,
      },
    };
  }
);

/**
 * Get all available regions (public list)
 */
export const pack381_listAvailableRegions = functions.https.onCall(
  async (data, context) => {
    const regionsSnapshot = await db
      .collection('regionConfigs')
      .where('enabled', '==', true)
      .get();

    const regions = regionsSnapshot.docs.map(doc => {
      const config = doc.data() as RegionConfig;
      return {
        regionId: config.regionId,
        countryCode: config.countryCode,
        countryName: config.countryName,
        languages: config.localization.languages,
        currency: config.localization.currency,
        stage: config.market.stage,
      };
    });

    return { regions };
  }
);

/**
 * Admin: Get full region configuration with sensitive data
 */
export const pack381_adminGetRegionConfig = functions.https.onCall(
  async (data: { regionId: string }, context) => {
    // Verify admin authentication
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
    const configDoc = await db.collection('regionConfigs').doc(regionId).get();

    if (!configDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Region configuration not found'
      );
    }

    return configDoc.data();
  }
);

/**
 * Auto-detect user region based on IP and device settings
 */
export const pack381_detectUserRegion = functions.https.onCall(
  async (data: { countryCode?: string; language?: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    const { countryCode, language } = data;

    // Try to find region config based on provided data
    let query = db.collection('regionConfigs').where('enabled', '==', true);

    if (countryCode) {
      query = query.where('countryCode', '==', countryCode);
    }

    const snapshot = await query.limit(1).get();

    if (snapshot.empty) {
      // Default to global/international region
      return {
        regionId: 'GLOBAL',
        countryCode: 'XX',
        countryName: 'International',
        detected: false,
      };
    }

    const config = snapshot.docs[0].data() as RegionConfig;
    
    // Update user's region preference
    await db.collection('users').doc(context.auth.uid).update({
      detectedRegion: config.regionId,
      detectedAt: new Date().toISOString(),
    });

    return {
      regionId: config.regionId,
      countryCode: config.countryCode,
      countryName: config.countryName,
      detected: true,
    };
  }
);

/**
 * Validate if a feature is available in user's region
 */
export const pack381_validateFeatureAvailability = functions.https.onCall(
  async (data: { featureName: string; regionId?: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    const { featureName, regionId } = data;

    let userRegionId = regionId;
    
    // If no regionId provided, get from user profile
    if (!userRegionId) {
      const userDoc = await db.collection('users').doc(context.auth.uid).get();
      const userData = userDoc.data();
      userRegionId = userData?.detectedRegion || 'GLOBAL';
    }

    const configDoc = await db.collection('regionConfigs').doc(userRegionId).get();
    
    if (!configDoc.exists) {
      return { available: false, reason: 'Region not configured' };
    }

    const config = configDoc.data() as RegionConfig;
    const featureAvailable = config.features[featureName as keyof typeof config.features];

    return {
      available: featureAvailable === true,
      reason: featureAvailable ? null : 'Feature not available in your region',
      regionId: userRegionId,
    };
  }
);
