/**
 * PACK 129 — Tax & Treasury Integration
 * Integration layer between tax calculation and treasury payout system
 * 
 * INTEGRATION POINTS:
 * - Extends treasury_requestPayout with tax calculations
 * - Applies withholding before payout release
 * - Creates tax-aware ledger entries
 * - Ensures compliance before payouts
 */

import { logger } from 'firebase-functions/v2';
import { Timestamp } from 'firebase-admin/firestore';
import { db, serverTimestamp } from './init';
import { calculateTaxForUser } from './tax-calculation';
import { createLedgerEntry } from './treasury-helpers';
import {
  TaxCalculation,
  TaxProfile,
  TaxWithholdingRecord,
  RevenueCategory,
} from './types/tax.types';
import { CreatorVault } from './types/treasury.types';

// ============================================================================
// TAX-AWARE PAYOUT FLOW
// ============================================================================

/**
 * Enhanced payout eligibility check with tax compliance
 */
export async function checkTaxCompliance(userId: string): Promise<{
  compliant: boolean;
  blockers: string[];
  profile?: TaxProfile;
}> {
  try {
    const profileDoc = await db.collection('tax_profiles').doc(userId).get();

    if (!profileDoc.exists) {
      return {
        compliant: false,
        blockers: ['Tax profile required for payouts'],
      };
    }

    const profile = profileDoc.data() as TaxProfile;
    const blockers: string[] = [];

    if (profile.status === 'SUSPENDED') {
      blockers.push('Tax profile is suspended');
    }

    if (profile.status === 'PENDING') {
      blockers.push('Tax profile is pending review');
    }

    if (profile.requiresWithholding && !profile.taxId) {
      blockers.push('Tax ID required for your region');
    }

    if (profile.entityType === 'COMPANY' && !profile.documentsVerified) {
      blockers.push('Business documents require verification');
    }

    return {
      compliant: blockers.length === 0,
      blockers,
      profile: blockers.length === 0 ? profile : undefined,
    };
  } catch (error) {
    logger.error('Tax compliance check failed', { error, userId });
    return {
      compliant: false,
      blockers: ['Tax compliance check failed'],
    };
  }
}

/**
 * Calculate tax for pending payout
 */
export async function calculateTaxForPayout(
  userId: string,
  tokenAmount: number
): Promise<{
  grossAmount: number;
  withholdingAmount: number;
  netAmount: number;
  calculation: TaxCalculation;
}> {
  try {
    // Get earnings period (last 30 days for calculation)
    const now = Timestamp.now();
    const thirtyDaysAgo = Timestamp.fromMillis(now.toMillis() - 30 * 24 * 60 * 60 * 1000);

    // Calculate tax using actual earnings
    const calculation = await calculateTaxForUser(
      userId,
      thirtyDaysAgo,
      now,
      tokenAmount,
      undefined // Will fetch from ledger
    );

    return {
      grossAmount: calculation.grossEarnings,
      withholdingAmount: calculation.withholdingTax,
      netAmount: calculation.netPayout,
      calculation,
    };
  } catch (error: any) {
    logger.error('Tax calculation for payout failed', { error, userId });
    throw new Error(`Failed to calculate tax: ${error.message}`);
  }
}

/**
 * Apply withholding and update vaults
 */
