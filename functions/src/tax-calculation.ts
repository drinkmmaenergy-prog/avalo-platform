/**
 * PACK 129 — Tax Calculation Engine
 * Automated tax calculation and withholding for payouts
 * 
 * NON-NEGOTIABLE RULES:
 * - No manipulation of 65/35 split
 * - Taxes apply AFTER creator earnings are calculated
 * - No bonuses or reductions based on tax status
 * - All calculations are audit-proof
 */

import { https, logger } from 'firebase-functions/v2';
import { HttpsError } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';
import { db, serverTimestamp } from './init';
import {
  TaxCalculation,
  TaxProfile,
  RegionalTaxRules,
  RevenueCategory,
  CalculateTaxForUserRequest,
  CalculateTaxForUserResponse,
  ApplyWithholdingRequest,
  ApplyWithholdingResponse,
  TaxWithholdingRecord,
  REVENUE_CATEGORY_MAPPING,
  TAX_CONSTANTS,
} from './types/tax.types';
import { TransactionType } from './types/treasury.types';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get regional tax rules
 */
async function getRegionalTaxRules(country: string): Promise<RegionalTaxRules | null> {
  try {
    const rulesDoc = await db.collection('regional_tax_rules').doc(country).get();
    
    if (rulesDoc.exists) {
      return rulesDoc.data() as RegionalTaxRules;
    }

    // Try to get from region_policy_profiles if not in tax rules
    const policyDoc = await db.collection('region_policy_profiles').doc(country).get();
    if (policyDoc.exists) {
      const policy = policyDoc.data();
      
      // Create default rules from policy
      const defaultRules: RegionalTaxRules = {
        regionCode: country,
        withholding: {
          required: false,
          rate: TAX_CONSTANTS.DEFAULT_WITHHOLDING_RATES[country] || 0,
          exemptionAvailable: false,
        },
        vat: {
          applicable: false,
          rate: TAX_CONSTANTS.DEFAULT_VAT_RATES[country] || 0,
        },
        digitalServicesTax: {
          applicable: false,
          rate: 0,
        },
        invoiceRequirements: {
          mandatory: false,
          format: 'PDF',
          mustIncludeVAT: false,
          mustIncludeTaxId: false,
        },
        reportingFrequency: 'QUARTERLY',
        lastUpdated: Timestamp.now(),
      };

      return defaultRules;
    }

    return null;
  } catch (error) {
    logger.error('Failed to get regional tax rules', { error, country });
    return null;
  }
}

/**
 * Categorize earnings by transaction type
 */
function categorizeEarnings(
  transactionTypes: Record<TransactionType, number>
): Record<RevenueCategory, number> {
  const earnings: Record<RevenueCategory, number> = {
    PAID_CHAT: 0,
    PAID_CALLS: 0,
    TIPS_GIFTS: 0,
    EXCLUSIVE_MEDIA: 0,
    EVENTS: 0,
    DIGITAL_PRODUCTS: 0,
    ADS_PARTNERSHIPS: 0,
    OTHER: 0,
  };

  // Map transaction types to revenue categories
  for (const [txType, amount] of Object.entries(transactionTypes)) {
    let mapped = false;

    for (const [category, treatment] of Object.entries(REVENUE_CATEGORY_MAPPING)) {
      if (treatment.transactionTypes.includes(txType as TransactionType)) {
        earnings[category as RevenueCategory] += amount;
        mapped = true;
        break;
      }
    }

    if (!mapped) {
      earnings.OTHER += amount;
    }
  }

  return earnings;
}

/**
 * Calculate withholding tax
 */
function calculateWithholding(
  grossAmount: number,
  withholdingRate: number,
  threshold?: number
): { withholdingAmount: number; netAmount: number } {
  // Check if earnings exceed threshold
  if (threshold && grossAmount < threshold) {
    return {
      withholdingAmount: 0,
      netAmount: grossAmount,
    };
  }

  const withholdingAmount = Math.round(grossAmount * (withholdingRate / 100));
  const netAmount = grossAmount - withholdingAmount;

  return { withholdingAmount, netAmount };
}

/**
 * Calculate VAT
 */
function calculateVAT(
  amount: number,
  vatRate: number,
  category: RevenueCategory
): number {
  // Check if category is subject to VAT
  const categoryTreatment = REVENUE_CATEGORY_MAPPING[category];
  if (!categoryTreatment?.subjectToVAT) {
    return 0;
  }

  return Math.round(amount * (vatRate / 100));
}

/**
 * Calculate digital services tax
 */
function calculateDigitalServicesTax(
  amount: number,
  dstRate: number,
  category: RevenueCategory
): number {
  // Check if category is subject to DST
  const categoryTreatment = REVENUE_CATEGORY_MAPPING[category];
  if (!categoryTreatment?.digitalServicesTax) {
    return 0;
  }

  return Math.round(amount * (dstRate / 100));
}

/**
 * Get earnings from treasury ledger
 */
