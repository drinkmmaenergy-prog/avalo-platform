/**
 * PACK 425 — Cloud Functions API
 * HTTP endpoints for country expansion management
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

import * as Readiness from './pack425-country-readiness';
import * as FeatureFlags from './pack425-feature-flags';
import * as Pricing from './pack425-pricing-matrix';
import * as Segmentation from './pack425-market-segmentation';
import * as Bootstrap from './pack425-creator-bootstrap';
import * as Localization from './pack425-localization';

// Initialize Firebase Admin if not already done
if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * Get country rollout profile with all data
 */
export const getCountryProfile = functions.https.onCall(async (data, context) => {
  const { countryCode } = data;
  
  if (!countryCode) {
    throw new functions.https.HttpsError('invalid-argument', 'countryCode is required');
  }
  
  const [rollout, flags, payment, market, bootstrap, localization] = await Promise.all([
    Readiness.getCountryProfile(countryCode),
    FeatureFlags.getCountryFlags(countryCode),
    Pricing.getCountryPaymentProfile(countryCode),
    Segmentation.getCountryMarketProfile(countryCode),
    Bootstrap.getBootstrapStatus(countryCode),
    countryCode ? null : null, //Localization validation done separately
  ]);
  
  return {
    rollout,
    flags,
    payment,
    market,
    bootstrap,
  };
});

/**
 * List all countries with readiness scores
 */
export const listCountries = functions.https.onCall(async (data, context) => {
  const countries = await Readiness.listCountriesByReadiness();
  return countries;
});

/**
 * Get countries by launch strategy
 */
export const getCountriesByStrategy = functions.https.onCall(async (data, context) => {
  const { strategy } = data;
  
  if (!strategy) {
    throw new functions.https.HttpsError('invalid-argument', 'strategy is required');
  }
  
  const countries = await Readiness.listCountriesByReadiness(undefined, strategy);
  return countries;
});

/**
 * Update country readiness profile
 */
export const updateCountryReadiness = functions.https.onCall(async (data, context) => {
  // Require admin authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const { countryCode, updates } = data;
  
  if (!countryCode || !updates) {
    throw new functions.https.HttpsError('invalid-argument', 'countryCode and updates required');
  }
  
  await Readiness.updateCountryProfile(countryCode, updates);
  
  return { success: true };
});

/**
 * Get feature flags for a country
 */
export const getCountryFeatureFlags = functions.https.onCall(async (data, context) => {
  const { countryCode } = data;
  
  if (!countryCode) {
    throw new functions.https.HttpsError('invalid-argument', 'countryCode is required');
  }
  
  const flags = await FeatureFlags.getCountryFlags(countryCode);
  return flags;
});

/**
 * Update feature flags for a country
 */
export const updateCountryFeatureFlags = functions.https.onCall(async (data, context) => {
  // Require admin authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const { countryCode, flags } = data;
  
  if (!countryCode || !flags) {
    throw new functions.https.HttpsError('invalid-argument', 'countryCode and flags required');
  }
  
  await FeatureFlags.updateCountryFlags(countryCode, flags, context.auth.uid);
  
  return { success: true };
});

/**
 * Get token pack pricing for a country
 */
export const getCountryPricing = functions.https.onCall(async (data, context) => {
  const { countryCode } = data;
  
  if (!countryCode) {
    throw new functions.https.HttpsError('invalid-argument', 'countryCode is required');
  }
  
  const profile = await Pricing.getCountryPaymentProfile(countryCode);
  return profile;
});

/**
 * Get expansion dashboard data
 */
export const getExpansionDashboard = functions.https.onCall(async (data, context) => {
  // Require admin authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const [
    allCountries,
    aggressiveCountries,
    steadyCountries,
    cautiousCountries,
    segmentDistribution,
    completenessReport,
  ] = await Promise.all([
    Readiness.listCountriesByReadiness(),
    Readiness.listCountriesByReadiness(0.75, 'AGGRESSIVE'),
    Readiness.listCountriesByReadiness(0.55, 'STEADY'),
    Readiness.listCountriesByReadiness(0.35, 'CAUTIOUS'),
    Segmentation.getSegmentDistribution(),
    Localization.getCompletenessReport(),
  ]);
  
  return {
    summary: {
      totalCountries: allCountries.length,
      aggressive: aggressiveCountries.length,
      steady: steadyCountries.length,
      cautious: cautiousCountries.length,
      deferred: allCountries.filter(c => c.recommendedLaunchStrategy === 'DEFER').length,
    },
    countries: allCountries,
    segments: segmentDistribution,
    localization: completenessReport,
  };
});

/**
 * Initialize a new country for expansion
 */
