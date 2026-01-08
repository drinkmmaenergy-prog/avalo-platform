/**
 * PACK 383 - Global Payment Routing, Compliance & Cross-Border Payout Engine
 * Tax & Reporting Engine
 * 
 * Handles:
 * - Regional tax calculations
 * - Withholding rates
 * - VAT/GST applicability
 * - Tax reporting thresholds
 * - IRS 1099 / W-8BEN / W-9 forms
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// Tax Profile Interface
interface TaxProfile {
  userId: string;
  residencyCountry: string;
  taxClassification: 'individual' | 'business' | 'exempt';
  taxId?: string; // SSN, EIN, VAT number, etc.
  vatGstApplicable: boolean;
  vatGstNumber?: string;
  withholdingRate: number; // percentage
  reportingThreshold: number; // annual amount
  taxTreaty?: string; // for US treaties
  w9Submitted?: boolean;
  w8benSubmitted?: boolean;
  formDocuments?: string[]; // Storage URLs
  autoWithholding: boolean;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

// Tax Calculation Result
interface TaxCalculation {
  grossAmount: number;
  netAmount: number;
  taxAmount: number;
  withholdingRate: number;
  currency: string;
  taxType: string;
  reportingRequired: boolean;
  breakdown: {
    federalTax?: number;
    stateTax?: number;
    vatGst?: number;
    localTax?: number;
  };
}

/**
 * Calculate withholding for payout
 */