export async function applyWithholdingToPayout(
  userId: string,
  payoutRequestId: string,
  grossAmount: number,
  calculation: TaxCalculation
): Promise<TaxWithholdingRecord> {
  try {
    const profileDoc = await db.collection('tax_profiles').doc(userId).get();
    const profile = profileDoc.data() as TaxProfile;

    const now = Timestamp.now();
    const taxYear = now.toDate().getFullYear();
    const taxQuarter = Math.ceil((now.toDate().getMonth() + 1) / 3);

    // Extract revenue categories from calculation
    const revenueCategories: RevenueCategory[] = [];
    for (const [category, amount] of Object.entries(calculation.earningsByCategory)) {
      if (amount > 0) {
        revenueCategories.push(category as RevenueCategory);
      }
    }

    // Create withholding record
    const recordId = db.collection('tax_withholding_records').doc().id;
    const withholdingRecord: TaxWithholdingRecord = {
      id: recordId,
      userId,
      payoutRequestId,
      grossAmount,
      withholdingAmount: calculation.withholdingTax,
      withholdingRate: calculation.withholdingRate,
      netAmount: calculation.netPayout,
      taxYear,
      taxQuarter,
      revenueCategories,
      country: profile.country,
      entityType: profile.entityType,
      taxId: profile.taxId,
      status: 'WITHHELD',
      createdAt: now,
      ledgerIds: [],
    };

    // Create ledger entry for withholding
    const ledgerId = await createLedgerEntry(
      'PAYOUT_LOCK',
      userId,
      -calculation.withholdingTax,
      'CREATOR',
      {
        payoutRequestId,
        withholdingRecordId: recordId,
        taxWithheld: calculation.withholdingTax,
        description: 'Tax withholding applied',
      },
      userId
    );

    // Update withholding record with ledger ID
    withholdingRecord.ledgerIds = [ledgerId];

    // Save withholding record
    await db
      .collection('tax_withholding_records')
      .doc(recordId)
      .set(withholdingRecord);

    logger.info('Withholding applied to payout', {
      userId,
      payoutRequestId,
      grossAmount,
      withholdingAmount: calculation.withholdingTax,
      netAmount: calculation.netPayout,
    });

    return withholdingRecord;
  } catch (error: any) {
    logger.error('Failed to apply withholding', { error, userId });
    throw error;
  }
}

/**
 * Enhanced payout request with tax integration
 * This extends the treasury payout flow
 */
export async function processPayoutWithTax(
  userId: string,
  payoutRequestId: string,
  requestedTokens: number
): Promise<{
  success: boolean;
  grossAmount: number;
  withholdingAmount: number;
  netAmount: number;
  withholdingRecordId?: string;
  message: string;
}> {
  try {
    // 1. Check tax compliance
    const compliance = await checkTaxCompliance(userId);
    
    if (!compliance.compliant) {
      return {
        success: false,
        grossAmount: requestedTokens,
        withholdingAmount: 0,
        netAmount: requestedTokens,
        message: `Tax compliance issues: ${compliance.blockers.join(', ')}`,
      };
    }

    // 2. Calculate tax
    const taxCalc = await calculateTaxForPayout(userId, requestedTokens);

    // 3. Verify creator vault has sufficient balance (including withholding)
    const vaultDoc = await db.collection('creator_vaults').doc(userId).get();
    if (!vaultDoc.exists) {
      return {
        success: false,
        grossAmount: requestedTokens,
        withholdingAmount: 0,
        netAmount: requestedTokens,
        message: 'Creator vault not found',
      };
    }

    const vault = vaultDoc.data() as CreatorVault;
    if (vault.availableTokens < requestedTokens) {
      return {
        success: false,
        grossAmount: requestedTokens,
        withholdingAmount: taxCalc.withholdingAmount,
        netAmount: taxCalc.netAmount,
        message: 'Insufficient balance',
      };
    }

    // 4. Apply withholding (if any)
    let withholdingRecordId: string | undefined;
    
    if (taxCalc.withholdingAmount > 0) {
      const withholdingRecord = await applyWithholdingToPayout(
        userId,
        payoutRequestId,
        requestedTokens,
        taxCalc.calculation
      );
      withholdingRecordId = withholdingRecord.id;
    }

    // 5. Update payout request with tax information
    await db.collection('payout_requests').doc(payoutRequestId).update({
      taxCalculation: taxCalc.calculation,
      grossAmount: requestedTokens,
      withholdingAmount: taxCalc.withholdingAmount,
      netAmount: taxCalc.netAmount,
      withholdingRecordId,
      updatedAt: serverTimestamp(),
    });

    logger.info('Payout processed with tax', {
      userId,
      payoutRequestId,
      grossAmount: requestedTokens,
      withholdingAmount: taxCalc.withholdingAmount,
      netAmount: taxCalc.netAmount,
    });

    return {
      success: true,
      grossAmount: requestedTokens,
      withholdingAmount: taxCalc.withholdingAmount,
      netAmount: taxCalc.netAmount,
      withholdingRecordId,
      message: taxCalc.withholdingAmount > 0
        ? `Payout approved. ${taxCalc.withholdingAmount} tokens withheld for tax.`
        : 'Payout approved.',
    };
  } catch (error: any) {
    logger.error('Process payout with tax failed', { error, userId });
    return {
      success: false,
      grossAmount: requestedTokens,
      withholdingAmount: 0,
      netAmount: requestedTokens,
      message: `Failed to process payout: ${error.message}`,
    };
  }
}