export const initializeCountry = functions.https.onCall(async (data, context) => {
  // Require admin authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const {
    countryCode,
    region,
    languageCodes,
    currency,
    primarySegment,
  } = data;
  
  if (!countryCode || !region || !languageCodes || !currency || !primarySegment) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'countryCode, region, languageCodes, currency, and primarySegment are required'
    );
  }
  
  // Create country readiness profile
  const rolloutProfile = await Readiness.createCountryProfile({
    countryCode,
    region,
    languageCodes,
    currency,
    asoScore: 50,
    trustScore: 0.5,
    fraudRiskScore: 50,
    paymentProviderReady: false,
    supportCoverageReady: false,
    legalRiskLevel: 'MEDIUM',
  });
  
  // Initialize feature flags
  await FeatureFlags.initializeCountryFlags(countryCode);
  
  // Create payment profile
  await Pricing.createCountryPaymentProfile(countryCode, currency, {
    purchasingPowerIndex: 1.0,
    payoutEnabled: false,
  });
  
  // Create market segmentation profile
  await Segmentation.createCountryMarketProfile(countryCode, primarySegment);
  
  return {
    success: true,
    profile: rolloutProfile,
  };
});

/**
 * Launch a country (enable all features)
 */
export const launchCountry = functions.https.onCall(async (data, context) => {
  // Require admin authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const { countryCode } = data;
  
  if (!countryCode) {
    throw new functions.https.HttpsError('invalid-argument', 'countryCode is required');
  }
  
  // Verify readiness
  const profile = await Readiness.getCountryProfile(countryCode);
  if (!profile) {
    throw new functions.https.HttpsError('not-found', 'Country profile not found');
  }
  
  if (profile.launchReadiness < 0.55) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      `Country not ready for launch (readiness: ${profile.launchReadiness})`
    );
  }
  
  // Enable all core features
  await FeatureFlags.updateCountryFlags(countryCode, {
    swipeEnabled: true,
    calendarEnabled: true,
    eventsEnabled: true,
    tokenStoreEnabled: true,
    feedEnabled: true,
    discoveryEnabled: true,
    matchingEnabled: true,
    notificationsEnabled: true,
  }, context.auth.uid);
  
  // Mark as launched
  await Readiness.updateCountryProfile(countryCode, {
    notes: `Launched on ${new Date().toISOString()}`,
  });
  
  return { success: true, launchedAt: new Date().toISOString() };
});

/**
 * Get bootstrap program status
 */
export const getBootstrapStatus = functions.https.onCall(async (data, context) => {
  const { countryCode } = data;
  
  if (!countryCode) {
    throw new functions.https.HttpsError('invalid-argument', 'countryCode is required');
  }
  
  const status = await Bootstrap.getBootstrapStatus(countryCode);
  return status;
});

/**
 * Get localization completeness report
 */
export const getLocalizationReport = functions.https.onCall(async (data, context) => {
  const report = await Localization.getCompletenessReport();
  return report;
});

/**
 * Validate country for launch
 */
export const validateCountryLaunch = functions.https.onCall(async (data, context) => {
  const { countryCode } = data;
  
  if (!countryCode) {
    throw new functions.https.HttpsError('invalid-argument', 'countryCode is required');
  }
  
  const [profile, flags, payment, market] = await Promise.all([
    Readiness.getCountryProfile(countryCode),
    FeatureFlags.getCountryFlags(countryCode),
    Pricing.getCountryPaymentProfile(countryCode),
    Segmentation.getCountryMarketProfile(countryCode),
  ]);
  
  const issues: string[] = [];
  
  if (!profile) {
    issues.push('No readiness profile found');
  } else {
    if (profile.launchReadiness < 0.35) {
      issues.push(`Launch readiness too low: ${profile.launchReadiness}`);
    }
    if (!profile.paymentProviderReady) {
      issues.push('Payment providers not configured');
    }
    if (!profile.supportCoverageReady) {
      issues.push('Support coverage not ready');
    }
    if (profile.legalRiskLevel === 'HIGH') {
      issues.push('High legal risk - review required');
    }
  }
  
  if (!payment) {
    issues.push('Payment profile not configured');
  }
  
  if (!market) {
    issues.push('Market segmentation not configured');
  }
  
  // Check localization
  if (profile) {
    const locValidation = await Localization.validateCountryLocalization(
      countryCode,
      profile.languageCodes
    );
    if (!locValidation.ready) {
      issues.push(...locValidation.issues);
    }
  }
  
  return {
    ready: issues.length === 0,
    issues,
    readinessScore: profile?.launchReadiness ?? 0,
    strategy: profile?.recommendedLaunchStrategy ?? 'DEFER',
  };
});

/**
 * Recompute all readiness scores
 */
export const recomputeAllReadiness = functions.https.onCall(async (data, context) => {
  // Require admin authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  
  const result = await Readiness.recomputeAllReadinessScores();
  return result;
});
