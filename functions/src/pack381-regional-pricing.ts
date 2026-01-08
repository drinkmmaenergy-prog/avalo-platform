/**
 * PACK 381 — Regional Expansion Engine
 * Regional Pricing & Token Economy Adapter
 * 
 * Handles PPP adjustments, regional taxes, and pricing localization
 * Integrates with PACK 277 (Wallet & Multi-Currency)
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// Base token value in PLN (Polish Złoty)
const BASE_TOKEN_VALUE_PLN = 0.20;

export interface RegionalPricePolicy {
  regionId: string;
  countryCode: string;
  currency: string;
  
  // Purchasing Power Parity
  ppp: {
    enabled: boolean;
    multiplier: number; // 1.0 = baseline, <1.0 cheaper, >1.0 more expensive
    calculatedFrom: string; // source: World Bank, OECD, etc.
    lastUpdated: string;
  };
  
  // Tax Configuration
  tax: {
    type: 'VAT' | 'GST' | 'Sales Tax' | 'None';
    rate: number; // e.g., 0.23 for 23%
    included: boolean; // true = tax included in display price
    label: string;
    taxIdRequired: boolean;
    businessTaxRate?: number; // for B2B transactions
  };
  
  // Token Pack Pricing
  tokenPacks: {
    [packId: string]: {
      tokens: number;
      priceLocal: number; // in local currency
      pricePLN: number; // baseline price
      discount: number; // percentage discount
      popular: boolean;
    };
  };
  
  // Minimum Pricing Rules
  minimums: {
    tokenPack: number; // minimum token pack price
    payout: number; // minimum payout amount
    transaction: number; // minimum transaction amount
  };
  
  // Payout Configuration
  payout: {
    enabled: boolean;
    restrictions: string[];
    fee: number; // percentage fee
    minimumAmount: number;
    maximumAmount: number;
    processingTime: string; // e.g., "1-3 business days"
    supportedMethods: string[];
  };
  
  // Currency Conversion
  conversion: {
    rateToPLN: number;
    rateToUSD: number;
    rateToEUR: number;
    conversionFee: number;
    lastUpdated: string;
    provider: string; // e.g., "ECB", "RBA",  "Bank API"
  };
  
  metadata: {
    createdAt: string;
    updatedAt: string;
    updatedBy: string;
    notes?: string;
  };
}

/**
 * Admin: Update regional price policy
 */
export const pack381_updateRegionalPricing = functions.https.onCall(
  async (data: Partial<RegionalPricePolicy>, context) => {
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

    const policyRef = db.collection('regionalPricePolicies').doc(regionId);
    const existingPolicy = await policyRef.get();

    const now = new Date().toISOString();
    const policyData = {
      ...data,
      metadata: {
        ...data.metadata,
        updatedAt: now,
        updatedBy: context.auth.uid,
        ...(existingPolicy.exists ? {} : { createdAt: now }),
      },
    };

    await policyRef.set(policyData, { merge: true });

    // Log the price update
    await db.collection('auditLogs').add({
      type: 'regional_pricing_update',
      userId: context.auth.uid,
      regionId,
      changes: data,
      timestamp: now,
    });

    return {
      success: true,
      regionId,
      message: 'Regional pricing updated',
    };
  }
);

/**
 * Apply regional pricing to token packs
 */
export const pack381_applyRegionalPricing = functions.https.onCall(
  async (data: { regionId: string; basePrices?: any }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    const { regionId, basePrices } = data;

    // Get regional price policy
    const policyDoc = await db.collection('regionalPricePolicies').doc(regionId).get();
    
    if (!policyDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Regional price policy not found'
      );
    }

    const policy = policyDoc.data() as RegionalPricePolicy;

    // Default token packs (in PLN)
    const defaultPacks = basePrices || {
      pack_100: { tokens: 100, pricePLN: 20, discount: 0 },
      pack_500: { tokens: 500, pricePLN: 95, discount: 5 },
      pack_1000: { tokens: 1000, pricePLN: 180, discount: 10 },
      pack_2500: { tokens: 2500, pricePLN: 425, discount: 15 },
      pack_5000: { tokens: 5000, pricePLN: 800, discount: 20 },
      pack_10000: { tokens: 10000, pricePLN: 1500, discount: 25 },
    };

    const localizedPacks: any = {};

    // Apply PPP and convert currency
    Object.entries(defaultPacks).forEach(([packId, pack]: [string, any]) => {
      let localPrice = pack.pricePLN * policy.conversion.rateToPLN;
      
      // Apply PPP adjustment
      if (policy.ppp.enabled) {
        localPrice *= policy.ppp.multiplier;
      }
      
      // Apply tax if not included
      if (!policy.tax.included) {
        localPrice *= (1 + policy.tax.rate);
      }
      
      // Round to appropriate decimal places for currency
      localPrice = Math.round(localPrice * 100) / 100;
      
      // Ensure minimum price
      if (localPrice < policy.minimums.tokenPack) {
        localPrice = policy.minimums.tokenPack;
      }

      localizedPacks[packId] = {
        tokens: pack.tokens,
        priceLocal: localPrice,
        pricePLN: pack.pricePLN,
        currency: policy.currency,
        discount: pack.discount,
        tax: {
          rate: policy.tax.rate,
          type: policy.tax.type,
          included: policy.tax.included,
        },
      };
    });

    return {
      regionId,
      currency: policy.currency,
      packs: localizedPacks,
      pppApplied: policy.ppp.enabled,
      pppMultiplier: policy.ppp.multiplier,
    };
  }
);