/**
 * Get earnings summary with tax breakdown
 */
export async function getEarningsSummaryWithTax(
  userId: string,
  periodStart: Timestamp,
  periodEnd: Timestamp
): Promise<{
  grossEarnings: number;
  withheldTax: number;
  netEarnings: number;
  earningsByCategory: Record<RevenueCategory, number>;
  withholdingRecords: TaxWithholdingRecord[];
}> {
  try {
    // Get all earnings in period
    const ledgerQuery = await db
      .collection('treasury_ledger')
      .where('userId', '==', userId)
      .where('eventType', '==', 'EARN')
      .where('timestamp', '>=', periodStart)
      .where('timestamp', '<=', periodEnd)
      .get();

    let grossEarnings = 0;
    const earningsByCategory: Record<RevenueCategory, number> = {
      PAID_CHAT: 0,
      PAID_CALLS: 0,
      TIPS_GIFTS: 0,
      EXCLUSIVE_MEDIA: 0,
      EVENTS: 0,
      DIGITAL_PRODUCTS: 0,
      ADS_PARTNERSHIPS: 0,
      OTHER: 0,
    };

    ledgerQuery.docs.forEach(doc => {
      const entry = doc.data();
      grossEarnings += entry.tokenAmount || 0;
      // Categorize earnings (simplified - would need proper mapping)
      earningsByCategory.OTHER += entry.tokenAmount || 0;
    });

    // Get withholding records in period
    const withholdingQuery = await db
      .collection('tax_withholding_records')
      .where('userId', '==', userId)
      .where('createdAt', '>=', periodStart)
      .where('createdAt', '<=', periodEnd)
      .get();

    let withheldTax = 0;
    const withholdingRecords: TaxWithholdingRecord[] = [];

    withholdingQuery.docs.forEach(doc => {
      const record = doc.data() as TaxWithholdingRecord;
      withheldTax += record.withholdingAmount;
      withholdingRecords.push(record);
    });

    const netEarnings = grossEarnings - withheldTax;

    return {
      grossEarnings,
      withheldTax,
      netEarnings,
      earningsByCategory,
      withholdingRecords,
    };
  } catch (error) {
    logger.error('Failed to get earnings summary', { error, userId });
    throw error;
  }
}

/**
 * Verify tax consistency across region, KYC, and payout
 */
export async function verifyTaxConsistency(userId: string): Promise<{
  consistent: boolean;
  warnings: string[];
  regions: {
    tax?: string;
    kyc?: string;
    payout?: string;
    verified?: string;
  };
}> {
  const warnings: string[] = [];
  const regions: {
    tax?: string;
    kyc?: string;
    payout?: string;
    verified?: string;
  } = {};

  try {
    // Get tax profile country
    const taxDoc = await db.collection('tax_profiles').doc(userId).get();
    if (taxDoc.exists) {
      regions.tax = taxDoc.data()?.country;
    }

    // Get KYC country
    const kycDocDoc = await db.collection('user_kyc_documents').where('userId', '==', userId).limit(1).get();
    if (!kycDocDoc.empty) {
      regions.kyc = kycDocDoc.docs[0].data()?.country;
    }

    // Get payout method country
    const payoutDoc = await db.collection('payout_methods').where('userId', '==', userId).limit(1).get();
    if (!payoutDoc.empty) {
      regions.payout = payoutDoc.docs[0].data()?.country;
    }

    // Get verified region
    const verifiedDoc = await db.collection('user_region_verification').doc(userId).get();
    if (verifiedDoc.exists) {
      regions.verified = verifiedDoc.data()?.consensusRegion;
    }

    // Check consistency
    const uniqueRegions = new Set(Object.values(regions).filter(Boolean));
    
    if (uniqueRegions.size > 1) {
      warnings.push(`Multiple regions detected: ${Array.from(uniqueRegions).join(', ')}`);
    }

    return {
      consistent: uniqueRegions.size <= 1,
      warnings,
      regions,
    };
  } catch (error) {
    logger.error('Failed to verify tax consistency', { error, userId });
    return {
      consistent: false,
      warnings: ['Failed to verify consistency'],
      regions,
    };
  }
}