async function getEarningsFromLedger(
  userId: string,
  periodStart: Timestamp,
  periodEnd: Timestamp
): Promise<{ total: number; byCategory: Record<RevenueCategory, number> }> {
  try {
    const ledgerQuery = await db
      .collection('treasury_ledger')
      .where('userId', '==', userId)
      .where('eventType', '==', 'EARN')
      .where('timestamp', '>=', periodStart)
      .where('timestamp', '<=', periodEnd)
      .get();

    const transactionTypeCounts: Record<TransactionType, number> = {
      PAID_MESSAGE: 0,
      PAID_CALL: 0,
      PAID_GIFT: 0,
      PAID_MEDIA: 0,
      PAID_STORY: 0,
      DIGITAL_PRODUCT: 0,
      EVENT_TICKET: 0,
      BOOST: 0,
      TOKEN_PURCHASE: 0,
      OTHER: 0,
    };

    let totalEarnings = 0;

    ledgerQuery.docs.forEach(doc => {
      const entry = doc.data();
      const amount = entry.tokenAmount || 0;
      const txType = entry.metadata?.transactionType as TransactionType;

      totalEarnings += amount;

      if (txType && txType in transactionTypeCounts) {
        transactionTypeCounts[txType] += amount;
      } else {
        transactionTypeCounts.OTHER += amount;
      }
    });

    const byCategory = categorizeEarnings(transactionTypeCounts);

    return { total: totalEarnings, byCategory };
  } catch (error) {
    logger.error('Failed to get earnings from ledger', { error, userId });
    throw error;
  }
}

// ============================================================================
// TAX CALCULATION FUNCTION
// ============================================================================

/**
 * Calculate taxes for user payout
 */
export async function calculateTaxForUser(
  userId: string,
  periodStart: Timestamp,
  periodEnd: Timestamp,
  grossEarnings?: number,
  earningsByCategory?: Record<RevenueCategory, number>
): Promise<TaxCalculation> {
  try {
    // Get user's tax profile
    const profileDoc = await db.collection('tax_profiles').doc(userId).get();
    
    if (!profileDoc.exists) {
      throw new Error('Tax profile not found. Please submit tax profile before requesting payout.');
    }

    const profile = profileDoc.data() as TaxProfile;

    // Get regional tax rules
    const taxRules = await getRegionalTaxRules(profile.country);
    
    if (!taxRules) {
      throw new Error(`Tax rules not available for country: ${profile.country}`);
    }

    // Get earnings if not provided
    let earnings = grossEarnings || 0;
    let earningsBreakdown = earningsByCategory;

    if (!grossEarnings || !earningsByCategory) {
      const ledgerEarnings = await getEarningsFromLedger(userId, periodStart, periodEnd);
      earnings = ledgerEarnings.total;
      earningsBreakdown = ledgerEarnings.byCategory;
    }

    if (!earningsBreakdown) {
      // Fallback: categorize as OTHER
      earningsBreakdown = {
        PAID_CHAT: 0,
        PAID_CALLS: 0,
        TIPS_GIFTS: 0,
        EXCLUSIVE_MEDIA: 0,
        EVENTS: 0,
        DIGITAL_PRODUCTS: 0,
        ADS_PARTNERSHIPS: 0,
        OTHER: earnings,
      };
    }

    // Calculate withholding tax
    let withholdingTax = 0;
    let withholdingRate = 0;

    if (profile.requiresWithholding && taxRules.withholding.required) {
      withholdingRate = taxRules.withholding.rate;
      const withholding = calculateWithholding(
        earnings,
        withholdingRate,
        taxRules.withholding.threshold
      );
      withholdingTax = withholding.withholdingAmount;
    }

    // Calculate VAT (if applicable)
    let vatAmount = 0;
    if (profile.vatEligible && taxRules.vat.applicable) {
      for (const [category, amount] of Object.entries(earningsBreakdown)) {
        vatAmount += calculateVAT(amount, taxRules.vat.rate, category as RevenueCategory);
      }
    }

    // Calculate digital services tax (if applicable)
    let digitalServicesTax = 0;
    if (taxRules.digitalServicesTax.applicable) {
      for (const [category, amount] of Object.entries(earningsBreakdown)) {
        digitalServicesTax += calculateDigitalServicesTax(
          amount,
          taxRules.digitalServicesTax.rate,
          category as RevenueCategory
        );
      }
    }

    // Calculate net payout
    const netPayout = earnings - withholdingTax - vatAmount - digitalServicesTax;

    const calculation: TaxCalculation = {
      userId,
      periodStart,
      periodEnd,
      grossEarnings: earnings,
      earningsByCategory: earningsBreakdown,
      withholdingTax,
      withholdingRate,
      vatAmount: vatAmount > 0 ? vatAmount : undefined,
      digitalServicesTax: digitalServicesTax > 0 ? digitalServicesTax : undefined,
      netPayout,
      appliedRules: {
        regionCode: profile.country,
        entityType: profile.entityType,
        rulesVersion: '1.0',
      },
      calculatedAt: Timestamp.now(),
      calculatedBy: 'SYSTEM',
    };

    logger.info('Tax calculation completed', {
      userId,
      grossEarnings: earnings,
      withholdingTax,
      vatAmount,
      digitalServicesTax,
      netPayout,
    });

    return calculation;
  } catch (error: any) {
    logger.error('Tax calculation failed', { error, userId });
    throw error;
  }
}

