/**
 * PACK 378 — Global Tax Engine
 * Core tax calculation and compliance functions
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { TaxProfile, VATRecord, CreatorTaxProfile } from '../../firestore/schemas/pack378-tax-profiles';

const db = admin.firestore();

/**
 * Get active tax profile for a country
 */
export async function getTaxProfile(countryCode: string): Promise<TaxProfile | null> {
  const now = new Date();
  const snapshot = await db.collection('taxProfiles')
    .where('countryCode', '==', countryCode)
    .where('effectiveFrom', '<=', now)
    .orderBy('effectiveFrom', 'desc')
    .limit(1)
    .get();
  
  if (snapshot.empty) {
    return null;
  }
  
  const profile = snapshot.docs[0].data() as TaxProfile;
  
  // Check if profile has expired
  if (profile.effectiveUntil && profile.effectiveUntil < now) {
    return null;
  }
  
  return profile;
}

/**
 * PACK378_applyPurchaseTax
 * Apply tax to token purchase
 */
export const pack378_applyPurchaseTax = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { amount, countryCode, ipCountry, billingCountry, simCountry } = data;

  // Validate inputs
  if (!amount || !countryCode || !billingCountry) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  // Get tax profile
  const taxProfile = await getTaxProfile(countryCode);
  if (!taxProfile) {
    throw new functions.https.HttpsError('not-found', `Tax profile not found for ${countryCode}`);
  }

  // Verify buyer location consistency
  const locationVerified = 
    countryCode === billingCountry &&
    (ipCountry ? ipCountry === countryCode : true) &&
    (simCountry ? simCountry === countryCode : true);

  if (!locationVerified) {
    functions.logger.warn('Location mismatch detected', {
      userId: context.auth.uid,
      countryCode,
      ipCountry,
      billingCountry,
      simCountry
    });
  }

  // Calculate VAT
  let netAmount = amount;
  let vatAmount = 0;
  let grossAmount = amount;
  let vatMossApplied = false;
  let reverseChargeApplied = false;

  if (taxProfile.vatRate > 0) {
    // Check if reverse charge applies (B2B in EU)
    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    const userData = userDoc.data();
    const isEUBusinessUser = userData?.vatRegistered && userData?.vatNumber;

    if (isEUBusinessUser && taxProfile.reverseChargeEnabled) {
      // Reverse charge: no VAT charged, buyer handles it
      reverseChargeApplied = true;
    } else {
      // Apply VAT
      vatAmount = (amount * taxProfile.vatRate) / (100 + taxProfile.vatRate);
      netAmount = amount - vatAmount;
      vatMossApplied = taxProfile.vatMossEnabled;
    }
  }

  // Add digital services tax if applicable
  let digitalServicesTax = 0;
  if (taxProfile.digitalServicesTax > 0) {
    digitalServicesTax = netAmount * (taxProfile.digitalServicesTax / 100);
    grossAmount += digitalServicesTax;
  }

  // Create VAT record
  const vatRecord: Partial<VATRecord> = {
    transactionId: '', // Will be set by calling function
    userId: context.auth.uid,
    netAmount,
    vatAmount,
    grossAmount,
    vatRate: taxProfile.vatRate,
    taxJurisdiction: countryCode,
    vatMossApplied,
    reverseChargeApplied,
    ipCountry: ipCountry || 'unknown',
    simCountry: simCountry || undefined,
    billingCountry,
    locationVerified,
    invoiceIssued: false,
    timestamp: new Date(),
    fiscalYear: new Date().getFullYear(),
    fiscalQuarter: Math.floor(new Date().getMonth() / 3) + 1
  };

  return {
    netAmount,
    vatAmount,
    grossAmount,
    digitalServicesTax,
    taxRate: taxProfile.vatRate,
    vatMossApplied,
    reverseChargeApplied,
    requiresInvoice: taxProfile.requiresInvoice,
    vatRecord
  };
});

/**
 * PACK378_applyPayoutWithholding
 * Calculate withholding tax on creator payouts
 */
