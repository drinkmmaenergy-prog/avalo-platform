/**
 * PACK 378 — Regional Price Normalization & Store Compliance
 * Handles PPP, currency adjustments, and store-specific compliance
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { RegionalPriceProfile } from '../../firestore/schemas/pack378-tax-profiles';

const db = admin.firestore();

/**
 * PACK378_priceNormalizationEngine
 * Calculate localized prices based on PPP, inflation, and store rules
 */
export const pack378_priceNormalizationEngine = functions.https.onCall(async (data, context) => {
  const { basePrice, baseCurrency, targetCountry, platform } = data;

  if (!basePrice || !targetCountry) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  // Get regional price profile
  const priceProfileDoc = await db.collection('regionalPriceProfiles')
    .where('countryCode', '==', targetCountry)
    .limit(1)
    .get();

  if (priceProfileDoc.empty) {
    // Return base price if no profile exists
    return {
      basePrice,
      localPrice: basePrice,
      currency: baseCurrency || 'USD',
      adjusted: false,
      reason: 'No regional price profile available'
    };
  }

  const profile = priceProfileDoc.docs[0].data() as RegionalPriceProfile;

  // Apply PPP adjustment
  let adjustedPrice = basePrice * profile.purchasingPowerParity;

  // Apply inflation adjustment
  adjustedPrice = adjustedPrice * profile.inflationIndex;

  // Apply store-specific rounding
  const storePlatform = platform?.toLowerCase();
  let finalPrice = adjustedPrice;

  if (storePlatform === 'apple' || storePlatform === 'ios') {
    finalPrice = applyRounding(adjustedPrice, profile.appleStoreRounding);
  } else if (storePlatform === 'google' || storePlatform === 'android') {
    finalPrice = applyRounding(adjustedPrice, profile.googlePlayRounding);
  }

  // Check if price is within allowed tiers
  const tier = findPriceTier(finalPrice, profile.tokenPriceTiers);

  return {
    basePrice,
    baseCurrency: baseCurrency || 'USD',
    localPrice: tier?.localPrice || finalPrice,
    localCurrency: profile.currencyCode,
    pppMultiplier: profile.purchasingPowerParity,
    inflationIndex: profile.inflationIndex,
    storeRounding: storePlatform === 'apple' ? profile.appleStoreRounding : profile.googlePlayRounding,
    priceTier: tier?.basePrice || basePrice,
    adjusted: true,
    countryCode: targetCountry
  };
});

/**
 * PACK378_storeComplianceEnforcer
 * Enforce Apple/Google store-specific compliance rules
 */
export const pack378_storeComplianceEnforcer = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { platform, transactionType, amount, countryCode } = data;

  // Get tax profile
  const taxProfileDoc = await db.collection('taxProfiles')
    .where('countryCode', '==', countryCode)
    .limit(1)
    .get();

  if (taxProfileDoc.empty) {
    throw new functions.https.HttpsError('not-found', 'Tax profile not found');
  }

  const taxProfile = taxProfileDoc.docs[0].data();
  const compliance: any = {
    approved: true,
    requirements: [],
    warnings: []
  };

  if (platform === 'apple' || platform === 'ios') {
    // Apple App Store compliance
    const appleCompliance = checkAppleStoreCompliance(
      transactionType,
      amount,
      taxProfile,
      countryCode
    );
    Object.assign(compliance, appleCompliance);
  } else if (platform === 'google' || platform === 'android') {
    // Google Play compliance
    const googleCompliance = checkGooglePlayCompliance(
      transactionType,
      amount,
      taxProfile,
      countryCode
    );
    Object.assign(compliance, googleCompliance);
  }

  // Log compliance check
  await db.collection('storeComplianceChecks').add({
    userId: context.auth.uid,
    platform,
    transactionType,
    amount,
    countryCode,
    approved: compliance.approved,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });

  return compliance;
});

/**
 * Apple App Store compliance checks
 */