export const pack383_calculateWithholding = functions.https.onCall(
  async (data: { userId: string; grossAmount: number; currency?: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { userId, grossAmount, currency = 'USD' } = data;

    try {
      // Get tax profile
      const taxProfileDoc = await db.collection('taxProfiles').doc(userId).get();
      let taxProfile: TaxProfile;

      if (!taxProfileDoc.exists) {
        // Create default tax profile
        taxProfile = await createDefaultTaxProfile(userId);
      } else {
        taxProfile = taxProfileDoc.data() as TaxProfile;
      }

      // Calculate tax
      const calculation = await calculateTax(grossAmount, taxProfile, currency);

      // Check if reporting threshold reached
      const ytdPayouts = await getYearToDatePayouts(userId);
      const reportingRequired = ytdPayouts + grossAmount >= taxProfile.reportingThreshold;

      // Save tax calculation record
      await db.collection('taxCalculations').add({
        userId,
        grossAmount,
        netAmount: calculation.netAmount,
        taxAmount: calculation.taxAmount,
        withholdingRate: calculation.withholdingRate,
        currency,
        reportingRequired,
        breakdown: calculation.breakdown,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        netAmount: calculation.netAmount,
        taxAmount: calculation.taxAmount,
        withholdingRate: calculation.withholdingRate,
        breakdown: calculation.breakdown,
        reportingRequired,
        reportingThresholdRemaining: Math.max(0, taxProfile.reportingThreshold - (ytdPayouts + grossAmount)),
      };
    } catch (error: any) {
      console.error('Error calculating withholding:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Submit tax profile
 */
export const pack383_submitTaxProfile = functions.https.onCall(
  async (data: {
    residencyCountry: string;
    taxClassification: 'individual' | 'business' | 'exempt';
    taxId?: string;
    vatGstNumber?: string;
    autoWithholding?: boolean;
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const userId = context.auth.uid;

    try {
      const withholdingRate = getWithholdingRate(
        data.residencyCountry,
        data.taxClassification
      );

      const taxProfile: TaxProfile = {
        userId,
        residencyCountry: data.residencyCountry,
        taxClassification: data.taxClassification,
        taxId: data.taxId,
        vatGstApplicable: !!data.vatGstNumber,
        vatGstNumber: data.vatGstNumber,
        withholdingRate,
        reportingThreshold: getReportingThreshold(data.residencyCountry),
        autoWithholding: data.autoWithholding !== false,
        createdAt: admin.firestore.FieldValue.serverTimestamp() as any,
        updatedAt: admin.firestore.FieldValue.serverTimestamp() as any,
      };

      await db.collection('taxProfiles').doc(userId).set(taxProfile);

      // Create audit log
      await db.collection('auditLogs').add({
        action: 'tax_profile_submitted',
        userId,
        targetType: 'tax_profile',
        targetId: userId,
        details: {
          residencyCountry: data.residencyCountry,
          taxClassification: data.taxClassification,
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        withholdingRate,
        reportingThreshold: taxProfile.reportingThreshold,
      };
    } catch (error: any) {
      console.error('Error submitting tax profile:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Generate tax report for user
 * Annual tax document generation
 */
export const pack383_generateTaxReport = functions.https.onCall(
  async (data: { userId: string; year: number }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { userId, year } = data;

    // Verify user can access this report
    if (context.auth.uid !== userId) {
      // Check if admin
      const userDoc = await db.collection('users').doc(context.auth.uid).get();
      if (!userDoc.exists || userDoc.data()!.role !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 'Cannot access another user\'s tax report');
      }
    }

    try {
      // Get tax profile
      const taxProfileDoc = await db.collection('taxProfiles').doc(userId).get();
      if (!taxProfileDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Tax profile not found');
      }

      const taxProfile = taxProfileDoc.data() as TaxProfile;

      // Get all payouts for the year
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year, 11, 31, 23, 59, 59);

      const payoutsSnapshot = await db
        .collection('payouts')
        .where('userId', '==', userId)
        .where('status', '==', 'completed')
        .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(startDate))
        .where('createdAt', '<=', admin.firestore.Timestamp.fromDate(endDate))
        .get();

      // Calculate totals
      let totalGross = 0;
      let totalNet = 0;
      let totalTax = 0;

      const payoutDetails = payoutsSnapshot.docs.map(doc => {
        const payout = doc.data();
        totalGross += payout.grossAmount || 0;
        totalNet += payout.netAmount || 0;
        totalTax += payout.taxAmount || 0;

        return {
          id: doc.id,
          date: payout.createdAt.toDate().toISOString(),
          grossAmount: payout.grossAmount,
          netAmount: payout.netAmount,
          taxAmount: payout.taxAmount,
          currency: payout.currency,
        };
      });

      // Generate report
      const report = {
        userId,
        year,
        residencyCountry: taxProfile.residencyCountry,
        taxClassification: taxProfile.taxClassification,
        totalPayouts: payoutsSnapshot.size,
        totalGrossAmount: totalGross,
        totalNetAmount: totalNet,
        totalTaxWithheld: totalTax,
        reportingRequired: totalGross >= taxProfile.reportingThreshold,
        payouts: payoutDetails,
        generatedAt: new Date().toISOString(),
      };

      // Save report
      await db.collection('taxReports').add({
        ...report,
        generatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        report,
      };
    } catch (error: any) {
      console.error('Error generating tax report:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Scheduled: Generate annual tax reports
 */
export const pack383_generateAnnualTaxReports = functions.pubsub
  .schedule('0 0 1 1 *') // January 1st at midnight
  .timeZone('America/New_York')
  .onRun(async (context) => {
    try {
      const previousYear = new Date().getFullYear() - 1;

      // Get all tax profiles
      const taxProfilesSnapshot = await db.collection('taxProfiles').get();

      if (taxProfilesSnapshot.empty) {
        console.log('No tax profiles to process');
        return null;
      }

      const reportPromises = taxProfilesSnapshot.docs.map(async (profileDoc) => {
        const profile = profileDoc.data() as TaxProfile;
        const userId = profile.userId;

        try {
          // Get year's payouts
          const startDate = new Date(previousYear, 0, 1);
          const endDate = new Date(previousYear, 11, 31, 23, 59, 59);

          const payoutsSnapshot = await db
            .collection('payouts')
            .where('userId', '==', userId)
            .where('status', '==', 'completed')
            .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(startDate))
            .where('createdAt', '<=', admin.firestore.Timestamp.fromDate(endDate))
            .get();

          if (payoutsSnapshot.empty) {
            console.log(`No payouts for user ${userId} in ${previousYear}`);
            return;
          }

          // Calculate totals
          let totalGross = 0;
          let totalNet = 0;
          let totalTax = 0;

          payoutsSnapshot.docs.forEach(doc => {
            const payout = doc.data();
            totalGross += payout.grossAmount || 0;
            totalNet += payout.netAmount || 0;
            totalTax += payout.taxAmount || 0;
          });

          // Only generate report if threshold met
          if (totalGross >= profile.reportingThreshold) {
            await db.collection('taxReports').add({
              userId,
              year: previousYear,
              residencyCountry: profile.residencyCountry,
              taxClassification: profile.taxClassification,
              totalPayouts: payoutsSnapshot.size,
              totalGrossAmount: totalGross,
              totalNetAmount: totalNet,
              totalTaxWithheld: totalTax,
              reportingRequired: true,
              autoGenerated: true,
              generatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            console.log(`Generated tax report for user ${userId} for year ${previousYear}`);
          }
        } catch (error) {
          console.error(`Error generating report for user ${userId}:`, error);
        }
      });

      await Promise.all(reportPromises);

      console.log(`Annual tax report generation completed for ${taxProfilesSnapshot.size} users`);
      return null;
    } catch (error) {
      console.error('Error in annual tax report generation:', error);
      return null;
    }
  });

// ============================================================================
// Helper Functions
// ============================================================================

async function createDefaultTaxProfile(userId: string): Promise<TaxProfile> {
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  const country = userData?.country || userData?.countryCode || 'US';

  const defaultProfile: TaxProfile = {
    userId,
    residencyCountry: country,
    taxClassification: 'individual',
    vatGstApplicable: false,
    withholdingRate: getWithholdingRate(country, 'individual'),
    reportingThreshold: getReportingThreshold(country),
    autoWithholding: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp() as any,
    updatedAt: admin.firestore.FieldValue.serverTimestamp() as any,
  };

  await db.collection('taxProfiles').doc(userId).set(defaultProfile);
  return defaultProfile;
}

async function calculateTax(
  grossAmount: number,
  taxProfile: TaxProfile,
  currency: string
): Promise<TaxCalculation> {
  const withholdingRate = taxProfile.autoWithholding ? taxProfile.withholdingRate : 0;
  const taxAmount = grossAmount * (withholdingRate / 100);
  const netAmount = grossAmount - taxAmount;

  const breakdown: any = {};

  // Apply federal tax (simplified)
  if (taxProfile.residencyCountry === 'US') {
    breakdown.federalTax = taxAmount;
  } else if (taxProfile.vatGstApplicable) {
    breakdown.vatGst = taxAmount;
  } else {
    breakdown.withholdingTax = taxAmount;
  }

  return {
    grossAmount,
    netAmount,
    taxAmount,
    withholdingRate,
    currency,
    taxType: taxProfile.vatGstApplicable ? 'VAT/GST' : 'withholding',
    reportingRequired: false, // Calculated separately
    breakdown,
  };
}

function getWithholdingRate(country: string, classification: string): number {
  // Simplified withholding rates by country
  const rates: Record<string, number> = {
    'US': 24, // Default US withholding for non-residents
    'GB': 20, // UK basic rate
    'DE': 25, // Germany
    'FR': 30, // France
    'IT': 30, // Italy
    'ES': 24, // Spain
    'CA': 25, // Canada
    'AU': 30, // Australia
    'PL': 19, // Poland
  };

  // Business entities often have lower rates
  if (classification === 'business') {
    return (rates[country] || 15) * 0.8;
  }

  return rates[country] || 15; // Default 15% for other countries
}

function getReportingThreshold(country: string): number {
  // Annual reporting thresholds by country (in local currency equivalent to USD)
  const thresholds: Record<string, number> = {
    'US': 600, // 1099-NEC threshold
    'GB': 1000,
    'DE': 600,
    'FR': 600,
    'IT': 600,
    'ES': 600,
    'CA': 500,
    'AU': 750,
    'PL': 800,
  };

  return thresholds[country] || 1000; // Default $1000
}

async function getYearToDatePayouts(userId: string): Promise<number> {
  const currentYear = new Date().getFullYear();
  const startDate = new Date(currentYear, 0, 1);

  const payoutsSnapshot = await db
    .collection('payouts')
    .where('userId', '==', userId)
    .where('status', '==', 'completed')
    .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(startDate))
    .get();

  return payoutsSnapshot.docs.reduce((total, doc) => {
    return total + (doc.data().grossAmount || 0);
  }, 0);
}