export const pack378_applyPayoutWithholding = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { amount, creatorId } = data;

  if (!amount || !creatorId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  // Get creator tax profile
  const creatorDoc = await db.collection('creatorTaxProfiles').doc(creatorId).get();
  if (!creatorDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Creator tax profile not found');
  }

  const creatorProfile = creatorDoc.data() as CreatorTaxProfile;

  // Get country tax profile
  const taxProfile = await getTaxProfile(creatorProfile.countryCode);
  if (!taxProfile) {
    throw new functions.https.HttpsError('not-found', `Tax profile not found for ${creatorProfile.countryCode}`);
  }

  let withholdingAmount = 0;
  let netPayout = amount;

  if (taxProfile.payoutWithholdingEnabled && amount >= taxProfile.withholdingThreshold) {
    // Apply withholding
    const withholdingRate = creatorProfile.withholdingRate || taxProfile.withholdingRate;
    withholdingAmount = amount * (withholdingRate / 100);
    netPayout = amount - withholdingAmount;
  }

  // Log withholding
  if (withholdingAmount > 0) {
    await db.collection('taxWithholdings').add({
      creatorId,
      amount: withholdingAmount,
      grossAmount: amount,
      netAmount: netPayout,
      withholdingRate: creatorProfile.withholdingRate || taxProfile.withholdingRate,
      countryCode: creatorProfile.countryCode,
      fiscalYear: new Date().getFullYear(),
      timestamp: new Date()
    });
  }

  return {
    grossAmount: amount,
    withholdingAmount,
    netAmount: netPayout,
    withholdingRate: creatorProfile.withholdingRate || taxProfile.withholdingRate,
    countryCode: creatorProfile.countryCode
  };
});

/**
 * PACK378_applyCreatorIncomeEstimate
 * Provide estimated tax liability for creators
 */
export const pack378_applyCreatorIncomeEstimate = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { amount, period } = data; // period: 'month' | 'quarter' | 'year'

  // Get creator tax profile
  const creatorDoc = await db.collection('creatorTaxProfiles').doc(context.auth.uid).get();
  if (!creatorDoc.exists) {
    // Return default estimate
    return {
      estimatedIncomeTax: amount * 0.20, // Default 20%
      estimatedSocialSecurity: amount * 0.15, // Default 15%
      estimatedTotal: amount * 0.35,
      warning: 'Complete tax profile for accurate estimates'
    };
  }

  const creatorProfile = creatorDoc.data() as CreatorTaxProfile;
  const taxProfile = await getTaxProfile(creatorProfile.countryCode);

  if (!taxProfile) {
    return {
      estimatedIncomeTax: amount * 0.20,
      estimatedSocialSecurity: amount * 0.15,
      estimatedTotal: amount * 0.35,
      warning: 'Tax profile unavailable for your country'
    };
  }

  const incomeTaxRate = taxProfile.creatorIncomeTaxEstimate;
  const estimatedIncomeTax = amount * (incomeTaxRate / 100);
  
  // Social security varies by country
  const socialSecurityRate = creatorProfile.isBusinessEntity ? 0 : 15; // Simplified
  const estimatedSocialSecurity = amount * (socialSecurityRate / 100);

  return {
    estimatedIncomeTax,
    estimatedSocialSecurity,
    estimatedTotal: estimatedIncomeTax + estimatedSocialSecurity,
    incomeTaxRate,
    socialSecurityRate,
    countryCode: creatorProfile.countryCode,
    period,
    note: 'This is an estimate. Consult a tax professional for accurate filing.'
  };
});

/**
 * Store VAT record
 */
export const storeVATRecord = async (vatRecord: Partial<VATRecord>): Promise<string> => {
  const docRef = await db.collection('vatRecords').add({
    ...vatRecord,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });
  return docRef.id;
};

/**
 * Get VAT records for period
 */
export const getVATRecordsForPeriod = async (
  startDate: Date,
  endDate: Date,
  countryCode?: string
): Promise<VATRecord[]> => {
  let query = db.collection('vatRecords')
    .where('timestamp', '>=', startDate)
    .where('timestamp', '<=', endDate);

  if (countryCode) {
    query = query.where('taxJurisdiction', '==', countryCode);
  }

  const snapshot = await query.get();
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as VATRecord));
};