function checkAppleStoreCompliance(
  transactionType: string,
  amount: number,
  taxProfile: any,
  countryCode: string
): any {
  const compliance = {
    approved: true,
    requirements: [] as string[],
    warnings: [] as string[],
    vatHandling: taxProfile.appleStoreVatHandling || 'automatic'
  };

  // Apple handles VAT automatically in most regions
  if (taxProfile.appleStoreVatHandling === 'manual') {
    compliance.requirements.push('Manual VAT calculation required');
  }

  // Check for In-App Purchase requirements
  if (transactionType === 'token_purchase') {
    compliance.requirements.push('Must use Apple In-App Purchase API');
    
    // Apple requires certain price points
    if (!isAppleApprovedPrice(amount)) {
      compliance.approved = false;
      compliance.warnings.push('Price not in Apple approved tiers');
    }
  }

  // Anti-circumvention detection
  if (transactionType === 'external_payment') {
    compliance.approved = false;
    compliance.warnings.push('External payments circumvent Apple IAP - violation of App Store guidelines');
  }

  // Creator payout transparency
  if (transactionType === 'creator_payout') {
    compliance.requirements.push('Payout must be disclosed in app metadata');
  }

  return compliance;
}

/**
 * Google Play compliance checks
 */
function checkGooglePlayCompliance(
  transactionType: string,
  amount: number,
  taxProfile: any,
  countryCode: string
): any {
  const compliance = {
    approved: true,
    requirements: [] as string[],
    warnings: [] as string[],
    vatHandling: taxProfile.googlePlayVatHandling || 'automatic'
  };

  // Google Play VAT handling
  if (taxProfile.googlePlayVatHandling === 'manual') {
    compliance.requirements.push('Manual VAT calculation and display required');
  }

  // Regional price rounding
  const roundedPrice = Math.round(amount * 100) / 100;
  if (amount !== roundedPrice) {
    compliance.warnings.push('Price should be rounded to 2 decimal places');
  }

  // Subscription compliance
  if (transactionType === 'subscription') {
    compliance.requirements.push('Must comply with Google Play subscription policies');
    compliance.requirements.push('Free trial and cancellation must be clearly disclosed');
  }

  // Check for billing API requirements
  if (transactionType === 'token_purchase') {
    compliance.requirements.push('Must use Google Play Billing Library');
  }

  return compliance;
}

/**
 * Apply store-specific rounding rules
 */
function applyRounding(price: number, roundingRule: string): number {
  switch (roundingRule) {
    case 'nearest_0.99':
      return Math.ceil(price) - 0.01;
    case 'nearest_0.49':
      return Math.ceil(price) - 0.51;
    case 'nearest_whole':
      return Math.round(price);
    default:
      return price;
  }
}

/**
 * Find appropriate price tier
 */
function findPriceTier(price: number, tiers: any[]): any | null {
  if (!tiers || tiers.length === 0) return null;

  // Find closest tier
  return tiers.reduce((closest, tier) => {
    const currentDiff = Math.abs(price - tier.localPrice);
    const closestDiff = Math.abs(price - (closest?.localPrice || Infinity));
    return currentDiff < closestDiff ? tier : closest;
  }, null);
}

/**
 * Check if price is in Apple's approved price tiers
 */
function isAppleApprovedPrice(price: number): boolean {
  // Simplified Apple price tiers (USD)
  const appleTiers = [
    0.99, 1.99, 2.99, 3.99, 4.99, 5.99, 6.99, 7.99, 8.99, 9.99,
    10.99, 11.99, 12.99, 13.99, 14.99, 15.99, 16.99, 17.99, 18.99, 19.99,
    24.99, 29.99, 34.99, 39.99, 44.99, 49.99, 54.99, 59.99, 64.99, 69.99,
    74.99, 79.99, 84.99, 89.99, 94.99, 99.99
  ];

  return appleTiers.some(tier => Math.abs(tier - price) < 0.01);
}

/**
 * Sync regional price profiles from external API or admin updates
 */
export const syncRegionalPriceProfiles = functions.pubsub
  .schedule('0 0 * * 0') // Weekly on Sunday
  .onRun(async (context) => {
    functions.logger.info('Starting regional price profile sync');

    // This would integrate with external APIs (IMF, World Bank, etc.)
    // For now, we'll just update timestamps

    const profilesSnapshot = await db.collection('regionalPriceProfiles').get();
    
    const batch = db.batch();
    profilesSnapshot.docs.forEach(doc => {
      batch.update(doc.ref, {
        lastSyncedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });

    await batch.commit();
    functions.logger.info(`Synced ${profilesSnapshot.size} regional price profiles`);
  });