/**
 * Calculate final price for any transaction with tax and fees
 */
export const pack381_calculateFinalPrice = functions.https.onCall(
  async (data: {
    regionId: string;
    baseAmount: number;
    includeConversionFee?: boolean;
    transactionType?: 'purchase' | 'payout';
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    const { regionId, baseAmount, includeConversionFee = false, transactionType = 'purchase' } = data;

    // Get regional price policy
    const policyDoc = await db.collection('regionalPricePolicies').doc(regionId).get();
    
    if (!policyDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Regional price policy not found'
      );
    }

    const policy = policyDoc.data() as RegionalPricePolicy;

    let finalAmount = baseAmount;
    const breakdown: any = {
      base: baseAmount,
      currency: policy.currency,
    };

    // Apply PPP if enabled
    if (policy.ppp.enabled && transactionType === 'purchase') {
      finalAmount *= policy.ppp.multiplier;
      breakdown.ppp = finalAmount - baseAmount;
    }

    // Apply tax
    if (!policy.tax.included) {
      const taxAmount = finalAmount * policy.tax.rate;
      finalAmount += taxAmount;
      breakdown.tax = {
        amount: taxAmount,
        rate: policy.tax.rate,
        type: policy.tax.type,
      };
    }

    // Apply conversion fee if requested
    if (includeConversionFee) {
      const conversionFee = finalAmount * policy.conversion.conversionFee;
      finalAmount += conversionFee;
      breakdown.conversionFee = conversionFee;
    }

    // Round to 2 decimal places
    finalAmount = Math.round(finalAmount * 100) / 100;

    return {
      regionId,
      currency: policy.currency,
      baseAmount,
      finalAmount,
      breakdown,
      savings: baseAmount !== finalAmount ? baseAmount - finalAmount : 0,
    };
  }
);

/**
 * Convert tokens to local currency value
 */
export const pack381_convertTokensToLocal = functions.https.onCall(
  async (data: { tokens: number; regionId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    const { tokens, regionId } = data;

    const policyDoc = await db.collection('regionalPricePolicies').doc(regionId).get();
    
    if (!policyDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Regional price policy not found'
      );
    }

    const policy = policyDoc.data() as RegionalPricePolicy;

    // Base value in PLN
    const valuePLN = tokens * BASE_TOKEN_VALUE_PLN;
    
    // Convert to local currency
    let valueLocal = valuePLN * policy.conversion.rateToPLN;
    
    // Apply PPP if enabled
    if (policy.ppp.enabled) {
      valueLocal *= policy.ppp.multiplier;
    }

    return {
      tokens,
      valuePLN,
      valueLocal: Math.round(valueLocal * 100) / 100,
      currency: policy.currency,
      regionId,
    };
  }
);

/**
 * Get payout eligibility and restrictions for region
 */
export const pack381_getPayoutEligibility = functions.https.onCall(
  async (data: { regionId?: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    const userId = context.auth.uid;
    let { regionId } = data;

    // Get user's region if not provided
    if (!regionId) {
      const userDoc = await db.collection('users').doc(userId).get();
      const userData = userDoc.data();
      regionId = userData?.detectedRegion || 'GLOBAL';
    }

    const policyDoc = await db.collection('regionalPricePolicies').doc(regionId).get();
    
    if (!policyDoc.exists) {
      return {
        eligible: false,
        reason: 'Region not configured for payouts',
      };
    }

    const policy = policyDoc.data() as RegionalPricePolicy;

    if (!policy.payout.enabled) {
      return {
        eligible: false,
        reason: 'Payouts not available in your region',
        restrictions: policy.payout.restrictions,
      };
    }

    // Get user's wallet balance
    const walletDoc = await db.collection('wallets').doc(userId).get();
    const walletData = walletDoc.data();
    const balance = walletData?.balance || 0;

    const eligible = balance >= policy.payout.minimumAmount;

    return {
      eligible,
      regionId,
      currency: policy.currency,
      balance,
      minimumAmount: policy.payout.minimumAmount,
      maximumAmount: policy.payout.maximumAmount,
      fee: policy.payout.fee,
      processingTime: policy.payout.processingTime,
      supportedMethods: policy.payout.supportedMethods,
      reason: eligible ? null : 'Insufficient balance for minimum payout',
    };
  }
);

/**
 * Admin: Bulk update currency conversion rates
 */
export const pack381_updateConversionRates = functions.https.onCall(
  async (data: {
    rates: Array<{
      regionId: string;
      rateToPLN: number;
      rateToUSD: number;
      rateToEUR: number;
    }>;
  }, context) => {
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

    const { rates } = data;
    const batch = db.batch();
    const now = new Date().toISOString();

    rates.forEach(rate => {
      const policyRef = db.collection('regionalPricePolicies').doc(rate.regionId);
      batch.update(policyRef, {
        'conversion.rateToPLN': rate.rateToPLN,
        'conversion.rateToUSD': rate.rateToUSD,
        'conversion.rateToEUR': rate.rateToEUR,
        'conversion.lastUpdated': now,
        'metadata.updatedAt': now,
        'metadata.updatedBy': context.auth.uid,
      });
    });

    await batch.commit();

    return {
      success: true,
      updated: rates.length,
      timestamp: now,
    };
  }
);