// ============================================================================
// CALLABLE FUNCTIONS
// ============================================================================

/**
 * Calculate tax for user (callable function)
 */
export const tax_calculateForUser = https.onCall<CalculateTaxForUserRequest>(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { userId, periodStart, periodEnd, grossEarnings, earningsByCategory } = request.data;

    if (userId !== auth.uid) {
      throw new HttpsError('permission-denied', 'Cannot calculate tax for another user');
    }

    try {
      const calculation = await calculateTaxForUser(
        userId,
        periodStart,
        periodEnd,
        grossEarnings,
        earningsByCategory
      );

      const response: CalculateTaxForUserResponse = {
        success: true,
        calculation,
      };

      return response;
    } catch (error: any) {
      logger.error('Tax calculation callable failed', { error, userId });
      throw new HttpsError('internal', error.message || 'Failed to calculate tax');
    }
  }
);

/**
 * Apply withholding to payout
 */
export const tax_applyWithholding = https.onCall<ApplyWithholdingRequest>(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { userId, payoutRequestId, grossAmount } = request.data;

    if (userId !== auth.uid) {
      throw new HttpsError('permission-denied', 'Cannot apply withholding for another user');
    }

    try {
      // Get tax profile
      const profileDoc = await db.collection('tax_profiles').doc(userId).get();
      
      if (!profileDoc.exists) {
        throw new HttpsError('not-found', 'Tax profile not found');
      }

      const profile = profileDoc.data() as TaxProfile;

      // Get regional tax rules
      const taxRules = await getRegionalTaxRules(profile.country);
      
      if (!taxRules) {
        throw new HttpsError('internal', 'Tax rules not available');
      }

      // Calculate withholding
      let withholdingAmount = 0;
      let withholdingRate = 0;
      let netAmount = grossAmount;

      if (profile.requiresWithholding && taxRules.withholding.required) {
        withholdingRate = taxRules.withholding.rate;
        const withholding = calculateWithholding(
          grossAmount,
          withholdingRate,
          taxRules.withholding.threshold
        );
        withholdingAmount = withholding.withholdingAmount;
        netAmount = withholding.netAmount;
      }

      // Create withholding record
      const recordId = db.collection('tax_withholding_records').doc().id;
      const now = Timestamp.now();
      const taxYear = now.toDate().getFullYear();
      const taxQuarter = Math.ceil((now.toDate().getMonth() + 1) / 3);

      const withholdingRecord: TaxWithholdingRecord = {
        id: recordId,
        userId,
        payoutRequestId,
        grossAmount,
        withholdingAmount,
        withholdingRate,
        netAmount,
        taxYear,
        taxQuarter,
        revenueCategories: ['OTHER'], // Will be updated with actual categories
        country: profile.country,
        entityType: profile.entityType,
        taxId: profile.taxId,
        status: 'WITHHELD',
        createdAt: now,
        ledgerIds: [], // Will be populated when ledger entries are created
      };

      await db
        .collection('tax_withholding_records')
        .doc(recordId)
        .set(withholdingRecord);

      logger.info('Withholding applied', {
        userId,
        payoutRequestId,
        grossAmount,
        withholdingAmount,
        withholdingRate,
        netAmount,
      });

      const response: ApplyWithholdingResponse = {
        success: true,
        withholdingRecordId: recordId,
        grossAmount,
        withholdingAmount,
        withholdingRate,
        netAmount,
      };

      return response;
    } catch (error: any) {
      logger.error('Apply withholding failed', { error, userId });
      throw new HttpsError('internal', error.message || 'Failed to apply withholding');
    }
  }
);

/**
 * Get withholding records for user
 */
export const tax_getWithholdingRecords = https.onCall(
  {
    region: 'us-central1',
    memory: '128MiB',
  },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { userId, year, quarter } = request.data;

    if (userId !== auth.uid) {
      throw new HttpsError('permission-denied', 'Cannot access records for another user');
    }

    try {
      let query = db
        .collection('tax_withholding_records')
        .where('userId', '==', userId);

      if (year) {
        query = query.where('taxYear', '==', year);
      }

      if (quarter) {
        query = query.where('taxQuarter', '==', quarter);
      }

      const recordsSnap = await query.orderBy('createdAt', 'desc').get();

      const records = recordsSnap.docs.map(doc => {
        const data = doc.data() as TaxWithholdingRecord;
        return {
          ...data,
          createdAt: data.createdAt.toMillis(),
          remittedAt: data.remittedAt?.toMillis(),
        };
      });

      return {
        success: true,
        records,
        count: records.length,
      };
    } catch (error: any) {
      logger.error('Failed to get withholding records', { error, userId });
      throw new HttpsError('internal', 'Failed to retrieve withholding records');
    }
  }
);